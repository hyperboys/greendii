const test = require('node:test');
const assert = require('node:assert/strict');

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
