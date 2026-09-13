const test = require('node:test');
const assert = require('node:assert/strict');
const { getYYMM, DOC_PATTERNS } = require('../src/lib/runningNumber');

test('Running Number - Pattern Metadata & Date Formatting', () => {
  const date = new Date('2026-09-13T10:00:00Z');
  const yymm = getYYMM(date);
  assert.equal(yymm, '2609');

  assert.equal(DOC_PATTERNS.so.prefix, 'SO');
  assert.equal(DOC_PATTERNS.so.padLen, 5);
  assert.equal(DOC_PATTERNS.iv.prefix, 'IV');
  assert.equal(DOC_PATTERNS.iv.padLen, 4);
  assert.equal(DOC_PATTERNS.bi.prefix, 'BI');
  assert.equal(DOC_PATTERNS.cn.prefix, 'CN');
  assert.equal(DOC_PATTERNS.rv.prefix, 'RV');
  assert.equal(DOC_PATTERNS.po.prefix, 'PO');
  assert.equal(DOC_PATTERNS.ps.prefix, 'PS');
  assert.equal(DOC_PATTERNS.gr.prefix, 'GR');
  assert.equal(DOC_PATTERNS.pv.prefix, 'PV');
  assert.equal(DOC_PATTERNS.cq.prefix, 'CQ');
});
