const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, text } = require('../lib/deliveryOrder');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { recordAuditLog } = require('../lib/auditTrail');
const { RECEIPT_INCLUDE, receiptData, lockReceipt, billingPaid, currentBilling, refreshBilling, reverseReceipt, settlement } = require('../lib/receiptVoucher');

router.use(authenticate);
async function canWrite(req, res, next) {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) return res.status(403).json({ message: 'ไม่มีสิทธิ์จัดการ RV' });
    next();
  } catch (error) { next(error); }
}
router.get('/', async (req, res, next) => {
  try {
    const { q, status, customerId } = req.query;
    res.json(await prisma.receiptVoucher.findMany({ where: {
      ...(status ? { status } : {}), ...(customerId ? { customerId } : {}),
      ...(q ? { OR: [{ rvNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }] } : {}),
    }, include: RECEIPT_INCLUDE, orderBy: { receiptDate: 'desc' } }));
  } catch (error) { next(error); }
});
router.get('/sources', canWrite, async (req, res, next) => {
  try {
    const customerId = text(req.query.customerId, 'ลูกค้า', true);
    const q = text(req.query.q, 'ค้นหา') || '';
    const invoices = await prisma.invoice.findMany({ where: { customerId, lifecycleVersion: 1, status: 'approved', outstandingAmount: { gt: 0 },
      ...(q ? { ivNo: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { ivDate: 'asc' }, take: 50 });
    const eligible = [];
    for (const inv of invoices) {
      const reservations = await prisma.billingNoteInvoice.findMany({ where: { invoiceId: inv.id,
        billingNote: { status: { not: 'cancelled' }, completedAt: null } }, include: { billingNote: true } });
      if (reservations.length > 1 || reservations.some(row => row.billingNote.lifecycleVersion !== 1 || row.billingNote.status !== 'approved')) continue;
      const link = await currentBilling(prisma, inv.id);
      const limit = Math.min(Number(inv.outstandingAmount), link ? (Math.round(Number(link.billingAmount) * 100) - await billingPaid(prisma, link.billingNoteId, inv.id)) / 100 : Number(inv.outstandingAmount));
      if (limit > 0) eligible.push({ id: inv.id, ivNo: inv.ivNo, ivDate: inv.ivDate, netAmount: inv.netAmount,
        outstandingAmount: inv.outstandingAmount, limit, billingNoteId: link?.billingNoteId || null, biNo: link?.billingNote.biNo || null });
    }
    const bills = await prisma.billingNote.findMany({ where: { customerId, lifecycleVersion: 1, status: 'approved', completedAt: null,
      ...(q ? { biNo: { contains: q, mode: 'insensitive' } } : {}) }, include: { invoices: { include: { invoice: true } } }, orderBy: { billingDate: 'asc' }, take: 50 });
    const billingNotes = [];
    for (const bill of bills) {
      const lines = [];
      for (const row of bill.invoices) {
        const remaining = Math.min(Number(row.invoice.outstandingAmount), (Math.round(Number(row.billingAmount) * 100) - await billingPaid(prisma, bill.id, row.invoiceId)) / 100);
        if (remaining > 0 && row.invoice.lifecycleVersion === 1 && row.invoice.status === 'approved') lines.push({
          id: row.invoiceId, ivNo: row.invoice.ivNo, ivDate: row.invoice.ivDate, netAmount: row.invoice.netAmount,
          outstandingAmount: row.invoice.outstandingAmount, limit: remaining, billingNoteId: bill.id, biNo: bill.biNo,
        });
      }
      if (lines.length) billingNotes.push({ id: bill.id, biNo: bill.biNo, invoices: lines });
    }
    res.json({ invoices: eligible, billingNotes });
  } catch (error) { next(error); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.receiptVoucher.findUnique({ where: { id: req.params.id }, include: RECEIPT_INCLUDE });
    if (!doc) invalid('ไม่พบใบสำคัญรับ', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'receipt_voucher', entityId: doc.id },
      select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ ...doc, history });
  } catch (error) { next(error); }
});
router.post('/', canWrite, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const { allocations, ...data } = await receiptData(tx, req.body);
      const rvNo = await generateNextRunningNumber('rv', { date: data.receiptDate }, tx);
      const doc = await tx.receiptVoucher.create({ data: { ...data, rvNo, status: 'draft', lifecycleVersion: 1, salesId: req.user.id,
        allocations: { create: allocations } }, include: RECEIPT_INCLUDE });
      await recordAuditLog({ entityType: 'receipt_voucher', entityId: doc.id, docNo: rvNo, action: 'create', newValue: doc, req }, tx);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.put('/:id', canWrite, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const previous = await lockReceipt(tx, req.params.id, req.body?.updatedAt);
      if (previous.status !== 'draft') invalid('แก้ได้เฉพาะ RV Draft', 409);
      const { allocations, ...data } = await receiptData(tx, req.body, previous);
      const doc = await tx.receiptVoucher.update({ where: { id: previous.id }, data: { ...data, allocations: { deleteMany: {}, create: allocations } }, include: RECEIPT_INCLUDE });
      await recordAuditLog({ entityType: 'receipt_voucher', entityId: doc.id, docNo: doc.rvNo, action: 'update', oldValue: previous, newValue: doc, req }, tx);
      return doc;
    });
    res.json(result);
  } catch (error) { next(error); }
});
for (const action of ['confirm', 'cancel']) router.post(`/:id/${action}`, canWrite, async (req, res, next) => {
  try {
    const reason = action === 'cancel' ? text(req.body?.reason, 'เหตุผลยกเลิก', true) : null;
    const result = await prisma.$transaction(async tx => {
      const previous = await lockReceipt(tx, req.params.id, req.body?.updatedAt);
      if (action === 'confirm' && previous.status !== 'draft') invalid('ยืนยันได้เฉพาะ RV Draft', 409);
      if (action === 'cancel' && !['draft', 'approved'].includes(previous.status)) invalid('สถานะนี้ยกเลิกไม่ได้', 409);
      let ids = [];
      let confirmation = {};
      if (action === 'confirm') {
        const { allocations, ...data } = await receiptData(tx, {
          ...previous, receiptDate: previous.receiptDate.toISOString().slice(0, 10),
          chequeDate: previous.chequeDate?.toISOString().slice(0, 10) || null,
        }, previous, true);
        for (const row of allocations) {
          await tx.invoice.update({ where: { id: row.invoiceId }, data: {
            outstandingAmount: (Math.round(Number(row.outstandingBefore) * 100) - settlement(row)) / 100,
          } });
        }
        ids = allocations.map(row => row.billingNoteId);
        confirmation = { ...data, confirmedAt: new Date(), allocations: { deleteMany: {}, create: allocations } };
      } else if (previous.status === 'approved') ids = await reverseReceipt(tx, previous);
      const doc = await tx.receiptVoucher.update({ where: { id: previous.id }, data: { ...confirmation, status: action === 'confirm' ? 'approved' : 'cancelled' }, include: RECEIPT_INCLUDE });
      await refreshBilling(tx, ids, req, recordAuditLog);
      await recordAuditLog({ entityType: 'receipt_voucher', entityId: doc.id, docNo: doc.rvNo, action, oldValue: previous, newValue: doc, reason, req }, tx);
      return doc;
    });
    res.json(result);
  } catch (error) { next(error); }
});
module.exports = router;
