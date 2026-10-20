const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = { accountingUserRole: { findUnique: async () => { throw new Error('Unexpected database call'); } } };
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
const {
  ALL_PERMISSIONS, validateAccountingRole, getAccountingAccess, hasAccountingPermission,
} = require('../src/lib/accountingAccess');

test('Accounting roles accept only supported permissions and require view for writes', () => {
  assert.deepEqual(validateAccountingRole({
    name: '  AR Clerk  ', permissions: ['ar.view', 'ar.create', 'ar.view'],
  }), { name: 'AR Clerk', permissions: ['ar.view', 'ar.create'] });
  for (const body of [
    null, {}, { name: 'A', permissions: [] }, { name: 'A', permissions: ['admin'] },
    { name: 'A', permissions: ['ar.approve'] }, { name: 'A', permissions: ['ar.create'] },
    { name: 'A', permissions: ['reports.delete'] }, { name: 'A'.repeat(101), permissions: ['ar.view'] },
    { name: 'A', permissions: 'ar.view' }, { name: 'A', permissions: [null] },
  ]) {
    assert.throws(() => validateAccountingRole(body), error => error.status === 400);
  }
});

test('Only legacy admin bypasses Accounting assignment; other legacy roles grant nothing', async t => {
  let queries = 0;
  t.mock.method(prisma.accountingUserRole, 'findUnique', async () => { queries += 1; return null; });
  const admin = await getAccountingAccess({ id: 'admin', role: 'admin' });
  assert.equal(admin.allowed, true);
  assert.equal(admin.isAdmin, true);
  assert.deepEqual(admin.permissions, ALL_PERMISSIONS);
  assert.equal(queries, 0);
  for (const role of ['sales', 'director', 'admin_mgr', 'accounting', 'factory', 'procurement']) {
    const access = await getAccountingAccess({ id: 'unassigned', role });
    assert.equal(access.allowed, false);
    assert.equal(access.isAdmin, false);
    assert.equal(hasAccountingPermission(access, 'ar', 'view'), false);
  }
});

test('Accounting permissions are read live, scoped to modules/actions, and revocable', async t => {
  let assignment = { role: { id: 'role-ar', name: 'AR Viewer', permissions: ['ar.view'] } };
  t.mock.method(prisma.accountingUserRole, 'findUnique', async args => {
    assert.equal(args.where.userId, 'sales-user');
    return assignment;
  });
  const user = { id: 'sales-user', role: 'sales' };
  const access = await getAccountingAccess(user);
  assert.equal(access.allowed, true);
  assert.equal(hasAccountingPermission(access, 'ar', 'view'), true);
  assert.equal(hasAccountingPermission(access, 'ar', 'create'), false);
  assert.equal(hasAccountingPermission(access, 'ap', 'view'), false);
  assignment.role.permissions = ['ar.view', 'ar.create', 'unknown.view'];
  const changed = await getAccountingAccess(user);
  assert.equal(hasAccountingPermission(changed, 'ar', 'create'), true);
  assert.equal(changed.permissions.includes('unknown.view'), false);
  assert.equal(user.role, 'sales');
  assignment = null;
  assert.equal((await getAccountingAccess(user)).allowed, false);
  assert.equal(hasAccountingPermission(null, 'ar', 'view'), false);
});
