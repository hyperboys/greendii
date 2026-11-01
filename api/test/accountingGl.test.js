const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
let config = null, audit = [], failAudit = false, queue = Promise.resolve();
const accounts = [
  { id: 'ar', code: '1101', name: 'AR', active: true, accountType: 'detail' },
  { id: 'header', code: '1000', name: 'Assets', active: true, accountType: 'header' },
  { id: 'inactive', code: '9999', name: 'Old', active: false, accountType: 'detail' },
];
const prisma = {
  user: { findUnique: async ({ where }) => ({ id: where.id, active: true, role: where.id === 'admin' ? 'admin' : 'sales' }) },
  $queryRaw: async () => [],
  accountingGlConfiguration: {
    createMany: async () => { if (!config) config = { id: 'main', revision: 0, fiscalYearStartMonth: 1, mappings: [], policyNotes: '' }; return { count: 1 }; },
    findUnique: async () => config && structuredClone(config),
    update: async ({ data }) => { config = { ...config, ...data, updatedAt: new Date() }; return structuredClone(config); },
  },
  chartOfAccount: { findMany: async ({ where }) => accounts.filter(account => where.id ? where.id.in.includes(account.id) : account.active && account.accountType === 'detail') },
  auditLog: { create: async ({ data }) => {
    if (failAudit) throw new Error('audit unavailable');
    audit.push(data); return { id: String(audit.length), ...data };
  } },
  $transaction: operation => {
    const next = queue.then(async () => {
      const before = structuredClone({ config, audit });
      try { return await operation(prisma); } catch (error) { config = before.config; audit = before.audit; throw error; }
    });
    queue = next.catch(() => {});
    return next;
  },
};
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
const { glInput, glView } = require('../src/lib/accountingGl');
const input = (extra = {}) => ({ revision: 0, fiscalYearStartMonth: 1, policyNotes: '', mappings: [{ role: 'AR', accountId: 'ar' }], ...extra });

test('GL settings accept only explicit mappings/month/revision and cannot enable posting or closing', () => {
  assert.equal(glView(null).postingEnabled, false);
  assert.equal(glView(null).closingEnabled, false);
  assert.equal(glInput(input()).mappings[0].accountId, 'ar');
  for (const extra of [{ postingEnabled: true }, { closingEnabled: true }, { postingEnabled: 'false' },
    { fiscalYearStartMonth: 0 }, { fiscalYearStartMonth: 13 }, { revision: -1 }, { revision: '0' },
    { mappings: [{ role: 'CUSTOM', accountId: 'ar' }] }, { mappings: [{ role: 'AR', accountId: 'ar' }, { role: 'AR', accountId: 'ar' }] },
    { mappings: [{ role: 'AR', accountId: 'ar', amount: 1 }] }, { policyNotes: 'x'.repeat(4001) }]) {
    assert.throws(() => glInput(input(extra)), error => [400, 409].includes(error.status));
  }
});

test('GL HTTP saves are admin-only, revisioned, account-validated and audit-atomic; they never post journals', async t => {
  process.env.JWT_SECRET = 'accounting-gl-isolated-test';
  config = null; audit = [];
  const app = express(); app.use(express.json());
  app.use('/api/accounting-gl', require('../src/routes/accounting-gl'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(method, body, user = 'admin', expected = 200) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/accounting-gl`, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data)); return data;
  }
  await request('GET', null, null, 401);
  await request('GET', null, 'viewer', 403);
  await request('PUT', input(), 'viewer', 403);
  const defaults = await request('GET');
  assert.equal(defaults.config.revision, 0);
  assert.deepEqual(defaults.accounts.map(account => account.id), ['ar']);
  await request('PUT', input({ postingEnabled: true }), 'admin', 409);
  await request('PUT', input({ mappings: [{ role: 'AR', accountId: 'header' }] }), 'admin', 409);
  await request('PUT', input({ mappings: [{ role: 'AR', accountId: 'inactive' }] }), 'admin', 409);
  assert.equal(config, null);
  const result = await request('PUT', input());
  assert.equal(result.revision, 1);
  assert.equal(result.postingEnabled, false);
  assert.equal(result.closingEnabled, false);
  assert.deepEqual(result.mappings, [{ role: 'AR', accountId: 'ar', code: '1101', name: 'AR' }]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].performedById, 'admin');
  await request('PUT', input(), 'admin', 409);
  failAudit = true;
  await request('PUT', input({ revision: 1, fiscalYearStartMonth: 4 }), 'admin', 500);
  failAudit = false;
  assert.equal(config.revision, 1);
  assert.equal(config.fiscalYearStartMonth, 1);
  assert.equal(audit.length, 1);
});
