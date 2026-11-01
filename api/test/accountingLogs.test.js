const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const person = { fullName: 'Accounting Reviewer', username: 'reviewer', role: 'sales' };
const auditRows = [
  { id: 'b', createdAt: new Date('2026-10-31T17:00:00Z'), entityType: 'invoice', entityId: 'invoice-1', docNo: 'INV001',
    action: 'approve', performedBy: person, oldValue: { password: 'never-expose' },
    newValue: { total: '100.00', nested: { accessToken: 'never-expose' } }, reason: 'Reviewed' },
  { id: 'a', createdAt: new Date('2026-10-31T17:00:00Z'), entityType: 'stock_transfer', entityId: 'tr-1', docNo: 'TR001', action: 'submit', performedBy: person },
  { id: 'before', createdAt: new Date('2026-10-31T16:59:59Z'), entityType: 'invoice', action: 'approve' },
  { id: 'after', createdAt: new Date('2026-11-01T17:00:00Z'), entityType: 'invoice', action: 'approve' },
  { id: 'sale', createdAt: new Date('2026-11-01T10:00:00Z'), entityType: 'quotation', action: 'approve' },
];
const activityRows = [
  { id: '1', createdAt: new Date('2026-11-01T10:00:00Z'), path: '/api/ar/invoices/1?token=hidden [rid:req1] [err:conflict]', method: 'POST', statusCode: 409, username: 'reviewer', user: person },
  { id: '2', createdAt: new Date('2026-11-01T11:00:00Z'), path: '/api/inventory?tab=balances [rid:req2]', method: 'GET', statusCode: 200, user: person },
  { id: '3', createdAt: new Date('2026-11-01T10:00:00Z'), path: '/api/accounting-logs/activity [rid:req3]', method: 'GET', statusCode: 200 },
  ...['/api/quotations', '/api/auth/login', '/api/arbitrary', '/api/suppliers-other'].map((path, i) => ({
    id: `sale-${i}`, createdAt: new Date('2026-11-01T10:00:00Z'), path, method: 'POST', statusCode: 500,
  })),
];
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(item => matches(row, item));
    if (key === 'OR') return value.some(item => matches(row, item));
    if (typeof value !== 'object' || value === null) return row[key] === value;
    const actual = row[key];
    if ('is' in value) return actual != null && matches(actual, value.is);
    if ('in' in value && !value.in.includes(actual)) return false;
    if ('contains' in value && !String(actual || '').toLowerCase().includes(value.contains.toLowerCase())) return false;
    if ('startsWith' in value && !String(actual || '').startsWith(value.startsWith)) return false;
    if ('gte' in value && !(actual >= value.gte)) return false;
    if ('lt' in value && !(actual < value.lt)) return false;
    return true;
  });
}
let failRead = false;
function model(rows) {
  return {
    count: async ({ where }) => rows.filter(row => matches(row, where)).length,
    findMany: async ({ where, skip, take }) => {
      if (failRead) throw new Error('Log storage unavailable');
      return rows.filter(row => matches(row, where)).sort((a, b) =>
        b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(skip, skip + take);
    },
  };
}
const prisma = { user: { findUnique: async ({ where }) => ({
  id: where.id, active: where.id !== 'inactive', role: where.id === 'admin' ? 'admin' : where.id,
}) }, auditLog: model(auditRows), activityLog: model(activityRows) };
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };

test('Accounting log HTTP is admin-only, Accounting-scoped, filtered, paginated and secret-masked', async t => {
  process.env.JWT_SECRET = 'accounting-logs-isolated-test';
  const app = express(); app.use('/api/accounting-logs', require('../src/routes/accounting-logs'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(path = '', user = 'admin', status = 200, method = 'GET') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/accounting-logs${path}`, {
      method, headers: user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {},
    });
    assert.equal(response.status, status);
    return response.headers.get('content-type')?.includes('application/json') ? response.json() : null;
  }
  for (const path of ['', '/activity']) {
    await request(path, null, 401); await request(path, 'inactive', 401);
    for (const user of ['sales', 'director', 'admin_mgr']) await request(path, user, 403);
    await request(path, 'admin', 404, 'POST');
    for (const query of ['page=0', 'limit=101', 'page=1.5', 'from=2026-02-30',
      'from=2026-11-02&to=2026-11-01', 'search=a&search=b']) await request(`${path}?${query}`, 'admin', 400);
  }
  const first = await request('?from=2026-11-01&to=2026-11-01&limit=1');
  assert.equal(first.total, 2); assert.equal(first.rows[0].id, 'b');
  assert.equal(first.rows[0].oldValue.password, '***MASKED***');
  assert.equal(first.rows[0].newValue.nested.accessToken, '***MASKED***');
  assert.equal(first.rows[0].newValue.total, '100.00');
  assert.equal((await request('?from=2026-11-01&to=2026-11-01&limit=1&page=2')).rows[0].id, 'a');
  assert.equal((await request('?entityType=invoice&action=approve&search=INV001&user=reviewer')).total, 1);
  await request('?entityType=quotation', 'admin', 400);
  const activity = await request('/activity');
  assert.equal(activity.total, 3);
  const error = await request('/activity?method=POST&status=error&user=Reviewer&search=invoices');
  assert.equal(error.total, 1);
  assert.match(error.rows[0].path, /token=\*\*\*MASKED\*\*\*/);
  assert.match(error.rows[0].path, /\[rid:req1\]/);
  assert.equal((await request('/activity?status=success')).total, 2);
  await request('/activity?method=INVALID', 'admin', 400);
  await request('/activity?status=unknown', 'admin', 400);
  failRead = true;
  assert.equal((await request('', 'admin', 500)).message, 'Log storage unavailable');
  failRead = false;
});
