const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid } = require('../lib/deliveryOrder');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { recordAuditLog } = require('../lib/auditTrail');
const { getPagination, paginated } = require('../lib/pagination');
const { PS_INCLUDE, PS_STATUSES, boundedText, paymentInput, lockPo, lockPayment, eligiblePo, usedCapacity, paymentData, normalizedSnapshot } = require('../lib/contractorPayment');

router.use(authenticate);
function permit(action) {
  return async (req, res, next) => {
    try {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ap', action)) return res.status(403).json({ message: `ไม่มีสิทธิ์ ap.${action}` });
      next();
    } catch (error) { next(error); }
  };
}
async function audit(tx, req, action, previous, result, reason) {
  await recordAuditLog({ entityType: 'contractor_payment_request', entityId: result.id, docNo: result.psNo,
    action, oldValue: normalizedSnapshot(previous), newValue: normalizedSnapshot(result), reason, req }, tx);
}
router.get('/', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '';
    const status = boundedText(req.query.status, 'สถานะ');
    if (status && !PS_STATUSES.includes(status)) invalid('สถานะ PS ไม่ถูกต้อง');
    const where = { ...(status ? { status } : {}), ...(q ? { OR: [
      { psNo: { contains: q, mode: 'insensitive' } }, { poNo: { contains: q, mode: 'insensitive' } },
      { supplier: { name: { contains: q, mode: 'insensitive' } } },
      { supplierSnapshot: { path: ['name'], string_contains: q } },
    ] } : {}) };
    const pg = getPagination(req.query);
    const orderBy = [{ docDate: 'desc' }, { id: 'desc' }];
    if (!pg) return res.json(await prisma.contractorPaymentRequest.findMany({ where, include: PS_INCLUDE, orderBy }));
    const [data, total] = await prisma.$transaction([
      prisma.contractorPaymentRequest.findMany({ where, include: PS_INCLUDE, orderBy, skip: pg.skip, take: pg.take }),
      prisma.contractorPaymentRequest.count({ where }),
    ]);
    res.json(paginated(data, total, pg));
  } catch (error) { next(error); }
});
router.get('/sources', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา') || '';
    res.json(await prisma.purchaseOrder.findMany({ where: { status: { notIn: ['cancelled', 'rejected'] }, supplier: { active: true },
      ...(q ? { OR: [{ poNo: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] } : {}) },
    select: { id: true, poNo: true, poDate: true, supplier: { select: { name: true } } }, orderBy: { poDate: 'desc' }, take: 50 }));
  } catch (error) { next(error); }
});
router.get('/sources/:id', permit('view'), async (req, res, next) => {
  try {
    res.json(await prisma.$transaction(async tx => {
      const po = await lockPo(tx, req.params.id);
      eligiblePo(po);
      const used = await usedCapacity(tx, po.id);
      const rounds = await tx.contractorPaymentRequest.findMany({ where: { poId: po.id }, select: { paymentRound: true } });
      return { id: po.id, poNo: po.poNo, poDate: po.poDate, supplier: { name: po.supplier.name }, vatConfig: po.vatConfig,
        before: Number(po.subTotal) - Number(po.discount), vat: Number(po.vat), gross: Number(po.netAmount),
        used: { before: used.before / 100, vat: used.vat / 100, gross: used.gross / 100, retention: used.retention / 100 },
        nextRound: rounds.reduce((max, row) => Math.max(max, row.paymentRound), 0) + 1 };
    }));
  } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.contractorPaymentRequest.findUnique({ where: { id: req.params.id }, include: PS_INCLUDE });
    if (!doc) invalid('ไม่พบ PS', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'contractor_payment_request', entityId: doc.id },
      select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    res.json({ ...doc, history });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = paymentInput(req.body);
    const requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await prisma.$transaction(async tx => {
      const po = await lockPo(tx, input.poId);
      const existing = await tx.contractorPaymentRequest.findUnique({ where: { requestKey }, include: PS_INCLUDE });
      if (existing) {
        if (existing.createdById !== req.user.id || existing.requestHash !== requestHash) invalid('requestKey ถูกใช้กับข้อมูลอื่นแล้ว', 409);
        return existing;
      }
      const { items, ...data } = await paymentData(tx, input, po);
      const psNo = await generateNextRunningNumber('ps', { date: data.docDate, round: data.paymentRound }, tx);
      const doc = await tx.contractorPaymentRequest.create({ data: { ...data, psNo, requestKey, requestHash, lifecycleVersion: 1,
        status: 'draft', createdById: req.user.id, items: { create: items } }, include: PS_INCLUDE });
      await audit(tx, req, 'create', null, doc);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = paymentInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockPayment(tx, req.params.id, req.body.updatedAt);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ไขได้เฉพาะ Draft / ส่งกลับ', 409);
      if (input.paymentRound !== previous.paymentRound) invalid('ไม่สามารถเปลี่ยนรอบเบิกของใบเดิมได้', 409);
      const po = await lockPo(tx, previous.poId);
      const { items, ...data } = await paymentData(tx, input, po, previous);
      const result = await tx.contractorPaymentRequest.update({ where: { id: previous.id },
        data: { ...data, items: { deleteMany: {}, create: items } }, include: PS_INCLUDE });
      await audit(tx, req, 'update', previous, result);
      return result;
    }));
  } catch (error) { next(error); }
});
for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockPayment(tx, req.params.id, req.body.updatedAt);
        const allowed = action === 'submit' ? ['draft', 'returned'] : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะ PS ไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && previous.createdById === req.user.id) invalid('ผู้สร้างไม่สามารถอนุมัติ PS ของตัวเองได้', 403);
        const po = await lockPo(tx, previous.poId);
        let changes = {};
        if (action === 'submit' || action === 'approve') {
          const input = paymentInput({ ...previous, docDate: previous.docDate.toISOString().slice(0, 10),
            whtRate: String(previous.whtRate), retentionRate: String(previous.retentionRate),
            items: previous.items.map(item => ({ ...item, amount: String(item.amount) })) });
          const { items, ...data } = await paymentData(tx, input, po, previous);
          changes = { ...data, items: { deleteMany: {}, create: items } };
        }
        if (action === 'cancel') {
          const used = await tx.paymentVoucher.count({ where: { sourceDocType: 'ps', sourceDocId: previous.id, status: { notIn: ['cancelled', 'rejected'] } } });
          if (used) invalid('PS ถูกอ้างอิงโดย PV ที่ยังไม่ยกเลิก ต้องยกเลิก PV ก่อน', 409);
        }
        const status = { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
        const result = await tx.contractorPaymentRequest.update({ where: { id: previous.id }, data: {
          ...changes, status, approvalStep: status === 'pending' ? 1 : previous.approvalStep,
          ...(action === 'approve' ? { approvedById: req.user.id, approvedAt: new Date() } : {}),
        }, include: PS_INCLUDE });
        await audit(tx, req, action, previous, result, reason);
        return result;
      }));
    } catch (error) { next(error); }
  });
}
module.exports = router;
