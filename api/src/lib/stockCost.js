const { Decimal: PrismaDecimal } = require('@prisma/client/runtime/library');
const Decimal = PrismaDecimal.clone({ precision: 80 });
const { randomUUID } = require('crypto');
const { invalid } = require('./deliveryOrder');
const { boundedText } = require('./contractorPayment');

const D = value => new Decimal(String(value));
const fixed = value => D(value).toFixed(12, Decimal.ROUND_HALF_UP);
function cost(value, label = 'ต้นทุน') {
  if (!['string', 'number'].includes(typeof value) || !/^(0|[1-9]\d{0,25})(\.\d{1,12})?$/.test(String(value))) {
    invalid(`${label}ต้องระบุชัดเจน ไม่ติดลบ ทศนิยมไม่เกิน 12 หลัก`);
  }
  return D(value);
}
function allocate(value, amount, quantity) {
  if (D(quantity).lte(0) || D(amount).gt(quantity) || D(amount).lt(0)) invalid('จำนวนจัดสรรต้นทุนไม่ถูกต้อง', 409);
  return D(amount).eq(quantity) ? D(value) : D(fixed(D(value).mul(amount).div(quantity)));
}
const average = (value, quantity) => D(quantity).eq(0) ? D(0) : D(fixed(D(value).div(quantity)));
function receiptCostInput(line) {
  if (line.unitCost === undefined || line.unitCost === null || line.unitCost === '') return { unitCost: null, costEvidence: null };
  return { unitCost: fixed(cost(line.unitCost)), costEvidence: boundedText(line.costEvidence, 'ที่มา/นโยบายต้นทุนรับเข้า', true, 1000) };
}
async function valuation(tx, key, balance) {
  await tx.$queryRaw`SELECT id FROM stock_valuations WHERE warehouse_id = ${key.warehouseId} AND product_id = ${key.productId} FOR UPDATE`;
  const state = await tx.stockValuation.findUnique({ where: { warehouseId_productId: key } });
  if (state && !D(state.quantity).eq(balance?.onHand || 0)) invalid('ยอดจำนวนกับฐานต้นทุนไม่ตรง ต้องกระทบยอดก่อน', 409);
  return state;
}

// The caller holds the warehouse lock and updates quantity and cost in the same transaction.
// Unknown historical stock is never assigned a master price or a zero value.
async function movementCost(tx, { key, balance, quantityIn = 0, quantityOut = 0, date, inboundValue, provenance, original, reversal = false }) {
  const state = await valuation(tx, key, balance);
  const beforeQty = D(balance?.onHand || 0), nextQty = beforeQty.add(quantityIn).sub(quantityOut);
  if (nextQty.lt(0)) invalid('Stock ติดลบไม่ได้', 409);
  const initialized = state?.status === 'valued';
  if (state?.lastDate && date < state.lastDate && initialized) invalid('ต้นทุน: ไม่รองรับรายการย้อนหลังหลังฐานต้นทุน ต้องตรวจคำนวณประวัติใหม่ก่อน', 409);
  if (reversal && initialized && (!original || state.lastMovementId !== original.id || original.costStatus !== 'valued')) {
    invalid('ต้นทุน: กลับได้เฉพาะ Movement ล่าสุดที่มีต้นทุนชัดเจน ไม่คำนวณประวัติย้อนหลังอัตโนมัติ', 409);
  }
  let valueIn = null, valueOut = null, nextValue = null;
  let status = initialized || (beforeQty.eq(0) && !reversal && inboundValue != null) ? 'valued' : 'unvalued';
  if (reversal && original?.costStatus === 'valued') {
    if (!initialized) invalid('ฐานต้นทุนของรายการกลับไม่พร้อม ต้องตรวจสอบ', 409);
    valueIn = D(original.valueOut || 0); valueOut = D(original.valueIn || 0);
  } else if (status === 'valued') {
    if (D(quantityIn).gt(0)) {
      if (inboundValue == null) {
        if (initialized) invalid('ต้นทุนรับเข้าไม่ระบุ ห้ามเปลี่ยน Moving Average โดยเดาต้นทุน', 409);
        status = 'unvalued';
      } else valueIn = D(inboundValue);
    } else valueIn = D(0);
    valueOut = D(quantityOut).gt(0) ? allocate(state?.totalValue || 0, quantityOut, beforeQty) : D(0);
  }
  if (status === 'valued') {
    nextValue = D(state?.totalValue || 0).add(valueIn).sub(valueOut);
    if (nextValue.lt(0) || (nextQty.eq(0) && !nextValue.eq(0))) invalid('ต้นทุนคงเหลือไม่สอดคล้องจำนวน ต้องตรวจสอบ', 409);
    if (nextValue.gte('1e26')) invalid('มูลค่าต้นทุนเกินช่วงที่รองรับ', 409);
  } else {
    valueIn = reversal ? (original?.valueOut == null ? null : D(original.valueOut)) : (inboundValue == null ? null : D(inboundValue));
    valueOut = reversal && original?.valueIn != null ? D(original.valueIn) : null;
  }
  const id = randomUUID(), source = reversal ? { type: 'reversal', movementId: original.id, original: original.costProvenance }
    : provenance || { type: 'moving_average', previousMovementId: state?.lastMovementId || null };
  const data = { status, quantity: nextQty.toFixed(3), totalValue: nextValue == null ? null : fixed(nextValue),
    lastMovementId: id, lastDate: state?.lastDate && state.lastDate > date ? state.lastDate : date,
    provenance: status === 'valued' ? source : { type: 'unvalued', reason: 'Historical/opening or inbound cost is not verified', supplied: source } };
  await tx.stockValuation.upsert({ where: { warehouseId_productId: key },
    create: { ...key, ...data, revision: 1 }, update: { ...data, revision: { increment: 1 } } });
  return { id, costStatus: status, valueIn: valueIn == null ? null : fixed(valueIn), valueOut: valueOut == null ? null : fixed(valueOut),
    balanceValue: nextValue == null ? null : fixed(nextValue), averageCost: nextValue == null ? null : fixed(average(nextValue, nextQty)),
    costProvenance: data.provenance };
}
module.exports = { D, fixed, cost, allocate, average, receiptCostInput, valuation, movementCost };
