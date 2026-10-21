const { parseCsv } = require('./csv');

const clean = value => String(value ?? '').trim();
const HEADER = { 1: 'รหัสผู้ขาย', 3: 'ชื่อผู้ขาย', 9: 'ที่อยู่', 12: 'ชื่อผู้ติดต่อ', 15: 'โทรศัพท์', 16: 'แฟ็กซ์', 19: 'วงเงินเครดิต' };
const DEFAULTS = { branch: 'สำนักงานใหญ่', vatConfig: 'VAT7%', paymentTerm: 30, supplierType: 'domestic', active: true };

function creditAmount(value, row) {
  if (!value) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(`แถว ${row}: วงเงินเครดิตไม่ถูกต้อง: ${value}`);
  }
  const [integer, fraction = ''] = value.replace(/,/g, '').split('.');
  if (integer.replace(/^0+/, '').length > 12) throw new Error(`แถว ${row}: วงเงินเครดิตเกิน DECIMAL(14,2)`);
  return `${integer}.${fraction.padEnd(2, '0')}`;
}

function buildImportPlan(rows) {
  if (rows[0]?.length !== 20 || clean(rows[0][0]) !== 'รหัสกลุ่มผู้ขาย' || clean(rows[0][5]) !== 'ชื่อกลุ่มผู้ขาย'
    || rows[1]?.length !== 20 || Object.entries(HEADER).some(([i, name]) => clean(rows[1][i]) !== name)) {
    throw new Error('หัวคอลัมน์ CSV ไม่ตรงรูปแบบรายงาน Supplier 20 คอลัมน์');
  }
  const suppliers = [];
  const groups = [];
  const ignoredRows = [{ row: 1, reason: 'หัวรายงาน' }, { row: 2, reason: 'หัวคอลัมน์' }];
  const codes = new Set();
  const names = new Map();
  let group = null;
  rows.slice(2).forEach((raw, index) => {
    const row = index + 3;
    if (raw.every(value => !clean(value))) {
      ignoredRows.push({ row, reason: 'แถวว่าง' });
      return;
    }
    if (raw.length !== 20) throw new Error(`แถว ${row}: ต้องมี 20 คอลัมน์ พบ ${raw.length}`);
    const values = raw.map(clean);
    if (['รวม', 'รวมทั้งสิ้น'].includes(values[0])) {
      if (values[1]) throw new Error(`แถว ${row}: แถวสรุปมีรหัสผู้ขาย`);
      ignoredRows.push({ row, reason: 'ยอดรวม' });
      group = null;
      return;
    }
    if (values[0] && !values[1]) {
      if (values.some((v, i) => v && i !== 0 && i !== 5)) throw new Error(`แถว ${row}: รูปแบบหัวกลุ่มไม่ถูกต้อง`);
      group = { code: values[0], name: values[5] || null, count: 0 };
      groups.push(group);
      ignoredRows.push({ row, reason: 'หัวกลุ่ม' });
      return;
    }
    if (!group || !values[1] || !values[3]) throw new Error(`แถว ${row}: ต้องมีรหัส ชื่อผู้ขาย และหัวกลุ่มก่อนหน้า`);
    if (values.some((v, i) => v && !Object.hasOwn(HEADER, i))) throw new Error(`แถว ${row}: พบข้อมูลนอกคอลัมน์ที่รองรับ`);
    const code = values[1];
    if (codes.has(code)) throw new Error(`แถว ${row}: รหัสผู้ขายซ้ำ ${code}`);
    codes.add(code);
    const supplier = {
      code, name: values[3], address: values[9] || null,
      contactPerson: values[12] || null, tel: values[15] || null, fax: values[16] || null,
      groupCode: group.code, groupName: group.name,
      creditLimit: creditAmount(values[19], row), ...DEFAULTS,
    };
    suppliers.push(supplier);
    group.count++;
    const nameCodes = names.get(supplier.name) || [];
    nameCodes.push(code);
    names.set(supplier.name, nameCodes);
  });
  if (!suppliers.length) throw new Error('ไม่พบผู้ขายใน CSV');
  const creditCents = suppliers.reduce((sum, supplier) => sum + BigInt((supplier.creditLimit || '0.00').replace('.', '')), 0n);
  const duplicateNames = [...names].filter(([, list]) => list.length > 1).map(([name, list]) => ({ name, codes: list }));
  return {
    summary: {
      sourceRows: rows.length, suppliers: suppliers.length, ignoredRows: ignoredRows.length,
      withAddress: suppliers.filter(s => s.address).length,
      withContactPerson: suppliers.filter(s => s.contactPerson).length,
      withTel: suppliers.filter(s => s.tel).length, withFax: suppliers.filter(s => s.fax).length,
      withCreditLimit: suppliers.filter(s => s.creditLimit !== null).length,
      totalCreditLimit: `${creditCents / 100n}.${String(creditCents % 100n).padStart(2, '0')}`,
      duplicateNames: duplicateNames.length,
    },
    defaults: DEFAULTS,
    warnings: [
      'CSV ไม่มีสาขา VAT วันเครดิต และประเภทผู้ขาย จึงใช้ค่าเริ่มต้นของระบบ ต้องตรวจสอบก่อนนำเข้าจริง',
      'เก็บรหัสกลุ่ม None เป็นข้อความตามต้นฉบับ ชื่อกลุ่มว่างเป็น null; ไม่รวมผู้ขายชื่อซ้ำ',
    ],
    groups, duplicateNames, ignoredRows, suppliers,
  };
}

function partitionSuppliers(plan, existingCodes) {
  const codes = new Set(existingCodes);
  const toCreate = [];
  const skipped = [];
  for (const supplier of plan.suppliers) {
    if (codes.has(supplier.code)) skipped.push({ code: supplier.code, reason: 'มีรหัสในระบบแล้ว ไม่เขียนทับ (รวมรายการ inactive)' });
    else {
      codes.add(supplier.code);
      toCreate.push(supplier);
    }
  }
  return { toCreate, skipped };
}

async function applyImportPlan(tx, plan, { performedById = null, source = 'Supplier.csv' } = {}) {
  const existing = await tx.supplier.findMany({ select: { code: true } });
  const { toCreate, skipped } = partitionSuppliers(plan, existing.map(s => s.code));
  const { recordAuditLog } = require('./auditTrail');
  const created = [];
  for (const data of toCreate) {
    const saved = await tx.supplier.create({ data, select: { id: true, code: true } });
    await recordAuditLog({
      entityType: 'supplier', entityId: saved.id, action: 'import',
      newValue: data, performedById, reason: `Import from ${source}`,
    }, tx);
    created.push(saved);
  }
  return { created, skipped };
}

module.exports = { parseCsv, buildImportPlan, partitionSuppliers, applyImportPlan };
