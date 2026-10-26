const test = require('node:test'), assert = require('node:assert/strict'), { randomUUID } = require('crypto');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');
test('Stock Return actual HTTP cumulative lifecycle optional evidence atomic stock and reversal', async t => {
  process.env.JWT_SECRET = 'stock-return-isolated-test';
  const f = createContractorPaymentApp(), state = () => f.state();
  const product = { id: 'mat', code: 'MAT', name: 'Material', unit: 'Pcs', productType: 'stored', active: true };
  state().accountProduct.push(product);
  state().warehouse.push({ id: 'main', code: 'MAIN', name: 'Main', active: true });
  state().stockBalance.push({ id: 'balance', warehouseId: 'main', productId: 'mat', onHand: 2, reserved: 2, available: 0 });
  state().stockIssue.push({ id: 'is', issueNo: 'IS26100001', lifecycleVersion: 1, status: 'approved', createdById: 'maker',
    issueDate: new Date('2026-10-25'), updatedAt: new Date(), warehouseId: 'main', warehouseSnapshot: { code: 'MAIN', name: 'Main' },
    workOrderId: null, workOrderSnapshot: null, requester: 'Requester', receiver: 'Receiver', items: [
      { id: 'line', seq: 0, productId: 'mat', requestedQty: 10, issuedQty: 5, cancelledQty: 5, productSnapshot: structuredClone(product) },
      { id: 'zero', seq: 1, productId: 'other', requestedQty: 2, issuedQty: 0, cancelledQty: 2, productSnapshot: structuredClone(product) },
    ] });
  const server = f.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, root = '/api/inventory/returns';
  const input = (patch = {}) => ({ requestKey: randomUUID(), stockIssueId: 'is', returnDate: '2026-10-26',
    sender: 'Sender', receiver: 'Store receiver', returnReason: 'Unused goods', items: [{ stockIssueLineId: 'line', returnedQty: '3' }], ...patch });
  async function call(path, { method = 'GET', user = 'maker', body, status = 200 } = {}) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${f.token(user)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  const create = (body = input(), status = 201) => call(root, { method: 'POST', body, status });
  const get = doc => call(`${root}/${doc.id}`);
  const act = (doc, action, patch = {}) => call(`${root}/${doc.id}/${action}`, { method: 'POST', body: {
    updatedAt: doc.updatedAt, reason: 'Reason', cancellationDate: '2026-10-27', physicalRemovalConfirmed: true }, ...patch });
  async function attach(doc, { status = 201, user = 'maker', patch = {}, name = 'sr.pdf', type = 'application/pdf' } = {}) {
    const body = new FormData(); body.set('stockReturnId', doc.id); body.set('category', 'stock-return'); body.set('updatedAt', doc.updatedAt);
    for (const [key, value] of Object.entries(patch)) body.set(key, value);
    body.append('files', new Blob(['%PDF-1.4\nevidence'], { type }), name);
    const res = await fetch(base + '/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${f.token(user)}` }, body });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  }
  let first, second;
  await t.test('strict approved source line good condition names quantities authoritative warehouse snapshots and create replay', async () => {
    await call(root, { user: null, status: 401 }); await call(root, { method: 'POST', user: 'viewer', body: input(), status: 403 });
    for (const patch of [{ stockIssueId: '' }, { returnDate: '2026-02-30' }, { returnDate: '2026-10-24' },
      { sender: '' }, { receiver: '' }, { returnReason: '' }, { condition: 'damaged' }, { items: [] },
      { items: [{ stockIssueLineId: 'line', returnedQty: '0' }] }, { items: [{ stockIssueLineId: 'line', returnedQty: '-1' }] },
      { items: [{ stockIssueLineId: 'line', returnedQty: '0.0001' }] }, { items: [{ stockIssueLineId: 'zero', returnedQty: '1' }] },
      { items: [{ stockIssueLineId: 'outside', returnedQty: '1' }] }, { items: [{ stockIssueLineId: 'line', returnedQty: '1' }, { stockIssueLineId: 'line', returnedQty: '1' }] }]) {
      await create(input(patch), 400);
    }
    await create(input({ items: [{ stockIssueLineId: 'line', returnedQty: '6' }] }), 409);
    for (const status of ['draft', 'pending', 'cancelled', 'returned']) { state().stockIssue[0].status = status; await create(input(), 409); }
    state().stockIssue[0].status = 'approved'; state().stockIssue[0].lifecycleVersion = 0; await create(input(), 409); state().stockIssue[0].lifecycleVersion = 1;
    state().accountProduct[0].unit = 'Box'; await create(input(), 409); state().accountProduct[0].unit = 'Pcs';
    const snapshot = structuredClone(state().stockIssue[0].items[0].productSnapshot);
    state().stockIssue[0].items[0].productSnapshot = null; await call(`${root}/sources/is`, { status: 409 });
    state().stockIssue[0].items[0].productSnapshot = { ...snapshot, productType: 'service' }; await create(input(), 409);
    state().stockIssue[0].items[0].productSnapshot = snapshot;
    const body = input({ warehouseId: 'forged', workOrderId: 'forged', issuedQty: 999 });
    first = await create(body); assert.match(first.returnNo, /^SR2610\d{4}$/); assert.equal(first.condition, 'good');
    assert.equal(first.warehouseId, 'main'); assert.equal(first.workOrderId, null); assert.equal(first.items[0].issuedQty, 5);
    assert.equal(first.items[0].remainingQty, 2); assert.equal(first.items[0].productId, 'mat');
    assert.equal(state().stockMovement.length, 0); assert.equal(state().stockBalance[0].onHand, 2);
    assert.equal((await create(body)).id, first.id); await create({ ...body, sender: 'Changed' }, 409);
    f.failAudit('stock_return'); const count = state().stockReturn.length; await create(input(), 500); f.failAudit(false);
    assert.equal(state().stockReturn.length, count);
    assert.equal((await call(`${root}/sources?q=IS`)).length, 1);
    assert.equal((await call(`${root}/sources/is`)).lines[0].remainingQty, 5);
  });
  await t.test('optional evidence validates binding category type permissions revisions frozen status and cleanup rollback', async () => {
    await attach(first, { user: 'viewer', status: 403 });
    await attach(first, { patch: { stockIssueId: 'is' }, status: 400 });
    await attach(first, { patch: { category: 'other' }, status: 400 });
    await attach(first, { name: 'bad.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 400 });
    f.failAudit('stock_return'); await attach(first, { status: 500 }); f.failAudit(false);
    assert.equal(state().attachment.length, 0); assert.equal(f.storageOperations.at(-1).action, 'delete');
    const files = await attach(first); await act(first, 'submit', { status: 409 }); first = await get(first);
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', user: 'viewer', body: { updatedAt: first.updatedAt }, status: 403 });
    await call(`/api/upload/${files[0].id}`, { method: 'DELETE', user: 'editor', body: { updatedAt: first.updatedAt } }); first = await get(first);
    await call(`${root}/${first.id}`, { method: 'PUT', body: { ...input(), updatedAt: 'stale' }, status: 409 });
    await call(`${root}/${first.id}`, { method: 'PUT', body: { ...input({ returnDate: '2026-10-27' }), updatedAt: first.updatedAt }, status: 409 });
    first = await act(first, 'submit'); assert.equal(state().stockBalance[0].onHand, 2); assert.equal(state().stockBalance[0].reserved, 2);
    await attach(first, { status: 409 }); await act(first, 'approve', { status: 403 });
    await act(first, 'approve', { user: 'editor', status: 403 });
  });
  await t.test('pending reserves cumulative capacity only; return editor resubmit and approval3 then approval2 totals5', async () => {
    assert.equal((await call(`${root}/sources/is`)).lines[0].pendingQty, 3);
    await create(input(), 409);
    second = await create(input({ items: [{ stockIssueLineId: 'line', returnedQty: '2' }] }));
    await call('/api/inventory/issues/is/cancel', { method: 'POST', body: { updatedAt: state().stockIssue[0].updatedAt.toISOString(),
      reason: 'Blocked by active SR', cancellationDate: '2026-10-27', physicalReturnConfirmed: true }, status: 409 });
    await act(first, 'return', { user: 'approver', body: { updatedAt: first.updatedAt }, status: 400 });
    first = await act(first, 'return', { user: 'approver' });
    assert.equal((await call(`${root}/sources/is`)).lines[0].remainingQty, 5);
    first = await call(`${root}/${first.id}`, { method: 'PUT', user: 'editor', body: { ...input({ remark: 'Checked' }), updatedAt: first.updatedAt } });
    await act(first, 'submit', { user: 'editor', status: 403 }); first = await act(first, 'submit');
    state().accountProduct[0].active = false; await act(first, 'approve', { user: 'approver', status: 409 }); state().accountProduct[0].active = true;
    f.failAudit('stock_return'); await act(first, 'approve', { user: 'approver', status: 500 }); f.failAudit(false);
    assert.equal(state().stockMovement.length, 0); assert.equal(state().stockBalance[0].onHand, 2);
    first = await act(first, 'approve', { user: 'approver' });
    assert.equal(state().stockBalance[0].onHand, 5); assert.equal(state().stockBalance[0].available, 3);
    await act(first, 'approve', { user: 'approver', status: 409 });
    second = await act(second, 'submit'); second = await act(second, 'approve', { user: 'approver' });
    assert.equal(state().stockBalance[0].onHand, 7); assert.equal(state().stockBalance[0].reserved, 2);
    assert.equal((await call(`${root}/sources/is`)).lines[0].remainingQty, 0); await create(input({ items: [{ stockIssueLineId: 'line', returnedQty: '0.001' }] }), 409);
  });
  await t.test('approved cancellation requires physical removal enough available chronology and linked atomic single reversal releases capacity', async () => {
    await act(first, 'cancel', { user: 'viewer', status: 403 });
    await act(first, 'cancel', { body: { updatedAt: first.updatedAt, reason: 'x', cancellationDate: '2026-10-27' }, status: 400 });
    await act(first, 'cancel', { body: { updatedAt: first.updatedAt, reason: 'x', cancellationDate: '2026-10-25', physicalRemovalConfirmed: true }, status: 400 });
    state().stockBalance[0].onHand = 4; state().stockBalance[0].available = 2; await act(first, 'cancel', { status: 409 });
    state().stockBalance[0].onHand = 7; state().stockBalance[0].available = 5;
    state().stockMovement.push({ id: 'later', warehouseId: 'main', productId: 'mat', transactionDate: new Date('2026-10-28') });
    await act(first, 'cancel', { status: 409 }); state().stockMovement.pop();
    f.failAudit('stock_return'); await act(first, 'cancel', { status: 500 }); f.failAudit(false);
    assert.equal(state().stockBalance[0].onHand, 7); assert.equal(state().stockMovement.length, 2);
    first = await act(first, 'cancel', { user: 'canceller' });
    assert.equal(state().stockBalance[0].onHand, 4); assert.equal(state().stockBalance[0].available, 2);
    assert.equal(state().stockMovement[2].reversalRefId, state().stockMovement[0].id);
    assert.equal(state().auditLog.find(row => row.entityId === first.id && row.action === 'cancel').newValue.physicalRemovalConfirmed, true);
    await act(first, 'cancel', { status: 409 });
    assert.equal((await call(`${root}/sources/is`)).lines[0].remainingQty, 3);
    second = await act(second, 'cancel', { user: 'canceller' }); assert.equal(state().stockBalance[0].onHand, 2);
  });
  await t.test('parallel pending submits reserve source capacity once; reject and cancel release; parallel approve posts once', async () => {
    const docs = await Promise.all([create(), create()]);
    const results = await Promise.all(docs.map(doc => fetch(`${base}${root}/${doc.id}/submit`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.token()}` }, body: JSON.stringify({ updatedAt: doc.updatedAt }) })));
    assert.deepEqual(results.map(res => res.status).sort(), [200, 409]);
    const pending = await get(docs.find(doc => state().stockReturn.find(row => row.id === doc.id).status === 'pending'));
    const replies = await Promise.all([0, 1].map(() => fetch(`${base}${root}/${pending.id}/approve`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.token('approver')}` }, body: JSON.stringify({ updatedAt: pending.updatedAt }) })));
    assert.deepEqual(replies.map(res => res.status).sort(), [200, 409]);
    const approved = await get(pending); assert.equal(state().stockMovement.filter(row => row.sourceDocId === pending.id).length, 1);
    await act(approved, 'cancel', { user: 'canceller' });
    const other = await get(docs.find(doc => doc.id !== pending.id)); const waiting = await act(other, 'submit');
    const rejected = await act(waiting, 'reject', { user: 'approver' }); await act(rejected, 'submit', { status: 409 });
    assert.equal((await call(`${root}/sources/is`)).lines[0].remainingQty, 5);
  });
  await t.test('decimal returns corruption guards legacy reconciliation admin self approval and register history permissions', async () => {
    let decimal = await create(input({ items: [{ stockIssueLineId: 'line', returnedQty: '0.125' }] }));
    decimal = await act(decimal, 'submit'); state().stockBalance[0].available = 99;
    await act(decimal, 'approve', { user: 'approver', status: 409 }); state().stockBalance[0].available = 0;
    decimal = await act(decimal, 'approve', { user: 'approver' }); assert.equal(state().stockBalance[0].onHand, 2.125);
    await act(decimal, 'cancel', { user: 'canceller' });
    state().stockReturn.push({ id: 'legacy', returnNo: 'SR-OLD', stockIssueId: 'is', lifecycleVersion: 0, status: 'approved', items: [], updatedAt: new Date() });
    await create(input(), 409); await act(await call(`${root}/legacy`), 'cancel', { status: 409 });
    state().stockReturn.find(row => row.id === 'legacy').status = 'cancelled';
    let own = await create(); state().stockReturn.find(row => row.id === own.id).createdById = 'admin';
    own = await act(await get(own), 'submit', { user: 'admin' }); await act(own, 'approve', { user: 'admin', status: 403 });
    await act(own, 'cancel', { user: 'canceller' });
    const detail = await get(first); assert.ok(detail.history.some(row => row.action === 'approve' && row.performedBy.fullName === 'approver'));
    const page = await call(`${root}?page=1&pageSize=2`); assert.equal(page.data.length, 2); assert.ok(page.total > 2);
    await call(`${root}?status=unknown`, { status: 400 }); await call(`${root}/sources/is?excludeId=missing`, { status: 409 });
    assert.ok(f.locks.some(row => row.sql.includes('stock_returns')));
    assert.ok(f.locks.some(row => row.sql.includes('stock_issues')));
    assert.ok(f.locks.some(row => row.sql.includes('warehouses')));
    const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'sql', 'accounting-stock-returns.sql'), 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /(?:^|;)\s*(?:UPDATE|DELETE|INSERT|TRUNCATE|DROP)\b/i);
    assert.match(sql, /stock_issue_line_id TEXT REFERENCES stock_issue_lines\(id\) ON DELETE RESTRICT/);
  });
  await t.test('multi-line return is atomic on later stock overflow; concurrent create retry gives one document and saved snapshots', async () => {
    const secondProduct = { id: 'second', code: 'TWO', name: 'Second', unit: 'Kg', productType: 'manufactured', active: true };
    state().accountProduct.push(secondProduct);
    state().stockIssue.push({ ...structuredClone(state().stockIssue[0]), id: 'is-multi', issueNo: 'IS-MULTI', items: [
      { id: 'multi-mat', productId: 'mat', issuedQty: 1, productSnapshot: structuredClone(product) },
      { id: 'multi-second', productId: 'second', issuedQty: 1, productSnapshot: structuredClone(secondProduct) },
    ] });
    const body = input({ stockIssueId: 'is-multi', items: [{ stockIssueLineId: 'multi-mat', returnedQty: '0.125' }, { stockIssueLineId: 'multi-second', returnedQty: '0.125' }] });
    const copies = await Promise.all([create(body), create(body)]);
    assert.equal(copies[0].id, copies[1].id); assert.equal(state().stockReturn.filter(row => row.requestKey === body.requestKey).length, 1);
    let multi = await act(copies[0], 'submit');
    state().stockBalance.push({ id: 'overflow', warehouseId: 'main', productId: 'second', onHand: 999999999.999, reserved: 0, available: 999999999.999 });
    const before = state().stockBalance[0].onHand, moves = state().stockMovement.length;
    await act(multi, 'approve', { user: 'approver', status: 409 });
    assert.equal(state().stockBalance[0].onHand, before); assert.equal(state().stockMovement.length, moves);
    state().stockBalance.find(row => row.id === 'overflow').onHand = 0; state().stockBalance.find(row => row.id === 'overflow').available = 0;
    state().accountProduct[0].name = 'Renamed master';
    multi = await act(multi, 'approve', { user: 'approver' });
    assert.equal(multi.items[0].productSnapshot.name, 'Material'); assert.equal(state().stockBalance[0].onHand, before + 0.125);
    assert.equal(state().stockBalance.find(row => row.id === 'overflow').onHand, 0.125);
    await create(body); assert.equal(state().stockMovement.filter(row => row.sourceDocId === multi.id).length, 2);
    await act(multi, 'cancel', { user: 'canceller' }); assert.equal(state().stockBalance[0].onHand, before);
  });
});
