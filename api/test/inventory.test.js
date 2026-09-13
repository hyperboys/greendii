const test = require('node:test');
const assert = require('node:assert/strict');

function processPartialStockIssue(requestedQty, issuedQty) {
  const req = Number(requestedQty) || 0;
  const iss = Number(issuedQty) || 0;
  const cancelled = Math.max(0, req - iss);
  return { requestedQty: req, issuedQty: iss, cancelledQty: cancelled };
}

function validateStockReturnLimit(issuedQty, previouslyReturnedQty, currentReturnQty) {
  const issued = Number(issuedQty) || 0;
  const prevRet = Number(previouslyReturnedQty) || 0;
  const currRet = Number(currentReturnQty) || 0;
  const maxReturnable = issued - prevRet;

  if (currRet > maxReturnable) {
    throw new Error(`จำนวนสินค้าที่คืน (${currRet}) เกินกว่าจำนวนที่เบิกคงเหลือ (${maxReturnable})`);
  }
  return true;
}

test('Inventory - Partial Stock Issue & Cancellation', () => {
  const result = processPartialStockIssue(10, 5);
  assert.equal(result.requestedQty, 10);
  assert.equal(result.issuedQty, 5);
  assert.equal(result.cancelledQty, 5);
});

test('Inventory - Stock Return Limit Validation', () => {
  assert.equal(validateStockReturnLimit(10, 2, 5), true);
  assert.throws(
    () => validateStockReturnLimit(10, 7, 5),
    /เกินกว่าจำนวนที่เบิกคงเหลือ/,
  );
});
