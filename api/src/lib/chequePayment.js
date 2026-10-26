const { invalid, documentDate, moneyCents } = require('./deliveryOrder');
const { boundedText, normalizedSnapshot } = require('./contractorPayment');
const { lockVoucher, lockVoucherSource, voucherAmounts, voucherAudit } = require('./paymentVoucher');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');
const { recordAuditLog } = require('./auditTrail');

const CQ_STATUSES = ['Prepared', 'Printed', 'Signed', 'Released', 'Cleared', 'Cancelled'];
const CQ_INCLUDE = { attachments: { orderBy: { uploadedAt: 'asc' } } };
const CQ_PERMISSIONS = { Printed: 'create', Signed: 'approve', Released: 'pay', Cleared: 'pay', Cancelled: 'cancel' };
const TRANSITIONS = { Prepared: ['Printed', 'Cancelled'], Printed: ['Signed', 'Cancelled'], Signed: ['Released', 'Cancelled'],
  Released: ['Cleared', 'Cancelled'], Cleared: ['Cancelled'], Cancelled: [] };
function normalizedAccount(value) {
  const account = boundedText(value, 'เลขบัญชีบริษัท', true, 50).replace(/[\s-]/g, '');
  if (!/^\d{6,30}$/.test(account)) invalid('เลขบัญชีบริษัทต้องเป็นตัวเลข 6-30 หลัก (คั่นด้วยช่องว่าง/ขีดได้)');
  return account;
}
function chequeInput(body) {
  if (!body || typeof body !== 'object') invalid('ข้อมูลเช็คไม่ถูกต้อง');
  const bankAccountNo = boundedText(body.bankAccountNo, 'เลขบัญชีบริษัท', true, 50);
  const chequeNo = boundedText(body.chequeNo, 'เลขเช็ค', true, 50);
  if (!/^[a-zA-Z0-9]+$/.test(chequeNo)) invalid('เลขเช็คใช้ตัวเลขหรือตัวอักษรอังกฤษโดยไม่เว้นวรรค');
  return { docDate: documentDate(body.docDate, 'วันที่เอกสาร', true),
    paymentVoucherId: boundedText(body.paymentVoucherId, 'PV', true, 100),
    bankName: boundedText(body.bankName, 'ธนาคารบริษัท', true, 200),
    bankBranch: boundedText(body.bankBranch, 'สาขาธนาคาร', true, 200),
    bankAccountNo, bankAccount: normalizedAccount(bankAccountNo), chequeNo: chequeNo.toUpperCase(),
    chequeDate: documentDate(body.chequeDate, 'วันที่บนเช็ค', true),
    payee: boundedText(body.payee, 'ผู้รับเงินตามเช็ค', true, 200), remark: boundedText(body.remark, 'หมายเหตุ', false, 1000) };
}
async function lockCheque(tx, id, revision) {
  await tx.$queryRaw`SELECT id FROM cheque_payments WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.chequePayment.findUnique({ where: { id }, include: CQ_INCLUDE });
  if (!doc) invalid('ไม่พบเช็คจ่าย', 404);
  if (doc.lifecycleVersion !== 1) invalid('เช็ค Legacy อ่านอย่างเดียว ต้องตรวจย้ายข้อมูลก่อน', 409);
  if (typeof revision !== 'string' || revision !== doc.updatedAt.toISOString()) invalid('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดเช็คใหม่', 409);
  return doc;
}
async function chequeVoucher(tx, id, paid = false) {
  const voucher = await lockVoucher(tx, id, null, false);
  if (voucher.status !== 'approved' || voucher.paymentMethod !== 'cheque' || Boolean(voucher.paidAt) !== paid || voucher.reversedAt) {
    invalid('PV ต้องอนุมัติแล้ว วิธีเช็ค และสถานะการจ่ายตรงกับเช็ค', 409);
  }
  const source = await lockVoucherSource(tx, voucher.sourceDocId), amounts = voucherAmounts(source);
  for (const key of Object.keys(amounts)) {
    if (moneyCents(String(voucher[key]), 'ยอด PV') !== moneyCents(String(amounts[key]), 'ยอด PS')) invalid('ยอด PV ไม่ตรง PS ต้องตรวจสอบก่อน', 409);
  }
  return voucher;
}
async function assertChequeAvailable(tx, input, previous) {
  if (previous && (input.paymentVoucherId !== previous.paymentVoucherId || input.bankAccount !== previous.bankAccount || input.chequeNo !== previous.chequeNo)) {
    invalid('ห้ามเปลี่ยน PV บัญชีหรือเลขเช็คของเอกสารเดิม ให้ยกเลิกและสร้างใหม่', 409);
  }
  const others = await tx.chequePayment.findMany({ where: { paymentVoucherId: input.paymentVoucherId,
    ...(previous ? { id: { not: previous.id } } : {}), status: { not: 'Cancelled' } } });
  if (others.length) invalid('PV มีเช็คที่ยังไม่ยกเลิกอยู่แล้ว รวม Legacy', 409);
  const numbers = await tx.chequePayment.findMany({ where: { chequeNo: { equals: input.chequeNo, mode: 'insensitive' },
    ...(previous ? { id: { not: previous.id } } : {}) } });
  if (numbers.some(row => String(row.bankAccountNo || row.bankAccount).replace(/[\s-]/g, '') === input.bankAccount)) {
    invalid('เลขเช็คนี้เคยใช้ในบัญชีนี้แล้ว รวมเช็คยกเลิก/Legacy ห้ามใช้ซ้ำ', 409);
  }
}
function stageData(doc, body) {
  const status = body.status;
  if (!CQ_STATUSES.includes(status)) invalid('สถานะเช็คไม่ถูกต้อง');
  if (!TRANSITIONS[doc.status]?.includes(status)) invalid('ลำดับสถานะเช็คไม่ถูกต้อง ห้ามข้ามขั้น', 409);
  const has = category => doc.attachments.some(file => file.category === category);
  const date = (value, label, min) => {
    const result = documentDate(value, label, true);
    if (result < min) invalid(`${label}ต้องไม่ก่อนขั้นก่อนหน้า`);
    return result;
  };
  if (status === 'Printed') return { printedAt: date(body.printedDate, 'วันที่พิมพ์เช็ค', doc.docDate) };
  if (status === 'Signed') return { signedAt: date(body.signedDate, 'วันที่ลงนาม', doc.printedAt),
    signer: boundedText(body.signer, 'ชื่อผู้ลงนาม', true, 200) };
  if (status === 'Released') {
    if (!has('cq-release')) invalid('กรุณาแนบหลักฐานส่งมอบเช็ค');
    return { releaseDate: date(body.releaseDate, 'วันที่ส่งมอบเช็ค', doc.signedAt),
      recipient: boundedText(body.recipient, 'ผู้รับเช็ค', true, 200) };
  }
  if (status === 'Cleared') {
    if (!has('cq-clear')) invalid('กรุณาแนบหลักฐานตัดบัญชีธนาคาร');
    const clearedAt = date(body.clearedDate, 'วันที่ตัดบัญชี', doc.releaseDate);
    if (clearedAt < doc.chequeDate) invalid('วันที่ตัดบัญชีต้องไม่ก่อนวันที่บนเช็ค');
    return { clearedAt, clearingReference: boundedText(body.clearingReference, 'เลขอ้างอิงตัดบัญชี', true, 200) };
  }
  const paid = ['Released', 'Cleared'].includes(doc.status);
  if (paid && !has('cq-reversal')) invalid('กรุณาแนบหลักฐานคืนเช็ค/หยุดจ่าย/คืนเงินจริง');
  return { cancelledAt: date(body.cancelledDate, 'วันที่ยกเลิก/กลับรายการ', doc.clearedAt || doc.releaseDate || doc.signedAt || doc.printedAt || doc.docDate),
    cancellationReason: boundedText(body.reason, 'เหตุผลยกเลิก', true, 1000),
    reversalReference: boundedText(body.reversalReference, 'เลขอ้างอิงกลับรายการ', paid, 200) };
}
function chequeEvidenceCategories(doc) {
  if (doc.lifecycleVersion !== 1) return [];
  return { Prepared: ['cq-document'], Printed: ['cq-document'], Signed: ['cq-release'],
    Released: ['cq-clear', 'cq-reversal'], Cleared: ['cq-reversal'], Cancelled: [] }[doc.status] || [];
}
async function assertChequeEvidence(req, doc, category) {
  if (!['cq-document', 'cq-release', 'cq-clear', 'cq-reversal'].includes(category)) invalid('ประเภทหลักฐานเช็คไม่ถูกต้อง');
  if (!chequeEvidenceCategories(doc).includes(category)) invalid('สถานะนี้ไม่อนุญาตจัดการหลักฐานเช็คประเภทนี้', 409);
  const access = await getAccountingAccess(req.user), can = action => hasAccountingPermission(access, 'ap', action);
  const allowed = category === 'cq-document' ? can('create') || can('update') : category === 'cq-reversal' ? can('pay') && can('cancel') : can('pay');
  if (!allowed) invalid('ไม่มีสิทธิ์จัดการหลักฐานเช็คประเภทนี้', 403);
}
async function chequeAudit(tx, req, action, previous, result, reason) {
  return recordAuditLog({ entityType: 'cheque_payment', entityId: result.id, docNo: result.cqNo, action,
    oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot(result), reason, req }, tx);
}
async function settleCheque(tx, req, doc, voucher, changes, status) {
  if (moneyCents(String(doc.amount), 'ยอดเช็ค') !== moneyCents(String(voucher.netPayment), 'ยอด PV')) invalid('ยอดเช็คไม่ตรง PV', 409);
  if (voucher.paidAt && voucher.paymentReference !== doc.cqNo) invalid('รายการจ่าย PV ไม่ตรงกับเช็คนี้ ต้องตรวจสอบก่อน', 409);
  if (status === 'Released') {
    const result = await tx.paymentVoucher.update({ where: { id: voucher.id }, data: {
      paidAt: changes.releaseDate, paidById: req.user.id, paymentRecordedAt: new Date(), payerBank: `${doc.bankName} / ${doc.bankBranch} / ${doc.bankAccountNo}`,
      recipient: changes.recipient, paymentReference: doc.cqNo,
    } });
    await voucherAudit(tx, req, 'pay', voucher, result, `ส่งมอบเช็ค ${doc.cqNo} / ${doc.chequeNo}`);
  }
  if (status === 'Cancelled' && voucher.paidAt) {
    const result = await tx.paymentVoucher.update({ where: { id: voucher.id }, data: {
      status: 'cancelled', reversedAt: changes.cancelledAt, reversedById: req.user.id, reversalRecordedAt: new Date(), reversalReference: changes.reversalReference,
    } });
    await voucherAudit(tx, req, 'reverse', voucher, result, `${changes.cancellationReason}; เช็ค ${doc.cqNo}`);
  }
}
module.exports = { CQ_STATUSES, CQ_INCLUDE, CQ_PERMISSIONS, normalizedAccount, chequeInput, lockCheque, chequeVoucher,
  assertChequeAvailable, stageData, chequeEvidenceCategories, assertChequeEvidence, chequeAudit, settleCheque };
