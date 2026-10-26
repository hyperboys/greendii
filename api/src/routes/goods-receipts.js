const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, documentDate } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { getPagination, paginated } = require('../lib/pagination');
const { GR_INCLUDE, GR_STATUSES, receiptInput, lockReceipt, receiptSource, receiptData, postReceipt, receiptAudit } = require('../lib/goodsReceipt');
router.use(authenticate);
function permit(action) {
  return async (req, res, next) => {
    try {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ap', action)) invalid(`ไม่มีสิทธิ์ ap.${action}`, 403);
      next();
    } catch (error) { next(error); }
  };
}
router.get('/', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '', status = boundedText(req.query.status, 'สถานะ');
    if (status && !GR_STATUSES.includes(status)) invalid('สถานะ GR ไม่ถูกต้อง');
    const where = { ...(status ? { status } : {}), ...(q ? { OR: [{ grNo: { contains: q, mode: 'insensitive' } },
      { poNo: { contains: q, mode: 'insensitive' } }, { supplierSnapshot: { path: ['name'], string_contains: q } }] } : {}) };
    const pg = getPagination(req.query), orderBy = [{ receiptDate: 'desc' }, { id: 'desc' }];
    if (!pg) return res.json(await prisma.goodsReceipt.findMany({ where, include: GR_INCLUDE, orderBy }));
    const [data, total] = await prisma.$transaction([prisma.goodsReceipt.findMany({ where, include: GR_INCLUDE, orderBy, skip: pg.skip, take: pg.take }),
      prisma.goodsReceipt.count({ where })]);
    res.json(paginated(data, total, pg));
  } catch (error) { next(error); }
});
router.get('/lookups', permit('view'), async (req, res, next) => {
  try {
    const [products, warehouses] = await Promise.all([
      prisma.accountProduct.findMany({ where: { active: true }, select: { id: true, code: true, name: true, unit: true, productType: true }, orderBy: { name: 'asc' } }),
      prisma.warehouse.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ products, warehouses });
  } catch (error) { next(error); }
});
router.get('/sources', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '';
    res.json(await prisma.purchaseOrder.findMany({ where: { status: 'approved', supplier: { active: true },
      goodsReceipts: { none: { lifecycleVersion: 0, status: { notIn: ['cancelled', 'rejected'] } } },
      ...(q ? { OR: [{ poNo: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] } : {}) },
    select: { id: true, poNo: true, poDate: true, supplier: { select: { name: true } } }, orderBy: { poDate: 'desc' }, take: 50 }));
  } catch (error) { next(error); }
});
router.get('/sources/:id', permit('view'), async (req, res, next) => {
  try {
    const excludeId = boundedText(req.query.excludeId, 'GR', false, 100);
    res.json(await prisma.$transaction(async tx => {
      if (excludeId) {
        const doc = await tx.goodsReceipt.findUnique({ where: { id: excludeId } });
        if (!doc || doc.poId !== req.params.id || doc.lifecycleVersion !== 1 || !['draft', 'returned'].includes(doc.status)) invalid('GR อ้างอิงไม่ตรงกับ PO ที่แก้ไข', 409);
      }
      const { po, lines } = await receiptSource(tx, req.params.id, excludeId);
      return { id: po.id, poNo: po.poNo, poDate: po.poDate, supplier: po.supplierSnapshot || { name: po.supplier.name }, lines };
    }));
  } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.goodsReceipt.findUnique({ where: { id: req.params.id }, include: GR_INCLUDE });
    if (!doc) invalid('ไม่พบ GR', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'goods_receipt', entityId: doc.id },
      select: { id: true, action: true, reason: true, newValue: true, performedBy: { select: { fullName: true } }, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const movements = await prisma.stockMovement.findMany({ where: { sourceDocId: doc.id, sourceDocType: { in: ['goods_receipt', 'goods_receipt_reversal'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    res.json({ ...doc, movements, history: history.map(({ newValue, ...row }) => ({ ...row,
      performedBy: typeof newValue?.actorSnapshot?.fullName === 'string' ? { fullName: newValue.actorSnapshot.fullName } : row.performedBy })) });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = receiptInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${input.poId} FOR UPDATE`;
      const replay = await tx.goodsReceipt.findUnique({ where: { requestKey }, include: GR_INCLUDE });
      if (replay) {
        if (replay.createdById !== req.user.id || replay.requestHash !== requestHash) invalid('requestKey ใช้กับข้อมูลอื่นแล้ว', 409);
        return replay;
      }
      const { items, ...data } = await receiptData(tx, input);
      const grNo = await generateNextRunningNumber('gr', { date: data.receiptDate }, tx);
      const doc = await tx.goodsReceipt.create({ data: { ...data, grNo, lifecycleVersion: 1, requestKey, requestHash,
        status: 'draft', createdById: req.user.id, items: { create: items } }, include: GR_INCLUDE });
      await receiptAudit(tx, req, 'create', null, doc);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = receiptInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockReceipt(tx, req.params.id, req.body.updatedAt);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ได้เฉพาะ GR Draft / ส่งกลับ', 409);
      if (input.receiptDate.toISOString() !== previous.receiptDate.toISOString()) invalid('เปลี่ยนวันที่ GR ที่ออกเลขแล้วไม่ได้', 409);
      const { items, ...data } = await receiptData(tx, input, previous);
      const doc = await tx.goodsReceipt.update({ where: { id: previous.id }, data: { ...data, items: { deleteMany: {}, create: items } }, include: GR_INCLUDE });
      await receiptAudit(tx, req, 'update', previous, doc); return doc;
    }));
  } catch (error) { next(error); }
});
for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockReceipt(tx, req.params.id, req.body.updatedAt);
        const allowed = action === 'submit' ? ['draft', 'returned'] : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะ GR ไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && previous.createdById === req.user.id) invalid('ผู้สร้างห้ามอนุมัติ GR ตัวเอง', 403);
        await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${previous.poId} FOR UPDATE`;
        let data = {};
        if (['submit', 'approve'].includes(action)) {
          if (!previous.attachments.some(file => file.category === 'gr-receipt')) invalid('ต้องแนบหลักฐานตรวจรับก่อนส่ง/อนุมัติ');
          const input = receiptInput({ ...previous, receiptDate: previous.receiptDate.toISOString().slice(0, 10),
            items: previous.items.map(item => ({ ...item, currentReceiptQty: String(item.currentReceiptQty) })) });
          const { items, ...fields } = await receiptData(tx, input, previous);
          data = { ...fields, items: { deleteMany: {}, create: items } };
          if (action === 'approve') await postReceipt(tx, { ...previous, ...fields, items }, req);
        }
        if (action === 'cancel') {
          const cancelledAt = documentDate(req.body.cancellationDate, 'วันที่ยกเลิก', true);
          if (cancelledAt < previous.receiptDate) invalid('วันที่ยกเลิกต้องไม่ก่อนวันที่รับ');
          data = { cancelledAt, cancellationReason: reason };
          if (previous.status === 'approved') await postReceipt(tx, { ...previous, cancellationReason: reason }, req, cancelledAt);
        }
        const status = { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
        const doc = await tx.goodsReceipt.update({ where: { id: previous.id }, data: { ...data, status,
          approvalStep: action === 'approve' ? 1 : previous.approvalStep,
          ...(action === 'approve' ? { approvedAt: new Date(), approvedById: req.user.id } : {}) }, include: GR_INCLUDE });
        await receiptAudit(tx, req, action, previous, doc, reason); return doc;
      }));
    } catch (error) { next(error); }
  });
}
module.exports = router;
