const { getPagination, paginated } = require('./pagination');
const { recordAuditLog } = require('./auditTrail');
const { email, taxId } = require('./accountCustomers');

const SUPPLIER_INCLUDE = { branches: { orderBy: { position: 'asc' }, include: { banks: { orderBy: { position: 'asc' } } } } };
const REFERENCES = {
  accountCustomer: ['provisionalDeliveryOrders', 'invoices', 'billingNotes', 'creditNotes', 'receiptVouchers'],
  accountSale: ['customers', 'secondaryCustomers', 'invoices'],
  supplier: ['purchaseOrders', 'contractorPaymentRequests', 'goodsReceipts', 'paymentVouchers'],
  accountProduct: ['stockBalances', 'provisionalDeliveryOrderLines', 'invoiceLines', 'purchaseOrderLines', 'goodsReceiptLines', 'stockIssueLines', 'stockReturnLines', 'stockMovements'],
  warehouse: ['stockBalances', 'goodsReceipts', 'stockIssues', 'stockReturns', 'stockMovements'],
  chartOfAccount: [],
};
const TABLES = { accountCustomer: 'account_customers', accountSale: 'account_sales', supplier: 'suppliers',
  accountProduct: 'account_products', warehouse: 'warehouses', chartOfAccount: 'chart_of_accounts' };
async function lockMaster(tx, model, id) {
  if (!Object.hasOwn(TABLES, model)) throw new Error('Unknown Accounting master model');
  await tx.$queryRawUnsafe(`SELECT id FROM "${TABLES[model]}" WHERE id = $1 FOR UPDATE`, id);
}
function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, label, required = false, max = 2000) {
  if (value != null && typeof value !== 'string') invalid(`${label}ไม่ถูกต้อง`);
  const result = value?.trim() || null;
  if (required && !result) invalid(`กรุณาระบุ${label}`);
  if (result?.length > max) invalid(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return result;
}
function choice(value, options, label) {
  if (!options.includes(value)) invalid(`${label}ไม่ถูกต้อง`);
  return value;
}
function active(value = true) { if (typeof value !== 'boolean') invalid('สถานะใช้งานไม่ถูกต้อง'); return value; }
function money(value, label, max = 9999999999.99) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
      !Number.isFinite(Number(value)) || Number(value) > max) invalid(`${label}ต้องไม่ติดลบ มีทศนิยมไม่เกิน 2 ตำแหน่ง และไม่เกิน ${max}`);
  return Number(value).toFixed(2);
}
function base(body) {
  return { code: text(body.code, 'รหัส', true, 100), name: text(body.name, 'ชื่อ', true, 500), active: active(body.active) };
}
function validateProduct(body) {
  return { ...base(body), category: text(body.category, 'หมวดหมู่', false, 200), unit: text(body.unit, 'หน่วย', false, 100),
    productType: choice(body.productType ?? 'stored', ['stored', 'manufactured', 'service'], 'ประเภทสินค้า'),
    vatConfig: choice(body.vatConfig ?? 'VAT7%', ['VAT7%', 'NO_VAT'], 'VAT'),
    price: money(body.price === undefined ? 0 : body.price, 'ราคา'), cost: money(body.cost === undefined ? 0 : body.cost, 'ต้นทุน'), description: text(body.description, 'รายละเอียด') };
}
function validateWarehouse(body) { return { ...base(body), location: text(body.location, 'ที่ตั้ง'), description: text(body.description, 'รายละเอียด') }; }
function validateAccount(body) {
  const data = { ...base(body), category: choice(body.category, ['asset', 'liability', 'equity', 'revenue', 'expense'], 'หมวดบัญชี'),
    accountType: choice(body.accountType ?? 'detail', ['header', 'detail'], 'ชนิดบัญชี'),
    accountMapping: text(body.accountMapping, 'Mapping') };
  if (data.accountMapping) choice(data.accountMapping, ['AR', 'AP', 'SALES', 'CASH', 'BANK', 'VAT_INPUT', 'VAT_OUTPUT'], 'Mapping');
  if (data.accountType === 'header' && data.accountMapping) invalid('บัญชีหัวไม่สามารถกำหนด Mapping ได้');
  return data;
}
function uniqueDefault(items, label) {
  if (items.length && items.filter(item => item.isDefault).length !== 1) invalid(`ต้องมี${label}เริ่มต้นหนึ่งรายการ`);
}
function validateSupplier(body, previous = null) {
  const data = { ...base(body), supplierType: choice(body.supplierType ?? 'domestic', ['domestic', 'overseas', 'contractor'], 'ประเภทผู้ขาย'),
    taxId: taxId(body.taxId, body.supplierType === 'overseas'),
    vatConfig: choice(body.vatConfig ?? 'VAT7%', ['VAT7%', 'NO_VAT'], 'VAT'),
    email: email(body.email), creditLimit: body.creditLimit == null ? null : money(body.creditLimit, 'วงเงินเครดิต', 999999999999.99) };
  const days = body.paymentTerm === undefined ? 30 : body.paymentTerm;
  if (!['string', 'number'].includes(typeof days) || !/^\d+$/.test(String(days)) || Number(days) > 2147483647) invalid('เงื่อนไขวันชำระต้องเป็นจำนวนเต็มไม่ติดลบ');
  data.paymentTerm = Number(days);
  for (const key of ['contactPerson', 'tel', 'fax', 'groupCode', 'groupName']) data[key] = text(body[key], key);
  if (previous && body.branches === undefined) {
    for (const key of ['branch', 'address', 'billingAddress', 'bankName', 'bankBranch', 'bankAccountNo', 'bankAccountName']) {
      if (body[key] !== previous[key]) invalid('กรุณาแก้ที่อยู่และธนาคารผ่านสาขา');
    }
    return data;
  }
  const branches = body.branches ?? [{ code: '00000', name: body.branch || 'สำนักงานใหญ่',
    address: body.address, billingAddress: body.billingAddress, isDefault: true,
    banks: body.bankAccountNo ? [{ bankName: body.bankName, bankBranch: body.bankBranch,
      bankAccountNo: body.bankAccountNo, bankAccountName: body.bankAccountName, isDefault: true }] : [] }];
  if (!Array.isArray(branches) || !branches.length || branches.length > 100) invalid('กรุณาระบุสาขา 1–100 รายการ');
  data.branches = branches.map(branch => {
    if (!branch || typeof branch !== 'object' || !Array.isArray(branch.banks) || branch.banks.length > 100) invalid('ข้อมูลสาขา/ธนาคารไม่ถูกต้อง');
    const result = { code: text(branch.code, 'รหัสสาขา', true, 100), name: text(branch.name, 'ชื่อสาขา', true, 500),
      isDefault: active(branch.isDefault ?? false), email: email(branch.email),
      banks: branch.banks.map(bank => {
        if (!bank || typeof bank !== 'object') invalid('ข้อมูลธนาคารไม่ถูกต้อง');
        return { bankName: text(bank.bankName, 'ธนาคาร', true), bankBranch: text(bank.bankBranch, 'สาขาธนาคาร'),
          bankAccountNo: text(bank.bankAccountNo, 'เลขบัญชี', true, 100), bankAccountName: text(bank.bankAccountName, 'ชื่อบัญชี', true),
          isDefault: active(bank.isDefault ?? false) };
      }) };
    for (const key of ['address', 'billingAddress', 'contactPerson', 'tel', 'fax']) result[key] = text(branch[key], key);
    uniqueDefault(result.banks, 'บัญชีธนาคาร');
    if (new Set(result.banks.map(bank => `${bank.bankName}:${bank.bankAccountNo}`)).size !== result.banks.length) invalid('บัญชีธนาคารซ้ำในสาขา');
    return result;
  });
  if (new Set(data.branches.map(branch => branch.code)).size !== data.branches.length) invalid('รหัสสาขาซ้ำ');
  uniqueDefault(data.branches, 'สาขา');
  const branch = data.branches.find(branch => branch.isDefault);
  const bank = branch.banks.find(bank => bank.isDefault);
  Object.assign(data, { branch: branch.name, address: branch.address, billingAddress: branch.billingAddress });
  for (const key of ['bankName', 'bankBranch', 'bankAccountNo', 'bankAccountName']) data[key] = bank?.[key] ?? null;
  return data;
}
function masterWhere(query, fields = ['code', 'name'], filters = []) {
  const where = {};
  if (query.active !== undefined) {
    if (!['true', 'false'].includes(query.active)) invalid('ตัวกรองสถานะไม่ถูกต้อง');
    where.active = query.active === 'true';
  }
  const q = text(query.q, 'คำค้นหา', false, 200);
  if (q) where.OR = fields.map(field => ({ [field]: { contains: q, mode: 'insensitive' } }));
  for (const field of filters) if (query[field]) where[field] = text(query[field], 'ตัวกรอง');
  return where;
}
function revision(body, previous) {
  if (body.updatedAt && new Date(body.updatedAt).getTime() !== new Date(previous.updatedAt).getTime()) invalid('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่', 409);
}
async function used(tx, model, id) {
  const fields = REFERENCES[model];
  if (!fields.length) return false;
  const item = await tx[model].findUniqueOrThrow({ where: { id }, select: { _count: { select: Object.fromEntries(fields.map(field => [field, true])) } } });
  return Object.values(item._count).some(count => count > 0);
}
function json(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
async function audit(tx, req, entityType, previous, saved, action) {
  await recordAuditLog({ entityType, entityId: saved?.id || previous.id, action, oldValue: json(previous), newValue: json(saved), req }, tx);
}
function conflict(error) {
  if (['P2034', 'P2002', 'P2003'].includes(error.code)) Object.assign(error, {
    status: 409, message: error.code === 'P2002' ? 'รหัสซ้ำ กรุณาใช้รหัสอื่น' : 'ข้อมูลถูกใช้งานหรือแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่',
  });
  return error;
}
function addMasterReads(router, { model, entityType, include, fields, filters }, prisma) {
  router.get('/', async (req, res, next) => {
    try {
      const where = masterWhere(req.query, fields, filters);
      const pg = getPagination(req.query);
      const args = { where, ...(include ? { include } : {}), orderBy: [{ code: 'asc' }, { id: 'asc' }] };
      if (!pg) return res.json(await prisma[model].findMany(args));
      const [data, total] = await prisma.$transaction([
        prisma[model].findMany({ ...args, skip: pg.skip, take: pg.take }), prisma[model].count({ where }),
      ]);
      res.json(paginated(data, total, pg));
    } catch (error) { next(error); }
  });
  router.get('/:id/history', async (req, res, next) => {
    try {
      const pg = getPagination({ ...req.query, page: req.query.page || '1' });
      const where = { entityType, entityId: req.params.id };
      const [data, total] = await prisma.$transaction([
        prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: pg.skip, take: pg.take,
          include: { performedBy: { select: { fullName: true } } } }),
        prisma.auditLog.count({ where }),
      ]);
      res.json(paginated(data, total, pg));
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try { res.json(await prisma[model].findUniqueOrThrow({ where: { id: req.params.id }, ...(include ? { include } : {}) })); }
    catch (error) { next(error); }
  });
}
function addMasterDeletes(router, { model, entityType, include }, prisma) {
  for (const permanent of [false, true]) router.delete(permanent ? '/:id/permanent' : '/:id', async (req, res, next) => {
    try {
      const saved = await prisma.$transaction(async tx => {
        await lockMaster(tx, model, req.params.id);
        const previous = await tx[model].findUniqueOrThrow({ where: { id: req.params.id }, ...(include ? { include } : {}) });
        revision(req.body || {}, previous);
        if (permanent && await used(tx, model, previous.id)) invalid('ข้อมูลเคยถูกใช้งานแล้ว กรุณาปิดใช้งานแทนการลบ', 409);
        const result = permanent ? await tx[model].delete({ where: { id: previous.id } })
          : await tx[model].update({ where: { id: previous.id }, data: { active: false } });
        await audit(tx, req, entityType, previous, permanent ? null : result, permanent ? 'delete' : 'deactivate');
        return result;
      }, { isolationLevel: 'Serializable' });
      res.json({ ...saved, message: permanent ? 'ลบข้อมูลแล้ว' : 'ปิดใช้งานแล้ว' });
    } catch (error) { next(conflict(error)); }
  });
}
function createMasterRouter(config) {
  const router = require('express').Router();
  const prisma = require('./prisma');
  router.use(require('../middleware/auth').authenticate);
  addMasterReads(router, config, prisma);
  async function save(req, res, next) {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) invalid('ข้อมูลหลักไม่ถูกต้อง');
      const result = await prisma.$transaction(async tx => {
        if (req.params.id) await lockMaster(tx, config.model, req.params.id);
        const previous = req.params.id ? await tx[config.model].findUniqueOrThrow({ where: { id: req.params.id }, ...(config.include ? { include: config.include } : {}) }) : null;
        if (previous) revision(req.body, previous);
        const data = config.validate({ ...previous, ...req.body,
          ...(config.model === 'supplier' && req.body.branches === undefined && !previous?.branches?.length ? { branches: undefined } : {}),
        }, previous);
        if (config.model === 'accountProduct' && previous && previous.productType !== data.productType && await used(tx, config.model, previous.id)) {
          invalid('สินค้าถูกใช้งานแล้ว ไม่สามารถเปลี่ยนประเภทสินค้า/บริการได้', 409);
        }
        if (config.model === 'supplier' && data.branches) {
          const branches = data.branches;
          if (previous) await tx.supplierBranch.deleteMany({ where: { supplierId: previous.id } });
          data.branches = { create: branches.map((branch, position) => ({ ...branch, position,
            banks: { create: branch.banks.map((bank, position) => ({ ...bank, position })) } })) };
        }
        const saved = previous
          ? await tx[config.model].update({ where: { id: previous.id }, data, ...(config.include ? { include: config.include } : {}) })
          : await tx[config.model].create({ data, ...(config.include ? { include: config.include } : {}) });
        await audit(tx, req, config.entityType, previous, saved, previous ? 'update' : 'create');
        return saved;
      }, { isolationLevel: 'Serializable' });
      res.status(req.params.id ? 200 : 201).json(result);
    } catch (error) { next(conflict(error)); }
  }
  router.post('/', save);
  router.put('/:id', save);
  addMasterDeletes(router, config, prisma);
  return router;
}
async function assertActive(tx, model, id, label) {
  const item = id ? await tx[model].findUnique({ where: { id } }) : null;
  if (!item || !item.active) invalid(`${label}ไม่มีอยู่หรือถูกปิดใช้งาน`);
  return item;
}
module.exports = { SUPPLIER_INCLUDE, validateProduct, validateWarehouse, validateAccount, validateSupplier, masterWhere,
  taxId, revision, audit, conflict, addMasterReads, addMasterDeletes, createMasterRouter, assertActive, lockMaster };
