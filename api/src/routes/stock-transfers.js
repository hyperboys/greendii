const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, documentDate } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { getPagination, paginated } = require('../lib/pagination');
const { STATUSES, hash, requestKey, revision, transferInput, transferData, warehouses, reserve, postTransfer, audit } = require('../lib/stockTransfer');

router.use(authenticate);
function permit(action) {
  return async (req, _res, next) => {
    try {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'inventory', action)) invalid(`ไม่มีสิทธิ์ inventory.${action}`, 403);
      next();
    } catch (error) { next(error); }
  };
}
async function lock(tx, id, supplied) {
  await tx.$queryRaw`SELECT id FROM stock_transfers WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.stockTransfer.findUnique({ where: { id } });
  if (!doc) invalid('ไม่พบใบโอน', 404);
  revision(doc, supplied); return doc;
}
router.get('/', permit('view'), async (req, res, next) => {
  try {
    const status = boundedText(req.query.status, 'สถานะ', false, 20);
    if (status && !STATUSES.includes(status)) invalid('สถานะไม่ถูกต้อง');
    const q = boundedText(req.query.q, 'ค้นหา', false, 100);
    const where = { ...(status ? { status } : {}), ...(q ? { transferNo: { contains: q, mode: 'insensitive' } } : {}) };
    const pg = getPagination(req.query), args = { where, orderBy: [{ transferDate: 'desc' }, { id: 'desc' }] };
    if (!pg) return res.json(await prisma.stockTransfer.findMany(args));
    const [rows, total] = await prisma.$transaction([prisma.stockTransfer.findMany({ ...args, skip: pg.skip, take: pg.take }), prisma.stockTransfer.count({ where })]);
    res.json(paginated(rows, total, pg));
  } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.stockTransfer.findUnique({ where: { id: req.params.id } });
    if (!doc) invalid('ไม่พบใบโอน', 404);
    const [movements, history] = await Promise.all([
      prisma.stockMovement.findMany({ where: { sourceDocId: doc.id, sourceDocType: { in: ['stock_transfer', 'stock_transfer_reversal'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      prisma.auditLog.findMany({ where: { entityType: 'stock_transfer', entityId: doc.id }, orderBy: { createdAt: 'desc' },
        select: { id: true, action: true, reason: true, createdAt: true, performedBy: { select: { fullName: true } } } }),
    ]);
    res.json({ ...doc, movements, history });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = transferInput(req.body), key = requestKey(req.body.requestKey), requestHash = hash(input);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock_transfer:${key}`}))`;
      const replay = await tx.stockTransfer.findUnique({ where: { requestKey: key } });
      if (replay) {
        if (replay.requestHash !== requestHash || replay.createdById !== req.user.id) invalid('requestKey ใช้กับข้อมูลอื่น', 409);
        return replay;
      }
      const data = await transferData(tx, input);
      const transferNo = await generateNextRunningNumber('tr', { date: input.transferDate }, tx);
      const doc = await tx.stockTransfer.create({ data: { ...data, transferNo, requestKey: key, requestHash, createdById: req.user.id, status: 'draft', revision: 1 } });
      await audit(tx, req, 'stock_transfer', 'create', null, doc); return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = transferInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lock(tx, req.params.id, req.body.revision);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ได้เฉพาะร่าง/ส่งกลับ', 409);
      const data = await transferData(tx, input, previous);
      const doc = await tx.stockTransfer.update({ where: { id: previous.id }, data: { ...data, revision: { increment: 1 } } });
      await audit(tx, req, 'stock_transfer', 'update', previous, doc); return doc;
    }));
  } catch (error) { next(error); }
});
for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lock(tx, req.params.id, req.body.revision);
        const allowed = action === 'submit' ? ['draft', 'returned'] : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && previous.createdById === req.user.id) invalid('ผู้สร้างห้ามอนุมัติใบโอนตัวเอง รวม admin', 403);
        await warehouses(tx, previous);
        if (['submit', 'approve'].includes(action)) await transferData(tx, previous, previous);
        if (action === 'submit') await reserve(tx, previous);
        if (previous.status === 'pending' && action !== 'submit') await reserve(tx, previous, true);
        if (action === 'approve') await postTransfer(tx, previous, req);
        if (action === 'cancel' && previous.status === 'approved') {
          if (req.body.physicalReturnConfirmed !== true) invalid('ต้องยืนยันโอนสินค้ากลับจริงก่อนยกเลิก');
          const date = documentDate(req.body.cancellationDate, 'วันที่โอนกลับ', true);
          if (date < previous.transferDate || date > new Date()) invalid('วันที่โอนกลับไม่ถูกต้อง');
          await postTransfer(tx, { ...previous, reason }, req, date);
        }
        const doc = await tx.stockTransfer.update({ where: { id: previous.id }, data: { status: { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action],
          revision: { increment: 1 }, reason, ...(action === 'approve' ? { approvedById: req.user.id } : {}) } });
        await audit(tx, req, 'stock_transfer', action, previous, doc, reason); return doc;
      }));
    } catch (error) { next(error); }
  });
}
module.exports = router;
