const test = require('node:test');
const assert = require('node:assert/strict');
const { chequeInput, normalizedAccount, stageData } = require('../src/lib/chequePayment');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');
const { randomUUID } = require('crypto');
const { once } = require('events');

test('CQ company account identity and strict date/state validation', () => {
  assert.equal(normalizedAccount(' 001-234 567 '), '001234567');
  const input = { docDate: '2026-10-26', paymentVoucherId: 'pv', bankName: 'Company bank', bankBranch: 'Main',
    bankAccountNo: '001-234 567', chequeNo: '000001', chequeDate: '2026-11-01', payee: 'Supplier' };
  assert.equal(chequeInput(input).bankAccount, '001234567');
  for (const change of [{ docDate: '2026-02-30' }, { bankAccountNo: 'bad account' }, { chequeNo: '' }]) {
    assert.throws(() => chequeInput({ ...input, ...change }), { status: 400 });
  }
  const doc = { status: 'Signed', docDate: new Date('2026-10-26'), signedAt: new Date('2026-10-26'), attachments: [] };
  assert.throws(() => stageData(doc, { status: 'Released', releaseDate: '2026-10-26', recipient: 'Receiver' }), { status: 400 });
  doc.attachments.push({ category: 'cq-release' });
  assert.equal(stageData(doc, { status: 'Released', releaseDate: '2026-10-26', recipient: 'Receiver' }).recipient, 'Receiver');
  assert.throws(() => stageData(doc, { status: 'Cleared' }), { status: 409 });
});

test('CQ actual HTTP stages, payment/reversal, permissions, evidence, duplicate identity and legacy guards', async t => {
  process.env.JWT_SECRET = 'cq-local-test-secret';
  const fixture = createContractorPaymentApp(), server = fixture.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`, base = '/api/ap/cheque-payments';
  async function call(path, { method = 'GET', body, user = 'maker', status = 200 } = {}) {
    const response = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  }
  async function source(round, paymentMethod = 'cheque') {
    const ps = '/api/ap/contractor-payments', pv = '/api/ap/payment-vouchers';
    let doc = await call(ps, { method: 'POST', status: 201, body: { docDate: '2026-10-26', poId: 'po', paymentRound: round,
      requestKey: randomUUID(), items: [{ desc: `CQ source ${round}`, amount: 100 }], whtRate: 3, retentionRate: 5 } });
    doc = await call(`${ps}/${doc.id}/submit`, { method: 'POST', body: { updatedAt: doc.updatedAt } });
    doc = await call(`${ps}/${doc.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: doc.updatedAt } });
    let voucher = await call(pv, { method: 'POST', status: 201, body: { pvDate: '2026-10-26', sourceDocId: doc.id, paymentMethod,
      taxpayerType: 'company', taxDescription: 'WHT', requestKey: randomUUID() } });
    voucher = await call(`${pv}/${voucher.id}/submit`, { method: 'POST', body: { updatedAt: voucher.updatedAt } });
    return call(`${pv}/${voucher.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: voucher.updatedAt } });
  }
  const input = (pv, chequeNo = '000001') => ({ docDate: '2026-10-26', paymentVoucherId: pv.id, bankName: 'Company bank', bankBranch: 'Main',
    bankAccountNo: '001-234 567', chequeNo, chequeDate: '2026-11-01', payee: 'Supplier', requestKey: randomUUID() });
  const get = id => call(`${base}/${id}`);
  const stage = (doc, status, body = {}, user = 'maker', expected = 200) => call(`${base}/${doc.id}/status`, {
    method: 'PATCH', user, status: expected, body: { status, updatedAt: doc.updatedAt, ...body },
  });
  async function attach(doc, category, user = 'maker', expected = 201, overrides = {}, filename = 'cq-evidence.pdf', type = 'application/pdf') {
    const body = new FormData(); body.set('chequePaymentId', doc.id); body.set('updatedAt', doc.updatedAt); body.set('category', category);
    for (const [key, value] of Object.entries(overrides)) body.set(key, value);
    body.append('files', new Blob(['%PDF-1.4 Test'], { type }), filename);
    const response = await fetch(`${url}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${fixture.token(user)}` }, body });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  }
  let pv, doc, body;
  await t.test('approved cheque PV only; auth, full amounts, snapshot, idempotency and reservation', async () => {
    await call(base, { user: null, status: 401 });
    pv = await source(1); body = input(pv);
    await call(base, { method: 'POST', body, user: 'viewer', status: 403 });
    await call(base, { method: 'POST', body: { ...body, amount: 1 }, status: 400 });
    doc = await call(base, { method: 'POST', body, status: 201 });
    assert.equal(doc.amount, 99); assert.equal(doc.bankAccount, '001234567'); assert.equal(doc.voucherSnapshot.sourceNo, pv.sourceNo);
    assert.match(doc.cqNo, /^CQ2610\d{4}$/);
    assert.equal((await call(base, { method: 'POST', body, status: 201 })).id, doc.id);
    await call(base, { method: 'POST', body: { ...body, payee: 'Changed' }, status: 409 });
    await call(base, { method: 'POST', body: { ...body, requestKey: randomUUID(), chequeNo: '000002' }, status: 409 });
    assert.equal((await call(`${base}/sources`)).length, 0);
    const cash = await source(2, 'cash');
    await call(base, { method: 'POST', body: input(cash), status: 409 });
    const legacy = fixture.state().paymentVoucher.find(row => row.id === cash.id);
    legacy.lifecycleVersion = 0;
    await call(base, { method: 'POST', body: input(cash), status: 409 });
  });
  await t.test('Prepared edit identity/date immutable; evidence rejects invalid file/category/binding and stale revision; cleanup on rollback', async () => {
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...body, updatedAt: 'stale' }, status: 409 });
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...body, chequeNo: 'CHANGED', updatedAt: doc.updatedAt }, status: 409 });
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...body, docDate: '2026-11-01', updatedAt: doc.updatedAt }, status: 409 });
    await call(`${base}/${doc.id}`, { method: 'PUT', user: 'viewer', body: { ...body, updatedAt: doc.updatedAt }, status: 403 });
    doc = await call(`${base}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...body, remark: 'Edited', updatedAt: doc.updatedAt } });
    await attach(doc, 'cq-release', 'maker', 409);
    await attach(doc, 'cq-document', 'viewer', 403);
    await attach(doc, 'cq-document', 'maker', 400, { paymentVoucherId: pv.id });
    await attach(doc, 'cq-document', 'maker', 400, {}, 'bad.gif', 'image/gif');
    const storageBefore = fixture.storageOperations.length;
    fixture.failAudit(true); await attach(doc, 'cq-document', 'maker', 500); fixture.failAudit(false);
    assert.deepEqual(fixture.storageOperations.slice(storageBefore).map(row => row.action), ['upload', 'delete']);
    await attach(doc, 'cq-document', 'editor'); const stale = doc.updatedAt;
    doc = await get(doc.id); assert.equal(doc.attachments.length, 1); assert.notEqual(doc.updatedAt, stale);
    await attach({ ...doc, updatedAt: stale }, 'cq-document', 'maker', 409);
    await call(`/api/upload/${doc.attachments[0].id}`, { method: 'DELETE', user: 'editor', body: { updatedAt: doc.updatedAt } });
    doc = await get(doc.id); assert.equal(doc.attachments.length, 0);
  });
  await t.test('no skipping, separate Printed action, signer and permissions; no pay before Released', async () => {
    await stage(doc, 'Signed', { signedDate: '2026-10-26', signer: 'Signer' }, 'approver', 409);
    await stage(doc, 'Printed', { printedDate: '2026-10-26' }, 'viewer', 403);
    doc = await stage(doc, 'Printed', { printedDate: '2026-10-26' });
    await call(`${base}/${doc.id}`, { method: 'PUT', body: { ...body, updatedAt: doc.updatedAt }, status: 409 });
    await stage(doc, 'Signed', { signedDate: '2026-10-25', signer: 'Signer' }, 'approver', 400);
    await stage(doc, 'Signed', { signedDate: '2026-10-26' }, 'approver', 400);
    doc = await stage(doc, 'Signed', { signedDate: '2026-10-26', signer: 'Maker with approve permission' });
    assert.equal((await call(`/api/ap/payment-vouchers/${pv.id}`)).paidAt, null);
    await stage(doc, 'Released', { releaseDate: '2026-10-26', recipient: 'Receiver' }, 'approver', 403);
    await stage(doc, 'Released', { releaseDate: '2026-10-26', recipient: 'Receiver' }, 'payer', 400);
  });
  await t.test('postdated cheque release atomically marks PV paid once; audit failure restores both records', async () => {
    await attach(doc, 'cq-release', 'payer'); doc = await get(doc.id);
    fixture.failAudit('cheque_payment');
    await stage(doc, 'Released', { releaseDate: '2026-10-26', recipient: 'Receiver' }, 'payer', 500);
    fixture.failAudit(false);
    assert.equal((await get(doc.id)).status, 'Signed');
    assert.equal((await call(`/api/ap/payment-vouchers/${pv.id}`)).paidAt, null);
    const release = { releaseDate: '2026-10-26', recipient: 'Receiver' }, previous = doc;
    doc = await stage(doc, 'Released', release, 'payer');
    await stage(previous, 'Released', release, 'payer', 409);
    const paid = await call(`/api/ap/payment-vouchers/${pv.id}`);
    assert.ok(paid.paidAt); assert.equal(paid.paymentReference, doc.cqNo); assert.equal(paid.recipient, 'Receiver');
    assert.equal((await call(base, { method: 'POST', body, status: 201 })).id, doc.id);
    await call(`/api/upload/${doc.attachments[0].id}`, { method: 'DELETE', user: 'payer', body: { updatedAt: doc.updatedAt }, status: 409 });
    await call(`/api/ap/payment-vouchers/${pv.id}/cancel`, { method: 'POST', body: { updatedAt: paid.updatedAt, reason: 'Bypass' }, status: 409 });
    await stage(doc, 'Cancelled', { cancelledDate: '2026-10-26', reason: 'No pay' }, 'canceller', 403);
  });
  await t.test('Cleared requires bank evidence/reference and date >= cheque date; preserves payment date', async () => {
    await attach(doc, 'cq-clear', 'payer'); doc = await get(doc.id);
    await stage(doc, 'Cleared', { clearedDate: '2026-10-31', clearingReference: 'BANK' }, 'payer', 400);
    await stage(doc, 'Cleared', { clearedDate: '2026-11-01' }, 'payer', 400);
    const before = await call(`/api/ap/payment-vouchers/${pv.id}`);
    doc = await stage(doc, 'Cleared', { clearedDate: '2026-11-01', clearingReference: 'BANK-001' }, 'payer');
    assert.equal((await call(`/api/ap/payment-vouchers/${pv.id}`)).paidAt, before.paidAt);
    await attach(doc, 'cq-clear', 'payer', 409);
  });
  await t.test('cleared reversal dual permission/date/ref/proof; cancels CQ and PV atomically; PS stays approved', async () => {
    await attach(doc, 'cq-reversal', 'payer', 403);
    await stage(doc, 'Cancelled', { cancelledDate: '2026-11-02', reason: 'Returned', reversalReference: 'RETURN' }, 'maker', 400);
    await attach(doc, 'cq-reversal'); doc = await get(doc.id);
    await stage(doc, 'Cancelled', { cancelledDate: '2026-10-31', reason: 'Returned', reversalReference: 'RETURN' }, 'maker', 400);
    fixture.failAudit('cheque_payment');
    await stage(doc, 'Cancelled', { cancelledDate: '2026-11-02', reason: 'Funds returned', reversalReference: 'RET-001' }, 'maker', 500);
    fixture.failAudit(false);
    assert.equal((await get(doc.id)).status, 'Cleared');
    assert.equal((await call(`/api/ap/payment-vouchers/${pv.id}`)).status, 'approved');
    doc = await stage(doc, 'Cancelled', { cancelledDate: '2026-11-02', reason: 'Funds returned', reversalReference: 'RET-001' });
    assert.ok(doc.releaseDate); assert.ok(doc.clearedAt); assert.equal(doc.attachments.length, 3);
    const reversed = await call(`/api/ap/payment-vouchers/${pv.id}`);
    assert.equal(reversed.status, 'cancelled'); assert.ok(reversed.paidAt); assert.ok(reversed.reversedAt);
    assert.equal(reversed.reversalReference, 'RET-001');
    assert.equal((await call(`/api/ap/contractor-payments/${pv.sourceDocId}`)).status, 'approved');
    assert.ok((await call('/api/ap/payment-vouchers/sources')).some(row => row.id === pv.sourceDocId));
    assert.ok((await get(doc.id)).history.some(row => row.action === 'reverse'));
    await attach(doc, 'cq-reversal', 'maker', 409);
    await stage(doc, 'Printed', { printedDate: '2026-11-02' }, 'maker', 409);
  });
  await t.test('cancel before release frees PV, not cheque number; legacy and concurrent duplicate backstops', async () => {
    const voucher = await source(3), firstBody = input(voucher, '000002');
    let first = await call(base, { method: 'POST', body: firstBody, status: 201 });
    first = await stage(first, 'Cancelled', { cancelledDate: '2026-10-26', reason: 'Spoiled' }, 'canceller');
    assert.equal((await call(`/api/ap/payment-vouchers/${voucher.id}`)).paidAt, null);
    await call(base, { method: 'POST', body: { ...firstBody, requestKey: randomUUID(), bankAccountNo: '001234567' }, status: 409 });
    const requests = [1, 2].map(i => fetch(`${url}${base}`, { method: 'POST', headers: { Authorization: `Bearer ${fixture.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input(voucher, `00000${i + 2}`)) }));
    const results = await Promise.all(requests);
    assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
    const active = await results.find(row => row.status === 201).json();
    fixture.state().chequePayment.find(row => row.id === active.id).lifecycleVersion = 0;
    await stage(active, 'Cancelled', { cancelledDate: '2026-10-26', reason: 'Legacy' }, 'maker', 409);
    await call(base, { method: 'POST', body: input(voucher, '999999'), status: 409 });
    assert.equal((await call(`${base}/sources`)).some(row => row.id === voucher.id), false);
    assert.equal((await call(`${base}?page=1&pageSize=1&status=Cancelled`)).total, 2);
    const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'sql', 'accounting-cheque-payments.sql'), 'utf8');
    assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE FROM|DROP TABLE)\b/i);
    assert.match(sql, /cheque_payments_normalized_number_unique/);
    assert.ok(fixture.locks.some(lock => lock.sql.includes('cheque_payments') && lock.sql.includes('FOR UPDATE')));
  });
  await t.test('normalized legacy number blocks another PV; concurrent postdated release and reversal before clearance', async () => {
    const voucher = await source(4);
    fixture.state().chequePayment.push({ id: 'old-cancelled-cq', cqNo: 'OLD', lifecycleVersion: 0, bankAccount: '001-234 567', chequeNo: 'old001', status: 'Cancelled' });
    await call(base, { method: 'POST', body: input(voucher, 'OLD001'), status: 409 });
    let issued = await call(base, { method: 'POST', body: input(voucher, '000008'), status: 201 });
    issued = await stage(issued, 'Printed', { printedDate: '2026-10-26' });
    issued = await stage(issued, 'Signed', { signedDate: '2026-10-26', signer: 'Signer' }, 'approver');
    await attach(issued, 'cq-release', 'payer'); issued = await get(issued.id);
    const results = await Promise.all([1, 2].map(() => fetch(`${url}${base}/${issued.id}/status`, { method: 'PATCH',
      headers: { Authorization: `Bearer ${fixture.token('payer')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Released', updatedAt: issued.updatedAt, releaseDate: '2026-10-26', recipient: 'Receiver' }),
    })));
    assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
    issued = await get(issued.id);
    await attach(issued, 'cq-reversal'); issued = await get(issued.id);
    issued = await stage(issued, 'Cancelled', { cancelledDate: '2026-10-27', reason: 'Cheque returned', reversalReference: 'STOP-001' });
    assert.equal(issued.status, 'Cancelled'); assert.equal(issued.clearedAt ?? null, null);
    assert.equal((await call(`/api/ap/payment-vouchers/${voucher.id}`)).status, 'cancelled');
  });
});
