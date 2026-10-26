const { invalid, documentDate } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');
const { quantity, lockWarehouse } = require('./goodsReceipt');
const { ISSUE_INCLUDE, ISSUE_STATUSES } = require('./stockIssue');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');
const { recordAuditLog } = require('./auditTrail');
const RETURN_INCLUDE = { items: { orderBy: { seq: 'asc' } }, attachments: { orderBy: { uploadedAt: 'asc' } } };
const qty = value => quantity(String(value), 'จำนวนในระบบ', true);
function returnInput(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 200) invalid('ต้องมีรายการคืน 1-200 รายการ');
  if (body.condition !== undefined && body.condition !== 'good') invalid('รอบนี้รับคืนเฉพาะของดี ไม่รับของชำรุด');
  const seen = new Set();
  const items = body.items.map((line, seq) => {
    const stockIssueLineId = boundedText(line?.stockIssueLineId, 'รายการ IS', true, 100);
    if (seen.has(stockIssueLineId)) invalid('รายการ IS ซ้ำในใบคืน');
    seen.add(stockIssueLineId);
    return { seq, stockIssueLineId, returnedQty: quantity(line.returnedQty, 'จำนวนคืน') / 1000 };
  });
  return { stockIssueId: boundedText(body.stockIssueId, 'IS', true, 100),
    returnDate: documentDate(body.returnDate, 'วันที่คืน', true),
    sender: boundedText(body.sender, 'ผู้ส่งคืน', true, 200), receiver: boundedText(body.receiver, 'ผู้รับคืน', true, 200),
    returnReason: boundedText(body.returnReason, 'เหตุผลคืน', true, 1000),
    remark: boundedText(body.remark, 'หมายเหตุ', false, 1000), condition: 'good', items };
}
async function lockReturn(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM stock_returns WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.stockReturn.findUnique({ where: { id }, include: RETURN_INCLUDE });
  if (!doc) invalid('ไม่พบใบคืน', 404);
  if (doc.lifecycleVersion !== 1) invalid('ใบคืน Legacy อ่านอย่างเดียว ต้องตรวจย้ายข้อมูลก่อน', 409);
  if (typeof revision !== 'string' || revision !== doc.updatedAt.toISOString()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใบคืนใหม่', 409);
  return doc;
}
async function lockReturnIssue(tx, id) {
  await tx.$queryRaw`SELECT id FROM stock_issues WHERE id = ${id} FOR UPDATE`;
  const issue = await tx.stockIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  if (!issue || issue.lifecycleVersion !== 1 || issue.status !== 'approved') invalid('ต้องอ้างใบเบิกรุ่นใหม่ที่อนุมัติแล้ว', 409);
  return issue;
}
async function returnSource(tx, id, excludeId) {
  const issue = await lockReturnIssue(tx, id);
  const returns = await tx.stockReturn.findMany({ where: { stockIssueId: id, status: { notIn: ['cancelled', 'rejected'] } }, include: { items: true } });
  if (returns.some(doc => doc.lifecycleVersion !== 1 || doc.items.some(line => !line.stockIssueLineId))) invalid('มีใบคืน Legacy/ไม่ผูกรายการ ต้องตรวจย้ายก่อนคืนเพิ่ม', 409);
  const products = new Set();
  const lines = issue.items.filter(line => qty(line.issuedQty) > 0).map(line => {
    if (!line.id || !line.productSnapshot?.unit?.trim() || !['stored', 'manufactured'].includes(line.productSnapshot.productType) || products.has(line.productId)) invalid('รายการ/หน่วย/ประเภทสินค้าต้นทางไม่ครบหรือซ้ำ ต้องตรวจสอบ IS', 409);
    products.add(line.productId);
    let returned = 0, pending = 0;
    for (const doc of returns) {
      if (doc.id === excludeId || !['pending', 'approved'].includes(doc.status)) continue;
      for (const item of doc.items.filter(item => item.stockIssueLineId === line.id)) {
        if (item.productId !== line.productId) invalid('ประวัติสินค้าไม่ตรงรายการ IS ต้องตรวจสอบ', 409);
        if (doc.status === 'approved') returned += qty(item.returnedQty); else pending += qty(item.returnedQty);
      }
    }
    const issued = qty(line.issuedQty);
    if (returned + pending > issued) invalid('ยอดคืนเดิมเกินจ่ายจริง ต้องตรวจสอบ', 409);
    return { id: line.id, productId: line.productId, productSnapshot: line.productSnapshot, issuedQty: issued / 1000,
      previouslyReturnedQty: returned / 1000, pendingQty: pending / 1000, remainingQty: (issued - returned - pending) / 1000 };
  });
  const lineIds = new Set(issue.items.map(line => line.id));
  if (returns.some(doc => ['pending', 'approved'].includes(doc.status) && doc.items.some(line => !lineIds.has(line.stockIssueLineId)))) invalid('ประวัติคืนมีรายการนอก IS ต้องตรวจสอบ', 409);
  return { issue, lines };
}
async function returnData(tx, input, previous) {
  if (previous && (input.stockIssueId !== previous.stockIssueId || input.returnDate.toISOString() !== previous.returnDate.toISOString())) invalid('เปลี่ยน IS หรือวันที่ใบคืนที่ออกเลขแล้วไม่ได้', 409);
  const { issue, lines } = await returnSource(tx, input.stockIssueId, previous?.id);
  if (input.returnDate < issue.issueDate) invalid('วันที่คืนต้องไม่ก่อนวันที่เบิก');
  const warehouse = await tx.warehouse.findUnique({ where: { id: issue.warehouseId } });
  if (!warehouse?.active) invalid('คลังเดิมไม่เปิดใช้งาน', 409);
  const items = [];
  for (const line of input.items) {
    const source = lines.find(item => item.id === line.stockIssueLineId);
    if (!source) invalid('ต้องคืนรายการที่จ่ายจริงจาก IS นี้เท่านั้น');
    const product = await tx.accountProduct.findUnique({ where: { id: source.productId } });
    const snapshot = source.productSnapshot;
    if (!product?.active || !snapshot?.unit?.trim() || !['stored', 'manufactured'].includes(snapshot.productType) ||
      product.unit?.trim() !== snapshot.unit.trim() || product.productType !== snapshot.productType) invalid('สินค้า/หน่วย/ประเภทไม่ตรง IS หรือถูกปิดใช้งาน', 409);
    if (qty(line.returnedQty) > qty(source.remainingQty)) invalid('จำนวนคืนเกินจ่ายจริงคงเหลือ (รวมใบคืนรออนุมัติ)', 409);
    items.push({ ...line, productId: source.productId, productSnapshot: snapshot, issuedQty: source.issuedQty,
      previouslyReturnedQty: source.previouslyReturnedQty, pendingQty: source.pendingQty,
      remainingQty: (qty(source.remainingQty) - qty(line.returnedQty)) / 1000 });
  }
  return { ...input, items, warehouseId: issue.warehouseId, workOrderId: issue.workOrderId,
    issueSnapshot: previous?.issueSnapshot || { issueNo: issue.issueNo, issueDate: issue.issueDate.toISOString(), requester: issue.requester, receiver: issue.receiver },
    warehouseSnapshot: previous?.warehouseSnapshot || issue.warehouseSnapshot,
    workOrderSnapshot: previous?.workOrderSnapshot || issue.workOrderSnapshot };
}
async function postReturn(tx, doc, req, reversalDate) {
  await lockWarehouse(tx, doc.warehouseId);
  const originals = await tx.stockMovement.findMany({ where: { sourceDocType: 'stock_return', sourceDocId: doc.id } });
  if (!reversalDate && originals.length) invalid('ใบคืนเพิ่ม Stock แล้ว', 409);
  if (reversalDate && (originals.length !== doc.items.length || await tx.stockMovement.count({ where: { sourceDocType: 'stock_return_reversal', sourceDocId: doc.id } }))) invalid('Movement ต้นฉบับไม่ครบหรือกลับแล้ว', 409);
  for (const line of [...doc.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const key = { warehouseId: doc.warehouseId, productId: line.productId }, amount = qty(line.returnedQty);
    const balance = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
    const onHand = balance ? qty(balance.onHand) : 0, reserved = balance ? qty(balance.reserved) : 0, available = balance ? qty(balance.available) : 0;
    if (onHand < reserved || available !== onHand - reserved) invalid('Stock balance ไม่ตรง onHand-reserved ต้องตรวจสอบ', 409);
    const original = originals.find(row => row.productId === line.productId);
    if (reversalDate) {
      if (!original || original.warehouseId !== doc.warehouseId || qty(original.qtyIn) !== amount || qty(original.qtyOut) || original.reversalRefId) invalid('Movement ต้นทางไม่ตรงใบคืน', 409);
      if (available < amount) invalid('Stock available ไม่พอกลับใบคืน ห้ามกินยอดจองหรือติดลบ', 409);
      const events = await tx.stockMovement.findMany({ where: key });
      if (events.some(row => row.transactionDate > reversalDate)) invalid('วันที่กลับรายการต้องไม่ก่อน Movement ล่าสุดของสินค้านี้', 409);
    }
    const next = onHand + (reversalDate ? -amount : amount);
    if (next > 999999999999 || next < reserved) invalid('ยอด Stock เกินช่วงหรือกระทบยอดจอง', 409);
    await tx.stockMovement.create({ data: { ...key, movementType: reversalDate ? 'reversal' : 'in',
      qtyIn: reversalDate ? 0 : amount / 1000, qtyOut: reversalDate ? amount / 1000 : 0,
      sourceDocType: reversalDate ? 'stock_return_reversal' : 'stock_return', sourceDocId: doc.id, sourceDocNo: doc.returnNo,
      transactionDate: reversalDate || doc.returnDate, createdById: req.user.id, reversalRefId: original?.id || null,
      remark: reversalDate ? doc.cancellationReason : `คืนสินค้า ${doc.returnNo}` } });
    await tx.stockBalance.upsert({ where: { warehouseId_productId: key },
      create: { ...key, onHand: next / 1000, reserved: 0, available: next / 1000 },
      update: { onHand: next / 1000, available: (next - reserved) / 1000 } });
  }
}
async function returnAudit(tx, req, action, previous, doc, reason) {
  await recordAuditLog({ entityType: 'stock_return', entityId: doc.id, docNo: doc.returnNo, action, reason, req,
    oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot({ ...doc, actorSnapshot: { fullName: req.user.fullName } }) }, tx);
}
async function assertReturnEvidence(req, doc, category) {
  if (category !== 'stock-return') invalid('ประเภทหลักฐานใบคืนไม่ถูกต้อง');
  if (!['draft', 'returned'].includes(doc.status)) invalid('แก้หลักฐานได้เฉพาะใบคืน Draft / ส่งกลับ', 409);
  const access = await getAccountingAccess(req.user);
  if (!hasAccountingPermission(access, 'inventory', 'create') && !hasAccountingPermission(access, 'inventory', 'update')) invalid('ไม่มีสิทธิ์จัดการหลักฐานใบคืน', 403);
}
module.exports = { RETURN_INCLUDE, RETURN_STATUSES: ISSUE_STATUSES, returnInput, lockReturn, lockReturnIssue, returnSource, returnData, postReturn, returnAudit, assertReturnEvidence };
