const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, initials: true } },
  customer: { select: { id: true, name: true } },
  items: { orderBy: { seq: 'asc' } },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true } } },
    orderBy: { actedAt: 'asc' },
  },
  attachments: true,
};

// GET /api/quotations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, salesId, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (salesId) where.salesId = salesId;
    if (q) where.OR = [
      { quoNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
    ];
    // Sales only sees their own quotations (unless manager+)
    const managerRoles = ['sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory'];
    if (!managerRoles.includes(req.user.role)) {
      where.salesId = req.user.id;
    }
    const list = await prisma.quotation.findMany({
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

// GET /api/quotations/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.quotation.findUniqueOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_FULL,
    });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/quotations
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      quoNo, customerName, customerId, attn, project, address, tel,
      conditionTerm, validityDays, leadTime, paymentTerm,
      items = [], subTotal, vat, grandTotal, remark,
    } = req.body;
    if (!quoNo || !project || !customerName) {
      return res.status(400).json({ message: 'quoNo, project, customerName required' });
    }
    const quo = await prisma.quotation.create({
      data: {
        quoNo, customerName, customerId, attn, project, address, tel,
        conditionTerm, validityDays: validityDays || 30, leadTime, paymentTerm,
        subTotal: subTotal || 0, vat: vat || 0, grandTotal: grandTotal || 0,
        remark, salesId: req.user.id, status: 'draft',
        items: {
          create: items.map((it, i) => ({
            seq: i, desc: it.desc, qty: it.qty, unit: it.unit,
            price: it.price, amount: it.amount,
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    res.status(201).json(quo);
  } catch (e) { next(e); }
});

// PUT /api/quotations/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const existing = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return res.status(400).json({ message: 'Can only edit draft/rejected quotations' });
    }
    const {
      customerName, customerId, attn, project, address, tel,
      conditionTerm, validityDays, leadTime, paymentTerm,
      items = [], subTotal, vat, grandTotal, remark,
    } = req.body;
    // Delete old items and recreate
    await prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } });
    const quo = await prisma.quotation.update({
      where: { id: req.params.id },
      data: {
        customerName, customerId, attn, project, address, tel,
        conditionTerm, validityDays, leadTime, paymentTerm,
        subTotal: subTotal || 0, vat: vat || 0, grandTotal: grandTotal || 0,
        remark,
        items: {
          create: items.map((it, i) => ({
            seq: i, desc: it.desc, qty: it.qty, unit: it.unit,
            price: it.price, amount: it.amount,
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    res.json(quo);
  } catch (e) { next(e); }
});

// POST /api/quotations/:id/submit  (draft → pending)
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (quo.status !== 'draft') return res.status(400).json({ message: 'Already submitted' });
    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: 1 },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'quotation', quotationId: quo.id,
        approverId: req.user.id, step: 0,
        action: 'approve', comment: req.body.comment || 'ส่งเอกสารเข้าอนุมัติ',
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/quotations/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (quo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const MAX_STEP = 6; // 6 approval roles after sales
    const nextStep = quo.approvalStep + 1;
    const newStatus = nextStep > MAX_STEP ? 'approved' : 'pending';
    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep, status: newStatus },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'quotation', quotationId: quo.id,
        approverId: req.user.id, step: quo.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/quotations/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (quo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'quotation', quotationId: quo.id,
        approverId: req.user.id, step: quo.approvalStep,
        action: 'reject', comment: req.body.comment || '',
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/quotations/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (quo.status === 'approved') return res.status(400).json({ message: 'Cannot delete approved quotation' });
    await prisma.quotation.update({ where: { id: req.params.id }, data: { status: 'cancelled' } });
    res.json({ message: 'Quotation cancelled' });
  } catch (e) { next(e); }
});

module.exports = router;
