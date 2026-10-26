const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, documentDate } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { getPagination, paginated } = require('../lib/pagination');
const { RETURN_INCLUDE, RETURN_STATUSES, returnInput, lockReturn, lockReturnIssue, returnSource, returnData, postReturn, returnAudit } = require('../lib/stockReturn');
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
    if (status && !RETURN_STATUSES.includes(status)) invalid('สถานะใบคืนไม่ถูกต้อง');
    const where = { ...(status ? { status } : {}), ...(q ? { OR: [
      { returnNo: { contains: q, mode: 'insensitive' } }, { sender: { contains: q, mode: 'insensitive' } },
      { receiver: { contains: q, mode: 'insensitive' } }, { issueSnapshot: { path: ['issueNo'], string_contains: q } },
    ] } : {}) };
    const pg = getPagination(req.query), args = { where, include: RETURN_INCLUDE, orderBy: [{ returnDate: 'desc' }, { id: 'desc' }] };
    if (!pg) return res.json(await prisma.stockReturn.findMany(args));
    const [rows, total] = await prisma.$transaction([prisma.stockReturn.findMany({ ...args, skip: pg.skip, take: pg.take }), prisma.stockReturn.count({ where })]);
    res.json(paginated(rows, total, pg));
  } catch (error) { next(error); }
});
router.get('/sources', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '';
    res.json(await prisma.stockIssue.findMany({ where: { lifecycleVersion: 1, status: 'approved', ...(q ? { OR: [
      { issueNo: { contains: q, mode: 'insensitive' } }, { requester: { contains: q, mode: 'insensitive' } }, { receiver: { contains: q, mode: 'insensitive' } },
    ] } : {}) }, select: { id: true, issueNo: true, requester: true, receiver: true, warehouseSnapshot: true },
    orderBy: { issueDate: 'desc' }, take: 50 }));
  } catch (error) { next(error); }
});
router.get('/sources/:id', permit('view'), async (req, res, next) => {
  try {
    const excludeId = boundedText(req.query.excludeId, 'ใบคืนเดิม', false, 100);
    if (excludeId) {
      const existing = await prisma.stockReturn.findUnique({ where: { id: excludeId } });
      if (!existing || existing.stockIssueId !== req.params.id || existing.lifecycleVersion !== 1) invalid('ใบคืนเดิมไม่ตรงต้นทาง', 409);
    }
    res.json(await prisma.$transaction(tx => returnSource(tx, req.params.id, excludeId)));
  } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.stockReturn.findUnique({ where: { id: req.params.id }, include: RETURN_INCLUDE });
    if (!doc) invalid('ไม่พบใบคืน', 404);
    const [history, movements] = await Promise.all([
      prisma.auditLog.findMany({ where: { entityType: 'stock_return', entityId: doc.id },
        select: { id: true, action: true, reason: true, createdAt: true, newValue: true, performedBy: { select: { fullName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.stockMovement.findMany({ where: { sourceDocId: doc.id, sourceDocType: { in: ['stock_return', 'stock_return_reversal'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    res.json({ ...doc, movements, history: history.map(({ newValue, ...row }) => ({ ...row,
      performedBy: typeof newValue?.actorSnapshot?.fullName === 'string' ? { fullName: newValue.actorSnapshot.fullName } : row.performedBy })) });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = returnInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const doc = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock_return:${requestKey}`}))`;
      const replay = await tx.stockReturn.findUnique({ where: { requestKey }, include: RETURN_INCLUDE });
      if (replay) {
        if (replay.createdById !== req.user.id || replay.requestHash !== requestHash) invalid('requestKey ใช้กับข้อมูลอื่นแล้ว', 409);
        return replay;
      }
      const { items, ...data } = await returnData(tx, input);
      const returnNo = await generateNextRunningNumber('sr', { date: input.returnDate }, tx);
      const saved = await tx.stockReturn.create({ data: { ...data, returnNo, lifecycleVersion: 1, requestKey, requestHash,
        status: 'draft', createdById: req.user.id, items: { create: items } }, include: RETURN_INCLUDE });
      await returnAudit(tx, req, 'create', null, saved); return saved;
    });
    res.status(201).json(doc);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = returnInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockReturn(tx, req.params.id, req.body.updatedAt);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ได้เฉพาะใบคืน Draft / ส่งกลับ', 409);
      const { items, ...data } = await returnData(tx, input, previous);
      const doc = await tx.stockReturn.update({ where: { id: previous.id }, data: { ...data, items: { deleteMany: {}, create: items } }, include: RETURN_INCLUDE });
      await returnAudit(tx, req, 'update', previous, doc); return doc;
    }));
  } catch (error) { next(error); }
});
for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockReturn(tx, req.params.id, req.body.updatedAt);
        const allowed = action === 'submit' ? ['draft', 'returned'] : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะใบคืนไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && (!previous.createdById || previous.createdById === req.user.id)) invalid('ผู้สร้างห้ามอนุมัติใบคืนตัวเอง หรือไม่มีผู้สร้างให้ตรวจสอบ', 403);
        let data = {};
        if (['submit', 'approve'].includes(action)) {
          const input = returnInput({ ...previous, returnDate: previous.returnDate.toISOString().slice(0, 10),
            items: previous.items.map(line => ({ ...line, returnedQty: String(line.returnedQty) })) });
          const { items, ...fields } = await returnData(tx, input, previous);
          data = { ...fields, items: { deleteMany: {}, create: items } };
          if (action === 'approve') await postReturn(tx, { ...previous, ...fields, items }, req);
        } else await lockReturnIssue(tx, previous.stockIssueId);
        if (action === 'cancel') {
          const cancelledAt = documentDate(req.body.cancellationDate, 'วันที่ยกเลิก', true);
          if (cancelledAt < previous.returnDate) invalid('วันที่ยกเลิกต้องไม่ก่อนวันที่คืน');
          data = { cancelledAt, cancellationReason: reason };
          if (previous.status === 'approved') {
            if (req.body.physicalRemovalConfirmed !== true) invalid('ต้องยืนยันว่าส่งของที่คืนกลับออกไปจริงครบแล้วก่อนกลับ Stock');
            await postReturn(tx, { ...previous, cancellationReason: reason }, req, cancelledAt);
          }
        }
        const status = { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
        const doc = await tx.stockReturn.update({ where: { id: previous.id }, data: { ...data, status,
          ...(action === 'approve' ? { approvalStep: 1, approvedAt: new Date(), approvedById: req.user.id } : {}) }, include: RETURN_INCLUDE });
        await returnAudit(tx, req, action, previous, action === 'cancel' && previous.status === 'approved'
          ? { ...doc, physicalRemovalConfirmed: true } : doc, reason); return doc;
      }));
    } catch (error) { next(error); }
  });
}
module.exports = router;
