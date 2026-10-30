const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateUnit } = require('../src/lib/accountingMaster');

test('Accounting units validate names and additive rollout seeds the 19 suggestions without rewriting snapshots', () => {
  assert.deepEqual(validateUnit({ code: ' U001 ', name: ' Lot ' }), { code: 'U001', name: 'Lot', active: true });
  for (const patch of [{ code: '' }, { name: '' }, { name: 1 }, { name: 'x'.repeat(41) }, { active: 'false' }]) {
    assert.throws(() => validateUnit({ code: 'U001', name: 'Lot', ...patch }), error => error.status === 400);
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sql', 'accounting-units.sql'), 'utf8');
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "account_units"/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
  const names = ['Lot', 'Set', 'เมตร', 'ตาราง', 'Pcs', 'Gallon', 'Pair', 'Mat', 'EA', 'AU', 'Bag', 'Unit', 'Job', 'Sheet', 'Box', 'KG', 'ETC', 'ตัน', 'Roll'];
  assert.equal((sql.match(/\('account-unit-/g) || []).length, names.length);
  for (const name of names) assert.ok(sql.includes(`'${name}'`));
});

test('Accounting unit HTTP master supports revisions/audit/deactivation and permission-scoped active suggestions', async t => {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-units-test';
  t.after(() => { if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
  const fixture = require('./helpers/accountingMasterApp').createMasterApp({ units: true });
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (route = 'account-units', method = 'GET', body, user = 'admin') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: response.status === 404 ? null : await response.json() };
  };
  assert.equal((await request('account-units', 'GET', undefined, null)).status, 401);
  assert.equal((await request('account-units', 'POST', { code: 'U001', name: 'Lot' }, 'viewer')).status, 403);
  const created = await request('account-units', 'POST', { code: 'U001', name: 'Lot' });
  assert.equal(created.status, 201);
  let doc = created.data;
  assert.equal((await request('account-units', 'POST', { code: 'U001', name: 'Other' })).status, 409);
  assert.equal((await request('account-units', 'POST', { code: 'U002', name: 'Lot' })).status, 409);
  for (const user of ['viewer', 'ar', 'ap', 'inventory']) {
    const result = await request('accounting-access/lookups/units', 'GET', undefined, user);
    assert.equal(result.status, 200);
    assert.equal(result.data[0].name, 'Lot');
  }
  assert.equal((await request('accounting-access/lookups/units', 'GET', undefined, 'unassigned')).status, 403);
  assert.equal((await request('account-units', 'GET', undefined, 'ar')).status, 403);
  assert.equal((await request(`account-units/${doc.id}`, 'PUT', { ...doc, name: 'Changed' }, 'viewer')).status, 403);
  const edited = await request(`account-units/${doc.id}`, 'PUT', { ...doc, name: 'Changed' });
  assert.equal(edited.status, 200);
  assert.equal((await request(`account-units/${doc.id}`, 'PUT', { ...doc, name: 'Stale' })).status, 409);
  doc = edited.data;
  fixture.failAudit(true);
  assert.equal((await request(`account-units/${doc.id}`, 'PUT', { ...doc, name: 'Rollback' })).status, 500);
  assert.equal((await request(`account-units/${doc.id}`)).data.name, 'Changed');
  fixture.failAudit(false);
  const inactive = await request(`account-units/${doc.id}`, 'PUT', { ...doc, active: false });
  assert.equal(inactive.status, 200);
  assert.equal((await request('accounting-access/lookups/units', 'GET', undefined, 'ar')).data.length, 0);
  assert.equal((await request('account-units?active=false&page=1&pageSize=20')).data.total, 1);
  assert.equal((await request(`account-units/${doc.id}/permanent`, 'DELETE', inactive.data)).status, 404);
  assert.equal((await request(`account-units/${doc.id}/history`)).data.total, 3);
  assert.equal((await request(`account-units/${doc.id}`, 'PUT', { ...inactive.data, active: true })).status, 200);
  assert.equal((await request('accounting-access/lookups/units', 'GET', undefined, 'ar')).data[0].name, 'Changed');
});
