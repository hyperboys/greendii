const { invalid, documentDate } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');
const { recordAuditLog } = require('./auditTrail');
const GR_INCLUDE = { items: { orderBy: { seq: 'asc' } }, attachments: { orderBy: { uploadedAt: 'asc' } } };
const GR_STATUSES = ['draft', 'pending', 'approved', 'returned', 'rejected', 'cancelled'];
function quantity(value, label = 'จำนวน', zero = false) {
  if (!['string', 'number'].includes(typeof value) || !/^\d{1,9}(\.\d{1,3})?$/.test(String(value))) invalid(`${label}ต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 3 หลัก`);
  const scaled = Math.round(Number(value) * 1000);
  if ((!zero && !scaled) || !Number.isSafeInteger(scaled)) invalid(`${label}ต้องมากกว่า 0`);
  return scaled;
}
const qty = value => quantity(String(value), 'จำนวนในระบบ', true);
function receiptInput(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 200) invalid('ต้องมีรายการรับ 1-200 รายการ');
  const seen = new Set();
  const items = body.items.map((line, seq) => {
    const poLineId = boundedText(line?.poLineId, 'รายการ PO', true, 100);
    if (seen.has(poLineId)) invalid('รายการ PO ซ้ำในใบเดียวกัน');
    seen.add(poLineId);
    return { seq, poLineId, productId: boundedText(line.productId, 'สินค้า/บริการ', true, 100),
      currentReceiptQty: quantity(line.currentReceiptQty, 'จำนวนรับครั้งนี้') / 1000 };
  });
  return { receiptDate: documentDate(body.receiptDate, 'วันที่รับ', true), poId: boundedText(body.poId, 'PO', true, 100),
    warehouseId: boundedText(body.warehouseId, 'คลัง', false, 100) || null,
    sender: boundedText(body.sender, 'ผู้ส่ง', true, 200), receiver: boundedText(body.receiver, 'ผู้รับ', true, 200),
    remark: boundedText(body.remark, 'หมายเหตุ', false, 1000), items };
}
async function lockReceipt(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.goodsReceipt.findUnique({ where: { id }, include: GR_INCLUDE });
  if (!doc) invalid('ไม่พบ GR', 404);
  if (doc.lifecycleVersion !== 1) invalid('GR Legacy อ่านอย่างเดียว ต้องตรวจย้ายข้อมูลก่อน', 409);
  if (typeof revision !== 'string' || revision !== doc.updatedAt.toISOString()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลด GR ใหม่', 409);
  return doc;
}
async function receiptSource(tx, poId, excludeId) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${poId} FOR UPDATE`;
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { supplier: true, items: { orderBy: { seq: 'asc' } } } });
  if (!po || po.status !== 'approved') invalid('GR ต้องอ้าง PO ที่อนุมัติแล้ว', 409);
  if (!po.supplier?.active) invalid('ผู้ขายถูกปิดใช้งาน', 409);
  const receipts = await tx.goodsReceipt.findMany({ where: { poId, status: { notIn: ['cancelled', 'rejected'] } }, include: { items: true } });
  if (receipts.some(row => row.lifecycleVersion !== 1 || row.items.some(line => !line.poLineId))) invalid('PO มี GR Legacy ไม่ผูก PO line ต้องตรวจย้ายก่อนรับเพิ่ม', 409);
  const lines = po.items.map(line => {
    let received = 0, pending = 0, productId = line.productId || null;
    for (const doc of receipts) {
      if (!['pending', 'approved'].includes(doc.status) || doc.id === excludeId) continue;
      for (const item of doc.items.filter(item => item.poLineId === line.id)) {
        if (productId && productId !== item.productId) invalid('Mapping สินค้าในประวัติไม่ตรง ต้องตรวจสอบ', 409);
        productId = item.productId;
        if (doc.status === 'approved') received += qty(item.currentReceiptQty); else pending += qty(item.currentReceiptQty);
      }
    }
    const ordered = qty(line.qty);
    if (received + pending > ordered) invalid('ยอดรับเดิมเกิน PO ต้องตรวจสอบ', 409);
    return { id: line.id, seq: line.seq, desc: line.desc, unit: line.unit, productId,
      orderedQty: ordered / 1000, previouslyReceivedQty: received / 1000, pendingQty: pending / 1000,
      remainingQty: (ordered - received - pending) / 1000 };
  });
  return { po, lines };
}
async function receiptData(tx, input, previous) {
  if (previous && input.poId !== previous.poId) invalid('เปลี่ยน PO ของ GR เดิมไม่ได้', 409);
  const { po, lines } = await receiptSource(tx, input.poId, previous?.id);
  if (input.receiptDate < po.poDate) invalid('วันที่รับต้องไม่ก่อนวันที่ PO');
  const warehouse = input.warehouseId ? await tx.warehouse.findUnique({ where: { id: input.warehouseId } }) : null;
  if (input.warehouseId && !warehouse?.active) invalid('คลังไม่เปิดใช้งาน', 409);
  const items = [];
  for (const line of input.items) {
    const source = lines.find(row => row.id === line.poLineId);
    if (!source) invalid('รายการรับต้องมาจาก PO นี้');
    if (source.productId && source.productId !== line.productId) invalid('สินค้า/บริการไม่ตรง mapping PO ที่ล็อกไว้', 409);
    const product = await tx.accountProduct.findUnique({ where: { id: line.productId } });
    if (!product?.active || !['stored', 'manufactured', 'service'].includes(product.productType)) invalid('สินค้า/บริการไม่เปิดใช้งานหรือประเภทไม่รองรับ', 409);
    if (!source.unit || source.unit.trim() !== String(product.unit || '').trim()) invalid('หน่วยสินค้า/บริการต้องตรง PO ไม่แปลงหน่วยอัตโนมัติ', 409);
    if (product.productType !== 'service' && !warehouse) invalid('สินค้าต้องระบุคลังรับ');
    if (qty(line.currentReceiptQty) > qty(source.remainingQty)) invalid('จำนวนรับเกิน PO คงเหลือ (รวมรออนุมัติ)', 409);
    const old = previous?.items.find(item => item.poLineId === line.poLineId && item.productId === line.productId);
    if (old?.productSnapshot?.productType && old.productSnapshot.productType !== product.productType) invalid('ประเภทสินค้า/บริการเปลี่ยนจาก snapshot ต้องตรวจสอบหรือสร้าง GR ใหม่', 409);
    items.push({ ...line, desc: source.desc, unit: source.unit, orderedQty: source.orderedQty,
      previouslyReceivedQty: source.previouslyReceivedQty, pendingQty: source.pendingQty,
      remainingQty: (qty(source.remainingQty) - qty(line.currentReceiptQty)) / 1000,
      productSnapshot: old?.productSnapshot || { code: product.code, name: product.name, unit: product.unit, productType: product.productType } });
  }
  return { ...input, items, supplierId: po.supplierId, poNo: previous?.poNo || po.poNo,
    supplierSnapshot: previous?.supplierSnapshot || normalizedSnapshot(po.supplierSnapshot || { code: po.supplier.code, name: po.supplier.name, taxId: po.supplier.taxId }),
    warehouseSnapshot: previous?.warehouseId === input.warehouseId ? previous.warehouseSnapshot
      : warehouse ? { code: warehouse.code, name: warehouse.name } : null };
}
async function lockWarehouse(tx, id) {
  await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${id} FOR UPDATE`;
}
async function postReceipt(tx, doc, req, reversalDate) {
  const reversal = Boolean(reversalDate), products = new Map();
  for (const item of doc.items) {
    const type = item.productSnapshot?.productType;
    if (!['stored', 'manufactured', 'service'].includes(type)) invalid('Snapshot ประเภทสินค้าไม่ครบ ต้องตรวจสอบก่อนลง Stock', 409);
    if (type !== 'service') products.set(item.productId, (products.get(item.productId) || 0) + qty(item.currentReceiptQty));
  }
  if (!products.size) return;
  if (!doc.warehouseId) invalid('ไม่พบคลังของ GR', 409);
  await lockWarehouse(tx, doc.warehouseId);
  const originals = await tx.stockMovement.findMany({ where: { sourceDocType: 'goods_receipt', sourceDocId: doc.id } });
  if (!reversal && originals.length) invalid('GR นี้ลง Stock แล้ว', 409);
  if (reversal && await tx.stockMovement.count({ where: { sourceDocType: 'goods_receipt_reversal', sourceDocId: doc.id } })) invalid('GR นี้มี Movement กลับรายการแล้ว ต้องตรวจสอบ', 409);
  if (reversal && (originals.length !== products.size || originals.some(row => row.reversalRefId))) invalid('ประวัติ Stock ของ GR ไม่ตรง ต้องตรวจสอบก่อนกลับรายการ', 409);
  for (const [productId, amount] of [...products].sort(([a], [b]) => a.localeCompare(b))) {
    const key = { warehouseId: doc.warehouseId, productId };
    const balance = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
    const onHand = balance ? qty(balance.onHand) : 0, reserved = balance ? qty(balance.reserved) : 0;
    if (reversal) {
      const original = originals.find(row => row.productId === productId && row.warehouseId === doc.warehouseId);
      if (!original || qty(original.qtyIn) !== amount || qty(original.qtyOut)) invalid('Movement ต้นทางไม่ตรงยอดรับ', 409);
      const movements = await tx.stockMovement.findMany({ where: key, orderBy: { transactionDate: 'desc' } });
      if (movements.some(row => row.transactionDate > reversalDate)) invalid('วันที่กลับรายการต้องไม่ก่อน Movement ล่าสุดของสินค้านี้', 409);
      if (!balance || onHand - reserved < amount || qty(balance.available) < amount) invalid('Stock available ไม่พอกลับ GR หรือกระทบยอดจอง', 409);
    }
    const next = onHand + (reversal ? -amount : amount);
    if (next > 999999999999 || next < reserved) invalid('ยอด Stock เกินช่วงหรือกระทบยอดจอง', 409);
    await tx.stockMovement.create({ data: { ...key, movementType: reversal ? 'reversal' : 'in',
      qtyIn: reversal ? 0 : amount / 1000, qtyOut: reversal ? amount / 1000 : 0,
      sourceDocType: reversal ? 'goods_receipt_reversal' : 'goods_receipt', sourceDocId: doc.id, sourceDocNo: doc.grNo,
      reversalRefId: reversal ? originals.find(row => row.productId === productId).id : null,
      transactionDate: reversalDate || doc.receiptDate, createdById: req.user.id,
      remark: reversal ? doc.cancellationReason : `รับจาก ${doc.poNo}` } });
    await tx.stockBalance.upsert({ where: { warehouseId_productId: key },
      create: { ...key, onHand: next / 1000, reserved: 0, available: next / 1000 },
      update: { onHand: next / 1000, available: (next - reserved) / 1000 } });
  }
}
async function receiptAudit(tx, req, action, previous, doc, reason) {
  await recordAuditLog({ entityType: 'goods_receipt', entityId: doc.id, docNo: doc.grNo, action, reason, req,
    oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot({ ...doc, actorSnapshot: { fullName: req.user.fullName } }) }, tx);
}
async function assertReceiptEvidence(req, doc, category) {
  if (category !== 'gr-receipt') invalid('ประเภทหลักฐาน GR ไม่ถูกต้อง');
  if (!['draft', 'returned'].includes(doc.status)) invalid('แก้หลักฐานได้เฉพาะ GR Draft / ส่งกลับ', 409);
  const access = await getAccountingAccess(req.user);
  if (!hasAccountingPermission(access, 'ap', 'create') && !hasAccountingPermission(access, 'ap', 'update')) invalid('ไม่มีสิทธิ์จัดการหลักฐาน GR', 403);
}
module.exports = { GR_INCLUDE, GR_STATUSES, quantity, receiptInput, lockReceipt, receiptSource, receiptData, lockWarehouse, postReceipt, receiptAudit, assertReceiptEvidence };
