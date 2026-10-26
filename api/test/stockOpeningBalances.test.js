const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');

test('Stock opening balance HTTP workflow reconciles exact delta and reverses safely', async t => {
  process.env.JWT_SECRET = 'stock-opening-isolated-test';
  const f = createContractorPaymentApp(), state = () => f.state();
  state().accountProduct.push(
    { id: 'mat', code: 'MAT', name: 'Material', active: true, productType: 'stored', unit: 'Pcs' },
    { id: 'other', code: 'OTH', name: 'Other', active: true, productType: 'manufactured', unit: 'Kg' },
  );
  state().warehouse.push({ id: 'main', code: 'MAIN', name: 'Main', active: true });
  state().stockMovement.push(
    { id: 'movement-mat', productId: 'mat', warehouseId: 'main', sourceDocType: 'goods_receipt',
      transactionDate: new Date('2026-10-18T12:00:00Z'), createdAt: new Date('2026-10-18T12:00:00Z'), qtyIn: 3, qtyOut: 0 },
    { id: 'movement-other', productId: 'other', warehouseId: 'main', sourceDocType: 'goods_receipt',
      transactionDate: new Date('2026-10-18T12:00:00Z'), createdAt: new Date('2026-10-18T12:00:00Z'), qtyIn: 2, qtyOut: 0 },
  );
  state().stockBalance.push(
    { id: 'balance-mat', productId: 'mat', warehouseId: 'main', onHand: 3, reserved: 0, available: 3 },
    { id: 'balance-other', productId: 'other', warehouseId: 'main', onHand: 2, reserved: 0, available: 2 },
  );
  const server = f.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });

  const base = `http://127.0.0.1:${server.address().port}`, root = '/api/inventory/opening-balances';
  async function call(path, { method = 'GET', user = 'maker', body, status = 200 } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${f.token(user)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }

  const lookups = await call(`${root}/lookups`);
  assert.equal(lookups.warehouses[0].id, 'main');
  const initialPreview = await call(`${root}/preview?warehouseId=main&cutoverDate=2026-10-20`);
  assert.equal(initialPreview.canPost, true);
  assert.equal(initialPreview.lines.find(row => row.productId === 'mat').bookQtyAtCutover, '3.000');
  const futureDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + 86400000));
  const futureDoc = await call(root, { method: 'POST', status: 201, body: {
    requestKey: randomUUID(), warehouseId: 'main', cutoverDate: futureDate,
    items: [{ productId: 'mat', countedQty: '3' }, { productId: 'other', countedQty: '2' }],
  } });
  await call(`${root}/${futureDoc.id}/submit`, { method: 'POST', body: { updatedAt: futureDoc.updatedAt }, status: 409 });
  await call(`${root}/${futureDoc.id}/cancel`, { method: 'POST', body: { updatedAt: futureDoc.updatedAt, reason: 'Replace test draft' } });
  let doc = await call(root, { method: 'POST', status: 201, body: {
    requestKey: randomUUID(), warehouseId: 'main', cutoverDate: '2026-10-20',
    items: [{ productId: 'mat', countedQty: '5' }],
  } });
  assert.equal(doc.status, 'draft');
  assert.equal(state().stockMovement.length, 2);
  assert.equal((await call(root)).length, 2);
  assert.equal((await call(`${root}/${doc.id}`)).openingNo, doc.openingNo);
  await call(`${root}/${doc.id}/submit`, { method: 'POST', body: { updatedAt: doc.updatedAt }, status: 400 });

  doc = await call(`${root}/${doc.id}`, { method: 'PUT', user: 'editor', body: {
    updatedAt: doc.updatedAt, warehouseId: 'main', cutoverDate: '2026-10-20',
    items: [{ productId: 'mat', countedQty: '5' }, { productId: 'other', countedQty: '2' }],
  } });
  state().stockBalance.find(row => row.productId === 'mat').onHand = 4;
  state().stockBalance.find(row => row.productId === 'mat').available = 4;
  await call(`${root}/${doc.id}/submit`, { method: 'POST', body: { updatedAt: doc.updatedAt }, status: 409 });
  assert.equal(state().stockMovement.length, 2);
  state().stockBalance.find(row => row.productId === 'mat').onHand = 3;
  state().stockBalance.find(row => row.productId === 'mat').available = 3;

  doc = await call(`${root}/${doc.id}/submit`, { method: 'POST', body: { updatedAt: doc.updatedAt } });
  assert.equal(doc.status, 'pending');
  assert.equal(Number(doc.items.find(row => row.productId === 'mat').bookQtyAtCutover), 3);
  assert.equal(Number(doc.items.find(row => row.productId === 'mat').deltaQty), 2);
  assert.equal(state().stockMovement.length, 2);
  assert.equal(state().stockBalance.find(row => row.productId === 'mat').onHand, 3);
  await call(root, { method: 'POST', status: 409, body: {
    requestKey: randomUUID(), warehouseId: 'main', cutoverDate: '2026-10-20',
    items: [{ productId: 'mat', countedQty: '5' }],
  } });

  f.failAudit('stock_opening_balance');
  await call(`${root}/${doc.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: doc.updatedAt }, status: 500 });
  f.failAudit(false);
  assert.equal(state().stockMovement.length, 2);
  assert.equal(state().stockBalance.find(row => row.productId === 'mat').onHand, 3);
  doc = await call(`${root}/${doc.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: doc.updatedAt } });
  assert.equal(doc.status, 'approved');
  assert.equal(state().stockMovement.length, 3);
  assert.equal(state().stockBalance.find(row => row.productId === 'mat').onHand, 5);
  assert.equal(state().stockBalance.find(row => row.productId === 'other').onHand, 2);
  const openingMovement = state().stockMovement.find(row => row.sourceDocType === 'stock_opening_balance');
  assert.equal(openingMovement.qtyIn, 2);
  assert.equal(openingMovement.qtyOut, 0);
  assert.equal(new Date(openingMovement.transactionDate).toISOString(), '2026-10-19T16:59:59.999Z');

  const futureCancelDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + 86400000));
  await call(`${root}/${doc.id}/cancel`, { method: 'POST', body: {
    updatedAt: doc.updatedAt, reason: 'Cancel test', cancellationDate: futureCancelDate,
  }, status: 409 });
  assert.equal(state().stockMovement.length, 3);
  doc = await call(`${root}/${doc.id}/cancel`, { method: 'POST', body: {
    updatedAt: doc.updatedAt, reason: 'Cancel test', cancellationDate: '2026-10-21',
  } });
  assert.equal(doc.status, 'cancelled');
  assert.equal(state().stockMovement.length, 4);
  assert.equal(state().stockBalance.find(row => row.productId === 'mat').onHand, 3);
  assert.equal(state().stockMovement.at(-1).sourceDocType, 'stock_opening_balance_reversal');
  assert.equal(state().stockMovement.at(-1).qtyOut, 2);

  let reservedDoc = await call(root, { method: 'POST', status: 201, body: {
    requestKey: randomUUID(), warehouseId: 'main', cutoverDate: '2026-10-20',
    items: [{ productId: 'mat', countedQty: '1' }, { productId: 'other', countedQty: '2' }],
  } });
  reservedDoc = await call(`${root}/${reservedDoc.id}/submit`, { method: 'POST', body: { updatedAt: reservedDoc.updatedAt } });
  state().stockBalance.find(row => row.productId === 'mat').reserved = 2;
  state().stockBalance.find(row => row.productId === 'mat').available = 1;
  await call(`${root}/${reservedDoc.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: reservedDoc.updatedAt }, status: 409 });
  assert.equal(state().stockBalance.find(row => row.productId === 'mat').onHand, 3);
  assert.equal(state().stockMovement.length, 4);
});
