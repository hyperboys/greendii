const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { getPagination, paginated } = require('../lib/pagination');
const { OPENING_INCLUDE, dateOnly, dateString, openingInput, lockOpening, lockWarehouse, lockControl,
  assertNoActiveDuplicate, openingData, stockOpeningSnapshot, submittedItems, assertSubmittedBaselineUnchanged,
  postOpening, reverseOpening, openingAudit } = require('../lib/stockOpeningBalance');

router.use(authenticate);
function permit(action) {
  return async (req, _res, next) => {
    try {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'inventory', action)) invalid(`ไม่มีสิทธิ์ inventory.${action}`, 403);
      next();
    } catch (error) { next(error); }
  };
}
const statuses = ['draft', 'pending', 'approved', 'returned', 'rejected', 'cancelled'];

router.get('/lookups', permit('view'), async (_req, res, next) => {
  try {
    const [products, warehouses, control] = await Promise.all([
      prisma.accountProduct.findMany({ where: { productType: { in: ['stored', 'manufactured'] } },
        select: { id: true, code: true, name: true, unit: true, productType: true, active: true }, orderBy: { code: 'asc' } }),
      prisma.warehouse.findMany({ where: { active: true }, select: { id: true, code: true, name: true, active: true }, orderBy: { code: 'asc' } }),
      prisma.stockOpeningControl.findUnique({ where: { id: 'default' } }),
    ]);
    res.json({ products, warehouses, cutoverDate: control ? dateString(control.cutoverDate) : null });
  } catch (error) { next(error); }
});

router.get('/preview', permit('view'), async (req, res, next) => {
  try {
    const warehouseId = boundedText(req.query.warehouseId, 'คลัง', true, 100);
    const cutoverDate = dateOnly(req.query.cutoverDate, 'วันเริ่มใช้');
    const excludeId = boundedText(req.query.excludeId, 'ใบยอดยกมาเดิม', false, 100);
    const control = await prisma.stockOpeningControl.findUnique({ where: { id: 'default' } });
    if (control && dateString(control.cutoverDate) !== dateString(cutoverDate)) invalid(`วันเริ่มใช้ทั้งบริษัทถูกกำหนดเป็น ${dateString(control.cutoverDate)}`, 409);
    res.json(await stockOpeningSnapshot(prisma, warehouseId, cutoverDate, excludeId));
  } catch (error) { next(error); }
});

router.get('/', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '', status = boundedText(req.query.status, 'สถานะ');
    if (status && !statuses.includes(status)) invalid('สถานะใบยอดยกมาไม่ถูกต้อง');
    const where = { ...(status ? { status } : {}), ...(q ? { OR: [
      { openingNo: { contains: q, mode: 'insensitive' } },
      { warehouseSnapshot: { path: ['name'], string_contains: q } },
    ] } : {}) };
    const pg = getPagination(req.query), args = { where, include: OPENING_INCLUDE, orderBy: [{ cutoverDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] };
    if (!pg) return res.json(await prisma.stockOpeningBalance.findMany(args));
    const [rows, total] = await prisma.$transaction([
      prisma.stockOpeningBalance.findMany({ ...args, skip: pg.skip, take: pg.take }),
      prisma.stockOpeningBalance.count({ where }),
    ]);
    res.json(paginated(rows, total, pg));
  } catch (error) { next(error); }
});

router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.stockOpeningBalance.findUnique({ where: { id: req.params.id }, include: OPENING_INCLUDE });
    if (!doc) invalid('ไม่พบใบยอดยกมา', 404);
    const [history, movements] = await Promise.all([
      prisma.auditLog.findMany({ where: { entityType: 'stock_opening_balance', entityId: doc.id },
        select: { id: true, action: true, reason: true, createdAt: true, newValue: true, performedBy: { select: { fullName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.stockMovement.findMany({ where: { sourceDocId: doc.id,
        sourceDocType: { in: ['stock_opening_balance', 'stock_opening_balance_reversal'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    res.json({ ...doc, movements, history: history.map(({ newValue, ...row }) => ({ ...row,
      performedBy: typeof newValue?.actorSnapshot?.fullName === 'string' ? { fullName: newValue.actorSnapshot.fullName } : row.performedBy })) });
  } catch (error) { next(error); }
});

router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = openingInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const doc = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock_opening_balance:${requestKey}`}))`;
      const replay = await tx.stockOpeningBalance.findUnique({ where: { requestKey }, include: OPENING_INCLUDE });
      if (replay) {
        if (replay.createdById !== req.user.id || replay.requestHash !== requestHash) invalid('requestKey ใช้กับข้อมูลอื่นแล้ว', 409);
        return replay;
      }
      const warehouse = await lockWarehouse(tx, input.warehouseId);
      await assertNoActiveDuplicate(tx, input.warehouseId, input.cutoverDate);
      const { items, ...data } = await openingData(tx, input);
      const openingNo = await generateNextRunningNumber('ob', { date: input.cutoverDate }, tx);
      const saved = await tx.stockOpeningBalance.create({ data: { ...data, items: { create: items }, openingNo, lifecycleVersion: 1,
        requestKey, requestHash, status: 'draft', createdById: req.user.id,
        warehouseSnapshot: { code: warehouse.code, name: warehouse.name } }, include: OPENING_INCLUDE });
      await openingAudit(tx, req, 'create', null, saved);
      return saved;
    });
    res.status(201).json(doc);
  } catch (error) { next(error); }
});

router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = openingInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockOpening(tx, req.params.id, req.body.updatedAt);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ได้เฉพาะใบยอดยกมา Draft / ส่งกลับ', 409);
      await lockWarehouse(tx, previous.warehouseId);
      await assertNoActiveDuplicate(tx, previous.warehouseId, previous.cutoverDate, previous.id);
      const { items, ...data } = await openingData(tx, input, previous);
      const doc = await tx.stockOpeningBalance.update({ where: { id: previous.id },
        data: { ...data, items: { deleteMany: {}, create: items } }, include: OPENING_INCLUDE });
      await openingAudit(tx, req, 'update', previous, doc);
      return doc;
    }));
  } catch (error) { next(error); }
});

for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockOpening(tx, req.params.id, req.body.updatedAt);
        const allowed = action === 'submit' ? ['draft', 'returned']
          : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะใบยอดยกมาไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && (!previous.createdById || previous.createdById === req.user.id)) {
          invalid('ผู้สร้างห้ามอนุมัติใบยอดยกมาตัวเอง หรือไม่มีผู้สร้างให้ตรวจสอบ', 403);
        }
        let data = {};
        if (['submit', 'approve'].includes(action)) {
          await lockControl(tx, previous.cutoverDate);
          await lockWarehouse(tx, previous.warehouseId);
          await assertNoActiveDuplicate(tx, previous.warehouseId, previous.cutoverDate, previous.id);
          const input = openingInput({ warehouseId: previous.warehouseId, cutoverDate: dateString(previous.cutoverDate),
            remark: previous.remark, items: previous.items.map(line => ({ productId: line.productId, countedQty: String(line.countedQty) })) });
          const { items, ...fields } = await openingData(tx, input, previous);
          if (action === 'submit') {
            const prepared = await submittedItems(tx, { ...previous, ...fields, items });
            data = { ...fields, items: { deleteMany: {}, create: prepared.items } };
          } else {
            const prepared = await assertSubmittedBaselineUnchanged(tx, previous);
            await postOpening(tx, { ...previous, ...fields, items: prepared.items }, req);
          }
        } else {
          await lockWarehouse(tx, previous.warehouseId);
          if (action === 'cancel' && previous.status === 'approved') {
            const cancellationDate = dateOnly(req.body.cancellationDate, 'วันที่ยกเลิก');
            if (cancellationDate < previous.cutoverDate) invalid('วันที่ยกเลิกต้องไม่ก่อนวันเริ่มใช้');
            await reverseOpening(tx, previous, req, dateString(cancellationDate), reason);
            data = { cancelledAt: localDateStart(dateString(cancellationDate)), cancellationReason: reason };
          }
        }
        const status = { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
        const doc = await tx.stockOpeningBalance.update({ where: { id: previous.id }, data: { ...data, status,
          ...(action === 'approve' ? { approvalStep: 1, approvedAt: new Date(), approvedById: req.user.id } : {}) },
        include: OPENING_INCLUDE });
        await openingAudit(tx, req, action, previous, doc, reason);
        return doc;
      }));
    } catch (error) { next(error); }
  });
}

function localDateStart(value) {
  return new Date(`${value}T00:00:00+07:00`);
}

module.exports = router;
