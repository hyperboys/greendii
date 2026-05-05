const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { notifyByRole, notifyUser } = require('../lib/notify');

// GET /api/handovers
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (q) where.OR = [
      { hoNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
    ];
    const managerRoles = ['sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory'];
    if (!managerRoles.includes(req.user.role)) where.salesId = req.user.id;

    const list = await prisma.handOverJob.findMany({
      where,
      include: { sales: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/handovers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.handOverJob.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        sales: { select: { id: true, fullName: true } },
        workOrder: { select: { id: true, woNo: true } },
        attachments: true,
        approvalLogs: {
          include: { approver: { select: { id: true, fullName: true, role: true } } },
          orderBy: { actedAt: 'asc' },
        },
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/handovers
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      hoNo, workOrderId, project, contractor, location,
      contactName, contactTel, product, responsibility,
      serviceDate, qualityProduct, qualitySales, qualityInstall, comment,
    } = req.body;
    if (!hoNo || !project) return res.status(400).json({ message: 'hoNo and project required' });
    const item = await prisma.handOverJob.create({
      data: {
        hoNo, workOrderId, project, contractor, location,
        contactName, contactTel, product, responsibility,
        serviceDate: serviceDate ? new Date(serviceDate) : null,
        qualityProduct: qualityProduct || 0,
        qualitySales: qualitySales || 0,
        qualityInstall: qualityInstall || 0,
        comment, salesId: req.user.id, status: 'draft',
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/handovers/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.status !== 'draft') return res.status(400).json({ message: 'แก้ไขได้เฉพาะสถานะ Draft เท่านั้น' });
    const {
      project, contractor, location, contactName, contactTel,
      product, responsibility, serviceDate,
      qualityProduct, qualitySales, qualityInstall, comment,
    } = req.body;
    const item = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: {
        project, contractor, location, contactName, contactTel,
        product, responsibility,
        serviceDate: serviceDate ? new Date(serviceDate) : undefined,
        qualityProduct, qualitySales, qualityInstall, comment,
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/handovers/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.status !== 'draft') return res.status(400).json({ message: 'Already submitted' });
    const updated = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: 1 },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'handover', handOverJobId: ho.id,
        approverId: req.user.id, step: 0,
        action: 'approve', comment: req.body.comment || 'ส่งเข้าอนุมัติ',
      },
    });
    await notifyByRole('project_mgr', `ใบส่งมอบงาน ${ho.hoNo} รอการอนุมัติจากคุณ`).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/handovers/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const MAX_STEP = 1;
    const nextStep = ho.approvalStep + 1;
    const newStatus = nextStep > MAX_STEP ? 'approved' : 'pending';
    const updated = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep, status: newStatus },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'handover', handOverJobId: ho.id,
        approverId: req.user.id, step: ho.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    await notifyUser(ho.salesId, `ใบส่งมอบงาน ${ho.hoNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/handovers/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'handover', handOverJobId: ho.id,
        approverId: req.user.id, step: ho.approvalStep,
        action: 'reject', comment: req.body.comment || '',
      },
    });
    await notifyUser(ho.salesId, `ใบส่งมอบงาน ${ho.hoNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
