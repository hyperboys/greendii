const { invalid, moneyCents } = require('./deliveryOrder');
const cents = value => moneyCents(String(value), 'ยอดจองระหว่างรออนุมัติ');

// Call while holding the Invoice row lock; pending documents reserve, never post.
async function reservedSettlement(tx, invoiceId, except = {}) {
  const [receipts, credits] = await Promise.all([
    tx.receiptAllocation.findMany({ where: { invoiceId,
      ...(except.rv ? { receiptVoucherId: { not: except.rv } } : {}),
      receiptVoucher: { lifecycleVersion: 1, status: 'pending' } },
    select: { receivedAmount: true, whtAmount: true, bankFee: true } }),
    tx.creditNote.findMany({ where: { invoiceId, lifecycleVersion: 1, status: 'pending',
      ...(except.cn ? { id: { not: except.cn } } : {}) },
    select: { netAmount: true } }),
  ]);
  const total = receipts.reduce((sum, row) => sum + cents(row.receivedAmount) + cents(row.whtAmount) + cents(row.bankFee), 0)
    + credits.reduce((sum, row) => sum + cents(row.netAmount), 0);
  if (!Number.isSafeInteger(total)) invalid('ยอดจองเกินช่วงรองรับ', 409);
  return total;
}

async function assertAvailableSettlement(tx, invoice, amount, except) {
  const reserved = await reservedSettlement(tx, invoice.id, except);
  if (amount > cents(invoice.outstandingAmount) - reserved) {
    invalid('ยอดค้างรับถูกจองโดย RV/CN ที่รออนุมัติ กรุณาทบทวนเอกสาร', 409);
  }
}

module.exports = { reservedSettlement, assertAvailableSettlement };
