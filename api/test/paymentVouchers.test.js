const test = require('node:test');
const assert = require('node:assert/strict');
const { voucherInput, payoutData, reversalData, voucherAmounts } = require('../src/lib/paymentVoucher');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');
const { randomUUID } = require('crypto');
const { once } = require('events');

test('PV validates source, method, calendar dates and tax metadata without trusting totals', () => {
  const body = { pvDate: '2026-10-26', sourceDocId: 'ps', paymentMethod: 'transfer' };
  assert.equal(voucherInput(body).sourceDocId, 'ps');
  for (const patch of [{ pvDate: '2026-02-30' }, { paymentMethod: 'other' }, { sourceDocType: 'po' }, { sourceDocId: '' }]) {
    assert.throws(() => voucherInput({ ...body, ...patch }), { status: 400 });
  }
  assert.deepEqual(voucherAmounts({ currentRequestAmount: '1000.01', vat: 70, wht: 30, retention: 50, netAmount: '990.01' }),
    { amountBeforeTax: 1000.01, vat: 70, wht: 30, otherDeduction: 50, netPayment: 990.01 });
  assert.throws(() => voucherAmounts({ currentRequestAmount: 100, vat: 7, wht: 0, retention: 0, netAmount: 1 }), { status: 409 });
});

test('PV payout and reversal require real chronological dates and correctly categorized evidence', () => {
  const doc = { paymentMethod: 'transfer', pvDate: new Date('2026-10-26'), attachments: [] };
  const body = { paidDate: '2026-10-26', payerBank: 'Company bank', payeeBank: 'Supplier bank', paymentReference: 'TX-1', recipient: 'Supplier' };
  assert.throws(() => payoutData(doc, body), { status: 400 });
  doc.attachments = [{ category: 'pv-payment' }];
  assert.equal(payoutData(doc, body).paymentReference, 'TX-1');
  assert.throws(() => payoutData(doc, { ...body, paidDate: '2026-10-25' }), { status: 400 });
  assert.throws(() => payoutData({ ...doc, paymentMethod: 'cheque' }, body), { status: 409 });
  assert.equal(payoutData({ ...doc, paymentMethod: 'cash', attachments: [] }, { paidDate: '2026-10-26', recipient: 'Receiver' }).recipient, 'Receiver');
  assert.throws(() => reversalData({ ...doc, paidAt: new Date('2026-10-27') }, { reversalDate: '2026-10-26', reversalReference: 'RET-1' }), { status: 400 });
});

test('PV actual HTTP reservation approval payout evidence reversal and cheque interlocks', async t => {
  process.env.JWT_SECRET = 'pv-local-test-secret';
  const fixture = createContractorPaymentApp(), server = fixture.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { method = 'GET', body, user = 'maker', status = 200 } = {}) {
    const response = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  }
  const base = '/api/ap/payment-vouchers', psBase = '/api/ap/contractor-payments';
  async function ps(round, amount = 1000) {
    let doc = await call(psBase, { method: 'POST', status: 201, body: { docDate: '2026-10-26', poId: 'po', paymentRound: round,
      whtRate: 3, retentionRate: 5, requestKey: randomUUID(), items: [{ desc: `PS Work ${round}`, amount }] } });
    doc = await call(`${psBase}/${doc.id}/submit`, { method: 'POST', body: { updatedAt: doc.updatedAt } });
    return call(`${psBase}/${doc.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: doc.updatedAt } });
  }
  const input = (id, paymentMethod = 'transfer') => ({ pvDate: '2026-10-26', sourceDocId: id, sourceDocType: 'ps',
    requestKey: randomUUID(), paymentMethod, taxpayerType: 'company', taxDescription: 'Services reference', netPayment: 1 });
  const act = (doc, action, options = {}) => call(`${base}/${doc.id}/${action}`, { method: 'POST',
    body: { updatedAt: doc.updatedAt, reason: 'Test reason' }, ...options });
  const get = id => call(`${base}/${id}`);
  async function attach(doc, category, user = 'maker', expected = 201, overrides = {}, filename = 'evidence.pdf', type = 'application/pdf') {
    const form = new FormData();
    form.set('paymentVoucherId', doc.id); form.set('updatedAt', doc.updatedAt); form.set('category', category);
    for (const [key, value] of Object.entries(overrides)) form.set(key, value);
    form.append('files', new Blob(['%PDF-1.4\nTest'], { type }), filename);
    const response = await fetch(`${url}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${fixture.token(user)}` }, body: form });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  }
  let source, doc;
  await t.test('auth, PS-only sources, server amounts, idempotency and draft reservation', async () => {
    await call(base, { user: null, status: 401 });
    source = await ps(1);
    assert.equal((await call(`${base}/sources`)).length, 1);
    const body = input(source.id);
    await call(base, { method: 'POST', user: 'viewer', body, status: 403 });
    await call(base, { method: 'POST', body: { ...body, sourceDocType: 'po' }, status: 400 });
    doc = await call(base, { method: 'POST', body, status: 201 });
    assert.equal(doc.netPayment, 990); assert.equal(doc.amountBeforeTax, 1000);
    assert.equal((await call(base, { method: 'POST', body, status: 201 })).id, doc.id);
    assert.equal((await call(`${base}/sources`)).length, 0);
    await call(base, { method: 'POST', body: { ...body, requestKey: randomUUID() }, status: 409 });
    await call(base, { method: 'POST', body: { ...body, remark: 'different' }, status: 409 });
    await call(`${psBase}/${source.id}/cancel`, { method: 'POST', body: { updatedAt: source.updatedAt, reason: 'No' }, status: 409 });
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...body, updatedAt: 'stale' }, status: 409 });
    const other = await ps(2);
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...input(other.id), updatedAt: doc.updatedAt }, status: 409 });
  });
  await t.test('tax required before submit, self-approval blocked, return keeps reservation, revisions mandatory', async () => {
    const originalRevision = doc.updatedAt;
    await attach(doc, 'pv-document', 'maker', 400, {}, 'not-allowed.gif', 'image/gif');
    await attach(doc, 'pv-document');
    doc = await get(doc.id);
    assert.notEqual(doc.updatedAt, originalRevision);
    await attach({ ...doc, updatedAt: originalRevision }, 'pv-document', 'maker', 409);
    const attachment = doc.attachments[0];
    await call(`/api/upload/${attachment.id}`, { method: 'DELETE', user: 'editor', body: { updatedAt: doc.updatedAt } });
    doc = await get(doc.id); assert.equal(doc.attachments.length, 0);
    const storageBefore = fixture.storageOperations.length;
    fixture.failAudit(true); await attach(doc, 'pv-document', 'maker', 500); fixture.failAudit(false);
    const cleanup = fixture.storageOperations.slice(storageBefore);
    assert.deepEqual(cleanup.map(row => row.action), ['upload', 'delete']);
    assert.equal(cleanup[0].key, cleanup[1].key);
    doc = await get(doc.id); assert.equal(doc.attachments.length, 0);
    doc = await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...input(source.id), taxpayerType: '', updatedAt: doc.updatedAt } });
    await act(doc, 'submit', { status: 400 });
    doc = await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...input(source.id), updatedAt: doc.updatedAt } });
    doc = await act(doc, 'submit');
    await act(doc, 'approve', { status: 403 });
    await act(doc, 'approve', { user: 'viewer', status: 403 });
    await act(doc, 'return', { user: 'approver', body: { updatedAt: doc.updatedAt }, status: 400 });
    doc = await act(doc, 'return', { user: 'approver' });
    await call(base, { method: 'POST', body: input(source.id), status: 409 });
    doc = await act(doc, 'submit');
    doc = await act(doc, 'approve', { user: 'approver' });
    assert.equal(doc.paidAt, null);
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...input(source.id), updatedAt: doc.updatedAt }, status: 409 });
    await act(doc, 'pay', { user: 'approver', status: 403 });
  });
  await t.test('evidence category permissions, immutability and transfer payout', async () => {
    await attach(doc, 'pv-payment', 'viewer', 403);
    await attach(doc, 'pv-reversal', 'maker', 409);
    await attach(doc, 'pv-payment', 'payer', 400, { receiptVoucherId: 'rv' });
    await act(doc, 'pay', { user: 'payer', body: { updatedAt: doc.updatedAt, paidDate: '2026-10-26', recipient: 'Supplier',
      payerBank: 'Payer', payeeBank: 'Payee', paymentReference: 'TX' }, status: 400 });
    await attach(doc, 'pv-payment', 'payer');
    doc = await get(doc.id);
    const payment = doc.attachments[0];
    await call(`/api/upload/${payment.id}`, { method: 'DELETE', user: 'viewer', body: { updatedAt: doc.updatedAt }, status: 403 });
    const paidBody = { updatedAt: doc.updatedAt, paidDate: '2026-10-26', recipient: 'Supplier', payerBank: 'Bank 001', payeeBank: 'Bank 002', paymentReference: 'TX-001' };
    doc = await act(doc, 'pay', { user: 'payer', body: paidBody });
    assert.ok(doc.paidAt); assert.equal(doc.paymentReference, 'TX-001');
    await act(doc, 'pay', { user: 'payer', body: { ...paidBody, updatedAt: doc.updatedAt }, status: 409 });
    await call(`/api/upload/${payment.id}`, { method: 'DELETE', body: { updatedAt: doc.updatedAt }, status: 409 });
    await attach(doc, 'pv-payment', 'maker', 409);
  });
  await t.test('paid reversal needs dual permission, date/reference/proof; rollback preserves payment', async () => {
    await act(doc, 'cancel', { user: 'canceller', status: 403 });
    await attach(doc, 'pv-reversal', 'payer', 403);
    await act(doc, 'cancel', { body: { updatedAt: doc.updatedAt, reason: 'Reverse', reversalDate: '2026-10-26', reversalReference: 'RET' }, status: 400 });
    await attach(doc, 'pv-reversal');
    doc = await get(doc.id);
    const body = { updatedAt: doc.updatedAt, reason: 'Returned funds', reversalDate: '2026-10-27', reversalReference: 'RET-001' };
    fixture.failAudit(true); await act(doc, 'cancel', { body, status: 500 }); fixture.failAudit(false);
    assert.equal((await get(doc.id)).status, 'approved');
    doc = await act(doc, 'cancel', { body });
    assert.equal(doc.status, 'cancelled'); assert.ok(doc.paidAt); assert.ok(doc.reversedAt);
    assert.ok(doc.attachments.some(file => file.category === 'pv-payment'));
    assert.ok((await get(doc.id)).history.some(row => row.action === 'reverse'));
    assert.equal((await call(`${base}?page=1&pageSize=1&payment=reversed`)).total, 1);
    assert.equal((await call(`${psBase}/${source.id}`)).status, 'approved');
    const replacement = await call(base, { method: 'POST', body: input(source.id, 'cash'), status: 201 });
    let rejected = await act(replacement, 'submit');
    rejected = await act(rejected, 'reject', { user: 'approver' });
    assert.equal(rejected.status, 'rejected');
    assert.ok((await call(`${base}/sources`)).some(row => row.id === source.id));
  });
  await t.test('cash payout without transfer evidence and concurrent reservation/pay idempotency', async () => {
    const body = input(source.id, 'cash');
    const responses = await Promise.all([body, { ...body, requestKey: randomUUID() }].map(body => fetch(`${url}${base}`, {
      method: 'POST', headers: { Authorization: `Bearer ${fixture.token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })));
    assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
    let cash = await get((await responses.find(row => row.status === 201).json()).id);
    cash = await act(cash, 'submit'); cash = await act(cash, 'approve', { user: 'approver' });
    const paid = await Promise.all([1, 2].map(() => fetch(`${url}${base}/${cash.id}/pay`, {
      method: 'POST', headers: { Authorization: `Bearer ${fixture.token('payer')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedAt: cash.updatedAt, paidDate: '2026-10-26', recipient: 'Cash recipient' }),
    })));
    assert.deepEqual(paid.map(row => row.status).sort(), [200, 409]);
  });
  await t.test('cheque PV cannot be manually paid, cheques serialize with cancel and require matching approved source', async () => {
    const source2 = fixture.state().contractorPaymentRequest.find(row => row.paymentRound === 2);
    let cheque = await call(base, { method: 'POST', body: input(source2.id, 'cheque'), status: 201 });
    const cq = { paymentVoucherId: cheque.id, docDate: '2026-10-26', bankName: 'Bank', bankBranch: 'Main', bankAccountNo: '001-234567',
      chequeNo: '00001', chequeDate: '2026-10-26', payee: 'Supplier', requestKey: randomUUID(), amount: cheque.netPayment };
    await call('/api/ap/cheque-payments', { method: 'POST', body: cq, status: 409 });
    cheque = await act(cheque, 'submit'); cheque = await act(cheque, 'approve', { user: 'approver' });
    await act(cheque, 'pay', { user: 'payer', status: 409 });
    await call('/api/ap/cheque-payments', { method: 'POST', body: { ...cq, amount: 1 }, status: 400 });
    const issued = await call('/api/ap/cheque-payments', { method: 'POST', body: cq, status: 201 });
    await act(cheque, 'cancel', { status: 409 });
    await call(`/api/ap/cheque-payments/${issued.id}/status`, { method: 'PATCH', body: { status: 'Cleared', updatedAt: issued.updatedAt }, status: 409 });
    await call(`/api/ap/cheque-payments/${issued.id}/status`, { method: 'PATCH', body: { status: 'Cancelled', updatedAt: issued.updatedAt, cancelledDate: '2026-10-26', reason: 'Void' } });
    cheque = await act(cheque, 'cancel'); assert.equal(cheque.status, 'cancelled');
  });
  await t.test('legacy is read-only and blocks source reuse; SQL never rewrites money/status', async () => {
    const legacySource = await ps(3);
    fixture.state().paymentVoucher.push({ id: 'old-pv', pvNo: 'OLD', lifecycleVersion: 0, sourceDocType: 'ps', sourceDocId: legacySource.id, status: 'draft', items: [] });
    await call(`${base}/old-pv/cancel`, { method: 'POST', body: { reason: 'No', updatedAt: 'old' }, status: 409 });
    await call(base, { method: 'POST', body: input(legacySource.id), status: 409 });
    assert.equal((await call(`${base}/sources`)).some(row => row.id === legacySource.id), false);
    const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'sql', 'accounting-payment-vouchers.sql'), 'utf8');
    assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE FROM|DROP TABLE)\b/i);
    assert.match(sql, /payment_vouchers_active_ps_unique/);
    assert.ok(fixture.locks.some(lock => lock.sql.includes('payment_vouchers') && lock.sql.includes('FOR UPDATE')));
    const adminSource = await ps(4);
    let adminDoc = await call(base, { method: 'POST', body: input(adminSource.id, 'cash'), user: 'admin', status: 201 });
    adminDoc = await act(adminDoc, 'submit', { user: 'admin' });
    await act(adminDoc, 'approve', { user: 'admin', status: 403 });
    adminDoc = await act(adminDoc, 'approve');
    adminDoc = await act(adminDoc, 'cancel', { user: 'admin' });
    assert.equal(adminDoc.status, 'cancelled');
  });
});
