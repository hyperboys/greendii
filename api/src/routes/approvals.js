const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { ROLE_STEP } = require('../lib/approvalFlow');

// GET /api/approvals/pending  — items waiting for current user's approval
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const myStep = ROLE_STEP[req.user.role];
    if (!myStep) return res.json({ quotations: [], workOrders: [], prs: [], handovers: [] });

    // sales at step 1 can approve other people's docs (not their own)
    const notOwn = req.user.role === 'sales' ? { NOT: { salesId: req.user.id } } : {};

    const [quotations, workOrders, prs, handovers] = await Promise.all([
      prisma.quotation.findMany({
        where: { status: 'pending', approvalStep: myStep, ...notOwn },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.workOrder.findMany({
        where: { status: 'pending', approvalStep: myStep, ...notOwn },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.purchaseRequest.findMany({
        where: { status: 'pending', approvalStep: myStep, ...notOwn },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.handOverJob.findMany({
        where: { status: 'pending', approvalStep: myStep, ...notOwn },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.json({ quotations, workOrders, prs, handovers });
  } catch (e) { next(e); }
});

module.exports = router;
