const { invalid, moneyCents, documentDate } = require('./deliveryOrder');
const { boundedText, lockPo, normalizedSnapshot } = require('./contractorPayment');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');

const VOUCHER_INCLUDE = {
  items: { orderBy: { seq: 'asc' } },
  attachments: { orderBy: { uploadedAt: 'asc' } },
  chequePayments: { orderBy: { createdAt: 'asc' } },
};
const ACTIVE_VOUCHER = { notIn: ['cancelled', 'rejected'] };
function voucherAmounts(source) {
  const values = [source.currentRequestAmount, source.vat, source.wht, source.retention, source.netAmount].map(value => moneyCents(String(value), 'ยอด PS'));
  const [before, vat, wht, retention, net] = values;
  if (!before || before + vat - wht - retention !== net) invalid('ยอด PS ไม่สอดคล้องกัน ต้องตรวจเอกสารต้นทาง', 409);
  return { amountBeforeTax: before / 100, vat: vat / 100, wht: wht / 100, otherDeduction: retention / 100, netPayment: net / 100 };
}
function voucherInput(body) {
  if (!body || typeof body !== 'object') invalid('ข้อมูล PV ไม่ถูกต้อง');
  if (body.sourceDocType !== undefined && body.sourceDocType !== 'ps') invalid('PV ระยะนี้ใช้ PS เท่านั้น');
  const pvDate = documentDate(body.pvDate, 'วันที่ PV', true);
  const sourceDocId = boundedText(body.sourceDocId, 'PS', true, 100);
  if (!['cash', 'transfer', 'cheque'].includes(body.paymentMethod)) invalid('วิธีจ่ายไม่ถูกต้อง');
  const taxpayerType = boundedText(body.taxpayerType, 'ประเภทผู้ถูกหัก');
  if (taxpayerType && !['individual', 'company'].includes(taxpayerType)) invalid('ประเภทผู้ถูกหักไม่ถูกต้อง');
  return { pvDate, sourceDocId, sourceDocType: 'ps', paymentMethod: body.paymentMethod, taxpayerType,
    taxDescription: boundedText(body.taxDescription, 'รายละเอียด/อ้างอิงภาษี', false, 500),
    remark: boundedText(body.remark, 'หมายเหตุ', false, 1000) };
}
async function lockVoucher(tx, id, revision, requireRevision = true) {
  await tx.$queryRaw`SELECT id FROM payment_vouchers WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.paymentVoucher.findUnique({ where: { id }, include: VOUCHER_INCLUDE });
  if (!doc) invalid('ไม่พบ PV', 404);
  if (doc.lifecycleVersion !== 1) invalid('PV Legacy อ่านอย่างเดียว ต้องตรวจย้ายข้อมูลก่อนใช้งาน', 409);
  if (requireRevision && (typeof revision !== 'string' || revision !== doc.updatedAt.toISOString())) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลด PV ใหม่', 409);
  return doc;
}
async function lockVoucherSource(tx, id) {
  await tx.$queryRaw`SELECT id FROM contractor_payment_requests WHERE id = ${id} FOR UPDATE`;
  const source = await tx.contractorPaymentRequest.findUnique({ where: { id }, include: { items: { orderBy: { seq: 'asc' } } } });
  if (!source || source.lifecycleVersion !== 1 || source.status !== 'approved') invalid('ใช้ได้เฉพาะ PS ใหม่ที่อนุมัติแล้ว', 409);
  await lockPo(tx, source.poId);
  return source;
}
async function assertSourceAvailable(tx, source, previous) {
  if (previous && previous.sourceDocId !== source.id) invalid('ไม่สามารถเปลี่ยน PS ของ PV เดิมได้', 409);
  const count = await tx.paymentVoucher.count({ where: { sourceDocType: 'ps', sourceDocId: source.id, status: ACTIVE_VOUCHER,
    ...(previous ? { id: { not: previous.id } } : {}) } });
  if (count) invalid('PS มี PV ที่ยังใช้งานอยู่แล้ว รวม Draft/Legacy กรุณาตรวจเอกสารเดิม', 409);
}
async function voucherData(tx, input, source, previous) {
  if (previous && input.sourceDocId !== previous.sourceDocId) invalid('ไม่สามารถเปลี่ยน PS ของ PV เดิมได้', 409);
  await assertSourceAvailable(tx, source, previous);
  const amounts = voucherAmounts(source);
  if (input.pvDate < source.docDate) invalid('วันที่ PV ต้องไม่ก่อนวันที่ PS');
  if (!source.supplierId || !source.supplierSnapshot) invalid('PS ไม่มีผู้รับเหมา/snapshot ที่ครบถ้วน', 409);
  return { ...input, ...amounts, contractorPaymentRequestId: source.id, supplierId: source.supplierId, sourceNo: source.psNo, sourceDate: source.docDate,
    poNo: source.poNo, supplierSnapshot: previous?.supplierSnapshot || source.supplierSnapshot,
    items: source.items.map((item, seq) => ({ seq, desc: item.desc, amount: Number(item.amount) })) };
}
function assertTax(doc) {
  if (Number(doc.wht) > 0 && (!['individual', 'company'].includes(doc.taxpayerType) || !doc.taxDescription)) {
    invalid('กรุณาระบุประเภทผู้ถูกหักและรายละเอียด/อ้างอิงภาษีก่อนส่งอนุมัติ');
  }
}
function hasEvidence(doc, category) { return doc.attachments.some(file => file.category === category); }
function payoutData(doc, body) {
  if (doc.paymentMethod === 'cheque') invalid('PV เช็คต้องจ่ายผ่าน Process เช็ค ไม่สามารถบันทึกจ่ายเอง', 409);
  const paidAt = documentDate(body.paidDate, 'วันที่จ่ายจริง', true);
  if (paidAt < doc.pvDate) invalid('วันที่จ่ายต้องไม่ก่อนวันที่ PV');
  const recipient = boundedText(body.recipient, 'ชื่อผู้รับเงิน', true, 200);
  const transfer = doc.paymentMethod === 'transfer';
  const payerBank = boundedText(body.payerBank, 'บัญชีธนาคารผู้จ่าย', transfer, 300);
  const payeeBank = boundedText(body.payeeBank, 'บัญชีธนาคารผู้รับ', transfer, 300);
  const paymentReference = boundedText(body.paymentReference, 'เลขอ้างอิงการจ่าย', transfer, 200);
  if (transfer && !hasEvidence(doc, 'pv-payment')) invalid('กรุณาแนบหลักฐานประเภทการจ่ายเงินก่อนบันทึกจ่าย');
  return { paidAt, recipient, payerBank, payeeBank, paymentReference };
}
function reversalData(doc, body) {
  const reversedAt = documentDate(body.reversalDate, 'วันที่กลับรายการ', true);
  if (reversedAt < doc.paidAt) invalid('วันที่กลับรายการต้องไม่ก่อนวันที่จ่าย');
  const reversalReference = boundedText(body.reversalReference, 'เลขอ้างอิงการกลับเงิน', true, 200);
  if (!hasEvidence(doc, 'pv-reversal')) invalid('กรุณาแนบหลักฐานประเภทกลับรายการจ่ายก่อนยกเลิก');
  return { reversedAt, reversalReference };
}
async function assertNoActiveCheque(tx, id) {
  if (await tx.chequePayment.count({ where: { paymentVoucherId: id, status: { not: 'Cancelled' } } })) {
    invalid('PV มีเช็คที่ยังไม่ยกเลิก ต้องจัดการเช็คก่อน', 409);
  }
}
async function assertVoucherEvidence(req, doc, category) {
  const access = await getAccountingAccess(req.user);
  const can = action => hasAccountingPermission(access, 'ap', action);
  if (!['pv-document', 'pv-payment', 'pv-reversal'].includes(category)) invalid('ประเภทหลักฐาน PV ไม่ถูกต้อง');
  if (['draft', 'returned'].includes(doc.status) && !doc.paidAt && category !== 'pv-reversal') {
    if (!can('create') && !can('update')) invalid('ไม่มีสิทธิ์แนบเอกสาร PV', 403);
    return;
  }
  if (doc.status === 'approved' && !doc.paidAt && category === 'pv-payment') {
    if (!can('pay')) invalid('ไม่มีสิทธิ์แนบหลักฐานจ่าย', 403);
    return;
  }
  if (doc.status === 'approved' && doc.paidAt && category === 'pv-reversal') {
    if (!can('pay') || !can('cancel')) invalid('กลับรายการต้องมี ap.pay และ ap.cancel', 403);
    return;
  }
  invalid('สถานะนี้ไม่อนุญาตแก้ไขหลักฐานประเภทที่เลือก', 409);
}
async function voucherAudit(tx, req, action, previous, result, reason) {
  const { recordAuditLog } = require('./auditTrail');
  return recordAuditLog({ entityType: 'payment_voucher', entityId: result.id, docNo: result.pvNo, action,
    oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot(result), reason, req }, tx);
}
module.exports = { VOUCHER_INCLUDE, ACTIVE_VOUCHER, voucherAmounts, voucherInput, lockVoucher, lockVoucherSource, assertSourceAvailable,
  voucherData, assertTax, payoutData, reversalData, assertNoActiveCheque, assertVoucherEvidence, voucherAudit };
