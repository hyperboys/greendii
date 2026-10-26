const test = require('node:test'), assert = require('node:assert/strict');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');

test('Stock Card reports Bangkok date boundaries, opening and stable running quantities', async t => {
  process.env.JWT_SECRET = 'stock-card-isolated-test';
  const fixture = createContractorPaymentApp(), state = fixture.state();
  state.accountProduct.push(
    { id: 'mat', code: 'MAT', name: 'Material', unit: 'Pcs', active: true },
    { id: 'other', code: 'OTH', name: 'Other', unit: 'Box', active: false },
  );
  state.warehouse.push({ id: 'main', code: 'MAIN', name: 'Main', active: true },
    { id: 'old', code: 'OLD', name: 'Old store', active: false });
  const event = (id, date, productId = 'mat', warehouseId = 'main', qtyIn = 0, qtyOut = 0, sourceDocType = 'stock_issue') => ({
    id, transactionDate: new Date(date), productId, warehouseId, qtyIn, qtyOut, sourceDocType, sourceDocId: id, sourceDocNo: id,
  });
  state.stockMovement.push(
    event('before-in', '2026-10-25T16:59:59.999Z', 'mat', 'main', 5),
    event('before-out', '2026-10-25T16:59:59.999Z', 'mat', 'main', 0, 2),
    event('start-in', '2026-10-25T17:00:00.000Z', 'mat', 'main', 2, 0, 'goods_receipt'),
    event('same-out', '2026-10-26T06:00:00.000Z', 'mat', 'main', 0, 1),
    event('same-reversal', '2026-10-26T06:00:00.000Z', 'mat', 'main', 0.5, 0, 'stock_return_reversal'),
    event('other-product', '2026-10-26T09:00:00.000Z', 'other', 'old', 4, 0),
    event('after-end', '2026-10-26T17:00:00.000Z', 'mat', 'main', 9),
  );
  const server = fixture.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { user = 'viewer', status = 200 } = {}) {
    const response = await fetch(`${base}${path}`, { headers: user ? { Authorization: `Bearer ${fixture.token(user)}` } : {} });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  await request('/api/inventory/stock-card', { status: 400 });
  await request('/api/inventory/stock-card?from=2026-02-30&to=2026-10-26', { status: 400 });
  await request('/api/inventory/stock-card?from=2026-10-27&to=2026-10-26', { status: 400 });
  await request('/api/inventory/stock-card?from=2026-10-26&to=2026-10-26', { user: null, status: 401 });
  const report = await request('/api/inventory/stock-card?from=2026-10-26&to=2026-10-26&productId=mat&warehouseId=main');
  assert.equal(report.rows.length, 3);
  assert.deepEqual(report.rows.map(row => row.id), ['start-in', 'same-out', 'same-reversal']);
  assert.deepEqual(report.rows.map(row => [row.openingQty, row.runningQty]), [
    ['3.000', '5.000'], ['5.000', '4.000'], ['4.000', '4.500'],
  ]);
  assert.deepEqual(report.summaries.map(row => [row.openingQty, row.qtyIn, row.qtyOut, row.closingQty]), [
    ['3.000', '2.500', '1.000', '4.500'],
  ]);
  assert.equal(report.rows.some(row => row.id === 'after-end'), false);
  assert.equal(report.rows.some(row => row.id === 'other-product'), false);
  const previous = await request('/api/inventory/stock-card?from=2026-10-25&to=2026-10-25&productId=mat');
  assert.equal(previous.rows.length, 2);
  assert.equal(previous.summaries[0].closingQty, '3.000');
  const quietPeriod = await request('/api/inventory/stock-card?from=2026-10-28&to=2026-10-28&productId=mat&warehouseId=main');
  assert.equal(quietPeriod.rows.length, 0);
  assert.equal(quietPeriod.summaries[0].openingQty, '13.500');
  assert.equal(quietPeriod.summaries[0].closingQty, '13.500');
  await request('/api/inventory/stock-card?from=2026-10-26&to=2026-10-26&productId=mat&productId=other', { status: 400 });
  const lookups = await request('/api/inventory/stock-card/lookups');
  assert.equal(lookups.products.length, 2);
  assert.equal(lookups.warehouses.length, 2);
});
