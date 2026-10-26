const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, documentDate } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { getPagination, paginated } = require('../lib/pagination');
const { ISSUE_INCLUDE, ISSUE_STATUSES, issueInput, lockIssue, issueData, postIssue, issueAudit } = require('../lib/stockIssue');
router.use(authenticate);
function permit(action) {
  return async (req, _res, next) => {
    try {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'inventory', action)) invalid(`ไม่มีสิทธิ์ inventory.${action}`, 403);
      next();
    } catch (error) { next(error); }
  };
}
router.get('/', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '', status = boundedText(req.query.status, 'สถานะ');
    if (status && !ISSUE_STATUSES.includes(status)) invalid('สถานะใบเบิกไม่ถูกต้อง');
    const warehouseId = boundedText(req.query.warehouseId, 'คลัง', false, 100);
    const where = { ...(status ? { status } : {}), ...(warehouseId ? { warehouseId } : {}), ...(q ? { OR: [
      { issueNo: { contains: q, mode: 'insensitive' } }, { requester: { contains: q, mode: 'insensitive' } },
      { receiver: { contains: q, mode: 'insensitive' } }, { workOrderSnapshot: { path: ['woNo'], string_contains: q } },
    ] } : {}) };
    const pg = getPagination(req.query), args = { where, include: ISSUE_INCLUDE, orderBy: [{ issueDate: 'desc' }, { id: 'desc' }] };
    if (!pg) return res.json(await prisma.stockIssue.findMany(args));
    const [rows, total] = await prisma.$transaction([prisma.stockIssue.findMany({ ...args, skip: pg.skip, take: pg.take }), prisma.stockIssue.count({ where })]);
    res.json(paginated(rows, total, pg));
  } catch (error) { next(error); }
});
router.get('/lookups', permit('view'), async (_req, res, next) => {
  try {
    const [products, warehouses] = await Promise.all([
      prisma.accountProduct.findMany({ where: { active: true, productType: { in: ['stored', 'manufactured'] } },
        select: { id: true, code: true, name: true, unit: true, productType: true }, orderBy: { name: 'asc' } }),
      prisma.warehouse.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ products, warehouses });
  } catch (error) { next(error); }
});
router.get('/work-orders', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '';
    res.json(await prisma.workOrder.findMany({ where: { active: true, status: { not: 'cancelled' }, ...(q ? { OR: [
      { woNo: { contains: q, mode: 'insensitive' } }, { project: { contains: q, mode: 'insensitive' } },
    ] } : {}) }, select: { id: true, woNo: true, project: true }, orderBy: { createdAt: 'desc' }, take: 50 }));
  } catch (error) { next(error); }
});
router.get('/availability', permit('view'), async (req, res, next) => {
  try {
    const warehouseId = boundedText(req.query.warehouseId, 'คลัง', true, 100);
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse?.active) invalid('คลังไม่เปิดใช้งาน', 409);
    res.json(await prisma.stockBalance.findMany({ where: { warehouseId }, select: { productId: true, onHand: true, reserved: true, available: true } }));
  } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.stockIssue.findUnique({ where: { id: req.params.id }, include: ISSUE_INCLUDE });
    if (!doc) invalid('ไม่พบใบเบิก', 404);
    const [history, movements] = await Promise.all([
      prisma.auditLog.findMany({ where: { entityType: 'stock_issue', entityId: doc.id },
        select: { id: true, action: true, reason: true, createdAt: true, newValue: true, performedBy: { select: { fullName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.stockMovement.findMany({ where: { sourceDocId: doc.id, sourceDocType: { in: ['stock_issue', 'stock_issue_reversal'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    res.json({ ...doc, movements, history: history.map(({ newValue, ...row }) => ({ ...row,
      performedBy: typeof newValue?.actorSnapshot?.fullName === 'string' ? { fullName: newValue.actorSnapshot.fullName } : row.performedBy })) });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = issueInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const doc = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock_issue:${requestKey}`}))`;
      const replay = await tx.stockIssue.findUnique({ where: { requestKey }, include: ISSUE_INCLUDE });
      if (replay) {
        if (replay.createdById !== req.user.id || replay.requestHash !== requestHash) invalid('requestKey ใช้กับข้อมูลอื่นแล้ว', 409);
        return replay;
      }
      const { items, ...data } = await issueData(tx, input);
      const issueNo = await generateNextRunningNumber('is', { date: input.issueDate }, tx);
      const saved = await tx.stockIssue.create({ data: { ...data, issueNo, lifecycleVersion: 1, requestKey, requestHash,
        status: 'draft', createdById: req.user.id, items: { create: items } }, include: ISSUE_INCLUDE });
      await issueAudit(tx, req, 'create', null, saved); return saved;
    });
    res.status(201).json(doc);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = issueInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockIssue(tx, req.params.id, req.body.updatedAt);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ได้เฉพาะใบเบิก Draft / ส่งกลับ', 409);
      const { items, ...data } = await issueData(tx, input, previous);
      const doc = await tx.stockIssue.update({ where: { id: previous.id }, data: { ...data, items: { deleteMany: {}, create: items } }, include: ISSUE_INCLUDE });
      await issueAudit(tx, req, 'update', previous, doc); return doc;
    }));
  } catch (error) { next(error); }
});
for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockIssue(tx, req.params.id, req.body.updatedAt);
        const allowed = action === 'submit' ? ['draft', 'returned'] : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะใบเบิกไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && (!previous.createdById || previous.createdById === req.user.id)) invalid('ผู้สร้างห้ามอนุมัติใบเบิกตัวเอง หรือไม่พบผู้สร้าง', 403);
        let data = {};
        if (['submit', 'approve'].includes(action)) {
          const input = issueInput({ ...previous, issueDate: previous.issueDate.toISOString().slice(0, 10),
            items: previous.items.map(line => ({ ...line, requestedQty: String(line.requestedQty), issuedQty: String(line.issuedQty) })) });
          const { items, ...fields } = await issueData(tx, input, previous);
          data = { ...fields, items: { deleteMany: {}, create: items } };
          if (action === 'approve') await postIssue(tx, { ...previous, ...fields, items }, req);
        }
        if (action === 'cancel') {
          const cancelledAt = documentDate(req.body.cancellationDate, 'วันที่ยกเลิก', true);
          if (cancelledAt < previous.issueDate) invalid('วันที่ยกเลิกต้องไม่ก่อนวันที่เบิก');
          if (await tx.stockReturn.count({ where: { stockIssueId: previous.id, status: { notIn: ['cancelled', 'rejected'] } } })) invalid('มีใบคืนอ้างใบเบิกนี้ ต้องจัดการใบคืนก่อนยกเลิก', 409);
          data = { cancelledAt, cancellationReason: reason };
          if (previous.status === 'approved') {
            if (req.body.physicalReturnConfirmed !== true) invalid('ต้องยืนยันว่ารับสินค้าที่จ่ายกลับคืนครบจริงก่อนกลับ Stock');
            await postIssue(tx, { ...previous, cancellationReason: reason }, req, cancelledAt);
          }
        }
        const status = { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
        const doc = await tx.stockIssue.update({ where: { id: previous.id }, data: { ...data, status,
          ...(action === 'approve' ? { approvalStep: 1, approvedAt: new Date(), approvedById: req.user.id } : {}) }, include: ISSUE_INCLUDE });
        await issueAudit(tx, req, action, previous, action === 'cancel' && previous.status === 'approved'
          ? { ...doc, physicalReturnConfirmed: true } : doc, reason); return doc;
      }));
    } catch (error) { next(error); }
  });
}
module.exports = router;
