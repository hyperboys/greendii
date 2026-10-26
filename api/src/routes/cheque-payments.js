const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, moneyCents } = require('../lib/deliveryOrder');
const { boundedText, normalizedSnapshot } = require('../lib/contractorPayment');
const { getPagination, paginated } = require('../lib/pagination');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { lockVoucher } = require('../lib/paymentVoucher');
const { CQ_STATUSES, CQ_INCLUDE, CQ_PERMISSIONS, chequeInput, lockCheque, chequeVoucher, assertChequeAvailable, stageData, chequeAudit, settleCheque } = require('../lib/chequePayment');
router.use(authenticate);
const permit = action => async (req, _res, next) => {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ap', action)) invalid(`ไม่มีสิทธิ์ ap.${action}`, 403);
    next();
  } catch (error) { next(error); }
};
function filters(query) {
  const q = boundedText(query.q, 'ค้นหา'), status = boundedText(query.status, 'สถานะ');
  if (status && !CQ_STATUSES.includes(status)) invalid('สถานะเช็คไม่ถูกต้อง');
  return { ...(status ? { status } : {}), ...(q ? { OR: [
    { cqNo: { contains: q, mode: 'insensitive' } }, { chequeNo: { contains: q, mode: 'insensitive' } },
    { payee: { contains: q, mode: 'insensitive' } }, { bankAccount: { contains: q, mode: 'insensitive' } },
    { bankName: { contains: q, mode: 'insensitive' } }, { pvNo: { contains: q, mode: 'insensitive' } },
  ] } : {}) };
}
router.get('/', permit('view'), async (req, res, next) => {
  try {
    const where = filters(req.query), pg = getPagination(req.query), orderBy = [{ docDate: 'desc' }, { id: 'desc' }];
    if (!pg) return res.json(await prisma.chequePayment.findMany({ where, include: CQ_INCLUDE, orderBy }));
    const [data, total] = await prisma.$transaction([
      prisma.chequePayment.findMany({ where, include: CQ_INCLUDE, orderBy, skip: pg.skip, take: pg.take }),
      prisma.chequePayment.count({ where }),
    ]);
    res.json(paginated(data, total, pg));
  } catch (error) { next(error); }
});
router.get('/sources', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา');
    const active = await prisma.chequePayment.findMany({ where: { status: { not: 'Cancelled' } }, select: { paymentVoucherId: true } });
    res.json(await prisma.paymentVoucher.findMany({ where: { lifecycleVersion: 1, status: 'approved', paymentMethod: 'cheque', paidAt: null,
      id: { notIn: active.map(row => row.paymentVoucherId) }, ...(q ? { OR: [
        { pvNo: { contains: q, mode: 'insensitive' } }, { sourceNo: { contains: q, mode: 'insensitive' } },
        { supplierSnapshot: { path: ['name'], string_contains: q } },
      ] } : {}) }, orderBy: [{ pvDate: 'asc' }, { id: 'asc' }], take: 50,
    select: { id: true, pvNo: true, pvDate: true, sourceNo: true, supplierSnapshot: true, netPayment: true } }));
  } catch (error) { next(error); }
});
router.get('/sources/:id', permit('view'), async (req, res, next) => {
  try { res.json(await prisma.$transaction(tx => chequeVoucher(tx, req.params.id))); } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.chequePayment.findUnique({ where: { id: req.params.id }, include: CQ_INCLUDE });
    if (!doc) invalid('ไม่พบเช็คจ่าย', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'cheque_payment', entityId: doc.id },
      select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    res.json({ ...doc, history });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = chequeInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await prisma.$transaction(async tx => {
      await lockVoucher(tx, input.paymentVoucherId, null, false);
      const replay = await tx.chequePayment.findUnique({ where: { requestKey }, include: CQ_INCLUDE });
      if (replay) {
        if (replay.createdById !== req.user.id || replay.requestHash !== requestHash) invalid('requestKey ถูกใช้กับข้อมูลอื่นแล้ว', 409);
        return replay;
      }
      const voucher = await chequeVoucher(tx, input.paymentVoucherId);
      if (input.docDate < voucher.pvDate) invalid('วันที่ CQ ต้องไม่ก่อนวันที่ PV');
      await assertChequeAvailable(tx, input);
      if (req.body.amount !== undefined && moneyCents(req.body.amount, 'ยอดเช็ค') !== moneyCents(String(voucher.netPayment), 'ยอด PV')) invalid('ยอดเช็คต้องตรงยอดเต็ม PV');
      const cqNo = await generateNextRunningNumber('cq', { date: input.docDate }, tx);
      const doc = await tx.chequePayment.create({ data: { ...input, cqNo, amount: voucher.netPayment, pvNo: voucher.pvNo,
        voucherSnapshot: normalizedSnapshot({ pvDate: voucher.pvDate, sourceNo: voucher.sourceNo, poNo: voucher.poNo, supplier: voucher.supplierSnapshot,
          amountBeforeTax: voucher.amountBeforeTax, vat: voucher.vat, wht: voucher.wht, retention: voucher.otherDeduction, netPayment: voucher.netPayment }),
        lifecycleVersion: 1, requestKey, requestHash, status: 'Prepared', createdById: req.user.id }, include: CQ_INCLUDE });
      await chequeAudit(tx, req, 'create', null, doc);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = chequeInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockCheque(tx, req.params.id, req.body.updatedAt);
      if (previous.status !== 'Prepared') invalid('แก้ได้เฉพาะ Prepared', 409);
      const voucher = await chequeVoucher(tx, previous.paymentVoucherId);
      if (input.docDate.toISOString() !== previous.docDate.toISOString()) invalid('ห้ามเปลี่ยนวันที่เอกสารที่ออกเลขแล้ว', 409);
      await assertChequeAvailable(tx, input, previous);
      if (input.docDate < voucher.pvDate) invalid('วันที่ CQ ต้องไม่ก่อน PV');
      const doc = await tx.chequePayment.update({ where: { id: previous.id }, data: input, include: CQ_INCLUDE });
      await chequeAudit(tx, req, 'update', previous, doc); return doc;
    }));
  } catch (error) { next(error); }
});
router.patch('/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status, permission = CQ_PERMISSIONS[status];
    const access = await getAccountingAccess(req.user);
    if (!permission) invalid('สถานะปลายทางไม่ถูกต้อง');
    if (!hasAccountingPermission(access, 'ap', permission)) invalid(`ไม่มีสิทธิ์ ap.${permission}`, 403);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockCheque(tx, req.params.id, req.body.updatedAt), paid = ['Released', 'Cleared'].includes(previous.status);
      if (status === 'Cancelled' && paid && !hasAccountingPermission(access, 'ap', 'pay')) invalid('กลับรายการเช็คต้องมี ap.cancel และ ap.pay', 403);
      const changes = stageData(previous, req.body), voucher = await chequeVoucher(tx, previous.paymentVoucherId, paid);
      await settleCheque(tx, req, previous, voucher, changes, status);
      const doc = await tx.chequePayment.update({ where: { id: previous.id }, data: {
        ...changes, status, ...(status === 'Cancelled' ? { cancelledById: req.user.id } : {}),
      }, include: CQ_INCLUDE });
      await chequeAudit(tx, req, status === 'Cancelled' && paid ? 'reverse' : status.toLowerCase(), previous, doc, changes.cancellationReason);
      return doc;
    }));
  } catch (error) { next(error); }
});
module.exports = router;
