const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, buildImportPlan, partitionSuppliers, applyImportPlan } = require('../src/lib/supplierImport');
const { options, main } = require('../scripts/import-suppliers');

function row(fields) {
  const values = Array(20).fill('');
  for (const [index, value] of Object.entries(fields)) values[index] = value;
  return values;
}
function fixture() {
  return [
    row({ 0: 'รหัสกลุ่มผู้ขาย', 5: 'ชื่อกลุ่มผู้ขาย' }),
    row({ 1: 'รหัสผู้ขาย', 3: 'ชื่อผู้ขาย', 9: 'ที่อยู่', 12: 'ชื่อผู้ติดต่อ', 15: 'โทรศัพท์', 16: 'แฟ็กซ์', 19: 'วงเงินเครดิต' }),
    row({ 0: ' None' }),
    row({ 1: '00001', 3: ' Same Company ', 9: '1 Road,\nBangkok', 12: 'Contact', 15: '02-001, 081-001', 16: '02-002', 19: '200,000.00' }),
    row({ 1: 'B-002', 3: 'Same Company', 19: '30.00' }),
    row({ 0: 'รวม', 3: '2' }),
    row({ 0: '002', 5: 'เจ้าหนี้อื่นๆ' }),
    row({ 1: 'C-001', 3: 'Other' }),
    row({ 0: 'รวม', 3: '1' }),
    row({ 0: '003', 5: 'เจ้าหนี้การค้าในประเทศ' }),
    row({ 1: 'D-001', 3: 'Domestic' }),
    row({ 0: 'รวมทั้งสิ้น', 3: '3' }),
  ];
}

test('Supplier report maps group headers to following suppliers without merging names', () => {
  const plan = buildImportPlan(fixture());
  assert.deepEqual(plan.groups, [
    { code: 'None', name: null, count: 2 },
    { code: '002', name: 'เจ้าหนี้อื่นๆ', count: 1 },
    { code: '003', name: 'เจ้าหนี้การค้าในประเทศ', count: 1 },
  ]);
  assert.deepEqual(plan.summary, {
    sourceRows: 12, suppliers: 4, ignoredRows: 8, withAddress: 1,
    withContactPerson: 1, withTel: 1, withFax: 1, withCreditLimit: 2,
    totalCreditLimit: '200030.00', duplicateNames: 1,
  });
  assert.deepEqual(plan.duplicateNames, [{ name: 'Same Company', codes: ['00001', 'B-002'] }]);
  assert.deepEqual(plan.suppliers[0], {
    code: '00001', name: 'Same Company', address: '1 Road,\nBangkok', contactPerson: 'Contact',
    tel: '02-001, 081-001', fax: '02-002', groupCode: 'None', groupName: null,
    creditLimit: '200000.00', branch: 'สำนักงานใหญ่', vatConfig: 'VAT7%', paymentTerm: 30,
    supplierType: 'domestic', active: true,
  });
  assert.equal(plan.suppliers[1].creditLimit, '30.00');
  assert.equal(plan.suppliers[2].creditLimit, null);
  assert.equal(plan.suppliers[2].address, null);
  assert.ok(plan.warnings.length);
});

test('Supplier CSV supports UTF-8 BOM, quoted commas, quotes and multiline addresses', () => {
  const csv = '\uFEFF' + fixture().map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const plan = buildImportPlan(parseCsv(csv));
  assert.equal(plan.suppliers.length, 4);
  assert.equal(plan.suppliers[0].address, '1 Road,\nBangkok');
  assert.throws(() => parseCsv('"unfinished'), /คำพูด/);
});

test('Supplier plan fails explicitly on malformed layouts, missing names, duplicates and missing groups', () => {
  for (const mutate of [
    rows => { rows[0][5] = 'wrong'; },
    rows => { rows[1][19] = 'wrong'; },
    rows => { rows[3].pop(); },
    rows => { rows[3][3] = ''; },
    rows => { rows[4][1] = '00001'; },
    rows => { rows.splice(2, 1); },
    rows => { rows[3][8] = 'unmapped data'; },
    rows => { rows[2][9] = 'unexpected group data'; },
    rows => { rows[5][1] = 'unexpected subtotal code'; },
    rows => { rows.splice(6, 1); },
  ]) {
    const rows = fixture();
    mutate(rows);
    assert.throws(() => buildImportPlan(rows));
  }
  assert.throws(() => buildImportPlan(fixture().slice(0, 3)), /ไม่พบผู้ขาย/);
});

test('Credit limits are exact decimals, not payment terms; invalid and overflowing amounts fail', () => {
  for (const value of ['-1', 'abc', '1,23.00', '1.234', '1000000000000.00', '1e3']) {
    const rows = fixture();
    rows[3][19] = value;
    assert.throws(() => buildImportPlan(rows), /วงเงินเครดิต/);
  }
  const rows = fixture();
  rows[3][19] = '0';
  rows[4][19] = '0.1';
  const plan = buildImportPlan(rows);
  assert.equal(plan.summary.totalCreditLimit, '0.10');
  assert.equal(plan.suppliers[0].creditLimit, '0.00');
  assert.equal(plan.suppliers[0].paymentTerm, 30);
  rows[3][19] = '999,999,999,999.99';
  assert.equal(buildImportPlan(rows).suppliers[0].creditLimit, '999999999999.99');
});

function fakeTx() {
  const state = { suppliers: [{ id: 'old', code: '00001', name: 'Existing', active: false }], audits: [] };
  return {
    state,
    supplier: {
      findMany: async () => state.suppliers.map(s => ({ code: s.code })),
      create: async ({ data }) => {
        const saved = { ...data, id: `s${state.suppliers.length}` };
        state.suppliers.push(saved);
        return { id: saved.id, code: saved.code };
      },
      update: async () => { throw new Error('Must not update'); },
      delete: async () => { throw new Error('Must not delete'); },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
}

test('Applying twice skips all existing codes including inactive suppliers and records transactional audits', async () => {
  const tx = fakeTx();
  const plan = buildImportPlan(fixture());
  const partition = partitionSuppliers(plan, ['00001']);
  assert.equal(partition.toCreate.length, 3);
  const result = await applyImportPlan(tx, plan, { source: 'test.csv', performedById: 'operator' });
  assert.deepEqual(result.created.map(s => s.code), ['B-002', 'C-001', 'D-001']);
  assert.deepEqual(result.skipped.map(s => s.code), ['00001']);
  assert.deepEqual(tx.state.suppliers[0], { id: 'old', code: '00001', name: 'Existing', active: false });
  assert.equal(tx.state.suppliers[1].creditLimit, '30.00');
  assert.equal(tx.state.suppliers[2].groupCode, '002');
  assert.equal(tx.state.audits.length, 3);
  assert.ok(tx.state.audits.every(a => a.entityType === 'supplier' && a.action === 'import' && a.performedById === 'operator'));
  const again = await applyImportPlan(tx, plan);
  assert.equal(again.created.length, 0);
  assert.equal(again.skipped.length, 4);
  assert.equal(tx.state.audits.length, 3);
});

test('Database and audit errors propagate instead of returning success', async () => {
  const tx = fakeTx();
  tx.auditLog.create = async () => { throw new Error('audit unavailable'); };
  await assert.rejects(applyImportPlan(tx, buildImportPlan(fixture())), /audit unavailable/);
  tx.supplier.create = async () => { throw new Error('insert unavailable'); };
  await assert.rejects(applyImportPlan(tx, buildImportPlan(fixture())), /insert unavailable/);
});

test('CLI defaults to offline dry-run and requires explicit confirmation to apply', () => {
  assert.equal(options([]).apply, undefined);
  assert.equal(options(['--apply', '--confirm=IMPORT_SUPPLIERS']).apply, true);
  for (const args of [
    ['--apply'], ['--apply=false'], ['--check-db=false'], ['--confirm=IMPORT_SUPPLIERS'],
    ['--apply', '--confirm=IMPORT_SUPPLIERS', '--check-db'], ['--unknown'],
    ['--file=x', '--file=y'], ['--file=x', '--report=x'],
  ]) assert.throws(() => options(args));
});

test('CLI offline dry-run does not load Prisma or dotenv', async () => {
  const Module = require('module');
  const original = Module._load;
  Module._load = function (name, ...args) {
    if (name === 'dotenv' || name.includes('prisma') || name.includes('auditTrail')) throw new Error(`Unexpected DB dependency: ${name}`);
    return original.call(this, name, ...args);
  };
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supplier-import-'));
  const file = path.join(dir, 'input.csv');
  const reportFile = path.join(dir, 'preview.json');
  try {
    fs.writeFileSync(file, fixture().map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'));
    const result = await main([`--file=${file}`, `--report=${reportFile}`]);
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.plan.summary.suppliers, 4);
    assert.equal(result.result, undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(reportFile, 'utf8')), result);
    await assert.rejects(main([`--file=${file}`, `--report=${reportFile}`]), /EEXIST/);
  } finally {
    Module._load = original;
    fs.unlinkSync(file);
    if (fs.existsSync(reportFile)) fs.unlinkSync(reportFile);
    fs.rmdirSync(dir);
  }
});
