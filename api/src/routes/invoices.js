const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { recordAuditLog } = require('../lib/auditTrail');
const { getPagination, paginated } = require('../lib/pagination');
const { invalid, text } = require('../lib/deliveryOrder');
const { INVOICE_INCLUDE, lockInvoice, assertInvoiceVersion, assertNoInvoiceDependents, invoiceData } = require('../lib/invoice');

router.use(authenticate);
async function canWrite(req, res, next) {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) return res.status(403).json({ message: 'ไม่มีสิทธิ์จัดการ Invoice' });
    next();
  } catch (error) { next(error); }
}

router.get('/', async (req, res, next) => {
  try {
    const { q, status, customerId, unpaidOnly } = req.query;
    const where = {
      ...(status ? { status } : {}), ...(customerId ? { customerId } : {}),
      ...(q ? { OR: [{ ivNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
      ...(unpaidOnly === 'true' ? { outstandingAmount: { gt: 0 }, AND: [
        { status: { not: 'cancelled' } }, { OR: [{ lifecycleVersion: 0 }, { status: 'approved' }] },
      ] } : {}),
    };
    const args = { where, orderBy: { ivDate: 'desc' }, include: INVOICE_INCLUDE };
    const pg = getPagination(req.query);
    if (pg) {
      const [rows, total] = await prisma.$transaction([prisma.invoice.findMany({ ...args, skip: pg.skip, take: pg.take }), prisma.invoice.count({ where })]);
      return res.json(paginated(rows, total, pg));
    }
    res.json(await prisma.invoice.findMany(args));
  } catch (error) { next(error); }
});

router.get('/sources', canWrite, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    res.json(await prisma.provisionalDeliveryOrder.findMany({
      where: { status: { not: 'cancelled' }, invoices: { none: { status: { not: 'cancelled' } } },
        ...(q ? { soNo: { contains: q, mode: 'insensitive' } } : {}) },
      select: { id: true, soNo: true, customerId: true, customer: { select: { name: true } } },
      orderBy: { docDate: 'desc' }, take: 50,
    }));
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: INVOICE_INCLUDE });
    if (!doc) invalid('ไม่พบ Invoice', 404);
    const [history, createdBy] = await Promise.all([
      prisma.auditLog.findMany({ where: { entityType: 'invoice', entityId: doc.id },
        select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50 }),
      doc.salesId ? prisma.user.findUnique({ where: { id: doc.salesId }, select: { fullName: true } }) : null,
    ]);
    res.json({ ...doc, history, createdBy });
  } catch (error) { next(error); }
});

router.post('/', canWrite, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const { items, ...data } = await invoiceData(tx, req.body);
      const ivNo = await generateNextRunningNumber('iv', { date: data.ivDate }, tx);
      const doc = await tx.invoice.create({
        data: { ...data, ivNo, lifecycleVersion: 1, status: 'draft', outstandingAmount: 0, salesId: req.user.id, items: { create: items } },
        include: INVOICE_INCLUDE,
      });
      await recordAuditLog({ entityType: 'invoice', entityId: doc.id, docNo: ivNo, action: 'create', newValue: doc, req }, tx);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.put('/:id', canWrite, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const previous = await lockInvoice(tx, req.params.id);
      assertInvoiceVersion(previous, req.body.updatedAt);
      if (previous.status !== 'draft') invalid('แก้ไขได้เฉพาะ Invoice Draft', 409);
      await assertNoInvoiceDependents(tx, previous.id);
      const { items, ...data } = await invoiceData(tx, req.body, previous);
      const doc = await tx.invoice.update({ where: { id: previous.id },
        data: { ...data, outstandingAmount: 0, items: { deleteMany: {}, create: items } }, include: INVOICE_INCLUDE });
      await recordAuditLog({ entityType: 'invoice', entityId: doc.id, docNo: doc.ivNo, action: 'update', oldValue: previous, newValue: doc, req }, tx);
      return doc;
    });
    res.json(result);
  } catch (error) { next(error); }
});

for (const action of ['confirm', 'cancel']) router.post(`/:id/${action}`, canWrite, async (req, res, next) => {
  try {
    const reason = action === 'cancel' ? text(req.body.reason, 'เหตุผลยกเลิก', true) : null;
    const result = await prisma.$transaction(async tx => {
      const previous = await lockInvoice(tx, req.params.id);
      assertInvoiceVersion(previous, req.body.updatedAt);
      if (action === 'confirm' && previous.status !== 'draft') invalid('ยืนยันได้เฉพาะ Draft', 409);
      if (action === 'cancel' && !['draft', 'approved'].includes(previous.status)) invalid('สถานะนี้ไม่สามารถยกเลิกได้', 409);
      await assertNoInvoiceDependents(tx, previous.id);
      if (action === 'confirm') {
        if (Number(previous.netAmount) <= 0) invalid('ยอดสุทธิต้องมากกว่า 0 ก่อนยืนยัน');
        if (Number(previous.outstandingAmount) !== 0) invalid('Draft มียอดค้างรับผิดปกติ กรุณาตรวจสอบ', 409);
      } else if (previous.status === 'approved' && Number(previous.outstandingAmount) !== Number(previous.netAmount)) {
        invalid('ยอดค้างรับไม่ตรงยอดสุทธิ กรุณาตรวจสอบธุรกรรมก่อนยกเลิก', 409);
      }
      const doc = await tx.invoice.update({ where: { id: previous.id }, data: action === 'confirm'
        ? { status: 'approved', confirmedAt: new Date(), outstandingAmount: previous.netAmount }
        : { status: 'cancelled', outstandingAmount: 0 }, include: INVOICE_INCLUDE });
      await recordAuditLog({ entityType: 'invoice', entityId: doc.id, docNo: doc.ivNo, action, oldValue: previous, newValue: doc, reason, req }, tx);
      return doc;
    });
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
