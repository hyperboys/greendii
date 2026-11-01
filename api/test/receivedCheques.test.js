const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chequeTransition, assertNoUnresolvedCheque } = require('../src/lib/receivedCheque');
const { reverseReceipt, billingPaid } = require('../src/lib/receiptVoucher');

const voucher = () => ({ id: 'rv', rvNo: 'RV1', salesId: 'maker', lifecycleVersion: 1, status: 'approved',
  paymentMethod: 'cheque', receivedChequeState: 'received', receiptDate: new Date('2026-10-26'),
  chequeDate: new Date('2026-10-27'), confirmedAt: new Date('2026-10-26T12:00:00Z'),
  updatedAt: new Date('2026-10-26T12:00:00Z'), totalReceived: '10.31', whtAmount: '0', bankFee: '0',
  allocations: [{ invoiceId: 'i', billingNoteId: 'b', receivedAmount: '10.31', whtAmount: '0', bankFee: '0' }] });

test('received cheque validates final-confirmed-only states, exact dates, required deposit references and mixed-settlement policy', () => {
  const doc = voucher(), input = { actionDate: '2026-10-27', depositBank: 'Bank / account', depositRef: 'Slip' };
  assert.equal(chequeTransition(doc, 'deposit', input).receivedChequeState, 'deposited');
  for (const change of [{ status: 'pending' }, { status: 'draft' }, { lifecycleVersion: 0 }, { confirmedAt: null },
    { paymentMethod: 'transfer' }, { receivedChequeState: null }, { receivedChequeState: 'cleared' }]) {
    assert.throws(() => chequeTransition({ ...doc, ...change }, 'deposit', input), { status: 409 });
  }
  for (const change of [{ actionDate: '2026-02-30' }, { actionDate: '2026-10-26' }, { depositRef: '' },
    { depositBank: '' }, { depositBank: 'x'.repeat(201) }]) {
    assert.throws(() => chequeTransition(doc, 'deposit', { ...input, ...change }), { status: 400 });
  }
  assert.throws(() => chequeTransition(doc, 'clear', input), { status: 409 });
  assert.throws(() => chequeTransition({ ...doc, accountingApproval: { version: 1, cycles: [
    { state: 'pending', steps: [{ kind: 'user', targetId: 'approver' }], approvals: [] },
  ] } }, 'deposit', input), { status: 409 });
  const deposited = { ...doc, receivedChequeState: 'deposited', chequeDepositedAt: new Date('2026-10-28') };
  assert.throws(() => chequeTransition(deposited, 'clear', input), { status: 400 });
  assert.equal(chequeTransition(deposited, 'clear', { actionDate: '2026-10-28' }).receivedChequeState, 'cleared');
  assert.throws(() => chequeTransition(doc, 'dishonour', { actionDate: '2026-10-27', reason: '' }), { status: 400 });
  for (const field of ['whtAmount', 'bankFee']) assert.equal(chequeTransition({
    ...doc, allocations: [{ ...doc.allocations[0], [field]: '0.01' }],
  }, 'dishonour', { actionDate: '2026-10-27', reason: 'Returned' }).receivedChequeState, 'dishonoured');
});

function fixture() {
  let state = { doc: voucher(), invoice: { id: 'i', ivNo: 'IV1', lifecycleVersion: 1, status: 'approved', outstandingAmount: '0.00', netAmount: '10.31' },
    bill: { id: 'b', biNo: 'BI1', status: 'approved', totalAmount: '10.31', completedAt: new Date('2026-10-26T12:00:00Z'), invoices: [{ invoiceId: 'i' }] }, audits: [] };
  let failAudit = false, newer = 0, queue = Promise.resolve();
  const locks = [];
  const copy = value => structuredClone(value);
  const prisma = {
    $queryRaw: async (strings, id) => { locks.push([strings.join('?'), id]); return []; },
    receiptVoucher: {
      findUnique: async ({ where }) => where.id === state.doc.id ? copy(state.doc) : null,
      findMany: async ({ where }) => where.paymentMethod === 'cheque' && (!where.receivedChequeState || where.receivedChequeState === state.doc.receivedChequeState) ? [copy(state.doc)] : [],
      update: async ({ data }) => { Object.assign(state.doc, data, { updatedAt: new Date(new Date(state.doc.updatedAt).getTime() + 1) }); return copy(state.doc); },
    },
    invoice: {
      findUnique: async () => copy(state.invoice),
      update: async ({ data }) => { Object.assign(state.invoice, data); return copy(state.invoice); },
    },
    billingNote: {
      findMany: async () => [copy(state.bill)],
      findUnique: async () => copy(state.bill),
      update: async ({ data }) => { Object.assign(state.bill, data); return copy(state.bill); },
    },
    billingNoteInvoice: { count: async () => newer },
    receiptAllocation: {
      findMany: async ({ where }) => {
        const filter = where.receiptVoucher;
        if (filter.status && state.doc.status !== filter.status) return [];
        return copy(state.doc.allocations.map(row => ({ ...row, receiptVoucher: { chequeDishonouredAt: state.doc.chequeDishonouredAt } })));
      },
      count: async ({ where }) => where.receiptVoucher.receivedChequeState.in.includes(state.doc.receivedChequeState) && state.doc.status === 'approved' ? 1 : 0,
    },
  };
  prisma.$transaction = async callback => {
    const result = queue.then(async () => {
      const before = copy(state);
      try { return await callback(prisma); } catch (error) { state = before; throw error; }
    });
    queue = result.catch(() => {}); return result;
  };
  const express = require('express'), app = express();
  app.use(express.json());
  const stubs = {
    '../src/lib/prisma': prisma,
    '../src/middleware/auth': { authenticate: (req, res, next) => {
      if (!req.get('x-user')) return res.status(401).json({ message: 'Unauthenticated' });
      req.user = { id: req.get('x-user') }; next();
    } },
    '../src/lib/accountingAccess': { getAccountingAccess: async user => user,
      hasAccountingPermission: (user, module, action) => user.id === 'maker' || (user.id === 'viewer' && action === 'view') },
    '../src/lib/auditTrail': { recordAuditLog: async entry => {
      if (failAudit) throw new Error('Audit unavailable');
      const { req, ...snapshot } = entry; state.audits.push(copy({ ...snapshot, actorId: req.user.id }));
    } },
  };
  const old = new Map();
  for (const [name, exports] of Object.entries(stubs)) {
    const key = require.resolve(name); old.set(key, require.cache[key]); require.cache[key] = { id: key, filename: key, loaded: true, exports };
  }
  const route = require.resolve('../src/routes/receipt-vouchers'), approval = require.resolve('../src/lib/arApproval');
  old.set(route, require.cache[route]); old.set(approval, require.cache[approval]); delete require.cache[route]; delete require.cache[approval];
  app.use('/api/ar/receipt-vouchers', require(route));
  for (const [key, value] of old) { if (value) require.cache[key] = value; else delete require.cache[key]; }
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  return { app, prisma, state: () => state, locks, failAudit: value => { failAudit = value; }, newer: value => { newer = value; } };
}

test('received cheque real HTTP register/actions: auth, revision, locks, audit rollback, exact reversal, reopened BI and cancellation idempotency', async t => {
  const f = fixture(), server = f.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/ar/receipt-vouchers`;
  async function call(path, body, expected = 200, user = 'maker') {
    const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
  }
  const action = (name, body = {}, expected = 200, user) => call(`/rv/cheque/${name}`, {
    updatedAt: f.state().doc.updatedAt.toISOString(), actionDate: '2026-10-28', ...body,
  }, expected, user);
  await t.test('register rejects anonymous/no-view and mutation rejects viewers, pending, legacy and stale revisions', async () => {
    await call('/received-cheques', null, 401, null);
    await call('/received-cheques', null, 403, 'outsider');
    assert.equal((await call('/received-cheques', null, 200, 'viewer')).length, 1);
    await call('/received-cheques?state=invalid', null, 400);
    await action('deposit', {}, 403, 'viewer');
    await action('deposit', { updatedAt: 'stale' }, 409);
    f.state().doc.status = 'pending'; await action('deposit', {}, 409); f.state().doc.status = 'approved';
    f.state().doc.lifecycleVersion = 0; await action('deposit', {}, 409); f.state().doc.lifecycleVersion = 1;
  });
  await t.test('unresolved cheque blocks BI/CN, audit failure atomically rolls back state; deposit/clear never post debt', async () => {
    await assert.rejects(() => assertNoUnresolvedCheque(f.prisma, 'i'), { status: 409 });
    f.failAudit(true); await action('deposit', { depositBank: 'Bank / account', depositRef: 'Slip' }, 500); f.failAudit(false);
    assert.equal(f.state().doc.receivedChequeState, 'received'); assert.equal(f.state().audits.length, 0);
    await action('deposit', { depositBank: 'Bank / account', depositRef: 'Slip' });
    assert.equal(f.state().invoice.outstandingAmount, '0.00');
    assert.match(f.locks[0][0], /receipt_vouchers.*FOR UPDATE/);
    assert.ok(f.locks.some(([sql]) => /invoices.*FOR UPDATE/.test(sql)));
    assert.ok(f.locks.some(([sql]) => /billing_notes.*FOR UPDATE/.test(sql)));
    await action('deposit', { depositBank: 'Bank', depositRef: 'Slip' }, 409);
  });
  await t.test('new downstream BI prevents reversal; audit failure rolls back debt + BI + RV; competing dishonour restores once', async () => {
    f.newer(1); await action('dishonour', { reason: 'Returned' }, 409); f.newer(0);
    f.failAudit(true); await action('dishonour', { reason: 'Returned' }, 500); f.failAudit(false);
    assert.equal(f.state().invoice.outstandingAmount, '0.00'); assert.ok(f.state().bill.completedAt);
    const revision = f.state().doc.updatedAt.toISOString();
    const results = await Promise.all([1, 2].map(() => fetch(`${base}/rv/cheque/dishonour`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': 'maker' },
      body: JSON.stringify({ updatedAt: revision, actionDate: '2026-10-28', reason: 'Bank returned' }),
    })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(f.state().invoice.outstandingAmount, 10.31); assert.equal(f.state().bill.completedAt, null);
    assert.equal(await billingPaid(f.prisma, 'b'), 0);
    assert.equal(f.state().audits.filter(row => row.action === 'cheque_dishonour').length, 1);
    await assertNoUnresolvedCheque(f.prisma, 'i');
    await action('dishonour', { reason: 'Again' }, 409);
    await call('/rv/cancel', { updatedAt: f.state().doc.updatedAt.toISOString(), reason: 'Cancel returned receipt' });
    assert.equal(f.state().invoice.outstandingAmount, 10.31);
    assert.equal(f.state().doc.receivedChequeState, 'cancelled');
    await call('/rv/cancel', { updatedAt: f.state().doc.updatedAt.toISOString(), reason: 'Again' }, 409);
  });
});

test('clearing is debt-neutral and final; direct-receipt later BI and reversal overflow fail closed', async () => {
  const f = fixture(), deposited = { ...voucher(), receivedChequeState: 'deposited', chequeDepositedAt: new Date('2026-10-27') };
  Object.assign(f.state().doc, chequeTransition(deposited, 'clear', { actionDate: '2026-10-28' }));
  assert.equal(f.state().invoice.outstandingAmount, '0.00');
  await assertNoUnresolvedCheque(f.prisma, 'i');
  assert.throws(() => chequeTransition(f.state().doc, 'dishonour', { actionDate: '2026-10-28', reason: 'Return' }), { status: 409 });
  f.state().doc.allocations[0].billingNoteId = null; f.newer(1);
  await assert.rejects(() => reverseReceipt(f.prisma, f.state().doc), { status: 409 });
  f.newer(0); f.state().invoice.outstandingAmount = '0.01';
  await assert.rejects(() => reverseReceipt(f.prisma, f.state().doc), { status: 409 });
});

test('mixed received cheque HTTP cash-only dishonour 960 + retained WHT30/fee10; cancellation restores only remaining40', async t => {
  const f = fixture();
  Object.assign(f.state().doc, { totalReceived: '960', whtAmount: '30', bankFee: '10',
    allocations: [{ invoiceId: 'i', billingNoteId: 'b', receivedAmount: '960', whtAmount: '30', bankFee: '10' }] });
  Object.assign(f.state().invoice, { netAmount: '1000', outstandingAmount: '0' });
  f.state().bill.totalAmount = '1000';
  const server = f.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function call(action) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ar/receipt-vouchers/rv/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': 'maker' },
      body: JSON.stringify({ updatedAt: f.state().doc.updatedAt, actionDate: '2026-10-28', reason: 'Bank return' }),
    });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  }
  const returned = await call('cheque/dishonour');
  assert.equal(returned.status, 'approved');
  assert.equal(f.state().invoice.outstandingAmount, 960);
  assert.equal(await billingPaid(f.prisma, 'b'), 4000);
  assert.equal(f.state().bill.completedAt, null);
  assert.equal(returned.allocations[0].whtAmount, '30'); assert.equal(returned.allocations[0].bankFee, '10');
  const { assertNoInvoiceDependents } = require('../src/lib/invoice');
  const deps = { ...f.prisma, receiptAllocation: { count: async () => 1 },
    creditNote: { count: async () => 0 }, billingNoteInvoice: { count: async () => 0 } };
  await assert.rejects(() => assertNoInvoiceDependents(deps, 'i'), { status: 409 });
  await call('cancel');
  assert.equal(f.state().invoice.outstandingAmount, 1000, 'not 1960: cheque cash never reversed twice');
  assert.equal(await billingPaid(f.prisma, 'b'), 0);
});

test('mixed reversal uses allocation-specific satang and CN cancellation still checks post-dishonour residual RV', async () => {
  const { remainingSettlement } = require('../src/lib/receiptVoucher');
  const { assertCreditReversible } = require('../src/lib/creditNote');
  const rows = [{ receivedAmount: '0.10', whtAmount: '0.20', bankFee: '0.01' },
    { receivedAmount: '0.29', whtAmount: '0.01', bankFee: '0.02' }];
  assert.equal(rows.reduce((sum, row) => sum + remainingSettlement(row, true), 0), 24);
  const balances = new Map([['a', { id: 'a', status: 'approved', lifecycleVersion: 1, netAmount: '0.31', outstandingAmount: '0' }],
    ['b', { id: 'b', status: 'approved', lifecycleVersion: 1, netAmount: '0.32', outstandingAmount: '0' }]]);
  const tx = { $queryRaw: async () => [], billingNoteInvoice: { count: async () => 0 },
    invoice: { findUnique: async ({ where }) => balances.get(where.id),
      update: async ({ where, data }) => Object.assign(balances.get(where.id), data) } };
  const receipt = { ...voucher(), allocations: rows.map((row, index) => ({ ...row, invoiceId: index ? 'b' : 'a', billingNoteId: null })) };
  await reverseReceipt(tx, receipt, { cashOnly: true });
  assert.equal(balances.get('a').outstandingAmount, 0.10); assert.equal(balances.get('b').outstandingAmount, 0.29);
  await reverseReceipt(tx, { ...receipt, chequeDishonouredAt: new Date('2026-10-28') });
  assert.equal(balances.get('a').outstandingAmount, 0.31); assert.equal(balances.get('b').outstandingAmount, 0.32);
  const doc = { id: 'cn', invoiceId: 'i', confirmedAt: new Date('2026-10-25') };
  await assert.rejects(() => assertCreditReversible({
    billingNoteInvoice: { count: async () => 0 },
    receiptAllocation: { count: async ({ where }) => {
      assert.equal(where.receiptVoucher.status, 'approved');
      assert.ok(where.receiptVoucher.OR[0].confirmedAt.gte);
      return 1;
    } },
  }, doc), { status: 409 });
});

test('received cheque HTTP clear follows deposit, records audit and never settles a second time', async t => {
  const f = fixture(), server = f.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const [action, input] of [['deposit', { depositBank: 'Bank / account', depositRef: 'Slip' }], ['clear', {}]]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ar/receipt-vouchers/rv/cheque/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': 'maker' },
      body: JSON.stringify({ updatedAt: f.state().doc.updatedAt, actionDate: '2026-10-28', ...input }),
    });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(f.state().invoice.outstandingAmount, '0.00');
  }
  assert.equal(f.state().doc.receivedChequeState, 'cleared');
  assert.ok(f.state().bill.completedAt);
  assert.deepEqual(f.state().audits.map(row => row.action), ['cheque_deposit', 'cheque_clear']);
  assert.equal(f.state().audits[1].oldValue.receivedChequeState, 'deposited');
  assert.equal(f.state().audits[1].newValue.receivedChequeState, 'cleared');
});
