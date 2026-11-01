const test = require('node:test'), assert = require('node:assert/strict'), express = require('express'), jwt = require('jsonwebtoken');
let notifications = [], audits = [], failNotification = false, revoked = false;
const matches = (row, where) => Object.entries(where).every(([key, value]) =>
  value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : (row[key] ?? null) === value);
const prisma = {
  user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
  accountingUserRole: { findUnique: async () => ({ role: { id: 'ap', name: 'AP', permissions: revoked ? [] : ['ap.view'] } }) },
  auditLog: { create: async ({ data }) => { const audit = { id: `event${audits.length}`, ...data }; audits.push(audit); return audit; } },
  accountingNotification: {
    createMany: async ({ data }) => {
      if (failNotification) throw new Error('notification write unavailable');
      for (const row of data) if (!notifications.some(item => item.userId === row.userId && item.eventId === row.eventId)) {
        notifications.push({ id: `n${notifications.length}`, readAt: null, createdAt: new Date(), ...row });
      }
      return { count: data.length };
    },
    findMany: async ({ where, skip, take }) => notifications.filter(row => matches(row, where)).slice(skip, skip + take),
    count: async ({ where }) => notifications.filter(row => matches(row, where)).length,
    updateMany: async ({ where, data }) => {
      const rows = notifications.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length };
    },
  },
  $transaction: async operation => {
    if (Array.isArray(operation)) return Promise.all(operation);
    const before = structuredClone({ notifications, audits });
    try { return await operation(prisma); } catch (error) { notifications = before.notifications; audits = before.audits; throw error; }
  },
};
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
require.cache[require.resolve('../src/lib/accountingApproval')] = { exports: {
  documentType: type => ({ module: 'ap', href: `/ap/vouchers/${type}` }),
  eligibleRecipientsForCycle: async (tx, type, document) => document.status === 'pending' ? ['approver'] : [],
}, loaded: true };
const { notifyAccountingAudit } = require('../src/lib/accountingNotifications');
const { recordAuditLog } = require('../src/lib/auditTrail');

test('Approval notifications are atomic with audit, idempotent per event/recipient and actual-current-step only', async () => {
  notifications = []; audits = [];
  const document = { status: 'pending', createdById: 'creator', accountingApproval: { version: 1, cycles: [] } };
  const audit = { id: 'event1', entityType: 'purchase_order', entityId: 'po', docNo: 'PO1', action: 'submit' };
  await notifyAccountingAudit(prisma, audit, document, 'creator');
  await notifyAccountingAudit(prisma, audit, document, 'creator');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, 'approver');
  assert.equal(notifications[0].action, 'approval_required');
  await notifyAccountingAudit(prisma, { ...audit, id: 'event2', action: 'approve' }, { ...document, status: 'approved' }, 'approver');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].userId, 'creator');
  await notifyAccountingAudit(prisma, { ...audit, id: 'event-ar', entityType: 'invoice', action: 'approve' },
    { status: 'approved', salesId: 'ar-creator', accountingApproval: document.accountingApproval }, 'approver');
  assert.equal(notifications.at(-1).userId, 'ar-creator');
  await notifyAccountingAudit(prisma, { ...audit, id: 'event3', action: 'cancel' }, { ...document, status: 'cancelled' }, 'creator');
  assert.equal(notifications.length, 3);
  await notifyAccountingAudit(prisma, { ...audit, entityType: 'work_order' }, document, 'creator');
  assert.equal(notifications.length, 3);
  failNotification = true;
  const before = notifications.length;
  await assert.rejects(prisma.$transaction(tx => recordAuditLog({
    entityType: 'purchase_order', entityId: 'po', docNo: 'PO1', action: 'submit',
    newValue: document, performedById: 'creator',
  }, tx)), /notification write unavailable/);
  failNotification = false;
  assert.equal(notifications.length, before);
  assert.equal(audits.length, 0);
});

test('Notification HTTP list counts all unread and read mutations enforce owner and live module access', async t => {
  process.env.JWT_SECRET = 'accounting-notifications-isolated-test';
  notifications = Array.from({ length: 57 }, (_, index) => ({
    id: `visible${index}`, userId: 'viewer', module: 'ap', docType: 'po', documentId: 'po', text: 'PO request',
    action: 'approval_required', readAt: null, createdAt: new Date(), eventId: `e${index}`,
  }));
  notifications.push({ ...notifications[0], id: 'other-owner', userId: 'other' },
    { ...notifications[0], id: 'other-module', module: 'ar' });
  const app = express(); app.use('/api/accounting-notifications', require('../src/routes/accounting-notifications'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(path = '', method = 'GET', expected = 200, user = 'viewer') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/accounting-notifications${path}`, {
      method, headers: user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {},
    });
    const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
  }
  await request('', 'GET', 401, null);
  const first = await request('?page=1&pageSize=25');
  assert.equal(first.data.length, 25);
  assert.equal(first.total, 57);
  assert.equal(first.unreadCount, 57);
  assert.equal(first.data[0].href, '/approvals/po/po');
  const last = await request('?page=3&pageSize=25');
  assert.equal(last.data.length, 7);
  await request('?page=1&page=2', 'GET', 400);
  await request('/other-owner/read', 'PATCH', 404);
  await request('/other-module/read', 'PATCH', 404);
  await request('/visible0/read', 'PATCH');
  assert.equal((await request()).unreadCount, 56);
  revoked = true;
  await request('', 'GET', 403);
  await request('/visible1/read', 'PATCH', 403);
  revoked = false;
  await request('/read-all', 'PATCH');
  assert.equal((await request()).unreadCount, 0);
  assert.equal(notifications.find(row => row.id === 'other-owner').readAt, null);
  assert.equal(notifications.find(row => row.id === 'other-module').readAt, null);
});
