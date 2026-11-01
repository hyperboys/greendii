const { invalid, moneyCents, documentDate } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');

const DAY = 86400000;
const BILL_STATUSES = ['draft', 'confirmed', 'cancelled'];
const VAT_RATES = { VAT7: 7, NO_VAT: 0 };
const PAID_VOUCHER_SELECT = { id: true, pvNo: true, pvDate: true, status: true, lifecycleVersion: true, supplierId: true,
  paidAt: true, reversedAt: true, netPayment: true, wht: true };
const BILL_INCLUDE = {
  items: { orderBy: { seq: 'asc' } },
  settlements: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { paymentVoucher: { select: PAID_VOUCHER_SELECT } } },
};

const cents = (value, label = 'ยอดเงิน') => moneyCents(value != null && typeof value === 'object' ? value.toString() : value, label);
const decimal = value => (value / 100).toFixed(2);
const amount = value => Number(decimal(value));

function documentKey(value) {
  return value ? value.normalize('NFKC').replace(/\s+/g, '').toUpperCase() : null;
}
function vatCents(subTotal, vatMode) {
  return Math.floor((subTotal * VAT_RATES[vatMode] + 50) / 100);
}
function addDays(date, days) { return new Date(date.getTime() + days * DAY); }
function creditTerm(value, label = 'เครดิต (วัน)') {
  if (value === undefined || value === null || value === '') return null;
  const days = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isInteger(days) || days < 0 || days > 365) invalid(`${label}ต้องเป็นจำนวนเต็ม 0-365`);
  return days;
}
function revisionOf(body) {
  const revision = body?.revision;
  if (!Number.isInteger(revision) || revision < 1) invalid('กรุณาส่ง revision ของใบแจ้งหนี้ผู้ขาย', 409);
  return revision;
}

function billInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('ข้อมูลใบแจ้งหนี้ผู้ขายไม่ถูกต้อง');
  const supplierInvoiceNo = boundedText(body.supplierInvoiceNo, 'เลขที่ใบแจ้งหนี้ผู้ขาย', true, 100);
  const taxInvoiceNo = boundedText(body.taxInvoiceNo, 'เลขที่ใบกำกับภาษี', false, 100);
  const supplierInvoiceDate = documentDate(body.supplierInvoiceDate, 'วันที่ใบแจ้งหนี้ผู้ขาย', true);
  const taxInvoiceDate = documentDate(body.taxInvoiceDate, 'วันที่ใบกำกับภาษี');
  if (Boolean(taxInvoiceNo) !== Boolean(taxInvoiceDate)) invalid('ต้องระบุเลขที่และวันที่ใบกำกับภาษีคู่กัน');
  if (typeof body.vatMode !== 'string' || !Object.hasOwn(VAT_RATES, body.vatMode)) invalid('รูปแบบ VAT ไม่ถูกต้อง');
  if (body.vatMode === 'VAT7' && !taxInvoiceNo) invalid('บิลที่มี VAT ต้องระบุเลขที่/วันที่ใบกำกับภาษี');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) invalid('ต้องมีรายการ 1-200 รายการ');
  const items = body.items.map((item, index) => {
    if (!item || typeof item !== 'object') invalid(`รายการที่ ${index + 1} ไม่ถูกต้อง`);
    const value = cents(item.amount, `จำนวนเงินรายการที่ ${index + 1} `);
    if (!value) invalid(`จำนวนเงินรายการที่ ${index + 1} ต้องมากกว่า 0`);
    return { desc: boundedText(item.desc, `รายละเอียดรายการที่ ${index + 1}`, true, 500), amountCents: value };
  });
  return {
    supplierId: boundedText(body.supplierId, 'ผู้ขาย', true, 100), supplierInvoiceNo, supplierInvoiceDate,
    taxInvoiceNo, taxInvoiceDate, vatMode: body.vatMode, creditTermDays: creditTerm(body.creditTermDays),
    dueDate: documentDate(body.dueDate, 'วันครบกำหนด'), items,
    reference: boundedText(body.reference, 'อ้างอิง (PO/GR)', false, 200), remark: boundedText(body.remark, 'หมายเหตุ', false, 1000),
  };
}

function billTotals(items, vatMode) {
  const subTotal = items.reduce((sum, item) => sum + item.amountCents, 0);
  const vat = vatCents(subTotal, vatMode), net = subTotal + vat;
  if (!subTotal || net > 999999999999) invalid('ยอดรวมใบแจ้งหนี้ผู้ขายไม่อยู่ในช่วงที่รองรับ');
  return { subTotal, vat, net };
}

async function billData(tx, input) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier || !supplier.active) invalid('ผู้ขายไม่มีอยู่หรือถูกปิดใช้งาน');
  const creditTermDays = input.creditTermDays ?? creditTerm(supplier.paymentTerm ?? 0, 'เครดิตของผู้ขาย');
  const computedDue = addDays(input.supplierInvoiceDate, creditTermDays);
  const dueDate = input.dueDate || computedDue;
  if (dueDate < input.supplierInvoiceDate) invalid('วันครบกำหนดต้องไม่ก่อนวันที่ใบแจ้งหนี้ผู้ขาย');
  const totals = billTotals(input.items, input.vatMode);
  return {
    supplierId: supplier.id,
    supplierSnapshot: { id: supplier.id, code: supplier.code, name: supplier.name, taxId: supplier.taxId || null,
      branch: supplier.branch || null, address: supplier.billingAddress || supplier.address || null },
    supplierInvoiceNo: input.supplierInvoiceNo, supplierInvoiceNoKey: documentKey(input.supplierInvoiceNo),
    supplierInvoiceDate: input.supplierInvoiceDate, taxInvoiceNo: input.taxInvoiceNo, taxInvoiceNoKey: documentKey(input.taxInvoiceNo),
    taxInvoiceDate: input.taxInvoiceDate, creditTermDays, dueDate, dueDateManual: dueDate.getTime() !== computedDue.getTime(),
    vatMode: input.vatMode, subTotal: decimal(totals.subTotal), vat: decimal(totals.vat), netAmount: decimal(totals.net),
    reference: input.reference, remark: input.remark,
    items: input.items.map((item, seq) => ({ seq, desc: item.desc, amount: decimal(item.amountCents) })),
  };
}

async function assertNoDuplicate(tx, data, excludeId) {
  const base = { supplierId: data.supplierId, status: { not: 'cancelled' }, ...(excludeId ? { id: { not: excludeId } } : {}) };
  const sameInvoice = await tx.supplierBill.findFirst({ where: { ...base, supplierInvoiceNoKey: data.supplierInvoiceNoKey }, select: { billNo: true } });
  if (sameInvoice) invalid(`เลขที่ใบแจ้งหนี้ผู้ขายนี้ถูกบันทึกแล้วใน ${sameInvoice.billNo}`, 409);
  if (data.taxInvoiceNoKey) {
    const sameTax = await tx.supplierBill.findFirst({ where: { ...base, taxInvoiceNoKey: data.taxInvoiceNoKey }, select: { billNo: true } });
    if (sameTax) invalid(`เลขที่ใบกำกับภาษีนี้ถูกบันทึกแล้วใน ${sameTax.billNo}`, 409);
  }
}

// A PV settles AP only while it is a managed, actually paid voucher that is not cancelled/reversed.
function voucherPaid(pv, paidBefore) {
  return Boolean(pv && pv.lifecycleVersion === 1 && pv.status === 'approved' && pv.paidAt && !pv.reversedAt &&
    (!paidBefore || new Date(pv.paidAt) < paidBefore));
}
// Settlement value of a PV = cash paid + WHT withheld on the supplier's behalf; retention stays owed.
function voucherCapacity(pv) { return cents(pv.netPayment, 'ยอดจ่าย PV') + cents(pv.wht, 'ภาษีหัก ณ ที่จ่าย PV'); }

function billBalances(bill, paidBefore) {
  const net = cents(bill.netAmount);
  let settled = 0, ineffective = 0;
  for (const settlement of bill.settlements || []) {
    if (settlement.status !== 'active') continue;
    const value = cents(settlement.amount);
    if (voucherPaid(settlement.paymentVoucher, paidBefore)) settled += value;
    else if (!voucherPaid(settlement.paymentVoucher)) ineffective += value;
  }
  return { net, settled, outstanding: net - settled, ineffective };
}

function presentBill(bill) {
  if (!bill) return bill;
  const { net, settled, outstanding, ineffective } = billBalances(bill);
  return {
    ...bill,
    subTotal: amount(cents(bill.subTotal)), vat: amount(cents(bill.vat)), netAmount: amount(net),
    items: (bill.items || []).map(item => ({ ...item, amount: amount(cents(item.amount)) })),
    settlements: (bill.settlements || []).map(settlement => ({
      ...settlement, amount: amount(cents(settlement.amount)),
      effective: settlement.status === 'active' && voucherPaid(settlement.paymentVoucher),
      paymentVoucher: settlement.paymentVoucher && { ...settlement.paymentVoucher,
        netPayment: amount(cents(settlement.paymentVoucher.netPayment)), wht: amount(cents(settlement.paymentVoucher.wht)) },
    })),
    settledAmount: amount(settled), outstandingAmount: amount(outstanding), ineffectiveSettlementAmount: amount(ineffective),
    paymentState: bill.status !== 'confirmed' ? null : outstanding <= 0 ? 'paid' : settled > 0 ? 'partial' : 'unpaid',
  };
}

function apBillAgingRow(bill, asOfDate, agingBuckets) {
  const end = new Date(asOfDate.getTime() + DAY);
  const { net, settled, outstanding } = billBalances(bill, end);
  if (outstanding <= 0) return null;
  const due = new Date(bill.dueDate);
  const diffDays = Math.floor((asOfDate.getTime() - Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())) / DAY);
  const partnerName = bill.supplierSnapshot?.name || 'N/A';
  return {
    documentNo: bill.billNo, documentDate: bill.supplierInvoiceDate, partnerName, dueDate: bill.dueDate,
    supplierInvoiceNo: bill.supplierInvoiceNo, taxInvoiceNo: bill.taxInvoiceNo || null,
    netAmount: amount(net), settledAmount: amount(settled), outstandingAmount: amount(outstanding), diffDays,
    ...agingBuckets(amount(outstanding), diffDays),
  };
}

async function lockBill(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM supplier_bills WHERE id = ${id} FOR UPDATE`;
  const bill = await tx.supplierBill.findUnique({ where: { id }, include: BILL_INCLUDE });
  if (!bill) invalid('ไม่พบใบแจ้งหนี้ผู้ขาย', 404);
  if (revision !== undefined && revision !== bill.revision) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใบแจ้งหนี้ผู้ขายใหม่', 409);
  return bill;
}
// Lock order for every bill/PV operation: payment_vouchers (ascending id) first, then supplier_bills.
async function lockVouchers(tx, ids) {
  const vouchers = new Map();
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM payment_vouchers WHERE id = ${id} FOR UPDATE`;
    const pv = await tx.paymentVoucher.findUnique({ where: { id }, select: { ...PAID_VOUCHER_SELECT,
      supplierBillSettlements: { where: { status: 'active' }, select: { id: true, billId: true, amount: true } } } });
    if (!pv) invalid('ไม่พบ PV', 404);
    vouchers.set(id, pv);
  }
  return vouchers;
}

async function billAudit(tx, req, action, previous, result, reason) {
  const { recordAuditLog } = require('./auditTrail');
  return recordAuditLog({ entityType: 'supplier_bill', entityId: result.id, docNo: result.billNo, action,
    oldValue: normalizedSnapshot(previous && presentBill(previous)), newValue: normalizedSnapshot(presentBill(result)), reason, req }, tx);
}

function conflictError(error) {
  if (error?.code === 'P2002') {
    return Object.assign(new Error('ข้อมูลซ้ำ: เลขที่ใบแจ้งหนี้/ใบกำกับภาษีของผู้ขายนี้ หรือรายการตัดชำระนี้ถูกบันทึกแล้ว'), { status: 409 });
  }
  return error;
}

module.exports = { DAY, BILL_STATUSES, VAT_RATES, BILL_INCLUDE, cents, decimal, amount, documentKey, vatCents, addDays, creditTerm,
  revisionOf, billInput, billTotals, billData, assertNoDuplicate, voucherPaid, voucherCapacity, billBalances, presentBill,
  apBillAgingRow, lockBill, lockVouchers, billAudit, conflictError };