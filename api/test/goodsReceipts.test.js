const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');
const { randomUUID } = require('crypto');
const { quantity, receiptInput } = require('../src/lib/goodsReceipt');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');

test('GR quantities reject invalid precision signs zero dates duplicate or missing PO-line identity', () => {
  assert.equal(quantity('0.001'), 1);
  assert.equal(quantity('999999999.999'), 999999999999);
  for (const value of ['0', '-1', '1e3', '1.0001', '', NaN, null]) assert.throws(() => quantity(value), { status: 400 });
  const input = { receiptDate: '2026-10-26', poId: 'po', sender: 'Sender', receiver: 'Receiver',
    items: [{ poLineId: 'line', productId: 'product', currentReceiptQty: '1.123' }] };
  assert.equal(receiptInput(input).items[0].currentReceiptQty, 1.123);
  assert.throws(() => receiptInput({ ...input, receiptDate: '2026-02-30' }), { status: 400 });
  assert.throws(() => receiptInput({ ...input, items: [input.items[0], input.items[0]] }), { status: 400 });
  const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'sql', 'accounting-goods-receipts.sql'), 'utf8').replace(/--[^\r\n]*/g, '');
  assert.match(sql, /po_line_id TEXT REFERENCES purchase_order_lines\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|INSERT|DROP|TRUNCATE)\b/i);
});

test('GR actual HTTP authoritative receipt reservation mapping approval stock reversal evidence and legacy', async t => {
  process.env.JWT_SECRET = 'gr-local-test-secret';
  const fixture = createContractorPaymentApp(), state = () => fixture.state();
  Object.assign(state().purchaseOrder[0], { status: 'approved', updatedAt: new Date('2026-10-01'), items: [
    { id: 'line', seq: 0, desc: 'PO manual materials', qty: 10, unit: 'Pcs', productId: null },
    { id: 'line2', seq: 1, desc: 'Same product another PO line', qty: 10, unit: 'Pcs', productId: 'product' },
    { id: 'service-line', seq: 2, desc: 'Inspection service', qty: 2, unit: 'Job', productId: 'service' },
  ] });
  state().accountProduct.push({ id: 'product', code: 'MAT', name: 'Material', active: true, unit: 'Pcs', productType: 'stored' },
    { id: 'alternate', code: 'ALT', name: 'Alternate', active: true, unit: 'Pcs', productType: 'manufactured' },
    { id: 'service', code: 'SVC', name: 'Inspection', active: true, unit: 'Job', productType: 'service' });
  state().warehouse.push({ id: 'warehouse', code: 'MAIN', name: 'Main', active: true }, { id: 'warehouse2', code: 'SECOND', name: 'Second', active: true });
  const server = fixture.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, root = '/api/ap/goods-receipts';
  async function call(path, { method = 'GET', body, user = 'maker', status = 200 } = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data)); return data;
  }
  const input = (amount = 6, patch = {}) => ({ receiptDate: '2026-10-26', poId: 'po', warehouseId: 'warehouse', sender: 'Sender', receiver: 'Receiver',
    requestKey: randomUUID(), items: [{ poLineId: 'line', productId: 'product', currentReceiptQty: amount }], ...patch });
  const create = (body = input(), status = 201) => call(root, { method: 'POST', body, status });
  const get = doc => call(`${root}/${doc.id}`);
  const act = (doc, action, options = {}) => call(`${root}/${doc.id}/${action}`, { method: 'POST',
    body: { updatedAt: doc.updatedAt, reason: 'Test reason', cancellationDate: '2026-10-27' }, ...options });
  async function attach(doc, { user = 'maker', status = 201, category = 'gr-receipt', patch = {}, filename = 'receipt.pdf', type = 'application/pdf' } = {}) {
    const form = new FormData();
    form.set('goodsReceiptId', doc.id); form.set('updatedAt', doc.updatedAt); form.set('category', category);
    for (const [key, value] of Object.entries(patch)) form.set(key, value);
    form.append('files', new Blob(['%PDF-1.4\nGR evidence'], { type }), filename);
    const response = await fetch(`${base}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${fixture.token(user)}` }, body: form });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  }
  const ready = async body => { const doc = await create(body); await attach(doc); return get(doc); };
  let first, second;
  await t.test('sources and active lookups only; ignores forged quantities and supplier; no stock on create; idempotency', async () => {
    await call(root, { user: null, status: 401 });
    await call(root, { method: 'POST', user: 'viewer', body: input(), status: 403 });
    assert.equal((await call(`${root}/sources`)).length, 1);
    assert.equal((await call(`${root}/lookups`)).products.length, 3);
    state().purchaseOrder[0].status = 'draft';
    await create(input(), 409); state().purchaseOrder[0].status = 'approved';
    const body = input(6, { supplierId: 'forged', orderedQty: 10000 });
    first = await create(body);
    assert.equal(first.supplierId, 'supplier'); assert.equal(first.items[0].orderedQty, 10);
    assert.equal(first.items[0].remainingQty, 4); assert.equal(first.status, 'draft');
    assert.equal(state().stockMovement.length, 0); assert.equal(state().stockBalance.length, 0);
    assert.equal((await create(body)).id, first.id);
    await create({ ...body, remark: 'Different' }, 409);
    assert.equal((await call(`${root}/sources/po`)).lines[0].remainingQty, 10);
    await create(input(11), 409);
    await create(input(1, { warehouseId: '' }), 400);
    await create(input(1, { items: [{ poLineId: 'missing', productId: 'product', currentReceiptQty: 1 }] }), 400);
    await create(input(1, { receiptDate: '2026-09-30' }), 400);
    state().accountProduct[0].unit = 'Box';
    await create(input(1), 409);
    state().accountProduct[0].unit = 'Pcs';
    state().accountProduct[0].active = false;
    await create(input(1), 409);
    state().accountProduct[0].active = true;
    state().warehouse[0].active = false;
    await create(input(1), 409);
    state().warehouse[0].active = true;
  });
  await t.test('evidence binding type permission revision cleanup and submission reservation', async () => {
    await act(first, 'submit', { status: 400 });
    await attach(first, { user: 'viewer', status: 403 });
    await attach(first, { patch: { purchaseOrderId: 'po' }, status: 400 });
    await attach(first, { category: 'other', status: 400 });
    await attach(first, { filename: 'sheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 400 });
    fixture.failAudit('goods_receipt'); await attach(first, { status: 500 }); fixture.failAudit(false);
    assert.equal(state().attachment.length, 0);
    const ops = fixture.storageOperations.slice(-2); assert.equal(ops[0].key, ops[1].key); assert.equal(ops[1].action, 'delete');
    const files = await attach(first);
    await act(first, 'submit', { status: 409 });
    first = await get(first);
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', user: 'editor', body: { updatedAt: first.updatedAt } });
    first = await get(first); await attach(first); first = await get(first);
    first = await act(first, 'submit'); assert.equal(first.status, 'pending');
    assert.equal(state().stockMovement.length, 0);
    const source = await call(`${root}/sources/po`); assert.equal(source.lines[0].pendingQty, 6); assert.equal(source.lines[0].remainingQty, 4);
    await attach(first, { status: 409 });
    await act(first, 'approve', { status: 403 });
    await call('/api/ap/purchase-orders/po/cancel', { method: 'POST', body: { updatedAt: new Date(state().purchaseOrder[0].updatedAt || '2026-10-01').toISOString(), reason: 'No' }, status: 409 });
  });
  await t.test('pending mapping immutable and capacity exact; independent approval posts once and rolls back on audit failure', async () => {
    state().accountProduct[0].active = false;
    await act(first, 'approve', { user: 'approver', status: 409 });
    state().accountProduct[0].active = true;
    state().accountProduct[0].productType = 'service';
    await act(first, 'approve', { user: 'approver', status: 409 });
    state().accountProduct[0].productType = 'stored';
    await create(input(1, { items: [{ poLineId: 'line', productId: 'alternate', currentReceiptQty: 1 }] }), 409);
    await create(input(5), 409);
    fixture.failAudit('goods_receipt');
    await act(first, 'approve', { user: 'approver', status: 500 });
    assert.equal(state().stockBalance.length, 0); assert.equal(state().stockMovement.length, 0); assert.equal((await get(first)).status, 'pending');
    fixture.failAudit(false);
    first = await act(first, 'approve', { user: 'approver' });
    assert.equal(state().stockBalance[0].onHand, 6);
    assert.equal(state().stockMovement[0].qtyIn, 6);
    assert.equal(first.approvedById, 'approver');
    assert.equal((await create(input(6, { requestKey: first.requestKey }))).id, first.id);
    await act(first, 'approve', { user: 'approver', status: 409 });
    assert.equal((await call(`${root}/sources/po`)).lines[0].previouslyReceivedQty, 6);
    second = await ready(input(4, { warehouseId: 'warehouse2' }));
    second = await act(second, 'submit'); second = await act(second, 'approve', { user: 'approver' });
    assert.equal((await call(`${root}/sources/po`)).lines[0].remainingQty, 0);
    await create(input('0.001'), 409);
  });
  await t.test('reversal refuses unavailable/reserved stock and old date; rollback restores movements and balances; returns PO capacity', async () => {
    state().stockBalance[0].reserved = 1; state().stockBalance[0].available = 5;
    await act(first, 'cancel', { status: 409 });
    state().stockBalance[0].reserved = 0; state().stockBalance[0].available = 6;
    await act(first, 'cancel', { body: { updatedAt: first.updatedAt, reason: 'No date' }, status: 400 });
    await act(first, 'cancel', { body: { updatedAt: first.updatedAt, reason: 'Early', cancellationDate: '2026-10-25' }, status: 400 });
    state().stockMovement.push({ id: 'later-event', productId: 'product', warehouseId: 'warehouse', transactionDate: new Date('2026-10-28') });
    await act(first, 'cancel', { status: 409 });
    state().stockMovement = state().stockMovement.filter(row => row.id !== 'later-event');
    fixture.failAudit('goods_receipt'); await act(first, 'cancel', { status: 500 }); fixture.failAudit(false);
    assert.equal(state().stockBalance[0].onHand, 6); assert.equal(state().stockMovement.length, 2);
    first = await act(first, 'cancel', { user: 'canceller' });
    assert.equal(state().stockBalance[0].onHand, 0);
    const reverse = state().stockMovement.find(row => row.sourceDocType === 'goods_receipt_reversal');
    assert.equal(reverse.qtyOut, 6); assert.ok(reverse.reversalRefId);
    assert.equal((await call(`${root}/sources/po`)).lines[0].remainingQty, 6);
    await act(first, 'cancel', { status: 409 });
    const balance = state().stockBalance.find(row => row.warehouseId === 'warehouse2');
    balance.onHand = 0; balance.available = 0;
    await act(second, 'cancel', { status: 409 });
    balance.onHand = 4; balance.available = 4;
  });
  await t.test('returned edits and release reservations; rejects terminal; services do not need warehouse or post stock', async () => {
    let doc = await ready(input(2));
    await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input(2), updatedAt: 'stale' }, status: 409 });
    await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input(2), receiptDate: '2026-10-27', updatedAt: doc.updatedAt }, status: 409 });
    doc = await act(doc, 'submit');
    await act(doc, 'return', { user: 'approver', body: { updatedAt: doc.updatedAt }, status: 400 });
    doc = await act(doc, 'return', { user: 'approver' });
    assert.equal((await call(`${root}/sources/po`)).lines[0].pendingQty, 0);
    doc = await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input(1), updatedAt: doc.updatedAt } });
    assert.equal(doc.items[0].currentReceiptQty, 1);
    doc = await act(doc, 'submit'); doc = await act(doc, 'reject', { user: 'approver' });
    await act(doc, 'submit', { status: 409 });
    let service = await ready(input('0.125', { warehouseId: '', items: [{ poLineId: 'service-line', productId: 'service', currentReceiptQty: '0.125' }] }));
    service = await act(service, 'submit');
    const count = state().stockMovement.length;
    service = await act(service, 'approve', { user: 'approver' });
    assert.equal(state().stockMovement.length, count);
    await act(service, 'cancel', { user: 'canceller' });
    assert.equal(state().stockMovement.length, count);
  });
  await t.test('aggregates repeated product across lines and serializes concurrent submissions and approvals', async () => {
    let aggregate = await ready(input(1, { items: [
      { poLineId: 'line', productId: 'product', currentReceiptQty: 1 }, { poLineId: 'line2', productId: 'product', currentReceiptQty: 2 },
    ] }));
    aggregate = await act(aggregate, 'submit'); aggregate = await act(aggregate, 'approve', { user: 'approver' });
    assert.equal(state().stockMovement.filter(row => row.sourceDocId === aggregate.id).length, 1);
    assert.equal(state().stockMovement.find(row => row.sourceDocId === aggregate.id).qtyIn, 3);
    await act(aggregate, 'cancel');
    const docs = await Promise.all([ready(input(4)), ready(input(4))]);
    const responses = await Promise.all(docs.map(doc => fetch(`${base}${root}/${doc.id}/submit`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token()}` }, body: JSON.stringify({ updatedAt: doc.updatedAt }) })));
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
    const winner = state().goodsReceipt.find(row => docs.some(doc => doc.id === row.id) && row.status === 'pending');
    const results = await Promise.all([0, 1].map(() => fetch(`${base}${root}/${winner.id}/approve`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token('approver')}` }, body: JSON.stringify({ updatedAt: winner.updatedAt.toISOString() }) })));
    assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  });
  await t.test('legacy blocks source and mutations, admin self-approval forbidden, history and paginated register available', async () => {
    state().goodsReceipt.push({ id: 'legacy', grNo: 'OLD', lifecycleVersion: 0, status: 'approved', poId: 'po', items: [], updatedAt: new Date() });
    await create(input(1), 409);
    assert.equal((await call(`${root}/sources`)).length, 0);
    await act(await call(`${root}/legacy`), 'cancel', { status: 409 });
    state().goodsReceipt.find(row => row.id === 'legacy').status = 'cancelled';
    const doc = await create(input(1));
    state().goodsReceipt.find(row => row.id === doc.id).createdById = 'admin';
    await attach(doc);
    const pending = await act(await get(doc), 'submit', { user: 'admin' });
    await act(pending, 'approve', { user: 'admin', status: 403 });
    const list = await call(`${root}?page=1&pageSize=2`);
    assert.equal(list.data.length, 2); assert.ok(list.total > 2);
    assert.ok((await get(first)).history.some(row => row.action === 'cancel' && row.reason === 'Test reason'));
    assert.ok(fixture.locks.some(row => row.sql.includes('warehouses')));
  });
});
