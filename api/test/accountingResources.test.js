const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const unexpectedQuery = async () => { throw new Error('Unexpected database call'); };
const prisma = {
  user: { findUnique: unexpectedQuery },
  accountingUserRole: { findUnique: unexpectedQuery },
};
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
const { authenticate } = require('../src/middleware/auth');
const { ACCOUNTING_RESOURCES, requireAccountingResource } = require('../src/middleware/accountingAccess');
const { ACCOUNTING_MODULES } = require('../src/lib/accountingAccess');

test('Accounting resource gates protect every route and do not alter legacy access', async t => {
  const secret = 'accounting-resource-test-secret';
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  let active = true;
  let permissions = null;
  t.mock.method(prisma.user, 'findUnique', async ({ where }) =>
    ({ id: where.id, role: where.id === 'admin' ? 'admin' : 'sales', active }));
  t.mock.method(prisma.accountingUserRole, 'findUnique', async () =>
    permissions ? { role: { id: 'role', name: 'Test Role', permissions } } : null);
  const app = express();
  for (const [route, resource] of ACCOUNTING_RESOURCES) {
    app.use(route, authenticate, requireAccountingResource(resource));
    app.use(route, (_req, res) => res.json({ ok: true }));
  }
  app.get('/api/customers', authenticate, (_req, res) => res.json({ legacy: true }));
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ sub: 'sales-user' }, secret);
  const headers = { Authorization: `Bearer ${token}` };
  const forgedHeaders = { Authorization: `Bearer ${jwt.sign({ sub: 'admin' }, 'wrong-secret')}` };
  assert.equal((await fetch(`${base}/api/ar`, { headers: forgedHeaders })).status, 401);

  for (const [route] of ACCOUNTING_RESOURCES) {
    assert.equal((await fetch(`${base}${route}`)).status, 401, route);
    assert.equal((await fetch(`${base}${route}`, { headers })).status, 403, route);
  }
  for (const [route, resource] of ACCOUNTING_RESOURCES) {
    const actions = ACCOUNTING_MODULES.find(item => item.key === resource).actions;
    permissions = actions.map(action => `${resource}.${action}`);
    for (const [method, action] of Object.entries({ GET: 'view', HEAD: 'view', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' })) {
      const expected = actions.includes(action) ? 200 : 403;
      assert.equal((await fetch(`${base}${route}`, { method, headers })).status, expected, `${method} ${route}`);
    }
  }
  permissions = null;
  assert.equal((await fetch(`${base}/api/customers`, { headers })).status, 200);
  permissions = ['ar.view'];
  assert.equal((await fetch(`${base}/api/ar/invoices`, { headers })).status, 200);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await fetch(`${base}/api/ar/invoices`, { method, headers })).status, 403, method);
  }
  assert.equal((await fetch(`${base}/api/ap/purchase-orders`, { headers })).status, 403);
  permissions = ['ar.view', 'ar.create'];
  assert.equal((await fetch(`${base}/api/ar/invoices`, { method: 'POST', headers })).status, 200);
  permissions = null;
  assert.equal((await fetch(`${base}/api/ar/invoices`, { headers })).status, 403);
  for (const [route] of ACCOUNTING_RESOURCES) {
    const adminHeaders = { Authorization: `Bearer ${jwt.sign({ sub: 'admin' }, secret)}` };
    assert.equal((await fetch(`${base}${route}`, { headers: adminHeaders })).status, 200, route);
  }
  active = false;
  assert.equal((await fetch(`${base}/api/ar/invoices`, { headers })).status, 401);
  active = true;
  t.mock.method(prisma.accountingUserRole, 'findUnique', async () => { throw new Error('Database unavailable'); });
  assert.equal((await fetch(`${base}/api/ar/invoices`, { headers })).status, 500);
});

test('Nested Accounting authentication reads the user once per request without caching revocation', async t => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'accounting-authentication-test-secret';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  let active = true, permissions = ['ar.view'], userQueries = 0;
  t.mock.method(prisma.user, 'findUnique', async ({ where }) => {
    userQueries++;
    return { id: where.id, role: 'sales', active };
  });
  t.mock.method(prisma.accountingUserRole, 'findUnique', async () =>
    ({ role: { id: 'role', name: 'AR', permissions } }));
  const app = express();
  app.use('/api/ar', authenticate, requireAccountingResource('ar'));
  app.get('/api/ar/invoices', authenticate, authenticate, (req, res) => res.json({ userId: req.user.id }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/ar/invoices`;
  const headers = { Authorization: `Bearer ${jwt.sign({ sub: 'account-user' }, process.env.JWT_SECRET)}` };
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: 'account-user' });
  assert.equal(userQueries, 1, 'three middleware invocations use one user query');
  assert.equal((await fetch(url, { headers })).status, 200);
  assert.equal(userQueries, 2, 'new requests always read the current user');
  permissions = [];
  assert.equal((await fetch(url, { headers })).status, 403);
  assert.equal(userQueries, 3, 'permission revocation is effective on the next request');
  active = false;
  assert.equal((await fetch(url, { headers })).status, 401);
  assert.equal(userQueries, 4, 'deactivation is effective on the next request');
  assert.equal((await fetch(url)).status, 401);
  assert.equal(userQueries, 4);
});

test('Authentication reuse requires the same request, token and authenticated user object', async t => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'accounting-authentication-identity-secret';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  let queries = 0, nextCalls = 0, status;
  t.mock.method(prisma.user, 'findUnique', async ({ where }) => {
    queries++;
    return { id: where.id, role: 'sales', active: true };
  });
  const header = id => `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET)}`;
  const req = { headers: { authorization: header('first') }, user: { id: 'forged', role: 'admin' } };
  const res = { status(code) { status = code; return this; }, json() {} };
  const next = () => { nextCalls++; };
  await authenticate(req, res, next);
  assert.equal(req.user.id, 'first');
  await authenticate(req, res, next);
  assert.equal(queries, 1);
  req.user = { ...req.user, role: 'admin' };
  await authenticate(req, res, next);
  assert.equal(queries, 2);
  assert.equal(req.user.role, 'sales');
  req.headers.authorization = header('second');
  await authenticate(req, res, next);
  assert.equal(queries, 3);
  assert.equal(req.user.id, 'second');
  req.headers.authorization = `Bearer ${jwt.sign({ sub: 'admin' }, 'wrong-secret')}`;
  await authenticate(req, res, next);
  assert.equal(status, 401);
  assert.equal(nextCalls, 4);
  req.headers.authorization = `Bearer ${jwt.sign({ sub: 'second' }, process.env.JWT_SECRET, { expiresIn: -1 })}`;
  await authenticate(req, res, next);
  assert.equal(status, 401);
  assert.equal(nextCalls, 4);
});
