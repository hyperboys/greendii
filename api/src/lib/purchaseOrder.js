function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizePurchaseOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('ต้องมีรายการสั่งซื้ออย่างน้อย 1 รายการ'), { status: 400 });
  }

  return items.map((item, index) => {
    const qty = Number(item?.qty);
    const unitPrice = Number(item?.unitPrice);
    const discount = Number(item?.discount || 0);
    const grossAmount = qty * unitPrice;
    if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0
      || !Number.isFinite(grossAmount) || !Number.isFinite(discount) || discount < 0 || discount > grossAmount) {
      throw Object.assign(new Error(`ข้อมูลจำนวน ราคา หรือส่วนลดในรายการที่ ${index + 1} ไม่ถูกต้อง`), { status: 400 });
    }

    return {
      seq: index,
      partNo: String(item?.partNo || '').trim() || null,
      productId: item?.productId || null,
      desc: String(item?.desc || '').trim(),
      qty,
      unit: String(item?.unit || '').trim(),
      unitPrice,
      discount,
      amount: roundMoney(grossAmount - discount),
      remark: String(item?.remark || '').trim() || null,
    };
  });
}

function calculatePurchaseOrderTotals(items, vatConfig) {
  const subTotal = roundMoney(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const discount = roundMoney(items.reduce((sum, item) => sum + item.discount, 0));
  const taxableAmount = roundMoney(subTotal - discount);
  const vat = vatConfig === 'NO_VAT' ? 0 : roundMoney(taxableAmount * 0.07);
  return { subTotal, discount, vat, netAmount: roundMoney(taxableAmount + vat) };
}

function normalizePaymentTerm(value) {
  const paymentTerm = Number(value);
  if (!Number.isInteger(paymentTerm) || paymentTerm < 0) {
    throw Object.assign(new Error('จำนวนวันเครดิต/เงื่อนไขชำระไม่ถูกต้อง'), { status: 400 });
  }
  return paymentTerm;
}

module.exports = { normalizePurchaseOrderItems, calculatePurchaseOrderTotals, normalizePaymentTerm };
