const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { recordAuditLog } = require('../lib/auditTrail');
const { getPagination, paginated } = require('../lib/pagination');
const { DELIVERY_ORDER_INCLUDE, deliveryOrderData, lockDeliveryOrder, assertNoDeliveryInvoices, invalid, text } = require('../lib/deliveryOrder');

router.use(authenticate);
const canWrite = async (req, res, next) => {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์สร้างหรือจัดการใบส่งของชั่วคราว' });
    }
    next();
  } catch (error) { next(error); }
};

router.get('/work-orders', canWrite, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    res.json(await prisma.workOrder.findMany({
      where: { active: true, status: { not: 'cancelled' }, ...(q ? { OR: [
        { woNo: { contains: q, mode: 'insensitive' } }, { project: { contains: q, mode: 'insensitive' } },
      ] } : {}) },
      select: { id: true, woNo: true, project: true }, orderBy: { woNo: 'desc' }, take: 50,
    }));
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, customerId, q } = req.query;
    const where = {
      ...(status ? { status } : {}), ...(customerId ? { customerId } : {}),
      ...(q ? { OR: [
        { soNo: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const pg = getPagination(req.query);
    const args = { where, orderBy: { docDate: 'desc' }, include: DELIVERY_ORDER_INCLUDE };
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.provisionalDeliveryOrder.findMany({ ...args, skip: pg.skip, take: pg.take }),
        prisma.provisionalDeliveryOrder.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    res.json(await prisma.provisionalDeliveryOrder.findMany(args));
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.provisionalDeliveryOrder.findUnique({ where: { id: req.params.id }, include: DELIVERY_ORDER_INCLUDE });
    if (!doc) invalid('ไม่พบใบส่งของชั่วคราว', 404);
    const [history, createdBy] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entityType: 'provisional_delivery_order', entityId: doc.id },
        select: { id: true, action: true, reason: true, performedById: true, performedBy: { select: { fullName: true } }, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      doc.salesId ? prisma.user.findUnique({ where: { id: doc.salesId }, select: { fullName: true } }) : null,
    ]);
    res.json({ ...doc, history, createdBy });
  } catch (error) { next(error); }
});

router.post('/', canWrite, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const { items, ...data } = await deliveryOrderData(tx, req.body);
      const soNo = await generateNextRunningNumber('so', { date: data.docDate }, tx);
      const doc = await tx.provisionalDeliveryOrder.create({
        data: { ...data, soNo, status: 'draft', salesId: req.user.id, items: { create: items } },
        include: DELIVERY_ORDER_INCLUDE,
      });
      await recordAuditLog({ entityType: 'provisional_delivery_order', entityId: doc.id, docNo: doc.soNo, action: 'create', newValue: doc, req }, tx);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.put('/:id', canWrite, async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const previous = await lockDeliveryOrder(tx, req.params.id);
      if (previous.status !== 'draft') invalid('แก้ไขได้เฉพาะใบส่งของสถานะ Draft', 409);
      if (!req.body.updatedAt || new Date(req.body.updatedAt).getTime() !== new Date(previous.updatedAt).getTime()) {
        invalid('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดเอกสารใหม่ก่อนบันทึก', 409);
      }
      await assertNoDeliveryInvoices(tx, previous.id);
      const { items, ...data } = await deliveryOrderData(tx, req.body);
      const doc = await tx.provisionalDeliveryOrder.update({
        where: { id: previous.id }, data: { ...data, items: { deleteMany: {}, create: items } }, include: DELIVERY_ORDER_INCLUDE,
      });
      await recordAuditLog({ entityType: 'provisional_delivery_order', entityId: doc.id, docNo: doc.soNo, action: 'update', oldValue: previous, newValue: doc, req }, tx);
      return doc;
    });
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/:id/cancel', canWrite, async (req, res, next) => {
  try {
    const reason = text(req.body?.reason, 'เหตุผลยกเลิก', true);
    const result = await prisma.$transaction(async tx => {
      const previous = await lockDeliveryOrder(tx, req.params.id);
      if (previous.status === 'cancelled') invalid('ใบส่งของนี้ยกเลิกแล้ว', 409);
      if (previous.status !== 'draft') invalid('ระยะนี้รองรับการยกเลิกเฉพาะ Draft', 409);
      await assertNoDeliveryInvoices(tx, previous.id);
      const doc = await tx.provisionalDeliveryOrder.update({ where: { id: previous.id }, data: { status: 'cancelled' }, include: DELIVERY_ORDER_INCLUDE });
      await recordAuditLog({ entityType: 'provisional_delivery_order', entityId: doc.id, docNo: doc.soNo, action: 'cancel', oldValue: previous, newValue: doc, reason, req }, tx);
      return doc;
    });
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
