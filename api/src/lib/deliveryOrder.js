const { CUSTOMER_INCLUDE } = require('./accountCustomers');

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function text(value, label, required = false) {
  if (value != null && typeof value !== 'string') invalid(`${label} ไม่ถูกต้อง`);
  const result = value?.trim() || null;
  if (required && !result) invalid(`กรุณาระบุ${label}`);
  return result;
}

function documentDate(value, label, required = false) {
  const date = text(value, label, required);
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date || Number(date.slice(0, 4)) < 1900) {
    invalid(`${label}ไม่ถูกต้อง กรุณาใช้วันที่ที่มีอยู่จริง`);
  }
  return parsed;
}

function moneyCents(value, label) {
  if (!['string', 'number'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    invalid(`${label}ต้องเป็นจำนวนเงินไม่ติดลบ ไม่เกิน 2 ตำแหน่ง`);
  }
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents > 999999999999) invalid(`${label}เกินช่วงจำนวนเงินที่รองรับ`);
  return cents;
}

const DELIVERY_ORDER_INCLUDE = {
  customer: { select: { id: true, code: true, name: true } },
  workOrder: { select: { id: true, woNo: true, project: true } },
  items: { orderBy: { seq: 'asc' }, include: { product: { select: { code: true } } } },
};

async function deliveryOrderData(tx, body) {
  if (!body || typeof body !== 'object') invalid('ข้อมูลใบส่งของไม่ถูกต้อง');
  const docDate = documentDate(body.docDate, 'วันที่เอกสาร', true);
  const deliveryDate = documentDate(body.deliveryDate, 'วันที่กำหนดส่ง');
  const customerId = text(body.customerId, 'ลูกค้า', true);
  const customer = await tx.accountCustomer.findUnique({ where: { id: customerId }, include: CUSTOMER_INCLUDE });
  if (!customer?.active) invalid('ไม่พบลูกค้าที่เปิดใช้งาน');
  const branchId = text(body.customerBranchId, 'สาขาลูกค้า');
  const branch = branchId ? customer.branches.find(item => item.id === branchId) : null;
  if (branchId && !branch) invalid('สาขาไม่ใช่ของลูกค้าที่เลือก');
  const creditValue = body.creditTerm === undefined ? customer.creditTerm ?? 30 : body.creditTerm;
  const creditTerm = ['string', 'number'].includes(typeof creditValue) && String(creditValue).trim() ? Number(creditValue) : NaN;
  if (!Number.isInteger(creditTerm) || creditTerm < 0 || creditTerm > 2147483647) invalid('จำนวนวันเครดิตไม่ถูกต้อง');
  const vatConfig = body.vatConfig === undefined ? customer.vatConfig || 'VAT7%' : body.vatConfig;
  if (!['VAT7%', 'NO_VAT'].includes(vatConfig)) invalid('การตั้งค่า VAT ไม่ถูกต้อง');
  const workOrderId = text(body.workOrderId, 'Work Order');
  if (workOrderId) {
    const workOrder = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { active: true, status: true } });
    if (!workOrder?.active || workOrder.status === 'cancelled') invalid('ไม่พบ Work Order ที่ใช้งานได้');
  }
  if (!Array.isArray(body.items) || !body.items.length) invalid('ต้องมีรายการสินค้าอย่างน้อย 1 รายการ');
  const items = body.items.map((item, seq) => {
    const qty = ['number', 'string'].includes(typeof item?.qty) ? Number(item.qty) : NaN;
    if (!Number.isInteger(qty) || qty <= 0 || qty > 999999999) invalid(`จำนวนรายการที่ ${seq + 1} ต้องเป็นจำนวนเต็มบวกไม่เกิน 999999999`);
    const price = moneyCents(item.unitPrice === undefined ? 0 : item.unitPrice, `ราคาต่อหน่วยรายการที่ ${seq + 1}`);
    const discount = moneyCents(item.discount === undefined ? 0 : item.discount, `ส่วนลดรายการที่ ${seq + 1}`);
    const gross = price * qty;
    if (!Number.isSafeInteger(gross) || gross > 999999999999) invalid(`ยอดรายการที่ ${seq + 1} เกินช่วงจำนวนเงินที่รองรับ`);
    if (discount > gross) invalid(`ส่วนลดรายการที่ ${seq + 1} เกินยอดรายการ`);
    return {
      seq, productId: text(item.productId, 'สินค้า'),
      partNo: text(item.partNo, 'รหัสสินค้า'),
      desc: text(item.desc, `รายละเอียดรายการที่ ${seq + 1}`, true),
      unit: text(item.unit, `หน่วยรายการที่ ${seq + 1}`, true),
      qty, unitPrice: price / 100, discount: discount / 100, amount: (gross - discount) / 100,
      remark: text(item.remark, 'หมายเหตุรายการ'),
    };
  });
  const productIds = [...new Set(items.map(item => item.productId).filter(Boolean))];
  if (productIds.length) {
    const products = await tx.accountProduct.findMany({ where: { id: { in: productIds }, active: true }, select: { id: true, code: true } });
    if (productIds.some(id => !products.some(product => product.id === id))) invalid('มีสินค้าที่ไม่พบหรือปิดใช้งาน กรุณาเลือกสินค้าใหม่');
    items.forEach(item => { if (item.productId && !item.partNo) item.partNo = products.find(product => product.id === item.productId).code; });
  }
  const subTotalCents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const discountCents = moneyCents(body.discount === undefined ? 0 : body.discount, 'ส่วนลดท้ายเอกสาร');
  if (!Number.isSafeInteger(subTotalCents) || subTotalCents > 999999999999) invalid('ยอดรวมเกินช่วงจำนวนเงินที่รองรับ');
  if (discountCents > subTotalCents) invalid('ส่วนลดท้ายเอกสารเกินยอดรวมหลังหักส่วนลดรายการ');
  const taxable = subTotalCents - discountCents;
  const vatCents = vatConfig === 'NO_VAT' ? 0 : Math.round(taxable * 7 / 100);
  if (taxable + vatCents > 999999999999) invalid('ยอดสุทธิเกินช่วงจำนวนเงินที่รองรับ');
  return {
    docDate, customerId, customerBranch: branch?.name || text(body.customerBranch, 'สาขา') || customer.branch || 'สำนักงานใหญ่',
    customerTel: text(body.customerTel === undefined ? branch?.tel ?? customer.tel : body.customerTel, 'โทรศัพท์ลูกค้า'),
    customerFax: text(body.customerFax === undefined ? branch?.fax ?? customer.fax : body.customerFax, 'โทรสารลูกค้า'),
    deliveryDate, creditTerm, vatConfig,
    subTotal: subTotalCents / 100, discount: discountCents / 100, vat: vatCents / 100, netAmount: (taxable + vatCents) / 100,
    shippingAddress: text(body.shippingAddress, 'ที่อยู่จัดส่ง'), receiver: text(body.receiver, 'ผู้รับสินค้า'),
    workOrderId, remark: text(body.remark, 'หมายเหตุ'), items,
  };
}

async function lockDeliveryOrder(tx, id) {
  // Invoice creation and SO edits/cancellation use the same row lock.
  await tx.$queryRaw`SELECT id FROM provisional_delivery_orders WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.provisionalDeliveryOrder.findUnique({ where: { id }, include: DELIVERY_ORDER_INCLUDE });
  if (!doc) invalid('ไม่พบใบส่งของชั่วคราว', 404);
  return doc;
}

async function assertNoDeliveryInvoices(tx, id) {
  if (await tx.invoice.count({ where: { provisionalDeliveryOrderId: id, status: { not: 'cancelled' } } })) {
    invalid('มี Invoice ที่ยังไม่ยกเลิกอ้างอิงใบส่งของนี้ ไม่สามารถแก้ไขหรือยกเลิกได้', 409);
  }
}

module.exports = { DELIVERY_ORDER_INCLUDE, deliveryOrderData, lockDeliveryOrder, assertNoDeliveryInvoices, invalid, text, moneyCents };
