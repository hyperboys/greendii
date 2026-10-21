const { validateCustomer } = require('./accountCustomers');
const { recordAuditLog } = require('./auditTrail');

const EXPECTED_HEADER = ['รหัสลูกค้า', 'ชื่อลูกค้า', 'ที่อยู่', 'เลขทะเบียนผู้เสียภาษี', 'ชื่อผู้ติดต่อ', 'อีเมล', 'โทรศัพท์', 'แฟ็กซ์', 'sales', 'เครดิต'];
// Tax IDs shared by clearly different companies; held back until the source data is corrected.
const DEFAULT_SEPARATE_TAX_IDS = ['0735558004669', '0135555014871', '0105530066525'];
const DEFAULT_CREDIT_TERM = 30;
const DEFAULT_VAT = 'VAT7%';
const HEAD_OFFICE = /สำนักงานใหญ่|head\s*office/i;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function parseCsv(input) {
  const source = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV มีเครื่องหมายคำพูดไม่ครบ');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const saleName = value => clean(value).replace(/^\*\s*/, '');

function cleanCustomerName(name) {
  return clean(name
    .replace(/\(\s*(?:สำนักงานใหญ่|head\s*office)\s*\)/gi, '')
    .replace(/\(\s*branch\s*\d+\s*\)/gi, '')
    .replace(/\s+สาขา(?:ที่)?\s*\d+\s*$/, '')
    .replace(/\s+สำนักงานใหญ่\s*$/, ''));
}

function branchNumber(...values) {
  for (const value of values) {
    const match = value.match(/\bbranch\s*[:#]?\s*(\d+)/i) || value.match(/สาขา(?:ที่)?\s*(\d+)/);
    if (match) return match[1];
  }
  return null;
}

function parseEmails(raw, warn) {
  if (!raw) return null;
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  const valid = parts.filter(part => EMAIL_PATTERN.test(part));
  if (valid.length !== parts.length) warn(`อีเมลไม่ถูกต้องถูกตัดออก: ${parts.filter(p => !valid.includes(p)).join(', ')}`);
  return valid.length ? valid.join(', ') : null;
}

function readRecords(rows, ignoredRows) {
  const [header, ...body] = rows;
  const normalizedHeader = (header || []).slice(0, EXPECTED_HEADER.length).map(clean);
  if (EXPECTED_HEADER.some((name, index) => normalizedHeader[index] !== name)) {
    throw new Error(`หัวคอลัมน์ CSV ไม่ตรงรูปแบบ ต้องเป็น: ${EXPECTED_HEADER.join(', ')}`);
  }
  const records = [];
  let current = null;
  body.forEach((row, index) => {
    const [code, name, address, taxId, contactPerson, email, tel, fax, sale, credit] = EXPECTED_HEADER.map((_, i) => clean(row[i]));
    const rowNumber = index + 2;
    if (code) {
      current = { rowNumber, code, name, address, rawTaxId: taxId, contactPerson, email, tel, fax, sale, credit, extraSales: [] };
      records.push(current);
    } else if (sale && !name && !address && !taxId && current) {
      current.extraSales.push(sale);
    } else if (row.some(value => clean(value))) {
      ignoredRows.push({ row: rowNumber, reason: 'ไม่มีรหัสลูกค้า (เช่นแถวสรุปท้ายไฟล์)', value: name || sale });
    }
  });
  return records;
}

function canonicalSales(records, warnings) {
  const names = new Set(records.flatMap(r => [r.sale, ...r.extraSales]).map(saleName).filter(Boolean));
  const aliases = new Map();
  for (const name of names) {
    const longer = [...names].filter(other => other !== name && other.startsWith(name));
    if (longer.length === 1) {
      aliases.set(name, longer[0]);
      warnings.push({ code: '-', message: `ชื่อ Sale "${name}" ถูกปรับเป็น "${longer[0]}" (สะกดไม่ครบ)` });
    }
  }
  return name => {
    const value = saleName(name);
    return value ? aliases.get(value) || value : null;
  };
}

function buildImportPlan(rows, { separateTaxIds = DEFAULT_SEPARATE_TAX_IDS } = {}) {
  const ignoredRows = [];
  const warnings = [];
  const skipped = [];
  const records = readRecords(rows, ignoredRows);
  const sale = canonicalSales(records, warnings);
  const separateTax = new Set(separateTaxIds);

  for (const record of records) {
    const warn = message => warnings.push({ code: record.code, message });
    const digits = record.rawTaxId.replace(/\D/g, '');
    record.taxId = digits && !/^0+$/.test(digits) ? digits : null;
    if (record.rawTaxId && !record.taxId) warn(`Tax ID "${record.rawTaxId}" ไม่ถูกต้อง จึงไม่บันทึก`);
    else if (record.taxId && record.taxId.length !== 13) warn(`Tax ID "${record.rawTaxId}" ไม่ครบ 13 หลัก บันทึกตามต้นฉบับ กรุณาตรวจสอบ`);
    record.type = record.taxId?.length === 13 && !record.taxId.startsWith('0') ? 'บุคคลธรรมดา' : 'นิติบุคคล';
    record.emailValue = parseEmails(record.email, warn);
    record.creditTerm = /^\d+$/.test(record.credit) ? Number(record.credit) : null;
    if (record.credit && record.creditTerm === null) warn(`เครดิต "${record.credit}" ไม่ถูกต้อง`);
    const listed = [record.sale, ...record.extraSales].map(sale).filter(Boolean);
    if (!sale(record.sale) && record.extraSales.length) warn('ไม่มี Sale หลักในแถวลูกค้า ใช้ Sale แถวถัดไปเป็น Sale หลัก');
    record.primarySale = listed[0] || null;
    record.secondarySales = [...new Set(listed.slice(1))].filter(name => name !== record.primarySale);
    record.headOffice = HEAD_OFFICE.test(record.name) || HEAD_OFFICE.test(record.address);
  }

  const groups = new Map();
  for (const record of records) {
    // Same Tax ID but different company names: each name becomes its own customer;
    // rows with the same name (ignoring case/spacing) still merge as branches.
    const separate = Boolean(record.taxId) && separateTax.has(record.taxId);
    if (separate) warnings.push({ code: record.code, message: `Tax ID ${record.taxId} ซ้ำกับลูกค้าชื่ออื่น แยกลูกค้าตามชื่อบริษัท` });
    const key = separate ? `tax:${record.taxId}:name:${cleanCustomerName(record.name).toLowerCase()}`
      : record.taxId?.length === 13 ? `tax:${record.taxId}` : `code:${record.code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const customers = [];
  for (const group of groups.values()) {
    for (const record of group) {
      if (!record.address) warnings.push({ code: record.code, message: 'ไม่มีที่อยู่ในไฟล์ นำเข้าโดยไม่มีที่อยู่ กรุณาเพิ่มที่อยู่ก่อนออกเอกสาร' });
    }
    const primary = group.find(r => r.headOffice) || group[0];
    const ordered = [primary, ...group.filter(r => r !== primary)];
    const warn = message => warnings.push({ code: primary.code, message });
    if (ordered.length > 1) warn(`รวมรหัส ${ordered.map(r => r.code).join(', ')} เป็นลูกค้าเดียวตาม Tax ID ${primary.taxId}`);
    if (ordered.filter(r => r.headOffice).length > 1) warn('มีแถวที่ระบุสำนักงานใหญ่มากกว่าหนึ่งแถว กรุณาตรวจสอบสาขา');

    const saleNames = ordered.flatMap(r => [r.primarySale, ...r.secondarySales]).filter(Boolean);
    const responsibleSale = primary.primarySale || saleNames[0] || null;
    if (!primary.primarySale && responsibleSale) warn(`สำนักงานใหญ่ไม่มี Sale ใช้ ${responsibleSale} จากสาขาอื่นเป็น Sale หลัก`);
    const secondarySales = [...new Set(saleNames)].filter(name => name !== responsibleSale);

    const credits = [...new Set(ordered.map(r => r.creditTerm).filter(value => value !== null))];
    const creditTerm = primary.creditTerm ?? credits[0] ?? DEFAULT_CREDIT_TERM;
    if (credits.length > 1) warn(`เครดิตแต่ละรหัสไม่เท่ากัน (${credits.join(', ')}) ใช้ ${creditTerm} วัน`);

    const branches = ordered.map(record => {
      const number = branchNumber(record.name, record.address);
      let name = record.headOffice ? 'สำนักงานใหญ่' : number ? `สาขา ${number}` : null;
      if (!name && ordered.length === 1) name = 'สำนักงานใหญ่';
      if (!name) {
        name = `สาขา (รหัสเดิม ${record.code})`;
        warn(`ไม่พบเลขสาขาของรหัส ${record.code} กรุณาแก้ชื่อสาขาให้ตรงกับใบกำกับภาษี`);
      }
      return {
        code: record.code, name,
        contactPerson: record.contactPerson || null, tel: record.tel || null,
        fax: record.fax || null, email: record.emailValue,
        addresses: record.address ? [{ label: 'ที่อยู่หลัก', kind: 'both', address: record.address }] : [],
      };
    });

    const customer = {
      sourceCodes: ordered.map(r => r.code), sourceRows: ordered.map(r => r.rowNumber),
      code: primary.code, name: cleanCustomerName(primary.name), taxId: primary.taxId, type: primary.type,
      contactPerson: primary.contactPerson || null, tel: primary.tel || null, fax: primary.fax || null,
      email: primary.emailValue, vatConfig: DEFAULT_VAT, creditTerm, active: true,
      responsibleSale, secondarySales, branches,
    };
    try {
      validateCustomer({ ...customer, responsibleSaleId: responsibleSale, secondarySaleIds: secondarySales });
      customers.push(customer);
    } catch (error) {
      skipped.push({ codes: customer.sourceCodes, reason: error.message });
    }
  }

  const sales = [...new Set(customers.flatMap(c => [c.responsibleSale, ...c.secondarySales]).filter(Boolean))].sort();
  return {
    summary: {
      sourceRecords: records.length, customers: customers.length,
      branches: customers.reduce((sum, c) => sum + c.branches.length, 0),
      mergedCustomers: customers.filter(c => c.branches.length > 1).length,
      skippedRecords: skipped.reduce((sum, s) => sum + s.codes.length, 0),
      ignoredRows: ignoredRows.length, sales: sales.length, warnings: warnings.length,
    },
    customers, sales, skipped, ignoredRows, warnings,
  };
}

function nextSaleCode(taken) {
  for (let n = 1; ; n++) {
    const code = `SALE-${String(n).padStart(3, '0')}`;
    if (!taken.has(code)) { taken.add(code); return code; }
  }
}

// Insert-only: existing Accounting customers/sales are never updated or deleted.
async function applyImportPlan(tx, plan, { performedById = null, source = 'customer.csv' } = {}) {
  const existing = await tx.accountCustomer.findMany({ select: { code: true, taxId: true, branches: { select: { code: true } } } });
  const existingCodes = new Set(existing.flatMap(c => [c.code, ...(c.branches || []).map(b => b.code)]).filter(Boolean));
  const existingTax = new Set(existing.map(c => c.taxId).filter(Boolean));
  const toCreate = [];
  const skipped = [];
  for (const customer of plan.customers) {
    const clash = customer.sourceCodes.find(code => existingCodes.has(code));
    if (clash) skipped.push({ codes: customer.sourceCodes, reason: `มีรหัส ${clash} ในระบบแล้ว ไม่เขียนทับ` });
    else if (customer.taxId && existingTax.has(customer.taxId)) skipped.push({ codes: customer.sourceCodes, reason: `มี Tax ID ${customer.taxId} ในระบบแล้ว ไม่เขียนทับ` });
    else toCreate.push(customer);
  }

  const sales = await tx.accountSale.findMany();
  const saleByName = new Map(sales.map(s => [clean(s.name), s]));
  const takenCodes = new Set(sales.map(s => s.code));
  const createdSales = [];
  for (const name of new Set(toCreate.flatMap(c => [c.responsibleSale, ...c.secondarySales]).filter(Boolean))) {
    if (saleByName.has(name)) continue;
    const sale = await tx.accountSale.create({ data: { code: nextSaleCode(takenCodes), name, active: true } });
    saleByName.set(name, sale);
    createdSales.push(sale);
    await recordAuditLog({ entityType: 'account_sale', entityId: sale.id, action: 'import', newValue: sale, performedById, reason: `Import from ${source}` }, tx);
  }

  const created = [];
  for (const customer of toCreate) {
    const secondarySaleIds = customer.secondarySales.map(name => saleByName.get(name).id);
    const { branches, secondarySaleIds: ids, ...data } = validateCustomer({
      ...customer, responsibleSaleId: customer.responsibleSale ? saleByName.get(customer.responsibleSale).id : null, secondarySaleIds,
    });
    const saved = await tx.accountCustomer.create({
      data: {
        ...data,
        secondarySales: { create: ids.map((saleId, position) => ({ saleId, position })) },
        branches: { create: branches.map(({ id: _id, addresses, ...branch }, position) => ({
          ...branch, position,
          addresses: { create: addresses.map(({ id: _addressId, ...address }, addressPosition) => ({ ...address, position: addressPosition })) },
        })) },
      },
      select: { id: true, code: true },
    });
    await recordAuditLog({
      entityType: 'account_customer', entityId: saved.id, action: 'import',
      newValue: { ...customer, id: saved.id }, performedById, reason: `Import from ${source}`,
    }, tx);
    created.push(saved);
  }
  return { created, createdSales, skipped };
}

module.exports = { EXPECTED_HEADER, DEFAULT_SEPARATE_TAX_IDS, parseCsv, buildImportPlan, applyImportPlan, cleanCustomerName };
