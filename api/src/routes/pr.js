const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getPrFirstStep, getPrNextStep } = require('../lib/approvalFlow');
const { canManageAllDocs, canDeleteOthersDocs, assertDocAccessible } = require('../lib/roles');

const prValidators = [
  body('customer').trim().notEmpty().withMessage('กรุณาระบุลูกค้า'),
  body('projectRef').optional({ nullable: true }).isString(),
  body('dateIssue').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('dateRequired').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('items').optional().isArray().withMessage('items ต้องเป็น array'),
  body('items.*.desc').optional({ nullable: true }).isString(),
  body('items.*.qty').optional().isFloat({ min: 0 }).withMessage('จำนวนต้องไม่ติดลบ'),
  body('items.*.price').optional().isFloat({ min: 0 }).withMessage('ราคาต้องไม่ติดลบ'),
  body('subTotal').optional().isFloat({ min: 0 }),
  body('vat').optional().isFloat({ min: 0 }),
  body('netTotal').optional().isFloat({ min: 0 }),
];

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, role: true } },
  prType: { select: { id: true, name: true, approvalSteps: true } },
  workOrder: { select: { id: true, woNo: true } },
  items: { orderBy: { seq: 'asc' } },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true } } },
    orderBy: { actedAt: 'asc' },
  },
  attachments: true,
};

// GET /api/pr
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (q) where.OR = [
      { prNo: { contains: q, mode: 'insensitive' } },
      { customer: { contains: q, mode: 'insensitive' } },
      { projectRef: { contains: q, mode: 'insensitive' } },
    ];
    if (!canManageAllDocs(req.user.role)) where.salesId = req.user.id;

    const listInclude = {
      sales: { select: { id: true, fullName: true } },
      items: true,
    };
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.purchaseRequest.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
        prisma.purchaseRequest.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.purchaseRequest.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/pr/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_FULL,
    });
    assertDocAccessible(req, item);
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/pr/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uiBase = getUiBaseUrl(req);
    const url = `${uiBase}/print/pr/${req.params.id}?token=${encodeURIComponent(token)}`;
    const item = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id }, select: { prNo: true, salesId: true } });
    assertDocAccessible(req, item);
    const pdf = await renderUrlToPdf(url);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.prNo || 'pr'}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// POST /api/pr
router.post('/', authenticate, prValidators, validate, async (req, res, next) => {
  try {
    const {
      workOrderId, prTypeId, customer, projectRef,
      dateIssue, dateRequired, items = [],
      subTotal, specialDiscount, vat, netTotal, remarks,
    } = req.body;
    if (!customer) return res.status(400).json({ message: 'customer required' });
    const yy = String(new Date().getFullYear()).slice(2);
    const lastPR = await prisma.purchaseRequest.findFirst({
      where: { prNo: { startsWith: `PR${yy}` } },
      orderBy: { prNo: 'desc' },
    });
    const seq = lastPR ? (parseInt(lastPR.prNo.replace(`PR${yy}`, ''), 10) || 0) + 1 : 1;
    const prNo = `PR${yy}${String(seq).padStart(3, '0')}`;
    const item = await prisma.purchaseRequest.create({
      data: {
        prNo, workOrderId: workOrderId || null, prTypeId: prTypeId || null, customer, projectRef,
        dateIssue: dateIssue ? new Date(dateIssue) : null,
        dateRequired: dateRequired ? new Date(dateRequired) : null,
        subTotal: subTotal || 0, specialDiscount: specialDiscount || 0, vat: vat || 0, netTotal: netTotal || 0,
        remarks, salesId: req.user.id, status: 'draft',
        items: {
          create: items.map((it, i) => ({
            seq: i, partNo: it.partNo || null, desc: it.desc, note: it.note || null, qty: it.qty, unit: it.unit,
            price: it.price, amount: it.amount,
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/pr/:id
router.put('/:id', authenticate, prValidators, validate, async (req, res, next) => {
  try {
    const existing = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.salesId !== req.user.id && !canManageAllDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเอกสารของผู้อื่น' });
    }
    const {
      customer, projectRef, dateIssue, dateRequired, prTypeId,
      items = [], subTotal, specialDiscount, vat, netTotal, remarks,
    } = req.body;
    const item = await prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: req.params.id } });
      return tx.purchaseRequest.update({
        where: { id: req.params.id },
        data: {
          customer, projectRef,
          prTypeId: prTypeId !== undefined ? (prTypeId || null) : undefined,
          dateIssue: dateIssue ? new Date(dateIssue) : null,
          dateRequired: dateRequired ? new Date(dateRequired) : null,
          subTotal: subTotal || 0, specialDiscount: specialDiscount || 0, vat: vat || 0, netTotal: netTotal || 0,
          remarks,
          items: {
            create: items.map((it, i) => ({
              seq: i, partNo: it.partNo || null, desc: it.desc, note: it.note || null, qty: it.qty, unit: it.unit,
              price: it.price, amount: it.amount,
            })),
          },
        },
        include: INCLUDE_FULL,
      });
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/pr/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (pr.salesId !== req.user.id && !canDeleteOthersDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ลบเอกสารของผู้อื่น' });
    }
    if (!['draft', 'rejected'].includes(pr.status)) {
      return res.status(400).json({ message: 'ลบได้เฉพาะเอกสารที่อยู่ในสถานะ Draft หรือ Rejected เท่านั้น' });
    }
    await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/pr/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { prType: { select: { approvalSteps: true } }, sales: { select: { role: true } } },
    });
    if (!['draft', 'rejected'].includes(pr.status)) return res.status(400).json({ message: 'ส่งได้เฉพาะ Draft หรือ Rejected เท่านั้น' });

    const firstStep = await getPrFirstStep(pr.prType?.approvalSteps, pr.sales.role);
    const newStatus = firstStep === null ? 'approved' : 'pending';

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: newStatus, approvalStep: firstStep ?? 0 },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: 'ส่งเข้าอนุมัติ',
      },
    });

    if (newStatus === 'approved') {
      // ทุกขั้นถูกข้าม (ผู้สร้างครอบคลุมสายอนุมัติ) หรือไม่มีขั้นอนุมัติ → อนุมัติทันที
      await notifyUser(pr.salesId, `ใบขอซื้อ ${pr.prNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(firstStep, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { prType: { select: { approvalSteps: true } }, sales: { select: { role: true } } },
    });
    if (pr.status !== 'pending') return res.status(400).json({ message: 'Not pending' });

    const nextStep = await getPrNextStep(pr.prType?.approvalSteps, pr.sales.role, pr.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep ?? pr.approvalStep, status: newStatus },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: pr.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(pr.salesId, `ใบขอซื้อ ${pr.prNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (pr.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: pr.approvalStep,
        action: 'reject', comment: req.body.comment || '',
      },
    });
    await notifyUser(pr.salesId, `ใบขอซื้อ ${pr.prNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
