const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, buildImportPlan, applyImportPlan } = require('../src/lib/accountCustomerImport');

const HEADER = 'รหัสลูกค้า,ชื่อลูกค้า,ที่อยู่,เลขทะเบียนผู้เสียภาษี,ชื่อผู้ติดต่อ,อีเมล,โทรศัพท์,แฟ็กซ์,sales,เครดิต,';
const csv = [
  `\uFEFF${HEADER}`,
  'A001,บริษัท เอ จำกัด (สำนักงานใหญ่),"1 ถนน A,\nกรุงเทพ",0105500000001,คุณเอ,"a@x.co,b@y.co",02-1,02-2,"\n*Sale One",45,',
  ',,,,,,,,Sale Two,,',
  ',,,,,,,,Sale Thre,,',
  'A002,บริษัท เอ จำกัด,2 ถนน B,0105500000001,,,03-1,03-2,Sale Two,60,',
  'B001,"Bee Co.,Ltd. (Branch 3)",3 Road,,,,,,,,',
  'C001,บริษัท ซี จำกัด,,0105500000002,,,,,Sale One,30,',
  'D001,บริษัท ดี จำกัด,4 ถนน D,0105500000009,,,,,Sale One,,',
  'D002,บริษัท อื่น จำกัด,5 ถนน E,0105500000009,,,,,Sale Two,,',
  'D003,บริษัท  ดี จำกัด,7 ถนน F,0105500000009,,,,,,,',
  'P001,นาย พี,6 ซอย P,3100000000001,,bad-email,,,,,',
  ',,,,,,,,,,',
  ',5 รายการ,,,,,,,,,',
].join('\r\n');

test('CSV parser handles BOM, quoted commas and multiline fields', () => {
  const rows = parseCsv(csv);
  assert.equal(rows[0][0], 'รหัสลูกค้า');
  assert.equal(rows[1][2], '1 ถนน A,\nกรุงเทพ');
  assert.equal(rows[1][8], '\n*Sale One');
  assert.ok(rows.every(row => row.length === 11));
});

test('Import plan merges Tax ID groups into branches and applies Sale rules and defaults', () => {
  const plan = buildImportPlan(parseCsv(csv), { separateTaxIds: ['0105500000009'] });
  const merged = plan.customers.find(c => c.code === 'A001');
  assert.deepEqual(merged.sourceCodes, ['A001', 'A002']);
  assert.equal(merged.name, 'บริษัท เอ จำกัด');
  assert.equal(merged.responsibleSale, 'Sale One');
  assert.deepEqual(merged.secondarySales, ['Sale Two', 'Sale Thre']);
  assert.equal(merged.creditTerm, 45);
  assert.equal(merged.email, 'a@x.co, b@y.co');
  assert.equal(merged.fax, '02-2');
  assert.deepEqual(merged.branches.map(b => [b.code, b.name, b.tel, b.fax]), [
    ['A001', 'สำนักงานใหญ่', '02-1', '02-2'], ['A002', 'สาขา (รหัสเดิม A002)', '03-1', '03-2'],
  ]);
  assert.equal(merged.branches[1].addresses[0].kind, 'both');

  const bee = plan.customers.find(c => c.code === 'B001');
  assert.equal(bee.name, 'Bee Co.,Ltd.');
  assert.equal(bee.branches[0].name, 'สาขา 3');
  assert.equal(bee.creditTerm, 30);
  assert.equal(bee.vatConfig, 'VAT7%');
  assert.equal(bee.responsibleSale, null);

  const person = plan.customers.find(c => c.code === 'P001');
  assert.equal(person.type, 'บุคคลธรรมดา');
  assert.equal(person.email, null);
  assert.ok(plan.warnings.some(w => w.code === 'P001' && /อีเมล/.test(w.message)));

  assert.deepEqual(plan.skipped, []);
  const noAddress = plan.customers.find(c => c.code === 'C001');
  assert.deepEqual(noAddress.branches.map(b => [b.code, b.name, b.addresses]), [['C001', 'สำนักงานใหญ่', []]]);
  assert.ok(plan.warnings.some(w => w.code === 'C001' && /ไม่มีที่อยู่/.test(w.message)));
  const separated = plan.customers.filter(c => c.taxId === '0105500000009');
  assert.deepEqual(separated.map(c => [c.code, c.name, c.responsibleSale, c.branches.map(b => b.code)]), [
    ['D001', 'บริษัท ดี จำกัด', 'Sale One', ['D001', 'D003']], ['D002', 'บริษัท อื่น จำกัด', 'Sale Two', ['D002']],
  ]);
  assert.equal(plan.ignoredRows.length, 1);
  assert.deepEqual(plan.sales, ['Sale One', 'Sale Thre', 'Sale Two']);
});

test('Import plan rejects unexpected CSV layouts', () => {
  assert.throws(() => buildImportPlan(parseCsv('code,name\nA,B')), /หัวคอลัมน์/);
});

function fakeTx({ customers = [], sales = [] } = {}) {
  const state = { customers: structuredClone(customers), sales: structuredClone(sales), audits: [] };
  let id = 0;
  return {
    state,
    accountCustomer: {
      findMany: async () => structuredClone(state.customers),
      create: async ({ data }) => { const saved = { ...data, id: `c${id++}` }; state.customers.push(saved); return { id: saved.id, code: saved.code }; },
      update: async () => { throw new Error('Import must not update customers'); },
      delete: async () => { throw new Error('Import must not delete customers'); },
    },
    accountSale: {
      findMany: async () => structuredClone(state.sales),
      create: async ({ data }) => { const saved = { ...data, id: `s${id++}` }; state.sales.push(saved); return saved; },
      update: async () => { throw new Error('Import must not update sales'); },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
}

test('Applying an import only inserts and never overwrites existing Accounting data', async () => {
  const plan = buildImportPlan(parseCsv(csv), { separateTaxIds: ['0105500000009'] });
  const tx = fakeTx({
    customers: [{ code: 'X1', taxId: null, branches: [{ code: 'B001' }] }, { code: 'P9', taxId: '3100000000001', branches: [] }],
    sales: [{ id: 'existing', code: 'SALE-001', name: 'Sale One', active: true }],
  });
  const result = await applyImportPlan(tx, plan);
  assert.deepEqual(result.created.map(c => c.code), ['A001', 'C001', 'D001', 'D002']);
  assert.deepEqual(result.skipped.map(s => s.codes[0]).sort(), ['B001', 'P001']);
  assert.deepEqual(result.createdSales.map(s => [s.code, s.name]), [['SALE-002', 'Sale Two'], ['SALE-003', 'Sale Thre']]);
  assert.deepEqual(tx.state.customers.find(c => c.code === 'C001').branches.create[0].addresses.create, []);
  const created = tx.state.customers.find(c => c.code === 'A001');
  assert.equal(created.responsibleSaleId, 'existing');
  assert.equal(created.fax, '02-2');
  assert.equal(created.branches.create.length, 2);
  assert.equal(created.branches.create[1].tel, '03-1');
  assert.deepEqual(created.secondarySales.create.map(s => s.position), [0, 1]);
  assert.equal(tx.state.customers.length, 6);
  assert.ok(tx.state.audits.every(a => a.action === 'import'));
});
