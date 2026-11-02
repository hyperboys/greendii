/**
 * runningNumber.js — Concurrency-Safe Running Number Service
 *
 * Generates document numbers safely under high concurrency using atomic DB sequence locks.
 * Does NOT use raw MAX + 1 without locking.
 */

const prisma = require('./prisma');
const { BANGKOK_TIME_ZONE } = require('./timezone');

// Configuration patterns for supported document types according to Overview.txt
const DOC_PATTERNS = {
  provisional_delivery_order: { prefix: 'SO', padLen: 5, separator: '-', periodType: 'YYMM' },
  so:                          { prefix: 'SO', padLen: 5, separator: '-', periodType: 'YYMM' },
  invoice:                     { prefix: 'IV', padLen: 4, separator: '',  periodType: 'BEYYMM' },
  iv:                          { prefix: 'IV', padLen: 4, separator: '',  periodType: 'BEYYMM' },
  billing_note:                { prefix: 'BI', padLen: 5, separator: '-', periodType: 'YYMM' },
  bi:                          { prefix: 'BI', padLen: 5, separator: '-', periodType: 'YYMM' },
  credit_note:                 { prefix: 'CN', padLen: 5, separator: '-', periodType: 'YYMM' },
  cn:                          { prefix: 'CN', padLen: 5, separator: '-', periodType: 'YYMM' },
  receipt_voucher:             { prefix: 'RV', padLen: 5, separator: '-', periodType: 'YYMM' },
  rv:                          { prefix: 'RV', padLen: 5, separator: '-', periodType: 'YYMM' },
  purchase_order:              { prefix: 'PO', padLen: 3, separator: '',  periodType: 'YYMM' },
  po:                          { prefix: 'PO', padLen: 3, separator: '',  periodType: 'YYMM' },
  contractor_payment_request:  { prefix: 'PS', padLen: 3, separator: '',  periodType: 'YYMM', suffix: '-R' },
  ps:                          { prefix: 'PS', padLen: 3, separator: '',  periodType: 'YYMM', suffix: '-R' },
  goods_receipt:               { prefix: 'GR', padLen: 4, separator: '',  periodType: 'YYMM' },
  gr:                          { prefix: 'GR', padLen: 4, separator: '',  periodType: 'YYMM' },
  payment_voucher:             { prefix: 'PV', padLen: 4, separator: '',  periodType: 'YYMM' },
  pv:                          { prefix: 'PV', padLen: 4, separator: '',  periodType: 'YYMM' },
  cheque_payment:              { prefix: 'CQ', padLen: 4, separator: '',  periodType: 'YYMM' },
  cq:                          { prefix: 'CQ', padLen: 4, separator: '',  periodType: 'YYMM' },
  stock_issue:                 { prefix: 'IS', padLen: 4, separator: '',  periodType: 'YYMM' },
  is:                          { prefix: 'IS', padLen: 4, separator: '',  periodType: 'YYMM' },
  stock_return:                { prefix: 'SR', padLen: 4, separator: '',  periodType: 'YYMM' },
  sr:                          { prefix: 'SR', padLen: 4, separator: '',  periodType: 'YYMM' },
  stock_opening_balance:       { prefix: 'OB', padLen: 4, separator: '',  periodType: 'YYMM' },
  ob:                          { prefix: 'OB', padLen: 4, separator: '',  periodType: 'YYMM' },
  stock_transfer:              { prefix: 'TR', padLen: 4, separator: '',  periodType: 'YYMM' },
  tr:                          { prefix: 'TR', padLen: 4, separator: '',  periodType: 'YYMM' },
  supplier_bill:               { prefix: 'SB', padLen: 4, separator: '',  periodType: 'YYMM' },
  sb:                          { prefix: 'SB', padLen: 4, separator: '',  periodType: 'YYMM' },
};

/**
 * Extract YYMM string from Date object (Bangkok timezone).
 */
function getYYMM(date = new Date()) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BANGKOK_TIME_ZONE,
    year: '2-digit',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const yy = parts.find(p => p.type === 'year')?.value || '26';
  const mm = parts.find(p => p.type === 'month')?.value || '01';
  return `${yy}${mm}`;
}

function getBEYYMM(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(date));
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = parts.find(p => p.type === 'month')?.value || '01';
  return `${String(year + 543).slice(-2)}${month}`;
}

function getNumberParts(docTypeKey, options = {}) {
  const key = String(docTypeKey || '').trim().toLowerCase();
  const config = DOC_PATTERNS[key];
  if (!config) {
    throw new Error(`ไม่พบรูปแบบเลขที่เอกสารสำหรับประเภท "${docTypeKey}"`);
  }
  const date = options.date || new Date();
  const periodKey = config.periodType === 'BEYYMM'
    ? getBEYYMM(date)
    : config.periodType === 'YYMM' ? getYYMM(date) : 'GLOBAL';
  const prefix = config.prefix + (config.separator ? config.separator : '') + (periodKey !== 'GLOBAL' ? periodKey : '');
  return { key, config, periodKey, prefix, round: options.round != null ? options.round : 1 };
}

function formatRunningNumber(config, periodKey, lastSeq, round) {
  const seqStr = String(lastSeq).padStart(config.padLen, '0');
  if (config.suffix === '-R') return `${config.prefix}${periodKey}${seqStr}-R${round}`;
  if (config.separator) return `${config.prefix}${periodKey}${config.separator}${seqStr}`;
  return `${config.prefix}${periodKey}${seqStr}`;
}

async function previewNextRunningNumber(docTypeKey, options = {}, client = prisma) {
  const { key, config, periodKey, prefix, round } = getNumberParts(docTypeKey, options);
  const sequence = await client.documentSequence.findUnique({
    where: { docType_periodKey_prefix: { docType: key, periodKey, prefix } },
    select: { lastSeq: true },
  });
  return formatRunningNumber(config, periodKey, (sequence?.lastSeq || 0) + 1, round);
}

/**
 * Generate next running number for a document type atomically.
 */
async function generateNextRunningNumber(docTypeKey, options = {}, client = null) {
  const { key, config, periodKey, prefix, round } = getNumberParts(docTypeKey, options);

  const executeAtomicIncrement = async (tx) => {
    // 1. Ensure counter row exists
    await tx.documentSequence.upsert({
      where: {
        docType_periodKey_prefix: {
          docType: key,
          periodKey,
          prefix,
        },
      },
      create: {
        docType: key,
        periodKey,
        prefix,
        lastSeq: 0,
      },
      update: {},
    });

    // 2. Atomic increment
    const updated = await tx.documentSequence.update({
      where: {
        docType_periodKey_prefix: {
          docType: key,
          periodKey,
          prefix,
        },
      },
      data: {
        lastSeq: { increment: 1 },
      },
      select: { lastSeq: true },
    });

    return formatRunningNumber(config, periodKey, updated.lastSeq, round);
  };

  if (client) {
    return executeAtomicIncrement(client);
  }

  return prisma.$transaction(async (tx) => {
    return executeAtomicIncrement(tx);
  });
}

module.exports = {
  DOC_PATTERNS,
  getYYMM,
  getBEYYMM,
  previewNextRunningNumber,
  generateNextRunningNumber,
};
