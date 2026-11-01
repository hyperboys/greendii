const { invalid, text, documentDate } = require('./deliveryOrder');
const { currentCycle } = require('./accountingApproval');

const CHEQUE_STATES = ['received', 'deposited', 'cleared', 'dishonoured', 'cancelled'];
function chequeTransition(doc, action, body) {
  const cycle = currentCycle(doc);
  if (cycle && cycle.state !== 'legacy' && (cycle.state !== 'approved' || cycle.approvals.length !== cycle.steps.length)) {
    invalid('เช็คยังไม่ผ่านการอนุมัติครบขั้น', 409);
  }
  if (doc.lifecycleVersion !== 1 || doc.paymentMethod !== 'cheque' || doc.status !== 'approved' ||
      !doc.confirmedAt || !CHEQUE_STATES.includes(doc.receivedChequeState)) {
    invalid('ดำเนินการได้เฉพาะเช็ครับ RV ใหม่ที่ยืนยันขั้นสุดท้ายและเข้าวงจรเช็ครับแล้ว', 409);
  }
  const allowed = { deposit: ['received'], clear: ['deposited'], dishonour: ['received', 'deposited'] };
  if (!allowed[action]?.includes(doc.receivedChequeState) || doc.chequeDishonouredAt) invalid('เปลี่ยนสถานะเช็ครับขั้นนี้ไม่ได้', 409);
  const date = documentDate(body.actionDate, 'วันที่ดำเนินการ', true);
  const floor = action === 'clear' ? doc.chequeDepositedAt
    : action === 'dishonour' && doc.chequeDepositedAt ? doc.chequeDepositedAt : doc.receiptDate;
  if (!floor || date < new Date(new Date(floor).toISOString().slice(0, 10))) invalid('วันที่ดำเนินการต้องไม่ก่อนขั้นก่อนหน้า');
  if (['deposit', 'clear'].includes(action) && date < new Date(doc.chequeDate)) invalid('วันที่นำฝาก/ผ่านต้องไม่ก่อนวันที่บนเช็ค');
  const bounded = (value, label, max) => {
    const result = text(value, label, true);
    if (Array.from(result).length > max) invalid(`${label}ยาวเกิน ${max} ตัวอักษร`);
    return result;
  };
  if (action === 'deposit') return { receivedChequeState: 'deposited', chequeDepositedAt: date,
    chequeDepositBank: bounded(body.depositBank, 'ธนาคาร/บัญชีที่นำฝาก', 200),
    chequeDepositRef: bounded(body.depositRef, 'เลขอ้างอิงนำฝาก', 100) };
  if (action === 'clear') return { receivedChequeState: 'cleared', chequeClearedAt: date };
  return { receivedChequeState: 'dishonoured', chequeDishonouredAt: date,
    chequeDishonourReason: bounded(body.reason, 'เหตุผลเช็คคืน', 1000) };
}

async function assertNoUnresolvedCheque(tx, invoiceId) {
  const count = await tx.receiptAllocation.count({ where: { invoiceId,
    receiptVoucher: { lifecycleVersion: 1, status: 'approved', paymentMethod: 'cheque',
      receivedChequeState: { in: ['received', 'deposited'] } } } });
  if (count) invalid('Invoice มีเช็ครับที่ยังไม่ผ่าน กรุณาจัดการเช็คก่อนออก BI ใหม่/ยืนยัน CN', 409);
}
module.exports = { CHEQUE_STATES, chequeTransition, assertNoUnresolvedCheque };
