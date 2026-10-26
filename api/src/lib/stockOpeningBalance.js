const { invalid } = require('./deliveryOrder');
const { boundedText } = require('./contractorPayment');
const { milli, quantity } = require('./stockCard');

const OPENING_MOVEMENTS = ['stock_opening_balance', 'stock_opening_balance_reversal'];
const OPENING_INCLUDE = { items: { orderBy: { seq: 'asc' }, include: { product: true } }, warehouse: true };

function dateOnly(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label}ไม่ถูกต้อง`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1900) {
    invalid(`${label}ต้องเป็นวันที่จริง`);
  }
  return parsed;
}

function dateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function cutoverStart(date) {
  return new Date(`${dateString(date)}T00:00:00+07:00`);
}

function openingAt(date) {
  return new Date(cutoverStart(date).getTime() - 1);
}

function localDateStart(value) {
  return new Date(`${value}T00:00:00+07:00`);
}

function bangkokToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const part = type => parts.find(row => row.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function quantityInput(value, label) {
  if (!['number', 'string'].includes(typeof value) || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(value))) {
    invalid(`${label}ต้องเป็นจำนวนไม่ติดลบ ไม่เกิน 3 ตำแหน่ง`);
  }
  const amount = milli(value);
  if (amount > 999999999999) invalid(`${label}เกินช่วงจำนวนที่รองรับ`);
  return amount;
}

function openingInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('ข้อมูลยอดยกมาไม่ถูกต้อง');
  const warehouseId = boundedText(body.warehouseId, 'คลัง', true, 100);
  const cutoverDate = dateOnly(body.cutoverDate, 'วันเริ่มใช้');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 2000) invalid('ต้องมีรายการสินค้า 1-2000 รายการ');
  const seen = new Set();
  const items = body.items.map((item, seq) => {
    const productId = boundedText(item?.productId, `สินค้าแถว ${seq + 1}`, true, 100);
    if (seen.has(productId)) invalid('สินค้าในเอกสารซ้ำกัน');
    seen.add(productId);
    return { seq, productId, countedQty: quantityInput(item.countedQty, `จำนวนแถว ${seq + 1}`) / 1000 };
  });
  return { warehouseId, cutoverDate, items, remark: boundedText(body.remark, 'หมายเหตุ', false, 1000) };
}

async function lockOpening(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM stock_opening_balances WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.stockOpeningBalance.findUnique({ where: { id }, include: OPENING_INCLUDE });
  if (!doc) invalid('ไม่พบใบยอดยกมา', 404);
  if (!revision || new Date(revision).getTime() !== doc.updatedAt.getTime()) invalid('เอกสารถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนดำเนินการ', 409);
  return doc;
}

async function lockWarehouse(tx, warehouseId) {
  await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${warehouseId} FOR UPDATE`;
  const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse?.active) invalid('คลังไม่พบหรือปิดใช้งานแล้ว', 409);
  return warehouse;
}

async function lockControl(tx, cutoverDate) {
  if (dateString(cutoverDate) > bangkokToday()) invalid('ส่งอนุมัติยอดยกมาไม่ได้ก่อนวันเริ่มใช้', 409);
  await tx.stockOpeningControl.upsert({ where: { id: 'default' },
    create: { id: 'default', cutoverDate }, update: {} });
  await tx.$queryRaw`SELECT id FROM stock_opening_controls WHERE id = 'default' FOR UPDATE`;
  const control = await tx.stockOpeningControl.findUnique({ where: { id: 'default' } });
  if (dateString(control.cutoverDate) !== dateString(cutoverDate)) invalid(`วันเริ่มใช้ทั้งบริษัทถูกกำหนดเป็น ${dateString(control.cutoverDate)}`, 409);
  return control;
}

async function assertNoActiveDuplicate(tx, warehouseId, cutoverDate, excludeId) {
  const duplicate = await tx.stockOpeningBalance.findFirst({ where: {
    warehouseId, cutoverDate, status: { notIn: ['cancelled', 'rejected'] }, ...(excludeId ? { id: { not: excludeId } } : {}),
  } });
  if (duplicate) invalid(`คลังนี้มีใบยอดยกมาที่ใช้งานอยู่แล้ว (${duplicate.openingNo})`, 409);
}

async function openingData(tx, input, previous) {
  if (previous && (previous.warehouseId !== input.warehouseId || dateString(previous.cutoverDate) !== dateString(input.cutoverDate))) {
    invalid('เปลี่ยนคลังหรือวันเริ่มใช้หลังออกเลขไม่ได้', 409);
  }
  const control = await tx.stockOpeningControl.findUnique({ where: { id: 'default' } });
  if (control && dateString(control.cutoverDate) !== dateString(input.cutoverDate)) invalid(`วันเริ่มใช้ทั้งบริษัทถูกกำหนดเป็น ${dateString(control.cutoverDate)}`, 409);
  const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!warehouse?.active) invalid('กรุณาเลือกคลังที่เปิดใช้งาน', 409);
  const items = [];
  for (const item of input.items) {
    const product = await tx.accountProduct.findUnique({ where: { id: item.productId } });
    if (!product || !['stored', 'manufactured'].includes(product.productType)) invalid('ยอดยกมารับเฉพาะสินค้าเก็บคลัง/ผลิต ไม่รับบริการ', 409);
    if (!product.unit?.trim()) invalid('สินค้าต้องระบุหน่วยก่อนบันทึกยอดยกมา', 409);
    const old = previous?.items.find(row => row.productId === item.productId)?.productSnapshot;
    if (old && (old.unit !== product.unit || old.productType !== product.productType)) invalid('หน่วยหรือประเภทสินค้าเปลี่ยนจาก snapshot ต้องตรวจสอบ', 409);
    items.push({ ...item, bookQtyAtCutover: 0, deltaQty: 0,
      productSnapshot: old || { code: product.code, name: product.name, unit: product.unit, productType: product.productType } });
  }
  return { warehouseId: input.warehouseId, cutoverDate: input.cutoverDate,
    warehouseSnapshot: previous?.warehouseSnapshot || { code: warehouse.code, name: warehouse.name },
    remark: input.remark, items };
}

function netMilli(group) {
  return group ? milli(group._sum.qtyIn || 0) - milli(group._sum.qtyOut || 0) : 0;
}

async function stockOpeningSnapshot(tx, warehouseId, cutoverDate, excludeId) {
  const start = cutoverStart(cutoverDate);
  const [cutoverGroups, ledgerGroups, balances] = await Promise.all([
    tx.stockMovement.groupBy({ by: ['productId'], where: { warehouseId, transactionDate: { lt: start },
      sourceDocType: { notIn: OPENING_MOVEMENTS } }, _sum: { qtyIn: true, qtyOut: true } }),
    tx.stockMovement.groupBy({ by: ['productId'], where: { warehouseId }, _sum: { qtyIn: true, qtyOut: true } }),
    tx.stockBalance.findMany({ where: { warehouseId } }),
  ]);
  const cutoverByProduct = new Map(cutoverGroups.map(row => [row.productId, netMilli(row)]));
  const ledgerByProduct = new Map(ledgerGroups.map(row => [row.productId, netMilli(row)]));
  const balanceByProduct = new Map(balances.map(row => [row.productId, row]));
  const ids = [...new Set([...cutoverByProduct.keys(), ...ledgerByProduct.keys(), ...balanceByProduct.keys()])];
  const products = await tx.accountProduct.findMany({ where: { id: { in: ids } }, orderBy: { code: 'asc' } });
  const productById = new Map(products.map(product => [product.id, product]));
  const mismatches = [];
  const lines = [];
  for (const productId of ids) {
    const product = productById.get(productId), balance = balanceByProduct.get(productId);
    const bookQty = cutoverByProduct.get(productId) || 0;
    const ledgerQty = ledgerByProduct.get(productId) || 0;
    const onHand = balance ? milli(balance.onHand) : 0;
    const reserved = balance ? milli(balance.reserved) : 0;
    const available = balance ? milli(balance.available) : 0;
    const code = product?.code || productId;
    if (!product) mismatches.push(`${code}: ไม่พบสินค้า`);
    if (product && !['stored', 'manufactured'].includes(product.productType) && (ledgerQty || onHand || reserved)) {
      mismatches.push(`${code}: มี Movement/Stock ของสินค้าที่ไม่ใช่ประเภทเก็บคลัง/ผลิต`);
    }
    if (bookQty < 0) mismatches.push(`${code}: ยอด Movement ณ วันเริ่มใช้ติดลบ ${quantity(bookQty)}`);
    if (onHand !== ledgerQty || onHand < reserved || available !== onHand - reserved) {
      mismatches.push(`${code}: Movement ${quantity(ledgerQty)}, On Hand ${quantity(onHand)}, Reserved ${quantity(reserved)}, Available ${quantity(available)}`);
    }
    if (product && ['stored', 'manufactured'].includes(product.productType)) {
      lines.push({ productId, product: { id: product.id, code: product.code, name: product.name, unit: product.unit,
        productType: product.productType, active: product.active },
      bookQtyAtCutover: quantity(bookQty), currentLedgerQty: quantity(ledgerQty),
      onHand: quantity(onHand), reserved: quantity(reserved), available: quantity(available) });
    }
  }
  const activeDocument = await tx.stockOpeningBalance.findFirst({ where: {
    warehouseId, cutoverDate, status: { notIn: ['cancelled', 'rejected'] }, ...(excludeId ? { id: { not: excludeId } } : {}),
  } });
  return { warehouseId, cutoverDate: dateString(cutoverDate), lines, mismatches,
    activeDocument: activeDocument ? { id: activeDocument.id, openingNo: activeDocument.openingNo } : null,
    canPost: mismatches.length === 0 && !activeDocument };
}

function mismatchError(mismatches) {
  if (mismatches.length) invalid(`Movement กับ StockBalance ไม่ตรง ต้องกระทบยอดก่อน: ${mismatches.slice(0, 8).join('; ')}`, 409);
}

async function submittedItems(tx, doc) {
  const preview = await stockOpeningSnapshot(tx, doc.warehouseId, doc.cutoverDate, doc.id);
  mismatchError(preview.mismatches);
  const bookByProduct = new Map(preview.lines.map(row => [row.productId, milli(row.bookQtyAtCutover)]));
  const provided = new Set(doc.items.map(line => line.productId));
  const missing = preview.lines.filter(line => bookByProduct.get(line.productId) !== 0 && !provided.has(line.productId));
  if (missing.length) invalid(`ต้องระบุจำนวนตรวจนับให้สินค้าที่มียอดตาม Movement ก่อน: ${missing.slice(0, 8).map(line => line.product.code).join(', ')}`, 400);
  const items = doc.items.map(line => {
    const bookQtyAtCutover = bookByProduct.get(line.productId) || 0;
    const countedQty = milli(line.countedQty);
    return { ...line, bookQtyAtCutover: bookQtyAtCutover / 1000, deltaQty: (countedQty - bookQtyAtCutover) / 1000 };
  });
  return { items, preview };
}

async function assertSubmittedBaselineUnchanged(tx, doc) {
  const { items, preview } = await submittedItems(tx, doc);
  for (const line of items) {
    const previous = doc.items.find(item => item.productId === line.productId);
    if (milli(previous.bookQtyAtCutover) !== milli(line.bookQtyAtCutover) ||
        milli(previous.deltaQty) !== milli(line.deltaQty)) invalid('Movement ก่อนวันเริ่มใช้เปลี่ยนหลังส่งอนุมัติ กรุณาส่งกลับให้ตรวจทานใหม่', 409);
  }
  return { items, preview };
}

function assertBalance(balance, ledgerQty, productId) {
  const onHand = balance ? milli(balance.onHand) : 0;
  const reserved = balance ? milli(balance.reserved) : 0;
  const available = balance ? milli(balance.available) : 0;
  if (onHand !== ledgerQty || onHand < reserved || available !== onHand - reserved) {
    invalid(`Movement กับ StockBalance ของสินค้า ${productId} ไม่ตรง ต้องกระทบยอดก่อน`, 409);
  }
  return { onHand, reserved, available };
}

async function postOpening(tx, doc, req) {
  await lockWarehouse(tx, doc.warehouseId);
  const { items } = await assertSubmittedBaselineUnchanged(tx, doc);
  if (await tx.stockMovement.count({ where: { sourceDocType: 'stock_opening_balance', sourceDocId: doc.id } })) {
    invalid('ใบยอดยกมานี้ลง Stock ไปแล้ว ต้องตรวจสอบก่อน', 409);
  }
  const allLedger = await tx.stockMovement.groupBy({ by: ['productId'], where: { warehouseId: doc.warehouseId },
    _sum: { qtyIn: true, qtyOut: true } });
  const ledgerByProduct = new Map(allLedger.map(row => [row.productId, netMilli(row)]));
  for (const line of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const key = { warehouseId: doc.warehouseId, productId: line.productId };
    const balance = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
    const { onHand, reserved } = assertBalance(balance, ledgerByProduct.get(line.productId) || 0, line.productId);
    const delta = milli(line.deltaQty);
    if (!delta) continue;
    if (delta < 0 && onHand - reserved < -delta) invalid(`สินค้า ${line.productSnapshot.code} มียอด available ไม่พอปรับลด โดยห้ามกินยอดจอง`, 409);
    const next = onHand + delta;
    if (!Number.isSafeInteger(next) || next < reserved || next > 999999999999) invalid('ยอด Stock เกินช่วงหรือกระทบยอดจอง', 409);
    await tx.stockMovement.create({ data: { ...key, movementType: 'adjust', qtyIn: delta > 0 ? delta / 1000 : 0,
      qtyOut: delta < 0 ? -delta / 1000 : 0, sourceDocType: 'stock_opening_balance', sourceDocId: doc.id,
      sourceDocNo: doc.openingNo, transactionDate: openingAt(doc.cutoverDate), createdById: req.user.id,
      remark: `ผลต่างยอดยกมา ${doc.openingNo}` } });
    await tx.stockBalance.upsert({ where: { warehouseId_productId: key },
      create: { ...key, onHand: next / 1000, reserved: 0, available: next / 1000 },
      update: { onHand: next / 1000, available: (next - reserved) / 1000 } });
  }
  return items;
}

async function reverseOpening(tx, doc, req, cancellationDate, reason) {
  if (cancellationDate > bangkokToday()) invalid('วันที่ยกเลิกต้องไม่อยู่ในอนาคต', 409);
  await lockWarehouse(tx, doc.warehouseId);
  const allLedger = await tx.stockMovement.groupBy({ by: ['productId'], where: { warehouseId: doc.warehouseId },
    _sum: { qtyIn: true, qtyOut: true } });
  const ledgerByProduct = new Map(allLedger.map(row => [row.productId, netMilli(row)]));
  const originals = await tx.stockMovement.findMany({ where: { sourceDocType: 'stock_opening_balance', sourceDocId: doc.id } });
  const expected = doc.items.filter(line => milli(line.deltaQty) !== 0);
  if (originals.length !== expected.length || await tx.stockMovement.count({
    where: { sourceDocType: 'stock_opening_balance_reversal', sourceDocId: doc.id },
  })) invalid('Movement ต้นฉบับของยอดยกมาไม่ครบหรือกลับรายการแล้ว', 409);
  const latest = localDateStart(cancellationDate);
  for (const line of expected.sort((a, b) => a.productId.localeCompare(b.productId))) {
    const original = originals.find(row => row.productId === line.productId && row.warehouseId === doc.warehouseId);
    const amount = milli(line.deltaQty);
    if (!original || original.reversalRefId ||
        milli(original.qtyIn) !== (amount > 0 ? amount : 0) ||
        milli(original.qtyOut) !== (amount < 0 ? -amount : 0)) invalid('Movement ต้นฉบับไม่ตรงยอดยกมา ต้องตรวจสอบ', 409);
    const events = await tx.stockMovement.findMany({ where: { warehouseId: doc.warehouseId, productId: line.productId } });
    const later = events.some(row => row.id !== original.id &&
      (row.transactionDate > original.transactionDate ||
        (row.transactionDate.getTime() === original.transactionDate.getTime() && row.createdAt > original.createdAt)));
    if (later) invalid(`สินค้า ${line.productSnapshot.code} มี Movement หลังวันเริ่มใช้ จึงยกเลิกยอดยกมาไม่ได้`, 409);
    const key = { warehouseId: doc.warehouseId, productId: line.productId };
    const balance = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
    const { onHand, reserved } = assertBalance(balance, ledgerByProduct.get(line.productId) || 0, line.productId);
    if (reserved) invalid(`สินค้า ${line.productSnapshot.code} มียอดจอง จึงยกเลิกยอดยกมาไม่ได้`, 409);
    const next = onHand - amount;
    if (amount > 0 && onHand - reserved < amount) invalid(`สินค้า ${line.productSnapshot.code} มียอด available ไม่พอกลับรายการ`, 409);
    if (!Number.isSafeInteger(next) || next < reserved || next > 999999999999) invalid('ยอด Stock เกินช่วงหรือกระทบยอดจอง', 409);
    await tx.stockMovement.create({ data: { ...key, movementType: 'reversal', qtyIn: amount < 0 ? -amount / 1000 : 0,
      qtyOut: amount > 0 ? amount / 1000 : 0, sourceDocType: 'stock_opening_balance_reversal', sourceDocId: doc.id,
      sourceDocNo: doc.openingNo, transactionDate: latest, createdById: req.user.id, reversalRefId: original.id, remark: reason } });
    await tx.stockBalance.update({ where: { warehouseId_productId: key },
      data: { onHand: next / 1000, available: (next - reserved) / 1000 } });
  }
}

async function openingAudit(tx, req, action, previous, doc, reason) {
  const normalize = value => value ? JSON.parse(JSON.stringify(value)) : null;
  await require('../lib/auditTrail').recordAuditLog({ entityType: 'stock_opening_balance', entityId: doc.id,
    docNo: doc.openingNo, action, reason, req, oldValue: normalize(previous),
    newValue: normalize({ ...doc, actorSnapshot: { fullName: req.user.fullName } }) }, tx);
}

module.exports = { OPENING_INCLUDE, OPENING_MOVEMENTS, dateOnly, dateString, cutoverStart, openingAt,
  quantityInput, openingInput, lockOpening, lockWarehouse, lockControl, assertNoActiveDuplicate, openingData,
  stockOpeningSnapshot, submittedItems, assertSubmittedBaselineUnchanged, postOpening, reverseOpening, openingAudit };
