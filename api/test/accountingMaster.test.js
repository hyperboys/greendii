const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProduct, validateWarehouse, validateAccount, validateSupplier, masterWhere } = require('../src/lib/accountingMaster');

test('Master validators reject malformed numeric, enum, active and Tax ID values', () => {
  const base = { code: ' P1 ', name: ' Product ' };
  assert.equal(validateProduct(base).price, '0.00');
  assert.equal(validateProduct({ ...base, price: '12.30' }).price, '12.30');
  for (const price of ['abc', '-1', '1.001', '', true, null, 1e15]) {
    assert.throws(() => validateProduct({ ...base, price }), /ราคา/);
  }
  assert.throws(() => validateProduct({ ...base, productType: 'unknown' }), /ประเภท/);
  assert.throws(() => validateWarehouse({ ...base, active: 'false' }), /สถานะ/);
  assert.throws(() => validateAccount({ ...base, category: 'invalid' }), /หมวด/);
  assert.throws(() => validateAccount({ ...base, category: 'asset', accountType: 'header', accountMapping: 'AR' }), /หัว/);
  assert.throws(() => validateSupplier({ ...base, taxId: '123' }), /13/);
  assert.equal(validateSupplier({ ...base, supplierType: 'overseas', taxId: 'FOREIGN' }).taxId, 'FOREIGN');
});

test('Supplier branches and bank defaults are validated and scalar compatibility uses selected defaults', () => {
  const body = { code: 'V1', name: 'Supplier', branches: [
    { code: '00000', name: 'Main', isDefault: false, banks: [] },
    { code: '00001', name: 'Branch', isDefault: true, address: 'Here', banks: [
      { bankName: 'A', bankAccountNo: '001', bankAccountName: 'Supplier', isDefault: false },
      { bankName: 'B', bankAccountNo: '002', bankAccountName: 'Supplier', isDefault: true },
    ] },
  ] };
  const result = validateSupplier(body);
  assert.equal(result.branch, 'Branch');
  assert.equal(result.address, 'Here');
  assert.equal(result.bankAccountNo, '002');
  assert.throws(() => validateSupplier({ ...body, branches: [] }), /สาขา/);
  assert.throws(() => validateSupplier({ ...body, branches: body.branches.map(b => ({ ...b, isDefault: true })) }), /เริ่มต้น/);
  assert.throws(() => validateSupplier({ ...body, branches: [body.branches[0], body.branches[0]] }), /สาขา/);
  assert.throws(() => validateSupplier({ ...body, paymentTerm: '1x' }), /วัน/);
});

test('Master filters reject malformed active status rather than silently filtering inactive', () => {
  assert.deepEqual(masterWhere({ active: 'false', q: ' X ' }, ['code', 'name']), {
    active: false, OR: [{ code: { contains: 'X', mode: 'insensitive' } }, { name: { contains: 'X', mode: 'insensitive' } }],
  });

  assert.throws(() => masterWhere({ active: 'junk' }), /สถานะ/);
});

test('All six master HTTP routers persist complete records, paginate, audit, enforce permissions and guard deletion', async t => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'isolated-master-test';
    t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
    const fixture = require('./helpers/accountingMasterApp').createMasterApp();
    const server = fixture.app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const request = (route, method = 'GET', body, user = 'admin') => fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const samples = {
      customers: { taxId: '1234567890123', branches: [{ code: '00000', name: 'Main', addresses: [] }] },
      sales: { email: 'sale@example.test' },
      suppliers: { branches: [{ code: '00000', name: 'Main', isDefault: true, banks: [
        { bankName: 'Bank', bankAccountNo: '001', bankAccountName: 'Supplier', isDefault: true },
      ] }] },
      products: { unit: 'PCS', category: 'Tools', price: '100.25', cost: '50.00', description: 'Description', vatConfig: 'NO_VAT' },
      warehouses: { location: 'Bangkok', description: 'Main store' },
      coa: { category: 'asset', accountType: 'detail', accountMapping: 'AR' },
    };
    for (const [kind, [, route]] of Object.entries(fixture.kinds)) {
      assert.equal((await request(route, 'GET', undefined, null)).status, 401);
      assert.equal((await request(route, 'POST', {}, 'viewer')).status, 403);
      const payload = { code: `${kind}-1`, name: `${kind} name`, ...samples[kind] };
      const response = await request(route, 'POST', payload);
      assert.equal(response.status, 201, `${kind}: ${response.status}`);
      const saved = await response.json();
      assert.equal((await request(route, 'POST', payload)).status, 409, `${kind} duplicate code`);
      const get = await request(`${route}/${saved.id}`);
      assert.equal(get.status, 200);
      assert.equal((await get.json()).code, payload.code);
      const page = await (await request(`${route}?page=1&pageSize=1&q=${kind}&active=true`)).json();
      assert.equal(page.total, 1);
      assert.equal(page.data.length, 1);
      assert.equal((await request(`${route}?active=invalid`)).status, 400);
      const update = await request(`${route}/${saved.id}`, 'PUT', { ...saved, name: 'Edited' });
      assert.equal(update.status, 200, `${kind} update`);
      const edited = await update.json();
      if (kind === 'suppliers') assert.equal(edited.branches[0].banks[0].bankAccountNo, '001');
      if (kind === 'products') assert.equal(edited.price, '100.25');
      assert.equal((await request(`${route}/${saved.id}`, 'PUT', { ...saved, name: 'Stale' })).status, 409);
      fixture.failAudit(true);
      assert.equal((await request(`${route}/${saved.id}`, 'PUT', { ...edited, name: 'Rollback' })).status, 500);
      fixture.failAudit(false);
      assert.equal((await (await request(`${route}/${saved.id}`)).json()).name, 'Edited');
      const history = await request(`${route}/${saved.id}/history?page=1`);
      assert.equal(history.status, 200);
      assert.equal((await history.json()).total, 2);
      assert.equal((await request(`${route}/${saved.id}/permanent`, 'DELETE', {}, 'viewer')).status, 403);
      if (kind !== 'coa') {
        fixture.markUsed(saved.id);
        assert.equal((await request(`${route}/${saved.id}/permanent`, 'DELETE', { updatedAt: edited.updatedAt })).status, 409);
        if (kind === 'products') assert.equal((await request(`${route}/${saved.id}`, 'PUT', { ...edited, productType: 'service' })).status, 409);
        assert.equal((await request(`${route}/${saved.id}`, 'DELETE', { updatedAt: edited.updatedAt })).status, 200);
        assert.equal((await (await request(`${route}/${saved.id}`)).json()).active, false);
      } else {
        assert.equal((await request(`${route}/${saved.id}/permanent`, 'DELETE', { updatedAt: edited.updatedAt })).status, 200);
        assert.equal((await request(`${route}/${saved.id}`)).status, 404);
        assert.equal((await (await request(`${route}/${saved.id}/history`)).json()).total, 3);
      }
    }
    assert.equal((await request('accounting-access/lookups/customers', 'GET', undefined, 'ar')).status, 200);
    assert.equal((await (await request('accounting-access/lookups/customers', 'GET', undefined, 'ar')).json()).length, 0);
    const supplier = await (await request('suppliers', 'POST', { code: 'V-PO', name: 'Original Supplier', taxId: '1234567890123' })).json();
    const poPayload = { supplierId: supplier.id, items: [{ desc: 'Manual item', qty: 1, unitPrice: 100 }], vatConfig: 'NO_VAT' };
    const poResponse = await request('ap/purchase-orders', 'POST', poPayload);
    assert.equal(poResponse.status, 201);
    const po = await poResponse.json();
    assert.equal(po.supplierSnapshot.name, 'Original Supplier');
    assert.equal((await request(`suppliers/${supplier.id}`, 'PUT', { ...supplier, name: 'Renamed Supplier' })).status, 200);
    const oldPo = await (await request(`ap/purchase-orders/${po.id}`)).json();
    assert.equal(oldPo.supplierSnapshot.name, 'Original Supplier');
    assert.equal((await request(`suppliers/${supplier.id}`, 'DELETE')).status, 200);
    assert.equal((await request('ap/purchase-orders', 'POST', poPayload)).status, 400);
    assert.equal((await request(`suppliers/${supplier.id}/permanent`, 'DELETE')).status, 409);
    assert.equal((await request(`ap/purchase-orders/${po.id}`)).status, 200);
});

test('Master rollout preserves scalar values and freezes only missing PO snapshots without touching balances', () => {
  const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'sql', 'accounting-master-data.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "supplier_branches"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "supplier_banks"/);
  assert.match(sql, /"supplier_snapshot" IS NULL/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM "supplier_branches"/);
  assert.doesNotMatch(sql.replace(/--[^\r\n]*/g, ''), /\b(?:DROP|TRUNCATE|DELETE)\b(?!\s+CASCADE)/i);
  assert.doesNotMatch(sql, /UPDATE\s+"(?:suppliers|stock_balances|invoices)"/i);
});
