const { invalid, text, documentDate, moneyCents } = require('./deliveryOrder');
const { lockInvoice } = require('./invoice');
const { CUSTOMER_INCLUDE, invoiceCustomerDefaults } = require('./accountCustomers');

const BILLING_INCLUDE = {
  customer: { select: { id: true, code: true, name: true } },
  invoices: { orderBy: { seq: 'asc' }, include: { invoice: { select: {
    id: true, ivNo: true, ivDate: true, dueDate: true, netAmount: true, outstandingAmount: true, status: true,
  } } } },
};
function bounded(value, label, max, required = false) {
  const result = text(value, label, required);
  if (result && Array.from(result).length > max) invalid(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return result;
}
function assertBillable(invoice, customerId) {
  if (invoice.lifecycleVersion !== 1 || invoice.status !== 'approved' || Number(invoice.outstandingAmount) <= 0) {
    invalid(`Invoice ${invoice.ivNo} ต้องยืนยันแล้วและมียอดค้างรับ (Legacy ต้องตรวจย้ายข้อมูลก่อน)`, 409);
  }
  if (invoice.customerId !== customerId) invalid(`Invoice ${invoice.ivNo} ไม่ใช่ของลูกค้าที่เลือก`);
}
async function lockInvoices(tx, ids) {
  const rows = new Map();
  for (const id of [...new Set(ids)].sort()) rows.set(id, await lockInvoice(tx, id));
  return rows;
}
async function assertNoOtherBilling(tx, invoiceId, exceptId) {
  const other = await tx.billingNoteInvoice.count({ where: {
    invoiceId, ...(exceptId ? { billingNoteId: { not: exceptId } } : {}),
    billingNote: { status: { not: 'cancelled' }, completedAt: null },
  } });
  if (other) invalid('Invoice มีใบวางบิลที่ยังไม่ยกเลิกแล้ว กรุณายกเลิกใบเดิมก่อนออกใหม่', 409);
}
async function lockBillingNote(tx, id, updatedAt, additionalIds = []) {
  const before = await tx.billingNote.findUnique({ where: { id }, include: BILLING_INCLUDE });
  if (!before) invalid('ไม่พบใบวางบิล', 404);
  if (before.lifecycleVersion !== 1) invalid('ใบวางบิลเดิมเป็น Legacy อ่านได้อย่างเดียว กรุณาตรวจข้อมูลก่อนย้ายวงจร', 409);
  // All BI/RV writers lock sorted Invoice rows before BI rows.
  await lockInvoices(tx, [...before.invoices.map(row => row.invoiceId), ...additionalIds]);
  await tx.$queryRaw`SELECT id FROM billing_notes WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.billingNote.findUnique({ where: { id }, include: BILLING_INCLUDE });
  if (!doc) invalid('ไม่พบใบวางบิล', 404);
  if (doc.lifecycleVersion !== 1) invalid('ใบวางบิลเดิมเป็น Legacy อ่านได้อย่างเดียว กรุณาตรวจข้อมูลก่อนย้ายวงจร', 409);
  if (!updatedAt || new Date(updatedAt).getTime() !== new Date(doc.updatedAt).getTime()) invalid('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใบวางบิลใหม่', 409);
  return doc;
}
async function assertNoLaterSettlement(tx, doc) {
  const ids = doc.invoices.map(row => row.invoiceId);
  const [receipt, credit] = await Promise.all([
    tx.receiptAllocation.count({ where: { invoiceId: { in: ids }, receiptVoucher: { status: 'approved' },
      OR: [{ billingNoteId: doc.id }, { receiptVoucher: { OR: [
        { lifecycleVersion: 1, confirmedAt: { gte: doc.createdAt } },
        { lifecycleVersion: 0, createdAt: { gte: doc.createdAt } },
      ] } }],
    } }),
    tx.creditNote.count({ where: { invoiceId: { in: ids }, status: 'approved', OR: [
      { lifecycleVersion: 1, confirmedAt: { gte: doc.createdAt } }, { lifecycleVersion: 0, createdAt: { gte: doc.createdAt } },
    ] } }),
  ]);
  if (receipt || credit) invalid('มีรับชำระ/ลดหนี้ที่มีผลหลังจัดทำใบวางบิล ไม่สามารถแก้ไขหรือยกเลิกได้', 409);
}
async function billingData(tx, body, previous) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('ข้อมูลใบวางบิลไม่ถูกต้อง');
  const customerId = text(body.customerId, 'ลูกค้า', true);
  const billingDate = documentDate(body.billingDate, 'วันที่วางบิล', true);
  const expectedPaymentDate = documentDate(body.expectedPaymentDate, 'วันที่นัดชำระ');
  if (expectedPaymentDate && expectedPaymentDate < billingDate) invalid('วันที่นัดชำระต้องไม่ก่อนวันที่วางบิล');
  if (!Array.isArray(body.invoices) || !body.invoices.length || body.invoices.length > 200) invalid('เลือก Invoice อย่างน้อย 1 ใบ ไม่เกิน 200 ใบ');
  const ids = body.invoices.map(row => text(row?.invoiceId, 'Invoice', true));
  if (new Set(ids).size !== ids.length) invalid('รายการ Invoice ซ้ำ');
  const locked = await lockInvoices(tx, [...ids, ...(previous?.invoices.map(row => row.invoiceId) || [])]);
  if (previous) await assertNoLaterSettlement(tx, previous);
  const customer = await tx.accountCustomer.findUnique({ where: { id: customerId }, include: CUSTOMER_INCLUDE });
  const defaults = invoiceCustomerDefaults(customer, body);
  let total = 0;
  const invoices = [];
  for (const [seq, row] of body.invoices.entries()) {
    const invoice = locked.get(ids[seq]);
    assertBillable(invoice, customerId);
    await assertNoOtherBilling(tx, invoice.id, previous?.id);
    const cents = moneyCents(row.billingAmount, 'ยอดวางบิล');
    if (!cents || cents > moneyCents(String(invoice.outstandingAmount), 'ยอดคงค้าง')) invalid('ยอดวางบิลต้องมากกว่า 0 และไม่เกินยอดค้างรับปัจจุบัน');
    total += cents;
    invoices.push({
      seq, invoiceId: invoice.id, outstandingAmount: invoice.outstandingAmount, billingAmount: cents / 100,
      invoiceNo: invoice.ivNo, invoiceDate: invoice.ivDate, invoiceDueDate: invoice.dueDate, invoiceNetAmount: invoice.netAmount,
    });
  }
  if (total > 999999999999) invalid('ยอดวางบิลรวมเกินช่วงที่รองรับ');
  return {
    customerId, billingDate, expectedPaymentDate,
    customerName: bounded(previous?.customerId === customerId ? previous.customerName : customer.name, 'ชื่อลูกค้า', 200),
    customerCode: bounded(previous?.customerId === customerId ? previous.customerCode : customer.code, 'รหัสลูกค้า', 60),
    customerBranch: bounded(defaults.customerBranch, 'สาขา', 100),
    address: bounded(defaults.address, 'ที่อยู่', 500), taxId: bounded(defaults.taxId, 'เลขผู้เสียภาษี', 40),
    contactPerson: bounded(body.contactPerson, 'ผู้ติดต่อ', 100), paymentTerms: bounded(body.paymentTerms, 'เงื่อนไขการชำระ', 300),
    remark: bounded(body.remark, 'หมายเหตุ', 1000), totalAmount: total / 100, invoices,
  };
}
module.exports = { BILLING_INCLUDE, billingData, lockBillingNote, lockInvoices, assertBillable, assertNoOtherBilling, assertNoLaterSettlement };
