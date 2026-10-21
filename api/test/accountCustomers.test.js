const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCustomer, validateSale, invoiceCustomerDefaults } = require('../src/lib/accountCustomers');

test('Import support SQL is additive, re-runnable and Accounting-only', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sql', 'account-customer-import-support.sql'), 'utf8')
    .replace(/--[^\r\n]*/g, '');
  const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);
  const newTables = new Set(['account_customer_secondary_sales']);
  const existingTables = new Set(['account_customers', 'account_customer_branches']);
  const referencedTables = new Set([...newTables, ...existingTables, 'account_sales']);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  for (const statement of statements.slice(1, -1)) {
    assert.doesNotMatch(statement, /\b(?:DROP|TRUNCATE|RENAME|UPDATE|DELETE|INSERT)\b(?!\s+CASCADE|\s+RESTRICT)/i);
    const create = statement.match(/^CREATE TABLE IF NOT EXISTS "([^"]+)"/i);
    const index = statement.match(/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "[^"]+"\s+ON "([^"]+)"/i);
    const alter = statement.match(/^ALTER TABLE "([^"]+)"\s+ADD COLUMN IF NOT EXISTS "[^"]+" TEXT$/i);
    assert.ok(create || index || alter, `Unreviewed SQL statement: ${statement}`);
    if (create) assert.ok(newTables.has(create[1]), create[1]);
    if (index) assert.ok(newTables.has(index[1]), index[1]);
    if (alter) assert.ok(existingTables.has(alter[1]), alter[1]);
    for (const match of statement.matchAll(/\b(?:FROM|REFERENCES|JOIN)\s+"([^"]+)"/gi)) {
      assert.ok(referencedTables.has(match[1]), `SQL touches unrelated table: ${match[1]}`);
    }
  }
});

const customer = {
  code: ' C001 ', name: ' Customer ', creditTerm: 0, vatConfig: 'NO_VAT',
  branches: [
    { code: '00000', name: 'Head office', addresses: [
      { label: 'Billing', kind: 'billing', address: 'Address A' },
      { label: 'Shipping', kind: 'shipping', address: 'Address B' },
    ] },
    { code: '00001', name: 'Branch', addresses: [{ label: 'Office', kind: 'both', address: 'Address C' }] },
  ],
};

test('Customer validation preserves zero credit, multiple branches and address types', () => {
  const data = validateCustomer(customer);
  assert.equal(data.code, 'C001');
  assert.equal(data.name, 'Customer');
  assert.equal(data.creditTerm, 0);
  assert.equal(data.branches.length, 2);
  assert.equal(data.branches[0].addresses[1].kind, 'shipping');
  assert.throws(() => validateCustomer({ ...customer, name: ' ' }), /ชื่อ/);
  assert.throws(() => validateCustomer({ ...customer, creditTerm: -1 }), /Credit Term/);
  assert.throws(() => validateCustomer({ ...customer, creditTerm: 'abc' }), /Credit Term/);
  assert.throws(() => validateCustomer({ ...customer, creditTerm: null }), /Credit Term/);
  assert.throws(() => validateCustomer({ ...customer, creditTerm: ' ' }), /Credit Term/);
  assert.throws(() => validateCustomer({ ...customer, creditTerm: 1.5 }), /Credit Term/);
  assert.throws(() => validateCustomer({ ...customer, vatConfig: 'unknown' }), /VAT/);
  assert.throws(() => validateCustomer({ ...customer, active: 'false' }), /สถานะ/);
  assert.throws(() => validateCustomer({ ...customer, branches: [customer.branches[0], customer.branches[0]] }), /สาขาซ้ำ/);
  assert.throws(() => validateCustomer({ ...customer, branches: [] }), /สาขา/);
  const noAddress = validateCustomer({ ...customer, branches: [{ code: 'H', name: 'Office', addresses: [] }] });
  assert.deepEqual(noAddress.branches[0].addresses, []);
  assert.equal(noAddress.address, null);
  assert.equal(noAddress.billingAddress, null);
  assert.throws(() => validateCustomer({ ...customer, branches: [{ code: 'H', name: 'Office' }] }), /ที่อยู่/);
});

test('Accounting Sale has its own code, contact and active status', () => {
  assert.deepEqual(validateSale({ code: ' S01 ', name: ' Sale ', active: false }), {
    code: 'S01', name: 'Sale', tel: null, email: null, active: false,
  });
  assert.throws(() => validateSale({ code: '', name: 'Sale' }), /รหัส/);
});

const savedCustomer = {
  id: 'c1', taxId: '123', active: true, creditTerm: 0, vatConfig: 'NO_VAT',
  responsibleSaleId: 's1', responsibleSale: { id: 's1', name: 'Accounting Sale', active: true },
  branches: customer.branches.map((branch, index) => ({
    ...branch, id: `b${index}`, addresses: branch.addresses.map((address, i) => ({ ...address, id: `a${index}-${i}` })),
  })),
};

test('Invoice derives selected branch, addresses, accounting Sale, VAT and zero credit term', () => {
  const defaults = invoiceCustomerDefaults(savedCustomer, {
    customerBranchId: 'b0', billingAddressId: 'a0-0', shippingAddressId: 'a0-1',
  });
  assert.equal(defaults.customerBranch, 'Head office');
  assert.equal(defaults.address, 'Address A');
  assert.equal(defaults.shippingAddress, 'Address B');
  assert.equal(defaults.responsibleSaleId, 's1');
  assert.equal(defaults.responsibleSaleName, 'Accounting Sale');
  assert.equal(defaults.creditTerm, 0);
  assert.equal(defaults.vatConfig, 'NO_VAT');
  assert.equal(invoiceCustomerDefaults(savedCustomer, { customerBranch: 'Branch' }).address, 'Address C');
  assert.equal(invoiceCustomerDefaults(savedCustomer, { address: 'Legacy override' }).address, 'Legacy override');
  assert.throws(() => invoiceCustomerDefaults(savedCustomer, { customerBranch: 'Unknown branch' }), /สาขา/);
  assert.equal(invoiceCustomerDefaults(savedCustomer, { creditTerm: 14, vatConfig: 'VAT7%' }).creditTerm, 14);
  assert.throws(() => invoiceCustomerDefaults(savedCustomer, { customerBranchId: 'other-customer' }), /สาขา/);
  assert.throws(() => invoiceCustomerDefaults(savedCustomer, { shippingAddressId: 'a1-0' }), /ที่อยู่/);
  assert.throws(() => invoiceCustomerDefaults(savedCustomer, { billingAddressId: 'a0-1' }), /ที่อยู่/);
  assert.throws(() => invoiceCustomerDefaults(savedCustomer, { creditTerm: null }), /Credit Term/);
  assert.throws(() => invoiceCustomerDefaults({ ...savedCustomer, active: false }, {}), /ปิดใช้งาน/);
});

test('Legacy customers can still supply scalar addresses without losing data', () => {
  const defaults = invoiceCustomerDefaults({
    id: 'legacy', active: true, branch: 'Legacy branch', address: 'Old address',
    billingAddress: 'Old billing', shippingAddress: 'Old shipping', creditTerm: 45, vatConfig: 'VAT7%',
    branches: [], responsibleSale: null,
  }, {});
  assert.equal(defaults.customerBranch, 'Legacy branch');
  assert.equal(defaults.address, 'Old billing');
  assert.equal(defaults.shippingAddress, 'Old shipping');
  assert.equal(defaults.creditTerm, 45);
});

test('Customer validation supports fax, branch contacts, multiple emails and secondary Sales', () => {
  const data = validateCustomer({
    ...customer, fax: ' 02-1 ', email: 'a@x.co; b@y.co', responsibleSaleId: 's1', secondarySaleIds: ['s2', 's3'],
    branches: [{ ...customer.branches[0], tel: '1', fax: '2', contactPerson: 'K', email: 'c@z.co' }],
  });
  assert.equal(data.fax, '02-1');
  assert.equal(data.email, 'a@x.co, b@y.co');
  assert.deepEqual(data.secondarySaleIds, ['s2', 's3']);
  assert.deepEqual([data.branches[0].tel, data.branches[0].fax, data.branches[0].contactPerson], ['1', '2', 'K']);
  assert.throws(() => validateCustomer({ ...customer, email: 'a@x.co, nope' }), /อีเมล/);
  assert.throws(() => validateCustomer({ ...customer, responsibleSaleId: 's1', secondarySaleIds: ['s1'] }), /Sale รอง/);
  assert.throws(() => validateCustomer({ ...customer, secondarySaleIds: ['s2', 's2'] }), /Sale รองซ้ำ/);
  assert.throws(() => validateCustomer({ ...customer, secondarySaleIds: 's2' }), /Sale รอง/);
});
