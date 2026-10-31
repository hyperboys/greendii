const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { generateNextRunningNumber, getYYMM } = require('../lib/runningNumber');
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
    const exceptId = text(req.query.exceptId, 'Invoice ที่แก้ไข');
    if (exceptId) {
      const editing = await prisma.invoice.findUnique({ where: { id: exceptId } });
      if (!editing) invalid('ไม่พบ Invoice', 404);
      if (editing.lifecycleVersion !== 1 || editing.status !== 'draft') invalid('แก้ไขได้เฉพาะ Invoice Draft', 409);
    }
    res.json(await prisma.provisionalDeliveryOrder.findMany({
      where: { status: { not: 'cancelled' }, invoices: { none: { status: { not: 'cancelled' },
        ...(exceptId ? { id: { not: exceptId } } : {}) } },
        ...(q ? { soNo: { contains: q, mode: 'insensitive' } } : {}) },
      select: { id: true, soNo: true, customerId: true, customer: { select: { name: true } } },
      orderBy: { docDate: 'desc' }, take: 50,
    }));
  } catch (error) { next(error); }
});

router.get('/reusable-numbers', canWrite, async (req, res, next) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[1]) < 1900 || Number(match[2]) < 1 || Number(match[2]) > 12) {
      invalid('กรุณาระบุเดือน Invoice ในรูปแบบ YYYY-MM');
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const start = new Date(Date.UTC(year, monthIndex, 1) - 7 * 60 * 60 * 1000);
    const end = new Date(Date.UTC(year, monthIndex + 1, 1) - 7 * 60 * 60 * 1000);
    const cancelled = await prisma.invoice.findMany({
      where: {
        status: 'cancelled', lifecycleVersion: 1, reissuedAs: null,
        ivDate: { gte: start, lt: end },
      },
      select: { id: true, ivNo: true, ivDate: true, customerName: true, customerCode: true },
      orderBy: { createdAt: 'desc' },
    });
    const numbers = [...new Set(cancelled.map(row => row.ivNo))];
    if (!numbers.length) return res.json([]);
    const active = await prisma.invoice.findMany({
      where: { ivNo: { in: numbers }, status: { not: 'cancelled' } },
      select: { ivNo: true },
    });
    const activeNumbers = new Set(active.map(row => row.ivNo));
    const seen = new Set();
    res.json(cancelled.filter(row => {
      if (activeNumbers.has(row.ivNo) || seen.has(row.ivNo)) return false;
      seen.add(row.ivNo);
      return true;
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
      const reuseInvoiceId = text(req.body.reuseInvoiceId, 'เลข Invoice ที่ยกเลิก');
      let ivNo;
      let reissuedFromId = null;
      if (reuseInvoiceId) {
        const cancelledInvoice = await lockInvoice(tx, reuseInvoiceId);
        if (cancelledInvoice.status !== 'cancelled' || cancelledInvoice.lifecycleVersion !== 1) {
          invalid('เลือกใช้เลขได้เฉพาะ Invoice ที่ยกเลิกแล้วในวงจรใหม่', 409);
        }
        if (cancelledInvoice.reissuedAs || getYYMM(cancelledInvoice.ivDate) !== getYYMM(data.ivDate)) {
          invalid('เลข Invoice นี้ถูกใช้ไปแล้วหรืออยู่คนละเดือนกับวันที่เอกสาร', 409);
        }
        const activeInvoice = await tx.invoice.findFirst({
          where: { ivNo: cancelledInvoice.ivNo, status: { not: 'cancelled' } },
          select: { id: true },
        });
        if (activeInvoice) invalid('เลข Invoice นี้ถูกใช้ไปแล้ว', 409);
        ivNo = cancelledInvoice.ivNo;
        reissuedFromId = cancelledInvoice.id;
      } else {
        ivNo = await generateNextRunningNumber('iv', { date: data.ivDate }, tx);
      }
      const doc = await tx.invoice.create({
        data: { ...data, ivNo, reissuedFromId, lifecycleVersion: 1, status: 'draft', outstandingAmount: 0, salesId: req.user.id, items: { create: items } },
        include: INVOICE_INCLUDE,
      });
      await recordAuditLog({
        entityType: 'invoice', entityId: doc.id, docNo: ivNo,
        action: reissuedFromId ? 'reuse_cancelled_number' : 'create',
        newValue: doc, reason: reissuedFromId ? `นำเลขจาก Invoice ที่ยกเลิก ${ivNo} กลับมาใช้` : null, req,
      }, tx);
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
