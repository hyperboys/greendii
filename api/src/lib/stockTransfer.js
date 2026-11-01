const { createHash } = require('crypto');
const { invalid, documentDate } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');
const { quantity } = require('./goodsReceipt');
const { lockWarehouse, assertBalance } = require('./stockOpeningBalance');
const { milli } = require('./stockCard');
const { movementCost } = require('./stockCost');
const { recordAuditLog } = require('./auditTrail');

const STATUSES = ['draft', 'pending', 'returned', 'approved', 'rejected', 'cancelled'];
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function requestKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) invalid('requestKey ไม่ถูกต้อง');
  return value;
}
function revision(doc, supplied) {
  if (!Number.isSafeInteger(supplied) || doc.revision !== supplied) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
}
function transferInput(body) {
  const sourceWarehouseId = boundedText(body.sourceWarehouseId, 'คลังต้นทาง', true, 100);
  const destinationWarehouseId = boundedText(body.destinationWarehouseId, 'คลังปลายทาง', true, 100);
  if (sourceWarehouseId === destinationWarehouseId) invalid('ต้นทางและปลายทางต้องคนละคลัง');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) invalid('ต้องมีรายการโอน 1-200 รายการ');
  const seen = new Set();
  const items = body.items.map(line => {
    const productId = boundedText(line?.productId, 'สินค้า', true, 100);
    if (seen.has(productId)) invalid('ห้ามสินค้าซ้ำในใบโอน'); seen.add(productId);
    return { productId, quantity: (quantity(line.quantity) / 1000).toFixed(3) };
  });
  return { sourceWarehouseId, destinationWarehouseId, transferDate: documentDate(body.transferDate, 'วันที่โอน', true),
    remark: boundedText(body.remark, 'หมายเหตุ', false, 1000), items };
}
async function warehouses(tx, doc) {
  const rows = {};
  for (const id of [doc.sourceWarehouseId, doc.destinationWarehouseId].sort()) rows[id] = await lockWarehouse(tx, id);
  return rows;
}
async function transferData(tx, input, previous) {
  if (previous && (previous.sourceWarehouseId !== input.sourceWarehouseId || previous.destinationWarehouseId !== input.destinationWarehouseId ||
    previous.transferDate.toISOString() !== input.transferDate.toISOString())) invalid('เปลี่ยนคลังหรือวันที่หลังออกเลขไม่ได้', 409);
  const rows = await warehouses(tx, input);
  const items = [];
  for (const item of input.items) {
    const product = await tx.accountProduct.findUnique({ where: { id: item.productId } });
    if (!product?.active || !['stored', 'manufactured'].includes(product.productType) || !product.unit?.trim()) invalid('ต้องใช้สินค้าเก็บคลัง/ผลิต active ที่มีหน่วย', 409);
    const old = previous?.items.find(row => row.productId === item.productId)?.productSnapshot;
    if (old && (old.unit !== product.unit || old.productType !== product.productType)) invalid('หน่วยหรือประเภทเปลี่ยนจาก snapshot', 409);
    items.push({ ...item, productSnapshot: old || { code: product.code, name: product.name, unit: product.unit, productType: product.productType } });
  }
  return { ...input, items, snapshot: previous?.snapshot || { source: { code: rows[input.sourceWarehouseId].code, name: rows[input.sourceWarehouseId].name },
    destination: { code: rows[input.destinationWarehouseId].code, name: rows[input.destinationWarehouseId].name } } };
}
async function balanceFor(tx, key) {
  await tx.$queryRaw`SELECT id FROM stock_balances WHERE warehouse_id = ${key.warehouseId} AND product_id = ${key.productId} FOR UPDATE`;
  const balance = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
  const events = await tx.stockMovement.findMany({ where: key });
  const ledger = events.reduce((sum, row) => sum + milli(row.qtyIn) - milli(row.qtyOut), 0);
  assertBalance(balance, ledger, key.productId);
  return balance;
}
async function reserve(tx, doc, release = false) {
  for (const line of [...doc.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const key = { warehouseId: doc.sourceWarehouseId, productId: line.productId }, balance = await balanceFor(tx, key);
    const amount = milli(line.quantity), reserved = balance ? milli(balance.reserved) : 0, available = balance ? milli(balance.available) : 0;
    if (!balance || (!release && available < amount) || (release && reserved < amount)) invalid('Stock ไม่พอจอง/ยอดจองไม่ตรง ห้ามติดลบ', 409);
    await tx.stockBalance.update({ where: { warehouseId_productId: key }, data: {
      reserved: (reserved + (release ? -amount : amount)) / 1000, available: (available + (release ? amount : -amount)) / 1000 } });
  }
}
async function postTransfer(tx, doc, req, cancellationDate) {
  const reversal = Boolean(cancellationDate);
  const originals = await tx.stockMovement.findMany({ where: { sourceDocType: 'stock_transfer', sourceDocId: doc.id } });
  if (!reversal && originals.length) invalid('ใบโอนลง Stock แล้ว', 409);
  if (reversal && (originals.length !== doc.items.length * 2 || await tx.stockMovement.count({ where: { sourceDocType: 'stock_transfer_reversal', sourceDocId: doc.id } }))) invalid('Movement โอนไม่ครบหรือกลับแล้ว', 409);
  for (const line of [...doc.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const sourceKey = { warehouseId: reversal ? doc.destinationWarehouseId : doc.sourceWarehouseId, productId: line.productId };
    const destinationKey = { warehouseId: reversal ? doc.sourceWarehouseId : doc.destinationWarehouseId, productId: line.productId };
    const source = await balanceFor(tx, sourceKey), destination = await balanceFor(tx, destinationKey);
    const amount = milli(line.quantity), date = cancellationDate || doc.transferDate;
    if (!source || milli(source.available) < amount) invalid('Stock available ไม่พอโอน/กลับ ห้ามกินยอดจองหรือติดลบ', 409);
    if ((destination ? milli(destination.onHand) : 0) + amount > 999999999999) invalid('ยอดคลังปลายทางเกินช่วง', 409);
    const outOriginal = originals.find(row => row.warehouseId === sourceKey.warehouseId && row.productId === line.productId);
    const inOriginal = originals.find(row => row.warehouseId === destinationKey.warehouseId && row.productId === line.productId);
    if (reversal && (!outOriginal || !inOriginal || milli(outOriginal.qtyIn) !== amount || milli(inOriginal.qtyOut) !== amount)) invalid('Movement โอนไม่ตรง snapshot', 409);
    const outCosts = await movementCost(tx, { key: sourceKey, balance: source, quantityOut: line.quantity, date, reversal, original: outOriginal,
      provenance: { type: 'transfer_source_average', documentId: doc.id } });
    const inCosts = await movementCost(tx, { key: destinationKey, balance: destination, quantityIn: line.quantity, date, reversal, original: inOriginal,
      inboundValue: outCosts.valueOut, provenance: { type: 'transfer_source_cost', sourceMovementId: outCosts.id, sourceWarehouseId: sourceKey.warehouseId } });
    for (const [key, costs, inbound, original] of [[sourceKey, outCosts, false, outOriginal], [destinationKey, inCosts, true, inOriginal]]) {
      await tx.stockMovement.create({ data: { ...key, ...costs, movementType: reversal ? 'reversal' : inbound ? 'in' : 'out',
        qtyIn: inbound ? line.quantity : 0, qtyOut: inbound ? 0 : line.quantity,
        sourceDocType: reversal ? 'stock_transfer_reversal' : 'stock_transfer', sourceDocId: doc.id, sourceDocNo: doc.transferNo,
        transactionDate: date, createdById: req.user.id, reversalRefId: reversal ? original.id : null, remark: doc.reason || doc.remark } });
    }
    const nextSource = milli(source.onHand) - amount, nextDestination = (destination ? milli(destination.onHand) : 0) + amount;
    await tx.stockBalance.update({ where: { warehouseId_productId: sourceKey }, data: { onHand: nextSource / 1000, available: (nextSource - milli(source.reserved)) / 1000 } });
    await tx.stockBalance.upsert({ where: { warehouseId_productId: destinationKey },
      create: { ...destinationKey, onHand: nextDestination / 1000, reserved: 0, available: nextDestination / 1000 },
      update: { onHand: nextDestination / 1000, available: (nextDestination - (destination ? milli(destination.reserved) : 0)) / 1000 } });
  }
}
async function audit(tx, req, entityType, action, previous, doc, reason) {
  await recordAuditLog({ entityType, entityId: doc.id, docNo: doc.transferNo || doc.id, action, reason, req,
    oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot({ ...doc, actorSnapshot: { fullName: req.user.fullName } }) }, tx);
}
module.exports = { STATUSES, hash, requestKey, revision, transferInput, transferData, warehouses, balanceFor, reserve, postTransfer, audit };
