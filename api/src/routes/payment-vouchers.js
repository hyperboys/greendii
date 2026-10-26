const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { getPagination, paginated } = require('../lib/pagination');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { VOUCHER_INCLUDE, ACTIVE_VOUCHER, voucherAmounts, voucherInput, lockVoucher, lockVoucherSource, voucherData,
  assertTax, payoutData, reversalData, assertNoActiveCheque, voucherAudit } = require('../lib/paymentVoucher');

router.use(authenticate);
const permit = action => async (req, res, next) => {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ap', action)) invalid(`ไม่มีสิทธิ์ ap.${action}`, 403);
    next();
  } catch (error) { next(error); }
};
router.get('/', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา'), status = boundedText(req.query.status, 'สถานะ');
    if (status && !['draft', 'pending', 'approved', 'returned', 'rejected', 'cancelled'].includes(status)) invalid('สถานะ PV ไม่ถูกต้อง');
    const payment = boundedText(req.query.payment, 'สถานะการจ่าย');
    if (payment && !['unpaid', 'paid', 'reversed'].includes(payment)) invalid('สถานะการจ่ายไม่ถูกต้อง');
    const where = { ...(status ? { status } : {}),
      ...(payment === 'unpaid' ? { paidAt: null, status: status || ACTIVE_VOUCHER } : payment === 'paid'
        ? { paidAt: { not: null }, reversedAt: null } : payment === 'reversed' ? { reversedAt: { not: null } } : {}),
      ...(q ? { OR: [{ pvNo: { contains: q, mode: 'insensitive' } }, { sourceNo: { contains: q, mode: 'insensitive' } },
        { poNo: { contains: q, mode: 'insensitive' } }, { supplierSnapshot: { path: ['name'], string_contains: q } }] } : {}) };
    const pg = getPagination(req.query), orderBy = [{ pvDate: 'desc' }, { id: 'desc' }];
    if (!pg) return res.json(await prisma.paymentVoucher.findMany({ where, include: VOUCHER_INCLUDE, orderBy }));
    const [data, total] = await prisma.$transaction([
      prisma.paymentVoucher.findMany({ where, include: VOUCHER_INCLUDE, orderBy, skip: pg.skip, take: pg.take }),
      prisma.paymentVoucher.count({ where }),
    ]);
    res.json(paginated(data, total, pg));
  } catch (error) { next(error); }
});
router.get('/sources', permit('view'), async (req, res, next) => {
  try {
    const q = boundedText(req.query.q, 'ค้นหา');
    const reserved = await prisma.paymentVoucher.findMany({ where: { sourceDocType: 'ps', sourceDocId: { not: null }, status: ACTIVE_VOUCHER }, select: { sourceDocId: true } });
    const rows = await prisma.contractorPaymentRequest.findMany({ where: { lifecycleVersion: 1, status: 'approved',
      id: { notIn: reserved.map(row => row.sourceDocId) },
      ...(q ? { OR: [{ psNo: { contains: q, mode: 'insensitive' } }, { poNo: { contains: q, mode: 'insensitive' } },
        { supplierSnapshot: { path: ['name'], string_contains: q } }] } : {}) },
    select: { id: true, psNo: true, docDate: true, poNo: true, supplierSnapshot: true, netAmount: true }, orderBy: [{ docDate: 'asc' }, { id: 'asc' }], take: 50 });
    res.json(rows);
  } catch (error) { next(error); }
});
router.get('/sources/:id', permit('view'), async (req, res, next) => {
  try {
    res.json(await prisma.$transaction(async tx => {
      const source = await lockVoucherSource(tx, req.params.id);
      const amounts = voucherAmounts(source);
      return { ...source, ...amounts };
    }));
  } catch (error) { next(error); }
});
router.get('/:id', permit('view'), async (req, res, next) => {
  try {
    const doc = await prisma.paymentVoucher.findUnique({ where: { id: req.params.id }, include: VOUCHER_INCLUDE });
    if (!doc) invalid('ไม่พบ PV', 404);
    const history = await prisma.auditLog.findMany({ where: { entityType: 'payment_voucher', entityId: doc.id },
      select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    res.json({ ...doc, history });
  } catch (error) { next(error); }
});
router.post('/', permit('create'), async (req, res, next) => {
  try {
    const input = voucherInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await prisma.$transaction(async tx => {
      const source = await lockVoucherSource(tx, input.sourceDocId);
      const existing = await tx.paymentVoucher.findUnique({ where: { requestKey }, include: VOUCHER_INCLUDE });
      if (existing) {
        if (existing.createdById !== req.user.id || existing.requestHash !== requestHash) invalid('requestKey ถูกใช้กับข้อมูลอื่นแล้ว', 409);
        return existing;
      }
      const { items, ...data } = await voucherData(tx, input, source);
      const pvNo = await generateNextRunningNumber('pv', { date: data.pvDate }, tx);
      const doc = await tx.paymentVoucher.create({ data: { ...data, pvNo, lifecycleVersion: 1, requestKey, requestHash,
        createdById: req.user.id, status: 'draft', items: { create: items } }, include: VOUCHER_INCLUDE });
      await voucherAudit(tx, req, 'create', null, doc);
      return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
router.put('/:id', permit('update'), async (req, res, next) => {
  try {
    const input = voucherInput(req.body);
    res.json(await prisma.$transaction(async tx => {
      const previous = await lockVoucher(tx, req.params.id, req.body.updatedAt);
      if (!['draft', 'returned'].includes(previous.status)) invalid('แก้ไขได้เฉพาะ PV Draft / ส่งกลับ', 409);
      const source = await lockVoucherSource(tx, previous.sourceDocId);
      const { items, ...data } = await voucherData(tx, input, source, previous);
      const doc = await tx.paymentVoucher.update({ where: { id: previous.id }, data: { ...data, items: { deleteMany: {}, create: items } }, include: VOUCHER_INCLUDE });
      await voucherAudit(tx, req, 'update', previous, doc);
      return doc;
    }));
  } catch (error) { next(error); }
});
for (const action of ['submit', 'approve', 'return', 'reject', 'pay', 'cancel']) {
  router.post(`/:id/${action}`, permit(action === 'submit' ? 'create' : action === 'pay' ? 'pay' : action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
    try {
      const reason = boundedText(req.body.reason, 'เหตุผล', ['return', 'reject', 'cancel'].includes(action), 1000);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockVoucher(tx, req.params.id, req.body.updatedAt);
        const allowed = action === 'submit' ? ['draft', 'returned'] : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved']
          : action === 'pay' ? ['approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะ PV ไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && previous.createdById === req.user.id) invalid('ผู้สร้างไม่สามารถอนุมัติ PV ตัวเองได้ แม้เป็น admin', 403);
        if (action === 'pay' && previous.paidAt) invalid('PV บันทึกจ่ายแล้ว ห้ามจ่ายซ้ำ', 409);
        const source = await lockVoucherSource(tx, previous.sourceDocId);
        let changes = {};
        if (['submit', 'approve', 'pay'].includes(action)) {
          const input = voucherInput({ ...previous, pvDate: previous.pvDate.toISOString().slice(0, 10) });
          const { items, ...data } = await voucherData(tx, input, source, previous);
          assertTax(data);
          changes = { ...data, items: { deleteMany: {}, create: items } };
        }
        if (action === 'pay') {
          await assertNoActiveCheque(tx, previous.id);
          changes = { ...changes, ...payoutData(previous, req.body), paidById: req.user.id, paymentRecordedAt: new Date() };
        }
        if (action === 'cancel') {
          await assertNoActiveCheque(tx, previous.id);
          if (previous.paidAt) {
            if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ap', 'pay')) invalid('กลับรายการจ่ายต้องมี ap.pay และ ap.cancel', 403);
            changes = { ...reversalData(previous, req.body), reversedById: req.user.id, reversalRecordedAt: new Date() };
          }
        }
        const status = { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', pay: 'approved', cancel: 'cancelled' }[action];
        const doc = await tx.paymentVoucher.update({ where: { id: previous.id }, data: { ...changes, status,
          ...(action === 'approve' ? { approvedById: req.user.id, approvedAt: new Date() } : {}),
          approvalStep: status === 'pending' ? 1 : previous.approvalStep,
        }, include: VOUCHER_INCLUDE });
        await voucherAudit(tx, req, previous.paidAt && action === 'cancel' ? 'reverse' : action, previous, doc, reason);
        return doc;
      }));
    } catch (error) { next(error); }
  });
}
module.exports = router;
