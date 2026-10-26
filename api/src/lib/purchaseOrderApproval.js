const { invalid, moneyCents } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');
const { normalizePurchaseOrderItems, calculatePurchaseOrderTotals } = require('./purchaseOrder');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');
const { recordAuditLog } = require('./auditTrail');

const PO_STATUSES = ['draft', 'pending', 'approved', 'returned', 'rejected', 'cancelled'];
async function lockPurchaseOrder(tx, id, revision, include) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.purchaseOrder.findUnique({ where: { id }, include });
  if (!doc) invalid('ไม่พบ PO', 404);
  if (typeof revision !== 'string' || revision !== doc.updatedAt.toISOString()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลด PO ใหม่', 409);
  return doc;
}
async function assertNoPoDependents(tx, id) {
  const ps = await tx.contractorPaymentRequest.count({ where: { poId: id, status: { notIn: ['cancelled', 'rejected'] } } });
  const gr = await tx.goodsReceipt.count({ where: { poId: id, status: { notIn: ['cancelled', 'rejected'] } } });
  if (ps || gr) invalid('PO มี PS/GR ที่ยังไม่ปิด ต้องจัดการเอกสารปลายทางก่อน ไม่กลับ Stock หรือการจ่ายเงินผ่าน PO', 409);
}
function assertPoSubmittable(doc) {
  if (!doc.createdById) invalid('PO เดิมไม่มีผู้สร้าง ต้องตรวจสอบข้อมูลก่อนส่งอนุมัติ', 409);
  if (!['domestic', 'overseas'].includes(doc.purchaseType)) invalid('ประเภทจัดซื้อไม่รองรับ', 409);
  if (!['VAT7%', 'NO_VAT'].includes(doc.vatConfig)) invalid('VAT ของ PO ไม่รองรับ', 409);
  if (!doc.supplier?.active) invalid('ผู้ขายถูกปิดใช้งาน กรุณาตรวจสอบก่อนส่ง/อนุมัติ', 409);
  const items = normalizePurchaseOrderItems(doc.items);
  if (items.some(item => !item.desc)) invalid('ต้องมีรายละเอียดทุกรายการ');
  const totals = calculatePurchaseOrderTotals(items, doc.vatConfig);
  for (const key of Object.keys(totals)) {
    if (moneyCents(String(totals[key]), 'ยอด PO') !== moneyCents(String(doc[key]), 'ยอด PO')) invalid('ยอด PO ไม่ตรงกับรายการ ต้องแก้ไขก่อนส่ง/อนุมัติ', 409);
  }
}
async function purchaseOrderAudit(tx, req, action, previous, doc, reason) {
  await recordAuditLog({ entityType: 'purchase_order', entityId: doc.id, docNo: doc.poNo,
    action, oldValue: normalizedSnapshot(previous),
    newValue: normalizedSnapshot({ ...doc, actorSnapshot: { fullName: req.user.fullName } }), reason, req }, tx);
}
async function assertPoEvidence(req, doc, category) {
  if (category !== 'accounting-po') invalid('ประเภทหลักฐาน PO ไม่ถูกต้อง');
  if (!['draft', 'returned'].includes(doc.status)) invalid('แก้ไขไฟล์ได้เฉพาะ PO Draft / ส่งกลับ', 409);
  const access = await getAccountingAccess(req.user);
  if (!hasAccountingPermission(access, 'ap', 'update') && !hasAccountingPermission(access, 'ap', 'create')) invalid('ไม่มีสิทธิ์จัดการหลักฐาน PO', 403);
}
function poActionReason(action, value) {
  return boundedText(value, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
}
module.exports = { PO_STATUSES, lockPurchaseOrder, assertNoPoDependents, assertPoSubmittable, purchaseOrderAudit, assertPoEvidence, poActionReason };
