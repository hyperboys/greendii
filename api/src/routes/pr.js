const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { notifyStep, notifyUser } = require('../lib/notify');

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true } },
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
    const managerRoles = ['sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory'];
    if (!managerRoles.includes(req.user.role)) where.salesId = req.user.id;

    const list = await prisma.purchaseRequest.findMany({
      where,
      include: {
        sales: { select: { id: true, fullName: true } },
        items: true,
      },
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
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/pr
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      prNo, workOrderId, customer, projectRef,
      dateIssue, dateRequired, items = [],
      subTotal, vat, netTotal, remarks,
    } = req.body;
    if (!prNo || !customer) return res.status(400).json({ message: 'prNo and customer required' });
    const item = await prisma.purchaseRequest.create({
      data: {
        prNo, workOrderId, customer, projectRef,
        dateIssue: dateIssue ? new Date(dateIssue) : null,
        dateRequired: dateRequired ? new Date(dateRequired) : null,
        subTotal: subTotal || 0, vat: vat || 0, netTotal: netTotal || 0,
        remarks, salesId: req.user.id, status: 'draft',
        items: {
          create: items.map((it, i) => ({
            seq: i, desc: it.desc, note: it.note || null, qty: it.qty, unit: it.unit,
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
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const {
      customer, projectRef, dateIssue, dateRequired,
      items = [], subTotal, vat, netTotal, remarks,
    } = req.body;
    await prisma.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: req.params.id } });
    const item = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: {
        customer, projectRef,
        dateIssue: dateIssue ? new Date(dateIssue) : null,
        dateRequired: dateRequired ? new Date(dateRequired) : null,
        subTotal: subTotal || 0, vat: vat || 0, netTotal: netTotal || 0,
        remarks,
        items: {
          create: items.map((it, i) => ({
            seq: i, desc: it.desc, note: it.note || null, qty: it.qty, unit: it.unit,
            price: it.price, amount: it.amount,
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (pr.status !== 'draft') return res.status(400).json({ message: 'Already submitted' });
    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: 1 },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: 0,
        action: 'approve', comment: 'ส่งเข้าอนุมัติ',
      },
    });
    await notifyStep(1, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (pr.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const MAX_STEP = 6;
    const nextStep = pr.approvalStep + 1;
    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep, status: nextStep > MAX_STEP ? 'approved' : 'pending' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: pr.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    const newStatus = nextStep > MAX_STEP ? 'approved' : 'pending';
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
