const { invalid, text, documentDate, moneyCents } = require('./deliveryOrder');
const { lockInvoice } = require('./invoice');
const CREDIT_INCLUDE = {
  customer: { select: { id: true, name: true, code: true } },
  invoice: { select: { id: true, ivNo: true, outstandingAmount: true } },
  items: { orderBy: { seq: 'asc' } },
};
const cents = value => moneyCents(String(value), 'จำนวนเงินต้นทาง');
function bounded(value, label, max, required = false) {
  const result = text(value, label, required);
  if (result && Array.from(result).length > max) invalid(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return result;
}
function eligible(invoice) {
  if (invoice.lifecycleVersion !== 1 || invoice.status !== 'approved') invalid('ลดได้เฉพาะ Invoice ใหม่ที่ยืนยันแล้ว ไม่ใช่ Draft/Legacy/ยกเลิก', 409);
  if (!invoice.customerId) invalid('Invoice ไม่มีลูกค้า กรุณาตรวจข้อมูล', 409);
  if (!['VAT7%', 'NO_VAT'].includes(invoice.vatConfig)) invalid('Invoice ไม่มี VAT ที่รองรับ กรุณาตรวจข้อมูล', 409);
}
async function creditCapacity(tx, invoice, exceptId) {
  const prior = await tx.creditNote.findMany({ where: { invoiceId: invoice.id, status: 'approved',
    ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { amountBeforeVat: true, vat: true, netAmount: true } });
  const used = prior.reduce((sum, row) => ({ before: sum.before + cents(row.amountBeforeVat), vat: sum.vat + cents(row.vat), net: sum.net + cents(row.netAmount) }), { before: 0, vat: 0, net: 0 });
  const original = cents(invoice.netAmount) - cents(invoice.vat);
  if (original < 0 || used.before > original || used.vat > cents(invoice.vat) || used.net > cents(invoice.netAmount)) invalid('ยอด CN สะสมเดิมผิดปกติ กรุณาตรวจข้อมูลก่อนลดหนี้', 409);
  return { original, before: original - used.before, vat: cents(invoice.vat) - used.vat, net: cents(invoice.netAmount) - used.net };
}
async function lockCredit(tx, id, updatedAt) {
  await tx.$queryRaw`SELECT id FROM credit_notes WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.creditNote.findUnique({ where: { id }, include: CREDIT_INCLUDE });
  if (!doc) invalid('ไม่พบใบลดหนี้', 404);
  if (doc.lifecycleVersion !== 1) invalid('CN Legacy อ่านอย่างเดียว ไม่เปลี่ยนยอดย้อนหลัง', 409);
  if (!updatedAt || new Date(updatedAt).getTime() !== new Date(doc.updatedAt).getTime()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลด CN ใหม่', 409);
  return doc;
}
async function creditData(tx, body, previous) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('ข้อมูลใบลดหนี้ไม่ถูกต้อง');
  const invoiceId = text(body.invoiceId, 'Invoice', true);
  if (previous && invoiceId !== previous.invoiceId) invalid('เปลี่ยน Invoice ต้นทางหลังบันทึกไม่ได้ กรุณายกเลิกแล้วสร้างใหม่', 409);
  const invoice = await lockInvoice(tx, invoiceId);
  eligible(invoice);
  const cnDate = documentDate(body.cnDate, 'วันที่ลดหนี้', true);
  if (cnDate < invoice.ivDate) invalid('วันที่ลดหนี้ต้องไม่ก่อนวันที่ Invoice');
  const reason = bounded(body.reason, 'เหตุผลลดหนี้', 500, true);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) invalid('กรุณาระบุรายการลดหนี้ 1–200 รายการ');
  let before = 0, vatSum = 0;
  const items = body.items.map((row, seq) => {
    const qty = ['string', 'number'].includes(typeof row?.qty) ? Number(row.qty) : NaN;
    if (!Number.isInteger(qty) || qty < 1 || qty > 999999999) invalid(`จำนวนรายการ ${seq + 1} ต้องเป็นจำนวนเต็มบวกไม่เกิน 999999999`);
    const price = moneyCents(row.unitPrice, 'ราคาลดต่อหน่วย');
    const amount = qty * price;
    if (!Number.isSafeInteger(amount) || amount > 999999999999 || amount === 0) invalid('ยอดรายการลดหนี้ต้องมากกว่า 0 และอยู่ในช่วงรองรับ');
    // Allocate document-rounded VAT by cumulative difference so line sums equal the header.
    const nextVat = invoice.vatConfig === 'VAT7%' ? Math.round((before + amount) * 7 / 100) : 0;
    const vat = nextVat - vatSum;
    before += amount; vatSum = nextVat;
    return { seq, desc: bounded(row.desc, `รายละเอียด ${seq + 1}`, 500, true),
      partNo: bounded(row.partNo, 'รหัสสินค้า', 100), unit: bounded(row.unit, 'หน่วย', 40, true),
      qty, unitPrice: price / 100, amountBeforeVat: amount / 100, vat: vat / 100, netAmount: (amount + vat) / 100 };
  });
  const capacity = await creditCapacity(tx, invoice, previous?.id);
  if (before + vatSum > 999999999999) invalid('ยอดรวมลดหนี้เกินช่วงรองรับ');
  if (before > capacity.before || vatSum > capacity.vat || before + vatSum > capacity.net) invalid('ยอดลดก่อน VAT/VAT/ยอดรวมสะสมเกิน Invoice กรุณาปรับยอดลดหนี้', 409);
  if (before + vatSum > cents(invoice.outstandingAmount)) invalid('ยอดลดหนี้เกินยอดค้างรับปัจจุบัน ไม่รองรับคืนเงินหรือเครดิตล่วงหน้า', 409);
  return {
    invoiceId, cnDate, reason, customerId: invoice.customerId, customerBranch: invoice.customerBranch,
    customerName: invoice.customerName || invoice.customer?.name, customerCode: invoice.customerCode || invoice.customer?.code,
    address: invoice.address, taxId: invoice.taxId, invoiceNo: invoice.ivNo, invoiceDate: invoice.ivDate, vatConfig: invoice.vatConfig,
    contactPerson: bounded(body.contactPerson, 'ผู้ติดต่อ', 100), remark: bounded(body.remark, 'หมายเหตุ', 1000),
    originalBeforeVat: capacity.original / 100, correctedBeforeVat: (capacity.before - before) / 100,
    amountBeforeVat: before / 100, vat: vatSum / 100, netAmount: (before + vatSum) / 100, items,
  };
}
async function assertCreditConfirmable(tx, invoiceId) {
  if (await tx.billingNoteInvoice.count({ where: { invoiceId, billingNote: { status: { not: 'cancelled' }, completedAt: null } } })) {
    invalid('Invoice อยู่ใน BI ที่ยังไม่ปิด กรุณาจัดการ RV/ยกเลิก BI เดิมก่อนยืนยัน CN', 409);
  }
}
async function assertCreditReversible(tx, doc) {
  const [bill, receipt] = await Promise.all([
    tx.billingNoteInvoice.count({ where: { invoiceId: doc.invoiceId, billingNote: { status: { not: 'cancelled' }, OR: [
      { completedAt: null }, { createdAt: { gte: doc.confirmedAt } }, { updatedAt: { gte: doc.confirmedAt } },
    ] } } }),
    tx.receiptAllocation.count({ where: { invoiceId: doc.invoiceId, receiptVoucher: { status: 'approved', OR: [
      { lifecycleVersion: 1, confirmedAt: { gte: doc.confirmedAt } }, { lifecycleVersion: 0, createdAt: { gte: doc.confirmedAt } },
    ] } } }),
  ]);
  if (bill || receipt) invalid('มี BI ใหม่หรือ RV ยืนยันหลัง CN กรุณาจัดการเอกสารต่อเนื่องก่อนยกเลิก', 409);
}
module.exports = { CREDIT_INCLUDE, creditData, creditCapacity, eligible, lockCredit, assertCreditConfirmable, assertCreditReversible };
