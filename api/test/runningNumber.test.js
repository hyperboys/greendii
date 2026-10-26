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
  assert.equal(DOC_PATTERNS.pv.padLen, 4);
  assert.equal(DOC_PATTERNS.cq.prefix, 'CQ');
});

for (const [type, prefix] of [['pv', 'PV'], ['cq', 'CQ']]) test(`${prefix} running number restarts monthly in Gregorian YYMM and never reuses issued sequence`, async () => {
  const { generateNextRunningNumber } = require('../src/lib/runningNumber');
  const sequences = new Map();
  const tx = { documentSequence: {
    upsert: async ({ where }) => { if (!sequences.has(where.docType_periodKey_prefix.periodKey)) sequences.set(where.docType_periodKey_prefix.periodKey, 0); },
    update: async ({ where }) => {
      const key = where.docType_periodKey_prefix.periodKey, lastSeq = sequences.get(key) + 1; sequences.set(key, lastSeq); return { lastSeq };
    },
  } };
  assert.equal(await generateNextRunningNumber(type, { date: new Date('2026-10-26') }, tx), `${prefix}26100001`);
  assert.equal(await generateNextRunningNumber(type, { date: new Date('2026-10-27') }, tx), `${prefix}26100002`);
  assert.equal(await generateNextRunningNumber(type, { date: new Date('2026-11-01') }, tx), `${prefix}26110001`);
  assert.equal(await generateNextRunningNumber(type, { date: new Date('2026-10-28') }, tx), `${prefix}26100003`);
});
