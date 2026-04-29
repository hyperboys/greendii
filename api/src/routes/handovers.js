const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

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
    const {
      project, contractor, location, contactName, contactTel,
      product, responsibility, serviceDate,
      qualityProduct, qualitySales, qualityInstall, comment, status,
    } = req.body;
    const item = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: {
        project, contractor, location, contactName, contactTel,
        product, responsibility,
        serviceDate: serviceDate ? new Date(serviceDate) : undefined,
        qualityProduct, qualitySales, qualityInstall, comment, status,
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

module.exports = router;
