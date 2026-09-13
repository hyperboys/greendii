const test = require('node:test');
const assert = require('node:assert/strict');
const {
  maskSensitiveData,
  computeChangedFields,
} = require('../src/lib/auditTrail');

test('Audit Trail - Secret & Password Masking', () => {
  const inputData = {
    username: 'sales_user',
    password: 'super_secret_password_123',
    passwordHash: '$2a$10$xyz...',
    profile: {
      fullName: 'Sales Representative',
      api_key: 'sk_live_99999',
    },
    items: [{ id: 1, price: 500 }],
  };

  const sanitized = maskSensitiveData(inputData);

  assert.equal(sanitized.username, 'sales_user');
  assert.equal(sanitized.password, '***MASKED***');
  assert.equal(sanitized.passwordHash, '***MASKED***');
  assert.equal(sanitized.profile.fullName, 'Sales Representative');
  assert.equal(sanitized.profile.api_key, '***MASKED***');
  assert.equal(sanitized.items[0].price, 500);
});

test('Audit Trail - Diff Computation', () => {
  const oldValue = { status: 'draft', total: 100, remark: 'initial' };
  const newValue = { status: 'pending', total: 100, remark: 'updated' };

  const changed = computeChangedFields(oldValue, newValue);
  assert.deepEqual(changed.sort(), ['remark', 'status']);
});
