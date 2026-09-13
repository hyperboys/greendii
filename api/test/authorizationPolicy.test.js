const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isDocOwner,
  assertActionAuthorized,
} = require('../src/lib/authorizationPolicy');

test('Authorization Policy - Ownership Check', () => {
  const user = { id: 'usr_1', role: 'sales' };
  const ownDoc = { id: 'doc_1', salesId: 'usr_1' };
  const otherDoc = { id: 'doc_2', salesId: 'usr_2' };

  assert.equal(isDocOwner(user, ownDoc), true);
  assert.equal(isDocOwner(user, otherDoc), false);
});

test('Authorization Policy - Action Permission Check', async () => {
  const adminUser = { id: 'usr_admin', role: 'admin' };
  const salesUser = { id: 'usr_sales', role: 'sales' };
  const ownDoc = { id: 'doc_1', salesId: 'usr_sales', status: 'draft' };
  const otherDoc = { id: 'doc_2', salesId: 'usr_other', status: 'approved' };

  // Admin can do actions
  assert.equal(await assertActionAuthorized(adminUser, 'view', otherDoc), true);

  // Sales user can view own doc
  assert.equal(await assertActionAuthorized(salesUser, 'view', ownDoc), true);

  // Sales user cannot view other's doc
  await assert.rejects(
    async () => assertActionAuthorized(salesUser, 'view', otherDoc),
    /ไม่มีสิทธิ์เข้าถึงเอกสารนี้/,
  );

  // Sales user cannot edit approved doc
  await assert.rejects(
    async () => assertActionAuthorized(salesUser, 'edit', otherDoc),
    /ไม่มีสิทธิ์แก้ไขเอกสารนี้ในสถานะปัจจุบัน/,
  );
});
