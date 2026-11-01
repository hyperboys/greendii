const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');
const { reservedSettlement, assertAvailableSettlement } = require('../src/lib/arReservations');
const { arTransition } = require('../src/lib/arApproval');

test('AR reservations combine pending RV and CN in exact satang and exclude the current document', async () => {
  let receiptWhere, creditWhere;
  const tx = {
    receiptAllocation: { findMany: async ({ where }) => { receiptWhere = where; return [{ receivedAmount: 60.01, whtAmount: 1, bankFee: 0.99 }]; } },
    creditNote: { findMany: async ({ where }) => { creditWhere = where; return [{ netAmount: 20 }]; } },
  };
  assert.equal(await reservedSettlement(tx, 'iv', { rv: 'rv', cn: 'cn' }), 8200);
  assert.equal(receiptWhere.receiptVoucher.status, 'pending');
  assert.equal(receiptWhere.receiptVoucherId.not, 'rv');
  assert.equal(creditWhere.status, 'pending');
  assert.equal(creditWhere.id.not, 'cn');
  await assertAvailableSettlement(tx, { id: 'iv', outstandingAmount: 100 }, 1800);
  await assert.rejects(assertAvailableSettlement(tx, { id: 'iv', outstandingAmount: 100 }, 1801), { status: 409 });
});

test('AR confirm preserves legacy behavior while a configured chain blocks direct confirmation', async () => {
  const tx = { accountingApprovalConfig: { findUnique: async () => ({
    enabled: true, revision: 1, steps: [{ kind: 'user', targetId: 'approver' }],
  }) } };
  const draft = { id: 'legacy', salesId: 'maker', status: 'draft' };
  const legacy = await arTransition(tx, 'invoice', draft, 'confirm', 'maker');
  assert.equal(legacy.status, 'approved');
  assert.equal(legacy.posts, true);
  await assert.rejects(arTransition(tx, 'invoice', draft, 'confirm', 'maker', null, { rolloutReady: true }), { status: 409 });
});

for (const type of ['invoice', 'bi', 'rv', 'cn']) {
  test(`${type} HTTP approvals: no intermediate posting, final exactly once, permissions, rejection and atomic history`, async t => {
    const express = require('express'), jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = 'isolated-ar-approval-test';
    const copy = value => structuredClone(value);
    let tick = 0, failAudit = false, queue = Promise.resolve();
    const revision = () => new Date(Date.UTC(2026, 9, 31, 0, 0, ++tick));
    const customer = { id: 'c', active: true, name: 'Customer', code: 'C', branches: [], creditTerm: 0, vatConfig: 'NO_VAT' };
    const descriptor = {
      invoice: { model: 'invoice', route: 'invoices', date: 'ivDate', number: 'ivNo' },
      bi: { model: 'billingNote', route: 'billing-notes', date: 'billingDate', number: 'biNo' },
      rv: { model: 'receiptVoucher', route: 'receipt-vouchers', date: 'receiptDate', number: 'rvNo' },
      cn: { model: 'creditNote', route: 'credit-notes', date: 'cnDate', number: 'cnNo' },
    }[type];
    const pending = { version: 1, cycles: [{ cycle: 1, state: 'pending', submittedAt: revision().toISOString(), submittedById: 'maker',
      steps: [{ kind: 'role', targetId: 'review', label: 'Review' }, { kind: 'user', targetId: 'final', label: 'Final' }], approvals: [] }] };
    let state = {
      invoice: [{ id: 'source', ivNo: 'IV-SOURCE', lifecycleVersion: 1, status: 'approved', customerId: 'c',
        customerName: 'Customer', customerCode: 'C', customerBranch: 'Main', ivDate: new Date('2026-10-01'),
        vatConfig: 'NO_VAT', vat: 0, netAmount: 100, outstandingAmount: 100, updatedAt: revision() }],
      billingNote: [], receiptVoucher: [], creditNote: [], audits: [], notifications: [], posts: 0,
    };
    const doc = { id: 'target', lifecycleVersion: 1, status: 'pending', salesId: 'maker', customerId: 'c', customerBranch: 'Main',
      updatedAt: revision(), createdAt: new Date('2026-10-01'), [descriptor.date]: new Date('2026-10-25'),
      [descriptor.number]: 'TARGET', accountingApproval: pending };
    if (type === 'invoice') Object.assign(doc, { netAmount: 10, outstandingAmount: 0 });
    if (type === 'bi') Object.assign(doc, { totalAmount: 10, completedAt: null, invoices: [{ invoiceId: 'source', billingAmount: 10, outstandingAmount: 100 }] });
    if (type === 'rv') Object.assign(doc, { paymentMethod: 'cash', allocations: [{ invoiceId: 'source', receivedAmount: 10, whtAmount: 0, bankFee: 0 }] });
    if (type === 'cn') Object.assign(doc, { invoiceId: 'source', reason: 'Correction', items: [{ desc: 'Credit', qty: 1, unit: 'pcs', unitPrice: 10 }] });
    state[descriptor.model].push(doc);
    const users = Object.fromEntries(['maker', 'reviewer', 'final', 'viewer'].map(id => [id, {
      id, role: 'sales', active: true, fullName: id, signatureText: `${id} signature`, signatureUrl: null,
      accountingAssignment: { roleId: id === 'final' ? 'final-role' : 'review', role: { id: 'review', permissions: id === 'maker' ? ['ar.view', 'ar.create']
        : id === 'viewer' ? ['ar.view'] : ['ar.view', 'ar.approve'] } },
    }]));
    const prisma = {
      $queryRaw: async () => [],
      user: { findUnique: async ({ where }) => copy(users[where.id]) },
      accountingUserRole: { findUnique: async ({ where }) => copy(users[where.userId]?.accountingAssignment) },
      accountingApprovalConfig: { findUnique: async () => null },
      accountingApprovalSignature: { upsert: async () => ({}) },
      accountCustomer: { findUnique: async () => copy(customer) },
      accountProduct: { findMany: async () => [] },
      workOrder: { findUnique: async () => null },
      billingNoteInvoice: { count: async () => 0, findMany: async () => [] },
      receiptAllocation: { count: async () => 0, findMany: async ({ where }) => copy(state.receiptVoucher
        .filter(row => row.status === where.receiptVoucher.status && row.id !== where.receiptVoucherId?.not)
        .flatMap(row => row.allocations).filter(row => row.invoiceId === where.invoiceId)) },
      auditLog: { create: async ({ data }) => {
        if (failAudit) throw new Error('Audit unavailable');
        const row = { ...copy(data), id: `audit-${state.audits.length + 1}` };
        state.audits.push(row); return row;
      } },
      accountingNotification: { createMany: async ({ data, skipDuplicates = false }) => {
        let count = 0;
        for (const notification of data) {
          const duplicate = state.notifications.some(row => row.eventId === notification.eventId && row.userId === notification.userId);
          if (duplicate) {
            if (skipDuplicates) continue;
            throw Object.assign(new Error('Duplicate notification'), { code: 'P2002' });
          }
          state.notifications.push(copy(notification)); count += 1;
        }
        return { count };
      } },
    };
    for (const model of ['invoice', 'billingNote', 'receiptVoucher', 'creditNote']) prisma[model] = {
      findUnique: async ({ where }) => copy(state[model].find(row => row.id === where.id)),
      findMany: async ({ where } = {}) => copy(state[model].filter(row => (!where?.invoiceId || row.invoiceId === where.invoiceId)
        && row.id !== where?.id?.not && (!where?.status || (typeof where.status === 'string' ? row.status === where.status : where.status.in.includes(row.status))))),
      count: async () => 0,
      update: async ({ where, data }) => {
        const row = state[model].find(row => row.id === where.id);
        if (model === 'invoice' && data.outstandingAmount !== undefined) state.posts++;
        Object.assign(row, data, { updatedAt: revision() });
        if (data.items) row.items = data.items.create;
        if (data.allocations) row.allocations = data.allocations.create;
        return copy(row);
      },
    };
    prisma.$transaction = callback => {
      const work = queue.then(async () => {
        const before = copy(state);
        try { return await callback(prisma); } catch (error) { state = before; throw error; }
      });
      queue = work.catch(() => {}); return work;
    };
    require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
    for (const module of ['accountingAccess', 'arApproval']) delete require.cache[require.resolve(`../src/lib/${module}`)];
    delete require.cache[require.resolve(`../src/routes/${descriptor.route}`)];
    const app = express(); app.use(express.json());
    app.use('/documents', require(`../src/routes/${descriptor.route}`));
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const root = `http://127.0.0.1:${server.address().port}/documents/target`;
    const call = async (action, user, updatedAt, reason) => {
      const response = await fetch(`${root}/${action}`, { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}`,
      }, body: JSON.stringify({ updatedAt, reason }) });
      return { status: response.status, data: await response.json() };
    };
    let version = state[descriptor.model].find(row => row.id === 'target').updatedAt.toISOString();
    if (type !== 'invoice') {
      state.receiptVoucher.push({ id: 'reserved', status: 'pending', lifecycleVersion: 1,
        allocations: [{ invoiceId: 'source', receivedAmount: 95, whtAmount: 0, bankFee: 0 }] });
      assert.equal((await call('approve', 'reviewer', version)).status, 409, 'A pending settlement reserves capacity without reducing the Invoice');
      assert.equal(state.posts, 0);
      state.receiptVoucher.find(row => row.id === 'reserved').status = 'returned';
      assert.equal(await reservedSettlement(prisma, 'source', { rv: 'target', cn: 'target' }), 0, 'Return releases reservation');
    }
    for (const user of ['maker', 'viewer', 'final']) assert.equal((await call('approve', user, version)).status, 403);
    failAudit = true;
    assert.equal((await call('approve', 'reviewer', version)).status, 500);
    assert.equal(state.posts, 0);
    assert.equal(state[descriptor.model].find(row => row.id === 'target').accountingApproval.cycles[0].approvals.length, 0);
    failAudit = false;
    const first = await call('approve', 'reviewer', version);
    assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.status, 'pending');
    assert.equal(state.posts, 0);
    assert.equal(state.invoice.find(row => row.id === 'source').outstandingAmount, 100);
    if (['rv', 'cn'].includes(type)) assert.equal(await reservedSettlement(prisma, 'source'), 1000);
    assert.equal((await call('approve', 'final', version)).status, 409);
    version = first.data.updatedAt;
    const finishes = await Promise.all([call('approve', 'final', version), call('approve', 'final', version)]);
    assert.deepEqual(finishes.map(row => row.status).sort(), [200, 409]);
    const finished = finishes.find(row => row.status === 200).data;
    assert.equal(finished.status, 'approved');
    assert.equal(finished.accountingApproval.cycles[0].approvals.length, 2);
    assert.equal(state.posts, type === 'bi' ? 0 : 1);
    assert.equal(await reservedSettlement(prisma, 'source'), 0, 'Rejected documents no longer reserve debt');
    if (['rv', 'cn'].includes(type)) assert.equal(state.invoice.find(row => row.id === 'source').outstandingAmount, 90);
    if (type === 'invoice') assert.equal(finished.outstandingAmount, 10);
    const target = state[descriptor.model].find(row => row.id === 'target');
    Object.assign(target, { status: 'pending', accountingApproval: copy(pending), updatedAt: revision() });
    const rejected = await call('reject', 'reviewer', target.updatedAt.toISOString(), 'Reject');
    assert.equal(rejected.status, 200, JSON.stringify(rejected.data));
    assert.equal(rejected.data.status, 'rejected');
    assert.equal(rejected.data.accountingApproval.cycles[0].state, 'rejected');
    assert.equal(state.posts, type === 'bi' ? 0 : 1);
  });
}
