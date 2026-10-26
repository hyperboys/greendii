const test = require('node:test');
const assert = require('node:assert/strict');
require('./contractorPayments.test');
require('./paymentVouchers.test');
require('./chequePayments.test');
const {
  normalizePurchaseOrderItems,
  calculatePurchaseOrderTotals,
  normalizePaymentTerm,
} = require('../src/lib/purchaseOrder');

function validateContractorPaymentLimit(poNetTotal, previouslyRequested, currentRequest) {
  const poTotal = Number(poNetTotal) || 0;
  const prev = Number(previouslyRequested) || 0;
  const curr = Number(currentRequest) || 0;
  const remaining = poTotal - prev;

  if (curr > remaining) {
    throw new Error(`ยอดเบิกครั้งนี้ (฿${curr}) เกินกว่ายอด PO คงเหลือ (฿${remaining})`);
  }
  return true;
}

function validateChequeStateTransition(currentStatus, targetStatus) {
  const validTransitions = {
    Prepared: ['Printed', 'Cancelled'],
    Printed: ['Signed', 'Cancelled'],
    Signed: ['Released', 'Cancelled'],
    Released: ['Cleared', 'Cancelled'],
    Cleared: [],
    Cancelled: [],
  };

  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(`ไม่สามารถเปลี่ยนสถานะเช็คจาก ${currentStatus} เป็น ${targetStatus} ได้`);
  }
  return true;
}

test('Accounts Payable - Contractor Payment Accumulated Limit', () => {
  assert.equal(validateContractorPaymentLimit(100000, 40000, 50000), true);
  assert.throws(
    () => validateContractorPaymentLimit(100000, 60000, 50000),
    /เกินกว่ายอด PO คงเหลือ/,
  );
});

test('Accounts Payable - Cheque State Machine', () => {
  assert.equal(validateChequeStateTransition('Prepared', 'Printed'), true);
  assert.equal(validateChequeStateTransition('Printed', 'Signed'), true);
  assert.throws(
    () => validateChequeStateTransition('Cleared', 'Printed'),
    /ไม่สามารถเปลี่ยนสถานะเช็คจาก Cleared เป็น Printed ได้/,
  );
});

test('Accounts Payable - Purchase Order item validation and totals', () => {
  const items = normalizePurchaseOrderItems([
    { partNo: 'A-001', desc: 'Screws', qty: 1000, unit: 'Pcs', unitPrice: 2.6 },
    { partNo: 'A-001', desc: 'Nuts', qty: 1000, unit: 'Pcs', unitPrice: 0.2 },
    { partNo: 'A-001', desc: 'Washers', qty: 10, unit: 'Kg.', unitPrice: 80 },
    { partNo: 'A-001', desc: 'Bolts', qty: 1000, unit: 'Pcs', unitPrice: 0.82 },
  ]);
  assert.deepEqual(calculatePurchaseOrderTotals(items, 'VAT7%'), {
    subTotal: 4420, discount: 0, vat: 309.4, netAmount: 4729.4,
  });

  const discountedItems = normalizePurchaseOrderItems([
    { desc: 'Item', qty: 2, unitPrice: 100, discount: 10 },
  ]);
  assert.deepEqual(calculatePurchaseOrderTotals(discountedItems, 'NO_VAT'), {
    subTotal: 200, discount: 10, vat: 0, netAmount: 190,
  });
  assert.throws(() => normalizePurchaseOrderItems([{ desc: 'Invalid', qty: 1, unitPrice: 5, discount: 6 }]), {
    status: 400,
  });
  assert.throws(() => normalizePurchaseOrderItems([{ desc: 'Fractional quantity', qty: 1.001, unitPrice: 5 }]), {
    status: 400,
  });
  assert.equal(normalizePaymentTerm(0), 0);
  assert.equal(normalizePaymentTerm(30), 30);
  assert.throws(() => normalizePaymentTerm(-1), { status: 400 });
});
