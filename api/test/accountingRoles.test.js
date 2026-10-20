const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const unexpectedQuery = async () => { throw new Error('Unexpected database call'); };
const prisma = {
  user: { findUnique: unexpectedQuery, findMany: unexpectedQuery },
  accountingRole: {
    create: unexpectedQuery, findMany: unexpectedQuery, findUnique: unexpectedQuery,
    update: unexpectedQuery, delete: unexpectedQuery,
  },
  accountingUserRole: {
    findUnique: unexpectedQuery, upsert: unexpectedQuery, deleteMany: unexpectedQuery, count: unexpectedQuery,
  },
  accountCustomer: { findMany: unexpectedQuery },
};
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
const router = require('../src/routes/accounting-access');

test('Accounting administration persists roles/assignments independently and restricts management to admin', async t => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'accounting-role-test-secret';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  const users = [
    { id: 'admin', username: 'admin', role: 'admin', active: true },
    { id: 'sales', username: 'sales', role: 'sales', active: true },
    { id: 'director', username: 'director', role: 'director', active: true },
  ];
  const roles = new Map();
  const assignments = new Map();
  t.mock.method(prisma.user, 'findUnique', async ({ where }) => users.find(user => user.id === where.id) || null);
  t.mock.method(prisma.user, 'findMany', async () => users.map(user => ({
    ...user, accountingAssignment: assignments.has(user.id) ? { roleId: assignments.get(user.id) } : null,
  })));
  t.mock.method(prisma.accountingRole, 'create', async ({ data }) => {
    const role = { id: `role-${roles.size}`, ...data }; roles.set(role.id, role); return role;
  });
  t.mock.method(prisma.accountingRole, 'findMany', async () => [...roles.values()]);
  t.mock.method(prisma.accountingRole, 'findUnique', async ({ where }) => roles.get(where.id) || null);
  t.mock.method(prisma.accountingRole, 'update', async ({ where, data }) => {
    const role = { id: where.id, ...data }; roles.set(role.id, role); return role;
  });
  t.mock.method(prisma.accountingRole, 'delete', async ({ where }) => roles.delete(where.id));
  t.mock.method(prisma.accountingUserRole, 'findUnique', async ({ where }) => {
    const role = roles.get(assignments.get(where.userId)); return role ? { role } : null;
  });
  t.mock.method(prisma.accountingUserRole, 'upsert', async ({ create }) => assignments.set(create.userId, create.roleId));
  t.mock.method(prisma.accountingUserRole, 'deleteMany', async ({ where }) => assignments.delete(where.userId));
  t.mock.method(prisma.accountingUserRole, 'count', async ({ where }) =>
    [...assignments.values()].filter(roleId => roleId === where.roleId).length);
  t.mock.method(prisma.accountCustomer, 'findMany', async () => [{ id: 'customer', code: 'C1', name: 'Customer' }]);
  const app = express();
  app.use(express.json());
  app.use('/api/accounting-access', router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/accounting-access`;
  const request = (path, method = 'GET', body, userId = 'admin') => fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt.sign({ sub: userId }, 'accounting-role-test-secret')}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal((await fetch(`${base}/roles`)).status, 401);
  for (const userId of ['sales', 'director']) {
    assert.equal((await request('/roles', 'GET', undefined, userId)).status, 403);
    assert.equal((await request('/roles', 'POST', { name: 'No', permissions: ['ar.view'] }, userId)).status, 403);
    assert.equal((await request('/users', 'GET', undefined, userId)).status, 403);
    assert.equal((await request('/users/sales/role', 'PUT', { roleId: null }, userId)).status, 403);
    assert.equal((await request('/roles/any', 'PUT', { name: 'No', permissions: ['ar.view'] }, userId)).status, 403);
    assert.equal((await request('/roles/any', 'DELETE', undefined, userId)).status, 403);
  }
  assert.equal((await request('/roles', 'POST', { name: 'Invalid', permissions: ['ar.create'] })).status, 400);
  const created = await request('/roles', 'POST', { name: 'AR Viewer', permissions: ['ar.view'] });
  assert.equal(created.status, 201);
  const role = await created.json();
  assert.equal((await (await request('/roles')).json()).roles[0].name, 'AR Viewer');
  assert.equal((await request('/users/sales/role', 'PUT', { roleId: role.id })).status, 200);
  const access = await (await request('/me', 'GET', undefined, 'sales')).json();
  assert.equal(access.role.name, 'AR Viewer');
  assert.equal(access.isAdmin, false);
  assert.deepEqual(access.permissions, ['ar.view']);
  assert.equal((await request('/lookups/customers', 'GET', undefined, 'sales')).status, 403);
  assert.equal((await request(`/roles/${role.id}`, 'DELETE')).status, 409);
  assert.equal((await request(`/roles/${role.id}`, 'PUT', { name: 'AR Clerk', permissions: ['ar.view', 'ar.create'] })).status, 200);
  assert.deepEqual((await (await request('/me', 'GET', undefined, 'sales')).json()).permissions, ['ar.view', 'ar.create']);
  assert.equal((await request('/lookups/customers', 'GET', undefined, 'sales')).status, 200);
  assert.equal((await request('/lookups/suppliers', 'GET', undefined, 'sales')).status, 403);
  assert.equal((await request('/lookups/toString', 'GET', undefined, 'sales')).status, 404);
  assert.equal((await request('/users/sales/role', 'PUT', {})).status, 400);
  assert.equal((await request('/users/sales/role', 'PUT', { roleId: 'missing' })).status, 404);
  assert.equal((await request('/users/missing/role', 'PUT', { roleId: null })).status, 404);
  assert.equal((await request('/users/admin/role', 'PUT', { roleId: null })).status, 400);
  const assignedUsers = await (await request('/users')).json();
  assert.equal(assignedUsers.find(user => user.id === 'sales').accountingAssignment.roleId, role.id);
  assert.equal(users[1].role, 'sales');
  assert.equal((await request('/users/sales/role', 'PUT', { roleId: null })).status, 200);
  assert.equal((await (await request('/me', 'GET', undefined, 'sales')).json()).allowed, false);
  assert.equal((await request(`/roles/${role.id}`, 'DELETE')).status, 200);
  assert.equal((await (await request('/roles')).json()).roles.length, 0);
});
