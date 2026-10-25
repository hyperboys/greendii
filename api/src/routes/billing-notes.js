const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { recordAuditLog } = require('../lib/auditTrail');
const { invalid, text } = require('../lib/deliveryOrder');
const { BILLING_INCLUDE, billingData, lockBillingNote, lockInvoices, assertBillable, assertNoOtherBilling, assertNoLaterSettlement } = require('../lib/billingNote');

router.use(authenticate);
router.use((req, _res, next) => {
  if (['POST', 'PUT'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) invalid('ข้อมูลใบวางบิลไม่ถูกต้อง');
  next();
});
async function canWrite(req, res, next) {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) return res.status(403).json({ message: 'ไม่มีสิทธิ์จัดการใบวางบิล' });
    next();
  } catch (error) { next(error); }
}
router.get('/', async (req, res, next) => {
  try {
    const { q, status, customerId } = req.query;
    res.json(await prisma.billingNote.findMany({
      where: { ...(status ? { status } : {}), ...(customerId ? { customerId } : {}),
        ...(q ? { OR: [{ biNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] } : {}) },
      orderBy: { billingDate: 'desc' }, include: BILLING_INCLUDE,
    }));
  } catch (error) { next(error); }
});
router.get('/sources', canWrite, async (req, res, next) => {
  try {
    const customerId = text(req.query.customerId, 'ลูกค้า', true);
    const q = text(req.query.q, 'ค้นหา');
    const exceptId = text(req.query.exceptId, 'ใบวางบิล');
    if (exceptId) {
      const doc = await prisma.billingNote.findUnique({ where: { id: exceptId } });
      if (!doc || doc.lifecycleVersion !== 1 || doc.status !== 'draft' || doc.customerId !== customerId) invalid('ใบวางบิลสำหรับแก้ไขไม่ถูกต้อง', 409);
    }
    res.json(await prisma.invoice.findMany({
      where: { customerId, lifecycleVersion: 1, status: 'approved', outstandingAmount: { gt: 0 },
        billingNoteInvoices: { none: { billingNote: { status: { not: 'cancelled' }, completedAt: null }, ...(exceptId ? { billingNoteId: { not: exceptId } } : {}) } },
        ...(q ? { ivNo: { contains: q, mode: 'insensitive' } } : {}) },
      select: { id: true, ivNo: true, ivDate: true, dueDate: true, netAmount: true, outstandingAmount: true },
      orderBy: { ivDate: 'asc' }, take: 50,
    }));
  } catch (error) { next(error); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.billingNote.findUnique({ where: { id: req.params.id }, include: BILLING_INCLUDE });
    if (!doc) invalid('ไม่พบใบวางบิล', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'billing_note', entityId: doc.id },
      select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ ...doc, history });
  } catch (error) { next(error); }
});
router.post('/', canWrite, async (req, res, next) => {
  try {
    const doc = await prisma.$transaction(async tx => {
      const { invoices, ...data } = await billingData(tx, req.body);
      const biNo = await generateNextRunningNumber('bi', { date: data.billingDate }, tx);
      const result = await tx.billingNote.create({ data: { ...data, biNo, lifecycleVersion: 1, status: 'draft',
        salesId: req.user.id, createdAt: new Date(), invoices: { create: invoices } }, include: BILLING_INCLUDE });
      await recordAuditLog({ entityType: 'billing_note', entityId: result.id, docNo: biNo, action: 'create', newValue: result, req }, tx);
      return result;
    });
    res.status(201).json(doc);
  } catch (error) { next(error); }
});
router.put('/:id', canWrite, async (req, res, next) => {
  try {
    const doc = await prisma.$transaction(async tx => {
      const extraIds = Array.isArray(req.body.invoices) ? req.body.invoices.map(row => text(row?.invoiceId, 'Invoice', true)) : [];
      const previous = await lockBillingNote(tx, req.params.id, req.body.updatedAt, extraIds);
      if (previous.status !== 'draft') invalid('แก้ไขได้เฉพาะใบวางบิล Draft', 409);
      const { invoices, ...data } = await billingData(tx, req.body, previous);
      const result = await tx.billingNote.update({ where: { id: previous.id }, data: { ...data, invoices: { deleteMany: {}, create: invoices } }, include: BILLING_INCLUDE });
      await recordAuditLog({ entityType: 'billing_note', entityId: result.id, docNo: result.biNo, action: 'update', oldValue: previous, newValue: result, req }, tx);
      return result;
    });
    res.json(doc);
  } catch (error) { next(error); }
});
for (const action of ['confirm', 'cancel']) router.post(`/:id/${action}`, canWrite, async (req, res, next) => {
  try {
    const reason = action === 'cancel' ? text(req.body.reason, 'เหตุผลยกเลิก', true) : null;
    const doc = await prisma.$transaction(async tx => {
      const previous = await lockBillingNote(tx, req.params.id, req.body.updatedAt);
      if (action === 'confirm' && previous.status !== 'draft') invalid('ยืนยันได้เฉพาะ Draft', 409);
      if (action === 'cancel' && !['draft', 'approved'].includes(previous.status)) invalid('สถานะนี้ยกเลิกไม่ได้', 409);
      if (action === 'cancel' && previous.completedAt) invalid('ใบวางบิลปิดรับครบแล้ว ต้องตรวจ RV ก่อนยกเลิก', 409);
      const invoices = await lockInvoices(tx, previous.invoices.map(row => row.invoiceId));
      if (action === 'confirm') {
        if (!previous.invoices.length) invalid('ต้องมี Invoice อย่างน้อยหนึ่งใบ', 409);
        for (const row of previous.invoices) {
          const invoice = invoices.get(row.invoiceId);
          assertBillable(invoice, previous.customerId);
          await assertNoOtherBilling(tx, row.invoiceId, previous.id);
          if (Number(invoice.outstandingAmount) !== Number(row.outstandingAmount)) invalid('ยอดค้างรับเปลี่ยนไป กรุณาเปิดแก้ไขและบันทึก Draft ใหม่ก่อนยืนยัน', 409);
        }
      } else {
        await assertNoLaterSettlement(tx, previous);
        if (previous.invoices.some(row => Number(invoices.get(row.invoiceId).outstandingAmount) !== Number(row.outstandingAmount))) {
          invalid('ยอดค้างรับเปลี่ยนหลังจัดทำใบวางบิล กรุณาตรวจรับชำระ/ลดหนี้ก่อนยกเลิก', 409);
        }
      }
      const result = await tx.billingNote.update({ where: { id: previous.id }, data: action === 'confirm'
        ? { status: 'approved', confirmedAt: new Date() } : { status: 'cancelled' }, include: BILLING_INCLUDE });
      await recordAuditLog({ entityType: 'billing_note', entityId: result.id, docNo: result.biNo, action, oldValue: previous, newValue: result, reason, req }, tx);
      return result;
    });
    res.json(doc);
  } catch (error) { next(error); }
});
module.exports = router;
