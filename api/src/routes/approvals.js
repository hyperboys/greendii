const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { ROLE_STEP } = require('../lib/approvalFlow');

// GET /api/approvals/pending  — items waiting for current user's approval
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const myStep = ROLE_STEP[req.user.role];
    if (!myStep) return res.json({ quotations: [], workOrders: [], prs: [], handovers: [] });

    const [quotations, workOrders, prs, handovers] = await Promise.all([
      prisma.quotation.findMany({
        where: { status: 'pending', approvalStep: myStep },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.workOrder.findMany({
        where: { status: 'pending', approvalStep: myStep },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.purchaseRequest.findMany({
        where: { status: 'pending', approvalStep: myStep },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.handover.findMany({
        where: { status: 'pending', approvalStep: myStep },
        include: { sales: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.json({ quotations, workOrders, prs, handovers });
  } catch (e) { next(e); }
});

module.exports = router;
