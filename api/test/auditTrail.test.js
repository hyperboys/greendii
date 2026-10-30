const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const {
  maskSensitiveData,
  computeChangedFields,
  recordAuditLog,
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

test('Audit Trail - Preserve Decimal precision and dates while masking nested snapshots', () => {
  const date = new Date('2026-10-29T03:30:00.000Z');
  const amount = new Prisma.Decimal('12345678901234567890.12');
  const input = {
    docDate: date,
    deliveryDate: null,
    netAmount: amount,
    items: [{ qty: new Prisma.Decimal('1'), unitPrice: new Prisma.Decimal('1550.50') }],
    customer: { name: 'Customer', apiKey: 'secret' },
    password: 'secret',
    values: [date, amount, null],
  };

  const sanitized = maskSensitiveData(input);
  assert.deepEqual(sanitized, {
    docDate: '2026-10-29T03:30:00.000Z',
    deliveryDate: null,
    netAmount: '12345678901234567890.12',
    items: [{ qty: '1', unitPrice: '1550.5' }],
    customer: { name: 'Customer', apiKey: '***MASKED***' },
    password: '***MASKED***',
    values: ['2026-10-29T03:30:00.000Z', '12345678901234567890.12', null],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sanitized)), sanitized);
  assert.equal(input.docDate, date);
  assert.equal(input.netAmount, amount);
  assert.equal(input.customer.apiKey, 'secret');
});

for (const entityType of ['provisional_delivery_order', 'invoice']) {
  test(`Audit Trail - ${entityType} create/update snapshots use transaction client and JSON values`, async () => {
    const snapshot = {
      id: 'document',
      status: 'draft',
      docDate: new Date('2026-10-29T00:00:00.000Z'),
      netAmount: new Prisma.Decimal('2193.50'),
      items: [{ qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal('2050') }],
      customer: { apiKey: 'secret' },
    };
    const writes = [];
    const client = {
      auditLog: { create: async ({ data }) => {
        assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
        writes.push(data);
        return data;
      } },
    };
    const payload = { entityType, entityId: snapshot.id, docNo: 'DOC001', newValue: snapshot };
    const created = await recordAuditLog({ ...payload, action: 'create' }, client);
    const expected = JSON.parse(JSON.stringify(snapshot));
    expected.customer.apiKey = '***MASKED***';
    assert.deepEqual(created.newValue, expected);
    assert.equal(created.oldValue, null);
    assert.equal(created.changedFields, null);

    const updated = await recordAuditLog({
      ...payload,
      action: 'update',
      oldValue: snapshot,
      newValue: { ...snapshot, docDate: new Date('2026-10-30T00:00:00.000Z'), netAmount: new Prisma.Decimal('2194.50') },
    }, client);
    assert.deepEqual(updated.oldValue, expected);
    assert.deepEqual(updated.changedFields.sort(), ['docDate', 'netAmount']);
    assert.equal(updated.newValue.docDate, '2026-10-30T00:00:00.000Z');
    assert.equal(updated.newValue.netAmount, '2194.5');
    assert.equal(writes.length, 2);
  });
}

test('Audit Trail - Audit write failures propagate to the caller', async () => {
  const error = new Error('Audit unavailable');
  await assert.rejects(recordAuditLog({
    entityType: 'invoice', entityId: 'document', action: 'create',
    newValue: { netAmount: new Prisma.Decimal('100.50') },
  }, { auditLog: { create: async () => { throw error; } } }), error);
});
