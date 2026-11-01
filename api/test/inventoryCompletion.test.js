const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');

test('inventory transfer thresholds and explicit Moving Average costs through actual HTTP with rollback', async t => {
  process.env.JWT_SECRET = 'inventory-completion-isolated-test';
  const f = createContractorPaymentApp(), state = () => f.state();
  state().accountProduct.push({ id: 'mat', code: 'MAT', name: 'Material', unit: 'kg', productType: 'stored', active: true },
    { id: 'other', code: 'OTHER', name: 'Other', unit: 'kg', productType: 'stored', active: true });
  state().warehouse.push({ id: 'main', code: 'MAIN', name: 'Main', active: true }, { id: 'second', code: 'SECOND', name: 'Second', active: true });
  state().stockBalance.push({ id: 'b1', warehouseId: 'main', productId: 'mat', onHand: 10, reserved: 0, available: 10, updatedAt: new Date('2026-10-01') });
  state().stockMovement.push({ id: 'legacy', warehouseId: 'main', productId: 'mat', qtyIn: 10, qtyOut: 0, sourceDocType: 'legacy', sourceDocId: 'legacy',
    transactionDate: new Date('2026-10-01'), createdAt: new Date('2026-10-01') });
  const server = f.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/inventory`;
  async function call(path, { method = 'GET', user = 'maker', body, status = 200 } = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${f.token(user)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  const balance = (warehouse = 'main') => state().stockBalance.find(row => row.warehouseId === warehouse && row.productId === 'mat');
  const initialize = (patch = {}, status = 201) => call('/cost-initializations', { method: 'POST', status, body: { requestKey: randomUUID(), warehouseId: 'main', productId: 'mat',
    quantity: '10', totalValue: '100', evidence: 'Accounting verified original supplier invoice net of VAT, allocations reviewed',
    asOf: '2026-10-02', updatedAt: balance().updatedAt.toISOString(), ...patch } });
  const actInit = (doc, action, patch = {}) => call(`/cost-initializations/${doc.id}/${action}`, { method: 'POST', user: 'approver',
    body: { revision: doc.revision, reason: 'reviewed' }, ...patch });
  const input = (patch = {}) => ({ requestKey: randomUUID(), sourceWarehouseId: 'main', destinationWarehouseId: 'second',
    transferDate: '2026-10-03', items: [{ productId: 'mat', quantity: '2' }], remark: 'Move to warehouse', ...patch });
  const create = (body = input(), status = 201, user = 'maker') => call('/transfers', { method: 'POST', body, status, user });
  const act = (doc, action, patch = {}) => call(`/transfers/${doc.id}/${action}`, { method: 'POST',
    body: { revision: doc.revision, reason: 'reviewed', physicalReturnConfirmed: true, cancellationDate: '2026-10-04' }, ...patch });
  await t.test('unknown history has null values; explicit entry independent approval audit rollback', async () => {
    const rows = await call('/valuations'); assert.equal(rows[0].valuationStatus, 'unvalued'); assert.equal(rows[0].totalValue, null);
    await call('/valuations', { user: null, status: 401 });
    await call('/cost-initializations', { method: 'POST', user: 'viewer', body: {}, status: 403 });
    await call('/cost-initializations', { method: 'POST', body: { requestKey: randomUUID(), warehouseId: 'main', productId: 'mat', quantity: 10, totalValue: '', asOf: '2026-10-02' }, status: 400 });
    f.failAudit('stock_cost_initialization'); await initialize({}, 500); f.failAudit(false);
    assert.equal(state().stockCostInitialization.length, 0);
    let doc = await initialize(); assert.equal(doc.status, 'pending');
    await actInit(doc, 'approve', { user: 'maker', status: 403 });
    f.failAudit('stock_cost_initialization'); await actInit(doc, 'approve', { status: 500 }); f.failAudit(false);
    assert.equal(state().stockValuation.length, 0);
    doc = await actInit(doc, 'approve'); assert.equal(doc.status, 'approved');
    await actInit(doc, 'approve', { status: 409 });
    assert.equal((await call('/valuations'))[0].averageCost, '10.000000000000');
  });
  await t.test('thresholds explicit per pair warnings and revision/audit rollback', async () => {
    const body = { warehouseId: 'main', productId: 'mat', lowStockThreshold: '8', updatedAt: balance().updatedAt.toISOString() };
    await call('/thresholds', { method: 'PUT', user: 'viewer', body, status: 403 });
    f.failAudit('stock_threshold'); await call('/thresholds', { method: 'PUT', body, status: 500 }); f.failAudit(false);
    assert.equal(balance().lowStockThreshold, undefined);
    await call('/thresholds', { method: 'PUT', body }); assert.equal((await call('/low-stock')).length, 0);
    await call('/thresholds', { method: 'PUT', body, status: 409 });
  });
  let doc;
  await t.test('draft replay edit return re-submit reserving stock competing IS cannot consume transfer capacity', async () => {
    const body = input(); doc = await create(body); assert.equal((await create(body)).id, doc.id);
    await create({ ...body, remark: 'different' }, 409);
    assert.equal(balance().reserved, 0); assert.equal(state().stockMovement.length, 1);
    await create(input({ destinationWarehouseId: 'main' }), 400);
    await create(input({ items: [{ productId: 'mat', quantity: '0' }] }), 400);
    await create(input(), 403, 'viewer');
    doc = await act(doc, 'submit'); assert.equal(balance().reserved, 2); assert.equal(balance().available, 8);
    await act(doc, 'approve', { status: 403 });
    const competing = await create(input({ items: [{ productId: 'mat', quantity: '9' }] })); await act(competing, 'submit', { status: 409 });
    doc = await act(doc, 'return', { user: 'approver' }); assert.equal(balance().reserved, 0);
    doc = await call(`/transfers/${doc.id}`, { method: 'PUT', body: { ...body, revision: doc.revision, items: [{ productId: 'mat', quantity: '2.125' }] } });
    doc = await act(doc, 'submit'); assert.equal(balance().reserved, 2.125);
  });
  await t.test('atomic two-sided source average cost and full rollback; stale retries post only once', async () => {
    f.failAudit('stock_transfer'); await act(doc, 'approve', { user: 'approver', status: 500 }); f.failAudit(false);
    assert.equal(balance().onHand, 10); assert.equal(balance().reserved, 2.125); assert.equal(state().stockMovement.length, 1);
    const stale = doc; doc = await act(doc, 'approve', { user: 'approver' });
    await act(stale, 'approve', { user: 'approver', status: 409 });
    assert.equal(balance().onHand, 7.875); assert.equal(balance('second').onHand, 2.125); assert.equal(balance().reserved, 0);
    const movements = (await call(`/transfers/${doc.id}`)).movements;
    assert.equal(movements.length, 2); assert.equal(movements.find(row => row.warehouseId === 'main').valueOut, '21.250000000000');
    assert.equal(movements.find(row => row.warehouseId === 'second').valueIn, '21.250000000000');
    for (const movement of movements) {
      const valuation = state().stockValuation.find(row => row.warehouseId === movement.warehouseId && row.productId === movement.productId);
      assert.equal(valuation.lastMovementId, movement.id, 'Persist the supplied movement ID used by the valuation chain');
    }
    assert.equal((await call('/low-stock')).length, 1);
  });
  await t.test('backdated valued transfers fail closed and release rollback preserves pending reservation; latest reversal restores cost', async () => {
    let backdated = await create(input({ transferDate: '2026-10-02', items: [{ productId: 'mat', quantity: '1' }] }));
    backdated = await act(backdated, 'submit'); await act(backdated, 'approve', { user: 'approver', status: 409 });
    assert.equal(balance().reserved, 1);
    await act(backdated, 'cancel'); assert.equal(balance().reserved, 0);
    doc = await act(doc, 'cancel'); assert.equal(balance().onHand, 10); assert.equal(balance('second').onHand, 0);
    const rows = await call('/valuations'); assert.equal(rows.find(row => row.warehouseId === 'main').totalValue, '100.000000000000');
  });
  await t.test('GR explicit net cost weighted average; IS and SR use posted cost snapshots, not changing masters', async () => {
    const po = state().purchaseOrder[0]; po.status = 'approved'; po.items = [{ id: 'po-line', seq: 0, productId: 'mat', unit: 'kg', qty: 5, desc: 'Material' }];
    async function ap(path, method, body, user = 'maker', status = 200) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ap${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.token(user)}` }, body: JSON.stringify(body) });
      const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
    }
    let gr = await ap('/goods-receipts', 'POST', { requestKey: randomUUID(), receiptDate: '2026-10-05', poId: 'po', warehouseId: 'main', sender: 'supplier', receiver: 'store',
      items: [{ poLineId: 'po-line', productId: 'mat', currentReceiptQty: '5', unitCost: '20', costEvidence: 'Net after discount, VAT excluded, freight allocation approved' }] }, 'maker', 201);
    state().attachment.push({ id: 'gr-evidence', goodsReceiptId: gr.id, category: 'gr-receipt', uploadedAt: new Date(), originalName: 'checked.pdf', fileUrl: 'https://evidence.invalid/checked.pdf' });
    gr = await ap(`/goods-receipts/${gr.id}/submit`, 'POST', { updatedAt: gr.updatedAt });
    gr = await ap(`/goods-receipts/${gr.id}/approve`, 'POST', { updatedAt: gr.updatedAt }, 'approver');
    assert.equal(state().stockValuation.find(row => row.warehouseId === 'main').totalValue, '200.000000000000');
    state().accountProduct[0].purchasePrice = 999;
    let issue = await call('/issues', { method: 'POST', status: 201, body: { requestKey: randomUUID(), issueDate: '2026-10-06', warehouseId: 'main',
      requester: 'site', receiver: 'site', items: [{ productId: 'mat', requestedQty: '3', issuedQty: '3' }] } });
    issue = await call(`/issues/${issue.id}/submit`, { method: 'POST', body: { updatedAt: issue.updatedAt } });
    issue = await call(`/issues/${issue.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: issue.updatedAt } });
    const issueMovement = state().stockMovement.find(row => row.sourceDocId === issue.id);
    assert.equal(issueMovement.valueOut, '40.000000000000'); assert.equal(balance().onHand, 12);
    let sr = await call('/returns', { method: 'POST', status: 201, body: { requestKey: randomUUID(), stockIssueId: issue.id, returnDate: '2026-10-07', sender: 'site',
      receiver: 'store', returnReason: 'unused', items: [{ stockIssueLineId: issue.items[0].id, returnedQty: '1' }] } });
    sr = await call(`/returns/${sr.id}/submit`, { method: 'POST', body: { updatedAt: sr.updatedAt } });
    await call(`/returns/${sr.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: sr.updatedAt } });
    const returnMovement = state().stockMovement.find(row => row.sourceDocId === sr.id);
    assert.equal(returnMovement.valueIn, '13.333333333333'); assert.equal(returnMovement.costProvenance.movementId, issueMovement.id);
    assert.equal(state().stockValuation.find(row => row.warehouseId === 'main').totalValue, '173.333333333333');
    await ap(`/goods-receipts/${gr.id}/cancel`, 'POST', { updatedAt: gr.updatedAt, cancellationDate: '2026-10-08', reason: 'correct receipt' }, 'maker', 409);
    assert.equal(state().stockMovement.filter(row => row.sourceDocType === 'goods_receipt_reversal').length, 0);
  });
  await t.test('admin creator self approval forbidden; reject releases reservation; audit and row locks retained', async () => {
    let own = await create(input({ transferDate: '2026-10-08', items: [{ productId: 'mat', quantity: '1' }] }), 201, 'admin');
    own = await act(own, 'submit', { user: 'admin' }); await act(own, 'approve', { user: 'admin', status: 403 });
    await act(own, 'reject', { user: 'approver' }); assert.equal(balance().reserved, 0);
    assert.ok(f.locks.some(row => /stock_balances.*FOR UPDATE/.test(row.sql)));
    assert.ok(f.locks.some(row => /stock_valuations.*FOR UPDATE/.test(row.sql)));
    assert.ok(state().auditLog.some(row => row.entityType === 'stock_transfer'));
  });
});
