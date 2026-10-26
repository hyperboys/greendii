const { invalid, documentDate } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');
const { quantity, lockWarehouse } = require('./goodsReceipt');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');
const { recordAuditLog } = require('./auditTrail');
const ISSUE_INCLUDE = { items: { orderBy: { seq: 'asc' } }, attachments: { orderBy: { uploadedAt: 'asc' } } };
const ISSUE_STATUSES = ['draft', 'pending', 'approved', 'returned', 'rejected', 'cancelled'];
const qty = value => quantity(String(value), 'จำนวนในระบบ', true);
function issueInput(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 200) invalid('ต้องมีรายการเบิก 1-200 รายการ');
  const seen = new Set();
  const items = body.items.map((line, seq) => {
    const productId = boundedText(line?.productId, 'สินค้า', true, 100);
    if (seen.has(productId)) invalid('ห้ามสินค้าซ้ำในใบเบิกเดียวกัน');
    seen.add(productId);
    const requested = quantity(line.requestedQty, 'จำนวนขอ'), issued = quantity(line.issuedQty, 'จำนวนจ่าย', true);
    if (issued > requested) invalid('จำนวนจ่ายต้องไม่เกินจำนวนขอ');
    return { seq, productId, requestedQty: requested / 1000, issuedQty: issued / 1000, cancelledQty: (requested - issued) / 1000 };
  });
  if (!items.some(row => row.issuedQty > 0)) invalid('ต้องมีอย่างน้อยหนึ่งรายการจ่ายมากกว่า 0');
  return { issueDate: documentDate(body.issueDate, 'วันที่เบิก', true),
    warehouseId: boundedText(body.warehouseId, 'คลัง', true, 100),
    workOrderId: boundedText(body.workOrderId, 'WO', false, 100) || null,
    requester: boundedText(body.requester, 'ผู้ขอ', true, 200), receiver: boundedText(body.receiver, 'ผู้รับของ', true, 200),
    remark: boundedText(body.remark, 'หมายเหตุ', false, 1000), items };
}
async function lockIssue(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM stock_issues WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.stockIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  if (!doc) invalid('ไม่พบใบเบิก', 404);
  if (doc.lifecycleVersion !== 1) invalid('ใบเบิก Legacy อ่านอย่างเดียว ต้องตรวจย้ายข้อมูลก่อน', 409);
  if (typeof revision !== 'string' || revision !== doc.updatedAt.toISOString()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใบเบิกใหม่', 409);
  return doc;
}
async function issueData(tx, input, previous) {
  if (previous && (input.warehouseId !== previous.warehouseId || input.issueDate.toISOString() !== previous.issueDate.toISOString())) invalid('เปลี่ยนคลังหรือวันที่ใบเบิกที่ออกเลขแล้วไม่ได้', 409);
  const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!warehouse?.active) invalid('คลังไม่เปิดใช้งาน', 409);
  const wo = input.workOrderId ? await tx.workOrder.findUnique({ where: { id: input.workOrderId } }) : null;
  if (input.workOrderId && (!wo?.active || wo.status === 'cancelled')) invalid('ไม่พบ WO ที่ใช้อ้างอิงได้', 409);
  const items = [];
  for (const line of input.items) {
    const product = await tx.accountProduct.findUnique({ where: { id: line.productId } });
    if (!product?.active || !['stored', 'manufactured'].includes(product.productType)) invalid('ต้องเลือกสินค้า active ประเภทเก็บคลัง/ผลิต ไม่รับบริการ', 409);
    if (!product.unit?.trim()) invalid('สินค้าต้องระบุหน่วยในข้อมูลหลักก่อนเบิก', 409);
    const old = previous?.items.find(row => row.productId === line.productId)?.productSnapshot;
    if (old && (old.unit?.trim() !== product.unit.trim() || old.productType !== product.productType)) invalid('หน่วยหรือประเภทสินค้าเปลี่ยนจาก snapshot ต้องตรวจสอบหรือสร้างใบเบิกใหม่', 409);
    items.push({ ...line, productSnapshot: old || { code: product.code, name: product.name, unit: product.unit, productType: product.productType } });
  }
  return { ...input, items, warehouseSnapshot: previous?.warehouseSnapshot || { code: warehouse.code, name: warehouse.name },
    workOrderSnapshot: previous?.workOrderId === input.workOrderId ? previous.workOrderSnapshot : wo ? { woNo: wo.woNo, project: wo.project } : null };
}
async function postIssue(tx, doc, req, reversalDate) {
  await lockWarehouse(tx, doc.warehouseId);
  const originals = await tx.stockMovement.findMany({ where: { sourceDocType: 'stock_issue', sourceDocId: doc.id } });
  const lines = doc.items.filter(line => qty(line.issuedQty) > 0);
  if (!reversalDate && originals.length) invalid('ใบเบิกนี้ตัด Stock แล้ว', 409);
  if (reversalDate && (originals.length !== lines.length || await tx.stockMovement.count({ where: { sourceDocType: 'stock_issue_reversal', sourceDocId: doc.id } }))) invalid('Movement ต้นฉบับไม่ครบหรือกลับรายการแล้ว ต้องตรวจสอบ', 409);
  for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
    if (!['stored', 'manufactured'].includes(line.productSnapshot?.productType)) invalid('Snapshot ประเภทสินค้าไม่ครบ ต้องตรวจสอบ', 409);
    const key = { warehouseId: doc.warehouseId, productId: line.productId }, amount = qty(line.issuedQty);
    const balance = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
    const onHand = balance ? qty(balance.onHand) : 0, reserved = balance ? qty(balance.reserved) : 0, available = balance ? qty(balance.available) : 0;
    if (onHand < reserved || available !== onHand - reserved) invalid('Stock balance ไม่ตรง onHand-reserved ต้องตรวจสอบ', 409);
    if (!reversalDate && (!balance || amount > available)) invalid('Stock available ไม่พอจ่ายตามจำนวนที่ระบุ กรุณาส่งกลับแก้จำนวน ไม่จ่ายลดให้อัตโนมัติ', 409);
    const original = originals.find(row => row.productId === line.productId);
    if (reversalDate) {
      if (!original || original.warehouseId !== doc.warehouseId || qty(original.qtyOut) !== amount || qty(original.qtyIn) || original.reversalRefId) invalid('Movement ต้นทางไม่ตรงใบเบิก ต้องตรวจสอบ', 409);
      const events = await tx.stockMovement.findMany({ where: key });
      if (events.some(row => row.transactionDate > reversalDate)) invalid('วันที่กลับรายการต้องไม่ก่อน Movement ล่าสุดของสินค้านี้', 409);
    }
    const next = onHand + (reversalDate ? amount : -amount);
    if (next > 999999999999 || next < reserved) invalid('ยอด Stock เกินช่วงหรือกระทบยอดจอง', 409);
    await tx.stockMovement.create({ data: { ...key, movementType: reversalDate ? 'reversal' : 'out',
      qtyIn: reversalDate ? amount / 1000 : 0, qtyOut: reversalDate ? 0 : amount / 1000,
      sourceDocType: reversalDate ? 'stock_issue_reversal' : 'stock_issue', sourceDocId: doc.id, sourceDocNo: doc.issueNo,
      reversalRefId: reversalDate ? original.id : null, transactionDate: reversalDate || doc.issueDate,
      createdById: req.user.id, remark: reversalDate ? doc.cancellationReason : `เบิก ${doc.issueNo}` } });
    await tx.stockBalance.upsert({ where: { warehouseId_productId: key }, create: { ...key, onHand: next / 1000, reserved: 0, available: next / 1000 },
      update: { onHand: next / 1000, available: (next - reserved) / 1000 } });
  }
}
async function issueAudit(tx, req, action, previous, doc, reason) {
  await recordAuditLog({ entityType: 'stock_issue', entityId: doc.id, docNo: doc.issueNo, action, reason, req,
    oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot({ ...doc, actorSnapshot: { fullName: req.user.fullName } }) }, tx);
}
async function assertIssueEvidence(req, doc, category) {
  if (category !== 'stock-issue') invalid('ประเภทหลักฐานใบเบิกไม่ถูกต้อง');
  if (!['draft', 'returned'].includes(doc.status)) invalid('แก้หลักฐานได้เฉพาะใบเบิก Draft / ส่งกลับ', 409);
  const access = await getAccountingAccess(req.user);
  if (!hasAccountingPermission(access, 'inventory', 'create') && !hasAccountingPermission(access, 'inventory', 'update')) invalid('ไม่มีสิทธิ์จัดการหลักฐานใบเบิก', 403);
}
module.exports = { ISSUE_INCLUDE, ISSUE_STATUSES, issueInput, lockIssue, issueData, postIssue, issueAudit, assertIssueEvidence };
