const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');

test('PO approval actual HTTP lifecycle permissions revisions files and downstream interlocks', async t => {
  process.env.JWT_SECRET = 'po-approval-local-test';
  const fixture = createContractorPaymentApp();
  const po = fixture.state().purchaseOrder[0];
  Object.assign(po, { createdById: 'maker', purchaseType: 'domestic', updatedAt: new Date('2026-10-01'),
    items: [{ id: 'line', desc: 'Materials', qty: 100, unit: 'Pcs', unitPrice: 100, discount: 0 }], attachments: [] });
  const server = fixture.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { method = 'GET', body, user = 'maker', status = 200 } = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const get = () => call('/api/ap/purchase-orders/po');
  const act = (doc, action, options = {}) => call(`/api/ap/purchase-orders/po/${action}`, { method: 'POST',
    body: { updatedAt: doc.updatedAt, reason: 'Correction needed' }, ...options });
  const input = doc => ({ updatedAt: doc.updatedAt, supplierId: 'supplier', purchaseType: doc.purchaseType,
    poDate: '2026-10-01', items: [{ desc: 'Materials', qty: 100, unit: 'Pcs', unitPrice: 100, discount: 0 }] });
  async function upload(doc, user = 'maker', status = 201, overrides = {}, filename = 'po.pdf', type = 'application/pdf') {
    const form = new FormData();
    form.set('purchaseOrderId', 'po'); form.set('category', 'accounting-po'); form.set('updatedAt', doc.updatedAt);
    for (const [key, value] of Object.entries(overrides)) form.set(key, value);
    form.append('files', new Blob(['%PDF-1.4\nEvidence'], { type }), filename);
    const response = await fetch(`${base}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${fixture.token(user)}` }, body: form });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  let doc;
  await t.test('submit checks revision authorization totals supplier and historical creator', async () => {
    doc = await get();
    await act(doc, 'submit', { user: null, status: 401 });
    await act(doc, 'submit', { user: 'viewer', status: 403 });
    await act(doc, 'submit', { user: 'approver', status: 403 });
    await act(doc, 'submit', { body: {}, status: 409 });
    await call('/api/ap/goods-receipts', { method: 'POST', body: { poId: 'po', receiptDate: '2026-10-26', sender: 'Sender', receiver: 'Receiver',
      requestKey: 'po-gr-source-check-0001', items: [{ poLineId: 'line', productId: 'product', currentReceiptQty: 1 }] }, status: 409 });
    fixture.state().purchaseOrder[0].createdById = null;
    await act(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder[0].createdById = 'maker'; fixture.state().purchaseOrder[0].supplier.active = false;
    await act(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder[0].supplier.active = true; fixture.state().purchaseOrder[0].netAmount = 1;
    await act(doc, 'submit', { status: 409 });
    fixture.state().purchaseOrder[0].netAmount = 10700;
    doc = await act(doc, 'submit');
    assert.equal(doc.status, 'pending');
    assert.equal(doc.approvalStep, 0);
    await act(doc, 'submit', { status: 409 });
    await call('/api/ap/purchase-orders/po', { method: 'PUT', body: input(doc), status: 409 });
    await upload(doc, 'maker', 409);
  });
  await t.test('independent approver can return with reason; returned edits need fresh revisions', async () => {
    await act(doc, 'approve', { status: 403 });
    await act(doc, 'return', { user: 'approver', body: { updatedAt: doc.updatedAt }, status: 400 });
    doc = await act(doc, 'return', { user: 'approver' });
    assert.equal(doc.status, 'returned');
    await call('/api/ap/purchase-orders/po', { method: 'PUT', user: 'viewer', body: input(doc), status: 403 });
    const stale = doc.updatedAt;
    fixture.failAudit('purchase_order');
    await call('/api/ap/purchase-orders/po', { method: 'PUT', body: input(doc), status: 500 });
    assert.equal((await get()).updatedAt, stale);
    fixture.failAudit(false);
    doc = await call('/api/ap/purchase-orders/po', { method: 'PUT', user: 'editor', body: input(doc) });
    assert.equal(doc.status, 'returned');
    await call('/api/ap/purchase-orders/po', { method: 'PUT', body: { ...input(doc), updatedAt: stale }, status: 409 });
    assert.ok((await get()).history.some(row => row.action === 'return' && row.reason === 'Correction needed' && row.performedBy.fullName === 'approver'));
  });
  await t.test('attachment binding category type permissions revision and audit are transactional', async () => {
    await upload(doc, 'viewer', 403);
    await upload(doc, 'maker', 400, { workOrderId: 'other' });
    await upload(doc, 'maker', 400, { category: 'other' });
    await upload(doc, 'maker', 400, {}, 'sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const stale = doc;
    const files = await upload(doc, 'editor');
    doc = await get();
    fixture.state().attachment.find(row => row.id === files[0].id).workOrderId = 'legacy-work-order';
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', body: { updatedAt: doc.updatedAt }, status: 409 });
    fixture.state().attachment.find(row => row.id === files[0].id).workOrderId = null;
    assert.notEqual(doc.updatedAt, stale.updatedAt);
    await upload(stale, 'maker', 409);
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', body: { updatedAt: stale.updatedAt }, status: 409 });
    fixture.failAudit('purchase_order');
    const count = fixture.state().attachment.length;
    await upload(doc, 'maker', 500);
    assert.equal(fixture.state().attachment.length, count);
    assert.equal((await get()).updatedAt, doc.updatedAt);
    const ops = fixture.storageOperations.slice(-2);
    assert.equal(ops[0].action, 'upload');
    assert.equal(ops[1].action, 'delete');
    assert.equal(ops[0].key, ops[1].key);
    fixture.failAudit(false);
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', user: 'editor', body: { updatedAt: doc.updatedAt } });
    doc = await get();
    assert.equal(doc.attachments.length, 0);
  });
  await t.test('approval rollback concurrency signing restrictions and read-only print state', async () => {
    const files = await upload(doc);
    doc = await get();
    doc = await act(doc, 'submit');
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', body: { updatedAt: doc.updatedAt }, status: 409 });
    fixture.failAudit('purchase_order');
    await act(doc, 'approve', { user: 'approver', status: 500 });
    assert.equal((await get()).status, 'pending');
    fixture.failAudit(false);
    const responses = await Promise.all([0, 1].map(() => fetch(`${base}/api/ap/purchase-orders/po/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token('approver')}` },
      body: JSON.stringify({ updatedAt: doc.updatedAt }),
    })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    doc = await get();
    assert.equal(doc.status, 'approved'); assert.equal(doc.approvalStep, 1);
    assert.ok(doc.history.some(row => row.action === 'approve' && row.performedBy.fullName === 'approver'));
    fixture.state().auditLog.find(row => row.action === 'approve' && row.entityType === 'purchase_order').performedBy.fullName = 'Renamed user';
    assert.equal((await get()).history.find(row => row.action === 'approve').performedBy.fullName, 'approver');
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', body: { updatedAt: doc.updatedAt }, status: 409 });
    await upload(doc, 'maker', 409);
    await act(doc, 'return', { user: 'approver', status: 409 });
    await call('/api/ap/purchase-orders/po', { method: 'PUT', body: input(doc), status: 409 });
    await get();
    assert.equal((await get()).updatedAt, doc.updatedAt);
  });
  await t.test('cancellation requires reason and blocks every active downstream PS or GR', async () => {
    await act(doc, 'cancel', { user: 'approver', status: 403 });
    await act(doc, 'cancel', { body: { updatedAt: doc.updatedAt }, status: 400 });
    fixture.state().contractorPaymentRequest.push({ id: 'ps', poId: 'po', status: 'draft' });
    await act(doc, 'cancel', { status: 409 });
    fixture.state().contractorPaymentRequest[0].status = 'cancelled';
    fixture.state().goodsReceipt.push({ id: 'gr', poId: 'po', status: 'approved' });
    await act(doc, 'cancel', { status: 409 });
    fixture.state().goodsReceipt[0].status = 'cancelled';
    doc = await act(doc, 'cancel', { user: 'canceller' });
    assert.equal(doc.status, 'cancelled');
    await act(doc, 'submit', { status: 409 });
    await act(doc, 'approve', { user: 'approver', status: 409 });
  });
  await t.test('overseas same one-step policy; admin cannot approve own PO; reject terminal', async () => {
    const current = fixture.state().purchaseOrder[0];
    Object.assign(current, { status: 'draft', createdById: 'admin', purchaseType: 'overseas' });
    doc = await get();
    doc = await act(doc, 'submit', { user: 'admin' });
    await act(doc, 'approve', { user: 'admin', status: 403 });
    fixture.state().goodsReceipt.push({ id: 'pending-gr', poId: 'po', status: 'pending' });
    await act(doc, 'reject', { user: 'approver', status: 409 });
    fixture.state().goodsReceipt.find(row => row.id === 'pending-gr').status = 'cancelled';
    doc = await act(doc, 'reject', { user: 'approver' });
    assert.equal(doc.status, 'rejected');
    await act(doc, 'submit', { status: 409 });
  });
  await t.test('create and update real PO routes retain totals and typed revision contract', async () => {
    const body = { supplierId: 'supplier', purchaseType: 'overseas', poDate: '2026-10-26',
      items: [{ desc: 'New PO', qty: 2, unit: 'Pcs', unitPrice: 100, discount: 10 }] };
    const created = await call('/api/ap/purchase-orders', { method: 'POST', body, status: 201 });
    assert.equal(created.status, 'draft');
    assert.equal(created.netAmount, 203.3);
    await call('/api/ap/purchase-orders', { method: 'POST', body: { ...body, purchaseType: 'invalid' }, status: 400 });
    await call(`/api/ap/purchase-orders/${created.id}`, { method: 'PUT', body, status: 409 });
    const updated = await call(`/api/ap/purchase-orders/${created.id}`, { method: 'PUT', user: 'editor',
      body: { ...body, updatedAt: created.updatedAt, remarks: 'Updated' } });
    assert.equal(updated.netAmount, 203.3);
    const read = await call(`/api/ap/purchase-orders/${created.id}`, { user: 'viewer' });
    assert.equal(read.history.length, 2);
    const sent = await call(`/api/ap/purchase-orders/${created.id}/submit`, { method: 'POST', body: { updatedAt: updated.updatedAt } });
    const approved = await call(`/api/ap/purchase-orders/${created.id}/approve`, { method: 'POST', user: 'approver',
      body: { updatedAt: sent.updatedAt } });
    assert.equal(approved.status, 'approved');
    assert.equal((await call('/api/ap/purchase-orders?status=approved')).length, 1);
    await call('/api/ap/purchase-orders?status=invalid', { status: 400 });
  });
});
