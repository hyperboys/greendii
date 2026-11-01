const test = require('node:test');
const assert = require('node:assert/strict');
const { cost, allocate, average } = require('../src/lib/stockCost');

test('cost arithmetic is decimal, not master-price valuation; final allocation consumes residual', () => {
  assert.equal(cost('0.123456789012', 'cost').toFixed(12), '0.123456789012');
  assert.equal(allocate('1', '0.333', '1').toFixed(12), '0.333000000000');
  assert.equal(allocate('10.000000000001', '3', '3').toFixed(12), '10.000000000001');
  assert.equal(average('100', '3').toFixed(12), '33.333333333333');
  for (const value of ['', '-1', '1e3', '1.0000000000001', null, NaN]) assert.throws(() => cost(value, 'cost'));
});
