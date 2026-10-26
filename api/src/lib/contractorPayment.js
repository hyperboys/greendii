const { invalid, text, moneyCents, documentDate } = require('./deliveryOrder');

const PS_INCLUDE = { items: { orderBy: { seq: 'asc' } } };
const PS_STATUSES = ['draft', 'pending', 'approved', 'returned', 'rejected', 'cancelled'];
const RESERVED = ['pending', 'approved'];
const cents = value => moneyCents(String(value), 'ยอดเงิน');
function boundedText(value, label, required = false, max = 500) {
  const result = text(value, label, required);
  if (result && result.length > max) invalid(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return result;
}
function rate(value, label) {
  const scaled = moneyCents(value, label);
  if (scaled > 10000) invalid(`${label}ต้องอยู่ระหว่าง 0-100%`);
  return scaled;
}
function paymentAmounts(items, vatConfig, whtRate, retentionRate) {
  if (!Array.isArray(items) || !items.length || items.length > 200) invalid('ต้องมีรายการเบิก 1-200 รายการ');
  if (!['VAT7%', 'NO_VAT'].includes(vatConfig)) invalid('รูปแบบ VAT ของ PO ไม่รองรับ');
  const before = items.reduce((sum, item) => {
    const amount = moneyCents(item?.amount, 'จำนวนเงินรายการ');
    if (!amount) invalid('จำนวนเงินรายการต้องมากกว่า 0');
    return sum + amount;
  }, 0);
  if (!Number.isSafeInteger(before) || before > 999999999999) invalid('ยอดรวมเกินช่วงที่รองรับ');
  const vat = vatConfig === 'VAT7%' ? Math.round(before * 7 / 100) : 0;
  const percent = scaled => Number((BigInt(before) * BigInt(scaled) + 5000n) / 10000n);
  const wht = percent(rate(whtRate, 'อัตราหัก ณ ที่จ่าย'));
  const retention = percent(rate(retentionRate, 'อัตราเงินประกัน'));
  const net = before + vat - wht - retention;
  if (net < 0 || before + vat > 999999999999) invalid('ยอดสุทธิไม่ถูกต้อง กรุณาตรวจอัตราหักและยอดรวม');
  return { currentRequestAmount: before / 100, vat: vat / 100, wht: wht / 100, retention: retention / 100, netAmount: net / 100 };
}
function paymentInput(body) {
  if (!body || typeof body !== 'object') invalid('ข้อมูล PS ไม่ถูกต้อง');
  const docDate = documentDate(body.docDate, 'วันที่เอกสาร', true);
  const poId = boundedText(body.poId, 'PO', true, 100);
  const paymentRound = ['string', 'number'].includes(typeof body.paymentRound) && /^\d+$/.test(String(body.paymentRound))
    ? Number(body.paymentRound) : NaN;
  if (!Number.isInteger(paymentRound) || paymentRound < 1 || paymentRound > 999999) invalid('รอบเบิกต้องเป็นจำนวนเต็ม 1-999999');
  const whtRate = rate(body.whtRate === undefined ? 0 : body.whtRate, 'อัตราหัก ณ ที่จ่าย') / 100;
  const retentionRate = rate(body.retentionRate === undefined ? 0 : body.retentionRate, 'อัตราเงินประกัน') / 100;
  paymentAmounts(body.items, 'NO_VAT', 0, 0);
  const items = body.items.map((item, seq) => ({
    seq, desc: boundedText(item.desc, `รายละเอียดรายการ ${seq + 1}`, true),
    amount: moneyCents(item.amount, 'จำนวนเงินรายการ') / 100,
    remark: boundedText(item.remark, 'หมายเหตุรายการ', false, 300),
  }));
  return { docDate, poId, paymentRound, whtRate, retentionRate, remark: boundedText(body.remark, 'หมายเหตุ', false, 1000), items };
}
async function lockPo(tx, id) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { supplier: true } });
  if (!po) invalid('ไม่พบ PO', 404);
  return po;
}
async function lockPayment(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM contractor_payment_requests WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.contractorPaymentRequest.findUnique({ where: { id }, include: PS_INCLUDE });
  if (!doc) invalid('ไม่พบ PS', 404);
  if (doc.lifecycleVersion !== 1) invalid('PS เดิมเป็น Legacy อ่านได้อย่างเดียว ต้องตรวจสอบข้อมูลก่อนย้ายระบบ', 409);
  if (typeof revision !== 'string' || !revision || revision !== doc.updatedAt.toISOString()) {
    invalid('ข้อมูลเปลี่ยนแล้วหรือไม่มี revision กรุณาโหลด PS ใหม่', 409);
  }
  return doc;
}
function eligiblePo(po, previous) {
  if (['cancelled', 'rejected'].includes(po.status)) invalid('PO นี้ใช้เบิกไม่ได้', 409);
  if (!po.supplierId || !po.supplier?.active) invalid('PO ต้องมีผู้รับเหมาที่เปิดใช้งาน', 409);
  if (previous && previous.poId !== po.id) invalid('ไม่สามารถเปลี่ยน PO ของ PS เดิมได้', 409);
  if (previous && previous.supplierId !== po.supplierId) invalid('ผู้รับเหมาของ PO เปลี่ยนแล้ว กรุณายกเลิกและสร้าง PS ใหม่', 409);
  if (!['VAT7%', 'NO_VAT'].includes(po.vatConfig)) invalid('VAT ของ PO ไม่รองรับ', 409);
}
async function usedCapacity(tx, poId, excludeId) {
  const rows = await tx.contractorPaymentRequest.findMany({ where: { poId, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  if (rows.some(row => row.lifecycleVersion !== 1 && !['cancelled', 'rejected'].includes(row.status))) {
    invalid('PO มี PS Legacy ที่ยังไม่ปิด ต้องตรวจสอบยอดและย้ายข้อมูลก่อนเบิกเพิ่ม', 409);
  }
  return rows.filter(row => RESERVED.includes(row.status)).reduce((sum, row) => ({
    before: sum.before + cents(row.currentRequestAmount), vat: sum.vat + cents(row.vat),
    gross: sum.gross + cents(row.currentRequestAmount) + cents(row.vat),
    retention: sum.retention + cents(row.retention),
  }), { before: 0, vat: 0, gross: 0, retention: 0 });
}
function assertCapacity(po, used, amount) {
  const before = cents(po.subTotal) - cents(po.discount);
  if (before < 0 || used.before + cents(amount.currentRequestAmount) > before ||
      used.vat + cents(amount.vat) > cents(po.vat) ||
      used.gross + cents(amount.currentRequestAmount) + cents(amount.vat) > cents(po.netAmount)) {
    invalid('ยอดเบิกสะสมก่อน VAT / VAT / ยอดรวม เกินวงเงิน PO คงเหลือ', 409);
  }
}
async function paymentData(tx, input, po, previous) {
  eligiblePo(po, previous);
  const amounts = paymentAmounts(input.items, po.vatConfig, input.whtRate, input.retentionRate);
  const used = await usedCapacity(tx, po.id, previous?.id);
  assertCapacity(po, used, amounts);
  const duplicate = await tx.contractorPaymentRequest.findFirst({ where: {
    poId: po.id, paymentRound: input.paymentRound, ...(previous ? { id: { not: previous.id } } : {}),
  } });
  if (duplicate) invalid('รอบเบิกนี้มี PS แล้ว รวมใบยกเลิก/ปฏิเสธ กรุณาใช้รอบใหม่', 409);
  return {
    ...input, ...amounts, supplierId: po.supplierId, vatConfig: po.vatConfig,
    poNo: previous?.poNo || po.poNo, poAmount: (cents(po.subTotal) - cents(po.discount)) / 100,
    previouslyRequestedAmount: used.before / 100,
    remainingAmount: (cents(po.subTotal) - cents(po.discount) - used.before - cents(amounts.currentRequestAmount)) / 100,
    previouslyRetainedAmount: used.retention / 100,
    supplierSnapshot: previous?.supplierSnapshot || {
      code: po.supplierSnapshot?.code || po.supplier.code, name: po.supplierSnapshot?.name || po.supplier.name,
      taxId: po.supplierSnapshot?.taxId ?? po.supplier.taxId,
      branch: po.supplierBranch, address: po.address, contactPerson: po.contactPerson,
    },
  };
}
function normalizedSnapshot(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }

module.exports = { PS_INCLUDE, PS_STATUSES, RESERVED, boundedText, paymentAmounts, paymentInput, lockPo, lockPayment,
  eligiblePo, usedCapacity, assertCapacity, paymentData, normalizedSnapshot };
