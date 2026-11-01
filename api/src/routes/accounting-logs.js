const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { ACCOUNTING_RESOURCES } = require('../middleware/accountingAccess');
const { documentDate } = require('../lib/deliveryOrder');
const { maskSensitiveData } = require('../lib/auditTrail');

const ENTITY_TYPES = {
  purchase_order: 'ใบสั่งซื้อ (PO)', goods_receipt: 'ใบตรวจรับ (GR)',
  contractor_payment_request: 'ใบเบิกจ่ายผู้รับเหมา (PS)', payment_voucher: 'ใบสำคัญจ่าย (PV)',
  cheque_payment: 'เช็คจ่าย (CQ)', supplier_bill: 'ใบแจ้งหนี้ผู้ขาย',
  provisional_delivery_order: 'ใบส่งของชั่วคราว (SO)', invoice: 'ใบแจ้งหนี้',
  billing_note: 'ใบวางบิล (BI)', receipt_voucher: 'ใบสำคัญรับ (RV)', credit_note: 'ใบลดหนี้ (CN)',
  stock_issue: 'เบิกสินค้า (IS)', stock_return: 'คืนสินค้า (SR)', stock_opening_balance: 'ยอดยกมาคลัง',
  stock_transfer: 'โอนคลัง', stock_threshold: 'จุดเตือนสต็อก', stock_cost_initialization: 'ตั้งต้นทุน',
  account_customer: 'ลูกค้า', account_sale: 'Sale บัญชี', account_product: 'สินค้า',
  account_unit: 'หน่วยนับ', supplier: 'ผู้จำหน่าย', warehouse: 'คลังสินค้า', chart_of_account: 'ผังบัญชี',
  accounting_approval_config: 'ตั้งค่าการอนุมัติ', accounting_gl_configuration: 'ตั้งค่า GL',
};
const PATHS = [...ACCOUNTING_RESOURCES.map(([path]) => path),
  '/api/accounting-access', '/api/accounting-approvals', '/api/accounting-gl',
  '/api/accounting-notifications', '/api/accounting-logs'];
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
function text(query, key) {
  const value = query[key];
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 200) invalid(`ตัวกรอง ${key} ไม่ถูกต้อง`);
  return value.trim();
}
function filters(query) {
  const pageText = text(query, 'page') || '1', limitText = text(query, 'limit') || '50';
  if (!/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(limitText)) invalid('เลขหน้า/จำนวนรายการไม่ถูกต้อง');
  const page = Number(pageText), limit = Number(limitText);
  if (!Number.isSafeInteger(page) || page > 1000000 || limit > 100) invalid('เลขหน้า/จำนวนรายการเกินขอบเขต');
  const from = documentDate(text(query, 'from'), 'ตั้งแต่วันที่');
  const to = documentDate(text(query, 'to'), 'ถึงวันที่');
  if (from && to && from > to) invalid('ตั้งแต่วันที่ต้องไม่เกินถึงวันที่');
  const createdAt = { ...(from ? { gte: new Date(from.getTime() - 7 * 3600000) } : {}),
    ...(to ? { lt: new Date(to.getTime() + 17 * 3600000) } : {}) };
  return { page, limit, skip: (page - 1) * limit, createdAt };
}
router.use(authenticate, requireRole('admin'));
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip, createdAt } = filters(req.query);
    const entityType = text(req.query, 'entityType'), action = text(req.query, 'action');
    const search = text(req.query, 'search'), user = text(req.query, 'user');
    if (entityType && !Object.hasOwn(ENTITY_TYPES, entityType)) invalid('ประเภทเอกสารไม่ถูกต้อง');
    const where = { entityType: entityType || { in: Object.keys(ENTITY_TYPES) },
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(search ? { OR: ['docNo', 'entityId', 'reason'].map(key => ({ [key]: { contains: search, mode: 'insensitive' } })) } : {}),
      ...(user ? { performedBy: { is: { OR: ['username', 'fullName'].map(key => ({ [key]: { contains: user, mode: 'insensitive' } })) } } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { performedBy: { select: { id: true, username: true, fullName: true, role: true } } } }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ rows: maskSensitiveData(rows), total, page, limit, entityTypes: ENTITY_TYPES });
  } catch (error) { next(error); }
});
router.get('/activity', async (req, res, next) => {
  try {
    const { page, limit, skip, createdAt } = filters(req.query);
    const search = text(req.query, 'search'), user = text(req.query, 'user');
    const method = text(req.query, 'method'), status = text(req.query, 'status');
    if (method && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) invalid('HTTP method ไม่ถูกต้อง');
    if (status && !['error', 'success'].includes(status)) invalid('สถานะไม่ถูกต้อง');
    const where = { AND: [
      { OR: PATHS.flatMap(path => [ { path }, ...['/', '?', ' '].map(separator => ({ path: { startsWith: path + separator } })) ]) },
      ...(search ? [{ path: { contains: search, mode: 'insensitive' } }] : []),
      ...(user ? [{ OR: [{ username: { contains: user, mode: 'insensitive' } },
        { user: { is: { fullName: { contains: user, mode: 'insensitive' } } } }] }] : []),
    ], ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(method ? { method } : {}), ...(status ? { statusCode: status === 'error' ? { gte: 400 } : { lt: 400 } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.activityLog.findMany({ where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { user: { select: { fullName: true, role: true } } } }),
      prisma.activityLog.count({ where }),
    ]);
    res.json({ rows: rows.map(row => ({ ...row, path: row.path.replace(
      /([?&](?:[^=&\s]*(?:token|password|secret|api_?key|authorization)[^=&\s]*)=)[^&\s]*/gi, '$1***MASKED***',
    ) })), total, page, limit });
  } catch (error) { next(error); }
});
module.exports = router;
