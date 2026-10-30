const { deliveryOrderData, lockDeliveryOrder, invalid, text } = require('./deliveryOrder');
const { CUSTOMER_INCLUDE, invoiceCustomerDefaults } = require('./accountCustomers');

const INVOICE_INCLUDE = {
  customer: { select: { id: true, code: true, name: true } },
  provisionalDeliveryOrder: { select: { id: true, soNo: true } },
  workOrder: { select: { id: true, woNo: true, project: true } },
  items: { orderBy: { seq: 'asc' } },
};

async function lockInvoice(tx, id) {
  if (typeof id !== 'string' || !id.trim()) invalid('กรุณาระบุ Invoice');
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  if (!doc) invalid('ไม่พบ Invoice', 404);
  return doc;
}

function assertPostedInvoice(doc) {
  if (doc.status === 'cancelled' || (doc.lifecycleVersion === 1 && doc.status !== 'approved')) {
    invalid('Invoice ยังไม่ยืนยันหรือยกเลิกแล้ว ไม่สามารถวางบิล/รับชำระ/ลดหนี้ได้', 409);
  }
}

async function assertNoInvoiceDependents(tx, id) {
  const [bi, rv, cn] = await Promise.all([
    tx.billingNoteInvoice.count({ where: { invoiceId: id, billingNote: { status: { not: 'cancelled' } } } }),
    tx.receiptAllocation.count({ where: { invoiceId: id, receiptVoucher: { status: { not: 'cancelled' } } } }),
    tx.creditNote.count({ where: { invoiceId: id, status: { not: 'cancelled' } } }),
  ]);
  if (bi || rv || cn) invalid('มี BI/RV/CN ที่ยังไม่ยกเลิกอ้างอิง ไม่สามารถดำเนินการได้', 409);
}

function assertInvoiceVersion(doc, updatedAt) {
  if (doc.lifecycleVersion !== 1) invalid('เอกสารเดิมเป็น Legacy กรุณาตรวจยอด/สถานะก่อนย้ายเข้าวงจรใหม่', 409);
  if (!updatedAt || new Date(updatedAt).getTime() !== new Date(doc.updatedAt).getTime()) {
    invalid('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดเอกสารใหม่', 409);
  }
}

async function invoiceData(tx, body, previous = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('ข้อมูล Invoice ไม่ถูกต้อง');
  const sourceId = text(body.provisionalDeliveryOrderId, 'SO');
  if (previous && sourceId !== previous.provisionalDeliveryOrderId) invalid('ไม่สามารถเปลี่ยน SO อ้างอิงหลังบันทึก กรุณายกเลิกแล้วสร้างใหม่', 409);
  let input = body;
  if (sourceId) {
    const source = await lockDeliveryOrder(tx, sourceId);
    if (source.status === 'cancelled') invalid('SO ถูกยกเลิกแล้ว', 409);
    if (body.customerId !== source.customerId) invalid('SO และ Invoice ต้องเป็นลูกค้าเดียวกัน');
    if (await tx.invoice.count({ where: {
      provisionalDeliveryOrderId: sourceId, status: { not: 'cancelled' }, ...(previous ? { id: { not: previous.id } } : {}),
    } })) invalid('SO นี้มี Invoice ที่ยังไม่ยกเลิกแล้ว', 409);
    // SO values are defaults; Invoice edits are validated and totals recomputed below.
    input = {
      customerBranchId: null, customerBranch: source.customerBranch,
      shippingAddress: source.shippingAddress, workOrderId: source.workOrderId,
      creditTerm: source.creditTerm, vatConfig: source.vatConfig, discount: source.discount,
      items: source.items.map(item => ({ ...item, unitPrice: String(item.unitPrice), discount: String(item.discount) })),
      ...body,
    };
  }
  const customer = await tx.accountCustomer.findUnique({ where: { id: input.customerId }, include: CUSTOMER_INCLUDE });
  const defaults = invoiceCustomerDefaults(customer, sourceId ? {
    ...input, customerBranch: undefined,
    customerBranchId: input.customerBranchId || customer?.branches?.find(branch => branch.name === input.customerBranch)?.id,
  } : input);
  const data = await deliveryOrderData(tx, { ...defaults, ...input, docDate: body.ivDate,
    items: Array.isArray(input.items) ? input.items.map(item => ({ ...item, discount: item?.discount ?? item?.lineDiscount ?? 0 })) : input.items });
  const dueDate = new Date(data.docDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + data.creditTerm);
  if (Number.isNaN(dueDate.getTime()) || dueDate.getUTCFullYear() > 9999) invalid('วันครบกำหนดเกินช่วงวันที่ที่รองรับ');
  return {
    ivDate: data.docDate, customerId: data.customerId, customerBranch: data.customerBranch,
    customerName: previous?.customerId === data.customerId ? previous.customerName : customer.name,
    customerCode: previous?.customerId === data.customerId ? previous.customerCode : customer.code,
    taxId: text(defaults.taxId, 'เลขผู้เสียภาษี'),
    address: text(defaults.address, 'ที่อยู่ออกบิล'),
    responsibleSaleId: defaults.responsibleSaleId, responsibleSaleName: defaults.responsibleSaleName,
    shippingAddress: data.shippingAddress, creditTerm: data.creditTerm, dueDate, vatConfig: data.vatConfig,
    workOrderId: data.workOrderId, provisionalDeliveryOrderId: sourceId,
    customerPoNo: text(body.customerPoNo, 'เลข PO ลูกค้า'), remark: data.remark,
    subTotal: data.subTotal, discount: data.discount, vat: data.vat, netAmount: data.netAmount,
    items: data.items.map(({ discount, ...item }) => ({ ...item, lineDiscount: discount, vat: 0 })),
  };
}

module.exports = { INVOICE_INCLUDE, lockInvoice, assertPostedInvoice, assertNoInvoiceDependents, assertInvoiceVersion, invoiceData };
