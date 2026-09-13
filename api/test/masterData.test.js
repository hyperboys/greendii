const test = require('node:test');
const assert = require('node:assert/strict');

function calculateAvailableQuantity(onHand, reserved) {
  const oh = Number(onHand) || 0;
  const res = Number(reserved) || 0;
  return Math.max(0, oh - res);
}

function canProductAffectStock(productType) {
  const type = String(productType || '').toLowerCase();
  return type === 'stored' || type === 'manufactured';
}

test('Master Data - Warehouse Stock Calculation Formula', () => {
  assert.equal(calculateAvailableQuantity(100, 20), 80);
  assert.equal(calculateAvailableQuantity(50, 50), 0);
  assert.equal(calculateAvailableQuantity(10, 15), 0); // No negative available stock by default
});

test('Master Data - Product Type Stock Rule', () => {
  assert.equal(canProductAffectStock('stored'), true);
  assert.equal(canProductAffectStock('manufactured'), true);
  assert.equal(canProductAffectStock('service'), false);
});
