const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentAmounts, paymentInput, assertCapacity } = require('../src/lib/contractorPayment');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');
const { once } = require('events');
const { randomUUID } = require('crypto');

test('PS authoritative amount calculation, rates, money validation and rounding', () => {
  const result = paymentAmounts([{ desc: 'Work', amount: '1000.01' }], 'VAT7%', '3', '5');
  assert.deepEqual(result, { currentRequestAmount: 1000.01, vat: 70, wht: 30, retention: 50, netAmount: 990.01 });
  assert.equal(paymentAmounts([{ desc: 'No VAT', amount: 100 }], 'NO_VAT', 0, 0).netAmount, 100);
  for (const amount of [null, true, '', -1, '1.001', 0]) {
    assert.throws(() => paymentAmounts([{ desc: 'Invalid', amount }], 'VAT7%', 0, 0), { status: 400 });
  }
  assert.throws(() => paymentAmounts([{ desc: 'Invalid', amount: 100 }], 'VAT7%', 101, 0), { status: 400 });
  assert.throws(() => paymentAmounts([{ desc: 'Invalid', amount: 100 }], 'VAT7%', 80, 80), { status: 400 });
  assert.throws(() => paymentInput({ docDate: '2026-02-30' }), { status: 400 });
  assert.throws(() => paymentInput({ docDate: '2026-10-26', poId: 'po', paymentRound: 1.2, items: [] }), { status: 400 });
  const input = { docDate: '2026-10-26', poId: 'po', paymentRound: 1, items: [{ desc: 'Valid', amount: 1 }] };
  assert.throws(() => paymentInput({ ...input, whtRate: null }), { status: 400 });
  assert.throws(() => paymentInput({ ...input, retentionRate: '' }), { status: 400 });
  assert.throws(() => paymentInput({ ...input, items: [{ desc: '', amount: 1 }] }), { status: 400 });
  assert.equal(paymentAmounts([{ amount: '9999999999.99' }], 'NO_VAT', '99.99', 0).wht, 9998999999.99);
});

test('PS cumulative before VAT, VAT and gross limits are independently enforced', () => {
  const po = { subTotal: 100, discount: 10, vat: 6.3, netAmount: 96.3 };
  assert.doesNotThrow(() => assertCapacity(po, { before: 5000, vat: 350, gross: 5350 }, { currentRequestAmount: 40, vat: 2.8 }));
  assert.throws(() => assertCapacity(po, { before: 5000, vat: 350, gross: 5350 }, { currentRequestAmount: 40.01, vat: 2.8 }), { status: 409 });
  assert.throws(() => assertCapacity(po, { before: 0, vat: 631, gross: 0 }, { currentRequestAmount: 1, vat: 0 }), { status: 409 });
  assert.throws(() => assertCapacity(po, { before: 0, vat: 0, gross: 9630 }, { currentRequestAmount: 1, vat: 0 }), { status: 409 });
});

test('PS additive SQL preserves legacy money/status and refuses duplicate rounds', () => {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'sql', 'accounting-contractor-payments.sql'), 'utf8');
  assert.match(sql, /HAVING count\(\*\) > 1/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE FROM|DROP TABLE)\b/i);
});

test('PS actual HTTP lifecycle, permissions, cumulative locking, rollback, PV guards and legacy protection', async t => {
  process.env.JWT_SECRET = 'ps-test-only-secret';
  const fixture = createContractorPaymentApp();
  const server = fixture.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/ap`;
  async function call(path, { user = 'maker', method = 'GET', body, status = 200 } = {}) {
    const response = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const base = '/contractor-payments';
  const input = (round, amount = 4000) => ({ docDate: '2026-10-26', poId: 'po', paymentRound: round, whtRate: 3, retentionRate: 5,
    items: [{ desc: `Work round ${round}`, amount }], requestKey: randomUUID(), netAmount: 1, vat: 99999, supplierId: 'forged' });
  const create = body => call(base, { method: 'POST', body, status: 201 });
  const action = (doc, name, options = {}) => call(`${base}/${doc.id}/${name}`, {
    method: 'POST', body: { updatedAt: doc.updatedAt, reason: 'Test reason' }, ...options,
  });
  await t.test('view-only and approver-only permissions do not require ap.create for approval actions', async () => {
    await call(base, { user: null, status: 401 });
    await call(base, { user: 'viewer' });
    await call(base, { user: 'viewer', method: 'POST', body: input(1), status: 403 });
    await call(base, { user: 'approver', method: 'POST', body: input(1), status: 403 });
    await call(`${base}/sources?supplied=ignored`);
    assert.equal((await call(`${base}/sources/po`)).nextRound, 1);
    await call(`${base}?status=invalid`, { status: 400 });
    await call(base, { method: 'POST', body: { ...input(1), docDate: '2026-02-30' }, status: 400 });
    let adminDoc = await call(base, { method: 'POST', user: 'admin', body: input(99, 1), status: 201 });
    adminDoc = await action(adminDoc, 'submit', { user: 'admin' });
    await action(adminDoc, 'approve', { user: 'admin', status: 403 });
    await action(adminDoc, 'cancel', { user: 'admin' });
  });
  let first, second;
  await t.test('authoritative totals, duplicate create key, no draft reservation, unique rounds and revisions', async () => {
    const body = input(1);
    first = await create(body);
    assert.equal(first.netAmount, 3960); assert.equal(first.vat, 280); assert.equal(first.supplierId, 'supplier');
    assert.equal((await create(body)).id, first.id);
    await call(base, { method: 'POST', body: { ...body, items: [{ desc: 'Changed', amount: 1 }] }, status: 409 });
    await call(base, { method: 'POST', body: input(1), status: 409 });
    assert.equal((await call(`${base}/sources/po`)).used.before, 0);
    await call(`${base}/${first.id}`, { method: 'PUT', body: { ...body, updatedAt: 'stale' }, status: 409 });
    second = await create(input(2, 7000));
    first = await action(first, 'submit');
    await action(first, 'approve', { status: 403 });
    await action(first, 'approve', { user: 'viewer', status: 403 });
    await action(first, 'cancel', { user: 'approver', status: 403 });
    await action(first, 'approve', { user: 'approver', body: {}, status: 409 });
    await action(second, 'submit', { status: 409 });
    assert.equal((await call(`${base}/sources/po`)).used.before, 4000);
  });
  await t.test('return releases reservation, edits preserve identity, approve immutable, reject terminal and reasons required', async () => {
    await action(first, 'return', { user: 'approver', body: { updatedAt: first.updatedAt, reason: '' }, status: 400 });
    first = await action(first, 'return', { user: 'approver' });
    assert.equal((await call(`${base}/sources/po`)).used.before, 0);
    fixture.state().purchaseOrder[0].supplier.name = 'Renamed supplier';
    first = await call(`${base}/${first.id}`, { method: 'PUT', body: { ...input(1, 3000), updatedAt: first.updatedAt } });
    assert.equal(first.supplierSnapshot.name, 'Test contractor');
    first = await action(first, 'submit');
    first = await action(first, 'approve', { user: 'approver' });
    await action(first, 'approve', { user: 'approver', status: 409 });
    await call(`${base}/${first.id}`, { method: 'PUT', body: { ...input(1), updatedAt: first.updatedAt }, status: 409 });
    second = await action(second, 'submit');
    second = await action(second, 'reject', { user: 'approver' });
    await action(second, 'submit', { status: 409 });
    await call(base, { method: 'POST', body: input(2), status: 409 });
    const result = await call(`${base}?page=1&pageSize=1&q=${first.psNo}`);
    assert.equal(result.total, 1); assert.equal(result.data.length, 1);
    assert.ok((await call(`${base}/${first.id}`)).history.some(row => row.action === 'approve' && row.performedBy.fullName === 'approver'));
  });
  await t.test('PV cannot consume unapproved or mismatched PS, approved cancellation waits for PV', async () => {
    const pv = { sourceDocType: 'ps', sourceDocId: first.id, supplierId: 'supplier', amountBeforeTax: 3000, vat: 210, wht: 90, otherDeduction: 150, netPayment: 2970 };
    await call('/payment-vouchers', { method: 'POST', body: { ...pv, sourceDocId: second.id }, status: 409 });
    await call('/payment-vouchers', { method: 'POST', body: { ...pv, netPayment: 1 }, status: 400 });
    await call('/payment-vouchers', { method: 'POST', body: pv, status: 201 });
    await call('/payment-vouchers', { method: 'POST', body: pv, status: 409 });
    await action(first, 'cancel', { status: 409 });
    fixture.state().paymentVoucher[0].status = 'cancelled';
    first = await action(first, 'cancel');
    assert.equal((await call(`${base}/sources/po`)).used.before, 0);
    await action(first, 'cancel', { status: 409 });
  });
  await t.test('concurrent submissions cannot exceed shared PO; audit failure rolls back state', async () => {
    const a = await create(input(3, 6000)), b = await create(input(4, 6000));
    const statuses = await Promise.all([a, b].map(doc => fetch(`${url}${base}/${doc.id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token()}` }, body: JSON.stringify({ updatedAt: doc.updatedAt }),
    }).then(response => response.status)));
    assert.deepEqual(statuses.sort(), [200, 409]);
    assert.equal((await call(`${base}/sources/po`)).used.before, 6000);
    fixture.failAudit(true);
    const count = fixture.state().contractorPaymentRequest.length;
    await call(base, { method: 'POST', body: input(5, 1000), status: 500 });
    assert.equal(fixture.state().contractorPaymentRequest.length, count);
    const pending = fixture.state().contractorPaymentRequest.find(row => row.status === 'pending');
    await action({ ...pending, updatedAt: pending.updatedAt.toISOString() }, 'return', { user: 'approver', status: 500 });
    assert.equal((await call(`${base}/sources/po`)).used.before, 6000);
    fixture.failAudit(false);
    assert.ok(fixture.locks.some(lock => lock.sql.includes('purchase_orders') && lock.sql.includes('FOR UPDATE')));
    assert.ok(fixture.locks.some(lock => lock.sql.includes('contractor_payment_requests') && lock.sql.includes('FOR UPDATE')));
  });
  await t.test('NO VAT, changed source, inactive supplier and smaller PO are revalidated before submission', async () => {
    fixture.state().purchaseOrder.push({ ...structuredClone(fixture.state().purchaseOrder[0]),
      id: 'po2', poNo: 'PO2610002', subTotal: 100, discount: 0, vat: 0, netAmount: 100, vatConfig: 'NO_VAT' });
    let doc = await create({ ...input(1, 50), poId: 'po2' });
    assert.equal(doc.vat, 0); assert.equal(doc.netAmount, 46);
    fixture.state().purchaseOrder.find(row => row.id === 'po2').supplier.active = false;
    await action(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder.find(row => row.id === 'po2').supplier.active = true;
    fixture.state().purchaseOrder.find(row => row.id === 'po2').supplierId = 'changed';
    await action(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder.find(row => row.id === 'po2').supplierId = 'supplier';
    fixture.state().purchaseOrder.find(row => row.id === 'po2').discount = 99;
    await action(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder.find(row => row.id === 'po2').discount = 0;
    fixture.state().purchaseOrder.find(row => row.id === 'po2').status = 'cancelled';
    await action(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder.find(row => row.id === 'po2').status = 'draft';
    doc = await action(doc, 'submit');
    doc = await action(doc, 'approve', { user: 'approver' });
    assert.equal(doc.status, 'approved');
  });
  await t.test('PO edits blocked by reserved PS; legacy cannot change or be silently recalculated', async () => {
    await call('/purchase-orders/po', { method: 'PUT', body: { supplierId: 'supplier', items: [{ desc: 'Changed', qty: 1, unitPrice: 1 }] }, status: 409 });
    fixture.state().contractorPaymentRequest.push({ id: 'legacy', lifecycleVersion: 0, psNo: 'OLD', poId: 'po', paymentRound: 50, status: 'draft', items: [], updatedAt: new Date() });
    await call(`${base}/legacy`, { user: 'viewer' });
    await call(`${base}/legacy/cancel`, { method: 'POST', body: { reason: 'No', updatedAt: new Date().toISOString() }, status: 409 });
    await call(`${base}/sources/po`, { status: 409 });
    await call(base, { method: 'POST', body: input(6, 1), status: 409 });
  });
});
