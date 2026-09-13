const test = require('node:test');
const assert = require('node:assert/strict');

function calculateDueDate(invoiceDate, creditTerm) {
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + (parseInt(creditTerm, 10) || 30));
  return d;
}

function calculateInvoiceTotals(items = [], lineDiscount = 0, documentDiscount = 0, vatRate = 0.07) {
  const subTotal = items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitPrice)), 0);
  const afterDiscount = Math.max(0, subTotal - lineDiscount - documentDiscount);
  const vat = Number((afterDiscount * vatRate).toFixed(2));
  const netAmount = Number((afterDiscount + vat).toFixed(2));
  return { subTotal, afterDiscount, vat, netAmount };
}

function validateCreditNoteLimit(invoiceOutstanding, requestedCreditNoteAmount) {
  const outstanding = Number(invoiceOutstanding) || 0;
  const cnAmount = Number(requestedCreditNoteAmount) || 0;
  if (cnAmount > outstanding) {
    throw new Error(`ยอดใบลดหนี้ (฿${cnAmount}) เกินกว่ายอดลูกหนี้คงค้าง (฿${outstanding})`);
  }
  return true;
}

test('Accounts Receivable - Due Date Calculation', () => {
  const ivDate = new Date('2026-09-01T00:00:00Z');
  const dueDate = calculateDueDate(ivDate, 30);
  assert.equal(dueDate.toISOString().slice(0, 10), '2026-10-01');
});

test('Accounts Receivable - Invoice Totals & VAT Calculation', () => {
  const items = [
    { qty: 2, unitPrice: 1000 },
    { qty: 1, unitPrice: 500 },
  ];
  const totals = calculateInvoiceTotals(items, 100, 0, 0.07);
  assert.equal(totals.subTotal, 2500);
  assert.equal(totals.afterDiscount, 2400);
  assert.equal(totals.vat, 168);
  assert.equal(totals.netAmount, 2568);
});

test('Accounts Receivable - Credit Note Outstanding Limit', () => {
  assert.equal(validateCreditNoteLimit(1000, 500), true);
  assert.throws(
    () => validateCreditNoteLimit(500, 600),
    /เกินกว่ายอดลูกหนี้คงค้าง/,
  );
});
