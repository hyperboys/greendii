const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, text, moneyCents } = require('../lib/deliveryOrder');
const { lockInvoice } = require('../lib/invoice');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { recordAuditLog } = require('../lib/auditTrail');
const { CREDIT_INCLUDE, creditData, creditCapacity, eligible, lockCredit, assertCreditConfirmable, assertCreditReversible } = require('../lib/creditNote');
router.use(authenticate);
async function canWrite(req, res, next) {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) return res.status(403).json({ message: 'ไม่มีสิทธิ์จัดการ CN' });
    next();
  } catch (error) { next(error); }
}
router.get('/', async (req, res, next) => {
  try {
    const { q, status } = req.query;
    res.json(await prisma.creditNote.findMany({ where: { ...(status ? { status } : {}), ...(q ? { OR: [
      { cnNo: { contains: q, mode: 'insensitive' } }, { invoiceNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } },
    ] } : {}) }, include: CREDIT_INCLUDE, orderBy: { cnDate: 'desc' } }));
  } catch (error) { next(error); }
});
router.get('/sources', canWrite, async (req, res, next) => {
  try {
    const q = text(req.query.q, 'ค้นหา') || '';
    res.json(await prisma.invoice.findMany({ where: { lifecycleVersion: 1, status: 'approved', outstandingAmount: { gt: 0 },
      ...(q ? { OR: [{ ivNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { id: true, ivNo: true, ivDate: true, customerName: true, customerCode: true, customerBranch: true, address: true, taxId: true,
      vatConfig: true, netAmount: true, vat: true, outstandingAmount: true }, orderBy: { ivDate: 'desc' }, take: 50 }));
  } catch (error) { next(error); }
});
router.get('/sources/:id', canWrite, async (req, res, next) => {
  try {
    res.json(await prisma.$transaction(async tx => {
      const invoice = await lockInvoice(tx, req.params.id); eligible(invoice);
      const capacity = await creditCapacity(tx, invoice);
      const activeBilling = await tx.billingNoteInvoice.count({ where: { invoiceId: invoice.id, billingNote: { status: { not: 'cancelled' }, completedAt: null } } });
      return { ...invoice, capacity: { before: capacity.before / 100, vat: capacity.vat / 100, net: capacity.net / 100 }, activeBilling: Boolean(activeBilling) };
    }));
  } catch (error) { next(error); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.creditNote.findUnique({ where: { id: req.params.id }, include: CREDIT_INCLUDE });
    if (!doc) invalid('ไม่พบใบลดหนี้', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'credit_note', entityId: doc.id },
      select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ ...doc, history });
  } catch (error) { next(error); }
});
router.post('/', canWrite, async (req, res, next) => {
  try {
    const doc = await prisma.$transaction(async tx => {
      const { items, ...data } = await creditData(tx, req.body);
      const cnNo = await generateNextRunningNumber('cn', { date: data.cnDate }, tx);
      const result = await tx.creditNote.create({ data: { ...data, cnNo, lifecycleVersion: 1, status: 'draft', salesId: req.user.id, items: { create: items } }, include: CREDIT_INCLUDE });
      await recordAuditLog({ entityType: 'credit_note', entityId: result.id, docNo: cnNo, action: 'create', newValue: result, req }, tx);
      return result;
    });
    res.status(201).json(doc);
  } catch (error) { next(error); }
});
router.put('/:id', canWrite, async (req, res, next) => {
  try {
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockCredit(tx, req.params.id, req.body?.updatedAt);
      if (previous.status !== 'draft') invalid('แก้ไขได้เฉพาะ CN Draft', 409);
      const { items, ...data } = await creditData(tx, req.body, previous);
      const result = await tx.creditNote.update({ where: { id: previous.id }, data: { ...data, items: { deleteMany: {}, create: items } }, include: CREDIT_INCLUDE });
      await recordAuditLog({ entityType: 'credit_note', entityId: result.id, docNo: result.cnNo, action: 'update', oldValue: previous, newValue: result, req }, tx);
      return result;
    }));
  } catch (error) { next(error); }
});
for (const action of ['confirm', 'cancel']) router.post(`/:id/${action}`, canWrite, async (req, res, next) => {
  try {
    const reason = action === 'cancel' ? text(req.body?.reason, 'เหตุผลยกเลิก', true) : null;
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockCredit(tx, req.params.id, req.body?.updatedAt);
      if (action === 'confirm' && previous.status !== 'draft') invalid('ยืนยันได้เฉพาะ CN Draft', 409);
      if (action === 'cancel' && !['draft', 'approved'].includes(previous.status)) invalid('สถานะนี้ยกเลิกไม่ได้', 409);
      const invoice = await lockInvoice(tx, previous.invoiceId);
      let changes = {};
      if (action === 'confirm') {
        const { items, ...data } = await creditData(tx, { ...previous, cnDate: previous.cnDate.toISOString().slice(0, 10),
          items: previous.items.map(row => ({ ...row, qty: String(row.qty), unitPrice: String(row.unitPrice) })) }, previous);
        await assertCreditConfirmable(tx, previous.invoiceId);
        await tx.invoice.update({ where: { id: invoice.id }, data: { outstandingAmount: (moneyCents(String(invoice.outstandingAmount), 'หนี้ค้างรับ') - moneyCents(data.netAmount, 'ยอดลดหนี้')) / 100 } });
        changes = { ...data, items: { deleteMany: {}, create: items }, confirmedAt: new Date() };
      } else if (previous.status === 'approved') {
        eligible(invoice);
        await assertCreditReversible(tx, previous);
        const restored = moneyCents(String(invoice.outstandingAmount), 'หนี้ค้างรับ') + moneyCents(String(previous.netAmount), 'ยอดลดหนี้');
        if (restored > moneyCents(String(invoice.netAmount), 'ยอด Invoice')) invalid('กลับยอดเกิน Invoice กรุณาตรวจข้อมูล', 409);
        await tx.invoice.update({ where: { id: invoice.id }, data: { outstandingAmount: restored / 100 } });
      }
      const result = await tx.creditNote.update({ where: { id: previous.id }, data: { ...changes, status: action === 'confirm' ? 'approved' : 'cancelled' }, include: CREDIT_INCLUDE });
      await recordAuditLog({ entityType: 'credit_note', entityId: result.id, docNo: result.cnNo, action, oldValue: previous, newValue: result, reason, req }, tx);
      return result;
    }));
  } catch (error) { next(error); }
});
module.exports = router;
