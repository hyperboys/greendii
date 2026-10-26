const test = require('node:test'), assert = require('node:assert/strict'), { randomUUID } = require('crypto');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');
test('Stock Issue actual HTTP lifecycle quantities permissions evidence atomic stock and reversal', async t => {
  process.env.JWT_SECRET = 'stock-issue-isolated-test';
  const f = createContractorPaymentApp(), state = () => f.state();
  state().accountProduct.push({ id: 'mat', code: 'MAT', name: 'Material', active: true, productType: 'stored', unit: 'Pcs' },
    { id: 'service', code: 'SVC', name: 'Service', active: true, productType: 'service', unit: 'Job' },
    { id: 'other', code: 'OTH', name: 'Other', active: true, productType: 'manufactured', unit: 'Kg' });
  state().warehouse.push({ id: 'main', code: 'MAIN', name: 'Main', active: true }, { id: 'second', code: 'SECOND', name: 'Second', active: true });
  state().workOrder.push({ id: 'wo', woNo: 'WO-1', project: 'Site', status: 'approved', active: true });
  state().stockBalance.push({ id: 'balance', warehouseId: 'main', productId: 'mat', onHand: 7, reserved: 2, available: 5 });
  const server = f.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, root = '/api/inventory/issues';
  const input = (patch = {}) => ({ requestKey: randomUUID(), issueDate: '2026-10-26', warehouseId: 'main', workOrderId: 'wo',
    requester: 'Requester', receiver: 'Receiver', items: [{ productId: 'mat', requestedQty: '10', issuedQty: '5', cancelledQty: 999 }], ...patch });
  async function call(path, { method = 'GET', user = 'maker', body, status = 200 } = {}) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${f.token(user)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  const create = (body = input(), status = 201) => call(root, { method: 'POST', body, status });
  const get = doc => call(`${root}/${doc.id}`);
  const act = (doc, action, patch = {}) => call(`${root}/${doc.id}/${action}`, { method: 'POST', body: {
    updatedAt: doc.updatedAt, reason: 'Reason', cancellationDate: '2026-10-27', physicalReturnConfirmed: true }, ...patch });
  async function attach(doc, { user = 'maker', status = 201, patch = {}, name = 'issue.pdf', type = 'application/pdf' } = {}) {
    const body = new FormData(); body.set('stockIssueId', doc.id); body.set('category', 'stock-issue'); body.set('updatedAt', doc.updatedAt);
    for (const [key, value] of Object.entries(patch)) body.set(key, value);
    body.append('files', new Blob(['%PDF-1.4\nevidence'], { type }), name);
    const res = await fetch(base + '/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${f.token(user)}` }, body });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  let doc;
  await t.test('strict inputs active stock product warehouse WO and optional references; Draft no posting or reservation; replay', async () => {
    await call(root, { user: null, status: 401 }); await create(input({ items: [] }), 400);
    await call(root, { method: 'POST', user: 'viewer', body: input(), status: 403 });
    const body = input(); doc = await create(body); assert.match(doc.issueNo, /^IS2610\d{4}$/);
    assert.equal(doc.items[0].cancelledQty, 5); assert.equal(doc.status, 'draft');
    assert.equal(state().stockMovement.length, 0); assert.equal(state().stockBalance[0].reserved, 2);
    assert.equal((await create(body)).id, doc.id); await create({ ...body, remark: 'Different' }, 409);
    for (const [requestedQty, issuedQty] of [['0', '0'], ['1', '-1'], ['1', '1.0001'], ['1', '2'], ['10', '0']]) {
      await create(input({ items: [{ productId: 'mat', requestedQty, issuedQty }] }), 400);
    }
    await create(input({ items: [body.items[0], body.items[0]] }), 400);
    await create(input({ items: [{ productId: 'service', requestedQty: 1, issuedQty: 1 }] }), 409);
    await create(input({ workOrderId: 'missing' }), 409);
    state().accountProduct[0].active = false; await create(input(), 409); state().accountProduct[0].active = true;
    state().warehouse[0].active = false; await create(input(), 409); state().warehouse[0].active = true;
    for (const issueDate of ['', '2026-02-30', 'not-a-date']) await create(input({ issueDate }), 400);
    state().workOrder[0].active = false; await create(input(), 409); state().workOrder[0].active = true;
    const beforeFailure = state().stockIssue.length;
    f.failAudit('stock_issue'); await create(input(), 500); f.failAudit(false);
    assert.equal(state().stockIssue.length, beforeFailure);
    const optional = await create(input({ workOrderId: '', items: [{ productId: 'mat', requestedQty: '0.125', issuedQty: '0.125' }] }));
    assert.equal(optional.workOrderId, null); assert.equal(optional.items[0].issuedQty, 0.125);
    assert.equal((await call(`${root}/work-orders?q=WO`)).length, 1);
    assert.equal((await call(`${root}/lookups`)).products.length, 2);
    assert.equal((await call(`${root}/availability?warehouseId=main`))[0].available, 5);
  });
  await t.test('evidence optional protected binding revision permissions lifecycle rollback storage and stale edits', async () => {
    await attach(doc, { user: 'viewer', status: 403 });
    await attach(doc, { patch: { goodsReceiptId: 'gr' }, status: 400 });
    await attach(doc, { patch: { category: 'other' }, status: 400 });
    await attach(doc, { name: 'file.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 400 });
    f.failAudit('stock_issue'); await attach(doc, { status: 500 }); f.failAudit(false);
    assert.equal(state().attachment.length, 0); assert.equal(f.storageOperations.at(-1).action, 'delete');
    const files = await attach(doc); await act(doc, 'submit', { status: 409 }); doc = await get(doc);
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', user: 'editor', body: { updatedAt: doc.updatedAt } }); doc = await get(doc);
    await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input(), updatedAt: 'stale' }, status: 409 });
    await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input({ issueDate: '2026-10-27' }), updatedAt: doc.updatedAt }, status: 409 });
    await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input({ warehouseId: 'second' }), updatedAt: doc.updatedAt }, status: 409 });
    doc = await act(doc, 'submit'); assert.equal(doc.status, 'pending'); assert.equal(state().stockBalance[0].available, 5);
    await attach(doc, { status: 409 }); await act(doc, 'approve', { status: 403 });
    await act(doc, 'approve', { user: 'editor', status: 403 });
    await call(`${root}/${doc.id}`, { method: 'PUT', body: { ...input(), updatedAt: doc.updatedAt }, status: 409 });
  });
  await t.test('return edit resubmit and independent approval deduct exact planned qty no auto allocation; rollback', async () => {
    await act(doc, 'return', { user: 'approver', body: { updatedAt: doc.updatedAt }, status: 400 });
    doc = await act(doc, 'return', { user: 'approver' });
    doc = await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: { ...input(), updatedAt: doc.updatedAt, remark: 'Fixed' } });
    await act(doc, 'submit', { user: 'editor', status: 403 }); doc = await act(doc, 'submit');
    state().stockBalance[0].available = 4; state().stockBalance[0].onHand = 6;
    await act(doc, 'approve', { user: 'approver', status: 409 }); assert.equal((await get(doc)).items[0].issuedQty, 5);
    state().stockBalance[0].available = 5; state().stockBalance[0].onHand = 7;
    state().accountProduct[0].unit = 'Box'; await act(doc, 'approve', { user: 'approver', status: 409 }); state().accountProduct[0].unit = 'Pcs';
    state().accountProduct[0].active = false; await act(doc, 'approve', { user: 'approver', status: 409 }); state().accountProduct[0].active = true;
    state().stockBalance[0].available = 99; await act(doc, 'approve', { user: 'approver', status: 409 }); state().stockBalance[0].available = 5;
    f.failAudit('stock_issue'); await act(doc, 'approve', { user: 'approver', status: 500 }); f.failAudit(false);
    assert.equal(state().stockMovement.length, 0); assert.equal(state().stockBalance[0].onHand, 7);
    doc = await act(doc, 'approve', { user: 'approver' });
    assert.equal(state().stockBalance[0].onHand, 2); assert.equal(state().stockBalance[0].reserved, 2); assert.equal(state().stockBalance[0].available, 0);
    assert.equal(state().stockMovement[0].qtyOut, 5); assert.equal(doc.items[0].requestedQty, 10); assert.equal(doc.items[0].cancelledQty, 5);
    await act(doc, 'approve', { user: 'approver', status: 409 });
    assert.equal((await create(input({ requestKey: doc.requestKey }))).id, doc.id);
  });
  await t.test('cancellation requires physical return confirmation date reason no active returns and chronological linked reversal; atomic audit', async () => {
    await act(doc, 'cancel', { body: { updatedAt: doc.updatedAt, reason: 'x', cancellationDate: '2026-10-27' }, status: 400 });
    await act(doc, 'cancel', { body: { updatedAt: doc.updatedAt, reason: 'x', cancellationDate: '2026-10-25', physicalReturnConfirmed: true }, status: 400 });
    state().stockReturn.push({ id: 'return', stockIssueId: doc.id, status: 'draft' }); await act(doc, 'cancel', { status: 409 });
    state().stockReturn[0].status = 'cancelled';
    state().stockMovement.push({ id: 'later', warehouseId: 'main', productId: 'mat', transactionDate: new Date('2026-10-28') });
    await act(doc, 'cancel', { status: 409 }); state().stockMovement = state().stockMovement.filter(row => row.id !== 'later');
    f.failAudit('stock_issue'); await act(doc, 'cancel', { status: 500 }); f.failAudit(false);
    assert.equal(state().stockBalance[0].onHand, 2); assert.equal(state().stockMovement.length, 1);
    doc = await act(doc, 'cancel', { user: 'canceller' }); assert.equal(doc.status, 'cancelled');
    assert.equal(state().stockBalance[0].onHand, 7); assert.equal(state().stockBalance[0].reserved, 2); assert.equal(state().stockBalance[0].available, 5);
    assert.equal(state().stockMovement[1].reversalRefId, state().stockMovement[0].id); await act(doc, 'cancel', { status: 409 });
    assert.equal(state().auditLog.find(row => row.entityId === doc.id && row.action === 'cancel').newValue.physicalReturnConfirmed, true);
  });
  await t.test('legacy reads only; admin self approval blocked; old return endpoint cannot bypass new issue workflow', async () => {
    state().stockIssue.push({ id: 'legacy', issueNo: 'IS-OLD', lifecycleVersion: 0, status: 'approved', items: [], updatedAt: new Date() });
    await act(await call(`${root}/legacy`), 'cancel', { status: 409 });
    let own = await create(); state().stockIssue.find(row => row.id === own.id).createdById = 'admin';
    own = await act(await get(own), 'submit', { user: 'admin' }); await act(own, 'approve', { user: 'admin', status: 403 });
    await call('/api/inventory/returns', { method: 'POST', body: { stockIssueId: own.id, warehouseId: 'main', items: [{ productId: 'mat', returnedQty: 1 }] }, status: 400 });
    own = await act(own, 'reject', { user: 'approver' }); await act(own, 'submit', { status: 409 });
    assert.ok((await get(doc)).history.some(row => row.action === 'cancel' && row.performedBy.fullName === 'canceller'));
    const page = await call(`${root}?page=1&pageSize=2`); assert.equal(page.data.length, 2); assert.ok(page.total > 2);
    await call(`${root}?status=invalid`, { status: 400 });
    assert.ok(f.locks.some(row => row.sql.includes('stock_issues')));
    assert.ok(f.locks.some(row => row.sql.includes('warehouses')));
  });
  await t.test('zero-issued line posts no stock and decimal line posts exact amount; additive SQL leaves legacy stock untouched', async () => {
    let mixed = await create(input({ items: [{ productId: 'mat', requestedQty: '0.3', issuedQty: '0.125' },
      { productId: 'other', requestedQty: '2', issuedQty: '0' }] }));
    const originalRevision = mixed.updatedAt, originalRemark = mixed.remark;
    f.failAudit('stock_issue'); await call(`${root}/${mixed.id}`, { method: 'PUT',
      body: { ...input({ items: mixed.items, remark: 'Not committed' }), updatedAt: originalRevision }, status: 500 }); f.failAudit(false);
    assert.equal((await get(mixed)).remark, originalRemark); assert.equal((await get(mixed)).updatedAt, originalRevision);
    mixed = await act(mixed, 'submit'); mixed = await act(mixed, 'approve', { user: 'approver' });
    assert.equal(state().stockBalance[0].onHand, 6.875); assert.equal(state().stockBalance[0].reserved, 2);
    assert.equal(state().stockBalance[0].available, 4.875);
    assert.equal(state().stockMovement.filter(row => row.sourceDocId === mixed.id).length, 1);
    assert.equal(state().stockBalance.some(row => row.productId === 'other'), false);
    await act(mixed, 'cancel', { user: 'canceller' }); assert.equal(state().stockBalance[0].onHand, 7);
    const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'sql', 'accounting-stock-issues.sql'), 'utf8');
    const statements = sql.replace(/--[^\n]*/g, '');
    assert.doesNotMatch(statements, /(?:^|;)\s*(?:UPDATE|DELETE|INSERT|TRUNCATE|DROP)\b/i);
    assert.match(statements, /lifecycle_version[^;]*DEFAULT 0/i);
  });
  await t.test('parallel approvals on different issues cannot consume reserved or overdraw; approve retry posts once', async () => {
    const docs = await Promise.all([create(), create()]); const pending = await Promise.all(docs.map(row => act(row, 'submit')));
    const responses = await Promise.all(pending.map(row => fetch(`${base}${root}/${row.id}/approve`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${f.token('approver')}` }, body: JSON.stringify({ updatedAt: row.updatedAt }) })));
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
    assert.equal(state().stockBalance[0].onHand, 2); assert.equal(state().stockBalance[0].reserved, 2);
    const winner = state().stockIssue.find(row => pending.some(doc => doc.id === row.id) && row.status === 'approved');
    await act(await get(winner), 'approve', { user: 'approver', status: 409 });
    assert.equal(state().stockMovement.filter(row => row.sourceDocId === winner.id).length, 1);
  });
});
