const { documentDate } = require('./deliveryOrder');
const { quantity } = require('./goodsReceipt');

function reportFilters(query, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const asOfDate = documentDate(query.asOfDate === undefined ? today : query.asOfDate, 'วันที่อ้างอิง', true);
  const from = documentDate(query.from, 'ตั้งแต่วันที่');
  const to = documentDate(query.to, 'ถึงวันที่');
  if (from && to && from > to) {
    throw Object.assign(new Error('ตั้งแต่วันที่ต้องไม่เกินถึงวันที่'), { status: 400 });
  }
  const range = {};
  if (from) range.gte = from;
  if (to) range.lt = new Date(to.getTime() + 86400000);
  return { asOfDate, from, to, range };
}

function agingBuckets(amount, days) {
  return {
    current: days <= 0 ? amount : 0,
    days1To30: days > 0 && days <= 30 ? amount : 0,
    days31To60: days > 30 && days <= 60 ? amount : 0,
    days61To90: days > 60 && days <= 90 ? amount : 0,
    over90Days: days > 90 ? amount : 0,
  };
}

function invoiceIsPosted(invoice) {
  return invoice.status === 'approved' || (invoice.lifecycleVersion !== 1 && invoice.status === 'pending');
}

function poReceiptRow(po) {
  const approved = po.goodsReceipts.filter(gr => gr.status === 'approved');
  const pending = po.goodsReceipts.filter(gr => gr.status === 'pending');
  const active = [...approved, ...pending];
  const reviewReasons = [];
  const ids = new Set(po.items.map(line => line.id));
  if (!po.items.length) reviewReasons.push('PO ไม่มีรายการสำหรับกระทบยอด');
  if (active.some(gr => gr.lifecycleVersion !== 1 || !gr.items.length ||
    gr.items.some(line => !ids.has(line.poLineId)))) {
    reviewReasons.push('GR Legacy หรือรายการ GR ไม่ผูกกับรายการ PO ต้องตรวจสอบข้อมูล');
  }
  const scaled = value => quantity(String(value), 'จำนวนในรายงาน', true);
  const lines = po.items.map(line => {
    const ordered = scaled(line.qty);
    if (!ordered) reviewReasons.push(`รายการ ${line.desc}: จำนวน PO เป็นศูนย์ ต้องตรวจสอบ`);
    const sum = receipts => receipts.reduce((total, gr) => total + gr.items
      .filter(item => item.poLineId === line.id)
      .reduce((qty, item) => qty + scaled(item.currentReceiptQty), 0), 0);
    const received = sum(approved);
    const reserved = sum(pending);
    if (received + reserved > ordered) reviewReasons.push(`รายการ ${line.desc}: จำนวนรับ/รออนุมัติเกิน PO`);
    return {
      poLineId: line.id, desc: line.desc, unit: line.unit,
      orderedQty: ordered / 1000, receivedQty: received / 1000,
      pendingQty: reserved / 1000, remainingQty: (ordered - received) / 1000,
    };
  });
  const receiptState = po.status === 'cancelled' ? 'cancelled'
    : reviewReasons.length ? 'review_required'
      : lines.every(line => line.receivedQty >= line.orderedQty) ? 'complete'
        : lines.some(line => line.receivedQty > 0) ? 'partial' : 'not_received';
  return {
    poNo: po.poNo, poDate: po.poDate,
    supplierName: po.supplierSnapshot?.name || po.supplier?.name || 'N/A',
    status: po.status, goodsReceipts: approved.map(gr => gr.grNo),
    pendingGoodsReceipts: pending.map(gr => gr.grNo),
    cancelledGoodsReceipts: po.goodsReceipts.filter(gr => gr.status === 'cancelled').map(gr => gr.grNo),
    hasReceipt: approved.some(gr => gr.items.some(line => scaled(line.currentReceiptQty) > 0)),
    receiptState, reviewReasons, lines,
  };
}

module.exports = { reportFilters, agingBuckets, invoiceIsPosted, poReceiptRow };
