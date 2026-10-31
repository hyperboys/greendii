const { invalid, text, moneyCents, documentDate } = require('./deliveryOrder');
const { lockInvoices } = require('./billingNote');
const { CUSTOMER_INCLUDE, invoiceCustomerDefaults } = require('./accountCustomers');

const RECEIPT_INCLUDE = {
  customer: { select: { id: true, code: true, name: true } },
  allocations: { orderBy: { seq: 'asc' }, include: {
    invoice: { select: { id: true, ivNo: true, outstandingAmount: true } },
    billingNote: { select: { id: true, biNo: true, completedAt: true } },
  } },
  attachments: { select: { id: true, originalName: true, fileUrl: true, mimeType: true, uploadedAt: true }, orderBy: { uploadedAt: 'asc' } },
};
const cents = value => moneyCents(String(value), 'จำนวนเงิน');
const settlement = row => cents(row.receivedAmount) + cents(row.whtAmount) + cents(row.bankFee);
function limited(value, label, max = 300, required = false) {
  const result = text(value, label, required);
  if (result && Array.from(result).length > max) invalid(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return result;
}
async function lockReceipt(tx, id, updatedAt) {
  await tx.$queryRaw`SELECT id FROM receipt_vouchers WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.receiptVoucher.findUnique({ where: { id }, include: RECEIPT_INCLUDE });
  if (!doc) invalid('ไม่พบใบสำคัญรับ', 404);
  if (doc.lifecycleVersion !== 1) invalid('RV เดิมเป็น Legacy อ่านอย่างเดียว กรุณาตรวจยอดก่อนย้ายวงจร', 409);
  if (!updatedAt || new Date(updatedAt).getTime() !== new Date(doc.updatedAt).getTime()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลด RV ใหม่', 409);
  return doc;
}
async function billingPaid(tx, billingNoteId, invoiceId) {
  const rows = await tx.receiptAllocation.findMany({ where: { billingNoteId, ...(invoiceId ? { invoiceId } : {}),
    receiptVoucher: { lifecycleVersion: 1, status: 'approved' } }, select: { receivedAmount: true, whtAmount: true, bankFee: true } });
  return rows.reduce((sum, row) => sum + settlement(row), 0);
}
async function currentBilling(tx, invoiceId) {
  const rows = await tx.billingNoteInvoice.findMany({ where: { invoiceId, billingNote: { status: { not: 'cancelled' }, completedAt: null } },
    include: { billingNote: true } });
  if (rows.length > 1) invalid('Invoice มี BI active ซ้ำ กรุณาตรวจข้อมูลก่อนรับเงิน', 409);
  const link = rows[0];
  if (link && (link.billingNote.lifecycleVersion !== 1 || link.billingNote.status !== 'approved')) {
    invalid('Invoice อยู่ใน BI Draft/Legacy กรุณายืนยันหรือยกเลิก BI ก่อนรับชำระ', 409);
  }
  return link || null;
}
async function receiptData(tx, body, previous, strictLinks = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('ข้อมูล RV ไม่ถูกต้อง');
  const customerId = text(body.customerId, 'ลูกค้า', true);
  const receiptDate = documentDate(body.receiptDate, 'วันที่รับชำระ', true);
  const paymentMethod = body.paymentMethod;
  if (!['cash', 'transfer', 'cheque'].includes(paymentMethod)) invalid('วิธีรับเงินต้องเป็นเงินสด โอนเงิน หรือเช็ค');
  const bankName = limited(body.bankName, 'ธนาคาร', 100, paymentMethod !== 'cash');
  const refNo = limited(body.refNo, 'เลขอ้างอิงโอน', 100, paymentMethod === 'transfer');
  const chequeNo = paymentMethod === 'cheque' ? limited(body.chequeNo, 'เลขที่เช็ค', 100, true) : null;
  const chequeDate = paymentMethod === 'cheque' ? documentDate(body.chequeDate, 'วันที่บนเช็ค', true) : null;
  const whtCertificateNo = limited(body.whtCertificateNo, 'เลขหนังสือรับรองหัก ณ ที่จ่าย', 100);
  if (!Array.isArray(body.allocations) || !body.allocations.length || body.allocations.length > 200) invalid('ต้องมี Invoice อย่างน้อย 1 ใบ ไม่เกิน 200 ใบ');
  const ids = body.allocations.map(row => text(row?.invoiceId, 'Invoice', true));
  if (new Set(ids).size !== ids.length) invalid('Invoice รับชำระซ้ำ');
  const initialLinks = [];
  for (const id of ids) initialLinks.push(await currentBilling(tx, id));
  const initialBiIds = [...new Set(initialLinks.filter(Boolean).map(row => row.billingNoteId))];
  const bills = initialBiIds.length ? await tx.billingNote.findMany({ where: { id: { in: initialBiIds } }, include: { invoices: true } }) : [];
  // Include sibling invoices so BI completion/reversal and re-billing serialize.
  const invoices = await lockInvoices(tx, [...ids, ...bills.flatMap(bill => bill.invoices.map(row => row.invoiceId))]);
  const links = [];
  for (const id of ids) links.push(await currentBilling(tx, id));
  if (links.some((row, index) => (row?.billingNoteId || null) !== (initialLinks[index]?.billingNoteId || null))) {
    invalid('BI ต้นทางเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลใหม่', 409);
  }
  const biIds = [...new Set(links.filter(Boolean).map(row => row.billingNoteId))].sort();
  for (const id of biIds) await tx.$queryRaw`SELECT id FROM billing_notes WHERE id = ${id} FOR UPDATE`;
  const customer = await tx.accountCustomer.findUnique({ where: { id: customerId }, include: CUSTOMER_INCLUDE });
  const defaults = invoiceCustomerDefaults(customer, body);
  const allocations = [];
  let received = 0, wht = 0, fee = 0;
  for (const [seq, row] of body.allocations.entries()) {
    const invoice = invoices.get(ids[seq]);
    if (invoice.lifecycleVersion !== 1 || invoice.status !== 'approved') invalid('รับได้เฉพาะ Invoice ใหม่ที่ยืนยันแล้ว ไม่ใช่ Legacy/Draft/ยกเลิก', 409);
    if (invoice.customerId !== customerId) invalid('Invoice ไม่ใช่ของลูกค้าที่เลือก');
    const r = moneyCents(row.receivedAmount, 'เงินเข้าสุทธิ');
    const w = moneyCents(row.whtAmount ?? 0, 'WHT');
    const f = moneyCents(row.bankFee ?? 0, 'ค่าธรรมเนียม');
    const total = r + w + f;
    if (!total || total > cents(invoice.outstandingAmount)) invalid('ยอดลดหนี้ต้องมากกว่า 0 และไม่เกินค้างรับปัจจุบัน');
    const link = links[seq];
    const requestedBi = text(row.billingNoteId, 'BI');
    if ((strictLinks && requestedBi !== (link?.billingNoteId || null)) || (requestedBi && requestedBi !== link?.billingNoteId)) {
      invalid('BI ต้นทางเปลี่ยนไป กรุณาเปิดแก้ไขและทบทวน RV ก่อนยืนยัน', 409);
    }
    if (link) {
      const remaining = cents(link.billingAmount) - await billingPaid(tx, link.billingNoteId, invoice.id);
      if (total > remaining) invalid('ยอดลดหนี้เกินส่วนวางบิลที่ยังไม่รับชำระ', 409);
    }
    received += r; wht += w; fee += f;
    allocations.push({ seq, invoiceId: invoice.id, billingNoteId: link?.billingNoteId || null,
      receivedAmount: r / 100, whtAmount: w / 100, bankFee: f / 100,
      invoiceNo: invoice.ivNo, invoiceDate: invoice.ivDate, invoiceNetAmount: invoice.netAmount, outstandingBefore: invoice.outstandingAmount });
  }
  if (received + wht + fee > 999999999999) invalid('ยอดรวมเกินช่วงรองรับ');
  if (wht && !whtCertificateNo) invalid('กรุณาระบุเลขหนังสือรับรองหัก ณ ที่จ่ายเมื่อมี WHT');
  return { receiptDate, customerId, paymentMethod, bankName: paymentMethod !== 'cash' ? bankName : null, chequeNo, chequeDate,
    refNo: paymentMethod === 'transfer' ? refNo : null, whtCertificateNo: wht ? whtCertificateNo : null,
    customerName: limited(previous?.customerId === customerId ? previous.customerName : customer.name, 'ชื่อลูกค้า', 200),
    customerCode: limited(previous?.customerId === customerId ? previous.customerCode : customer.code, 'รหัสลูกค้า', 60),
    customerBranch: limited(defaults.customerBranch, 'สาขา', 100), address: limited(defaults.address, 'ที่อยู่', 500),
    taxId: limited(defaults.taxId, 'เลขผู้เสียภาษี', 40), remark: limited(body.remark, 'หมายเหตุ', 1000),
    totalReceived: received / 100, whtAmount: wht / 100, bankFee: fee / 100, allocations };
}
async function refreshBilling(tx, ids, req, recordAuditLog) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) {
    const doc = await tx.billingNote.findUnique({ where: { id }, include: { invoices: true } });
    const paid = await billingPaid(tx, id);
    const complete = paid === cents(doc.totalAmount);
    if (paid > cents(doc.totalAmount)) invalid('ยอดรับชำระ BI ผิดปกติ กรุณาตรวจสอบ', 409);
    if (complete !== Boolean(doc.completedAt)) {
      const result = await tx.billingNote.update({ where: { id }, data: { completedAt: complete ? new Date() : null } });
      await recordAuditLog({ entityType: 'billing_note', entityId: id, docNo: doc.biNo, action: complete ? 'complete' : 'reopen',
        oldValue: doc, newValue: result, req }, tx);
    }
  }
}
async function reverseReceipt(tx, doc) {
  const ids = [...new Set(doc.allocations.map(row => row.billingNoteId).filter(Boolean))].sort();
  const bills = ids.length ? await tx.billingNote.findMany({ where: { id: { in: ids } }, include: { invoices: true } }) : [];
  const invoices = await lockInvoices(tx, [...doc.allocations.map(row => row.invoiceId), ...bills.flatMap(bill => bill.invoices.map(row => row.invoiceId))]);
  for (const id of ids) await tx.$queryRaw`SELECT id FROM billing_notes WHERE id = ${id} FOR UPDATE`;
  for (const id of ids) {
    const bill = await tx.billingNote.findUnique({ where: { id }, include: { invoices: true } });
    if (bill.status !== 'approved') invalid('BI ต้นทางไม่ได้ยืนยัน กรุณาตรวจสอบก่อนกลับยอด', 409);
    if (bill.completedAt) {
      const newer = await tx.billingNoteInvoice.count({ where: {
        invoiceId: { in: bill.invoices.map(row => row.invoiceId) }, billingNoteId: { not: id },
        billingNote: { status: { not: 'cancelled' }, createdAt: { gte: bill.completedAt } },
      } });
      if (newer) invalid('มี BI ใหม่หลังปิด BI ต้นทาง ต้องยกเลิก BI ใหม่นั้นก่อนยกเลิก RV', 409);
    }
  }
  for (const row of doc.allocations) {
    const invoice = invoices.get(row.invoiceId);
    if (invoice.status !== 'approved' || invoice.lifecycleVersion !== 1) invalid('Invoice ต้นทางไม่พร้อมกลับยอด', 409);
    const restored = cents(invoice.outstandingAmount) + settlement(row);
    if (restored > cents(invoice.netAmount)) invalid('กลับยอดแล้วเกินยอด Invoice กรุณาตรวจข้อมูล', 409);
    await tx.invoice.update({ where: { id: invoice.id }, data: { outstandingAmount: restored / 100 } });
  }
  return ids;
}
module.exports = { RECEIPT_INCLUDE, receiptData, lockReceipt, billingPaid, currentBilling, refreshBilling, reverseReceipt, settlement };
