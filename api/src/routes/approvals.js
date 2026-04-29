const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

// Role → approval step mapping
const ROLE_STEP = {
  sales: 1, sales2: 2, sale_mgr: 3, admin_mgr: 4,
  project_mgr: 5, director: 6, procurement: 7, factory: 8,
};

// GET /api/approvals/pending  — items waiting for current user's approval
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const myStep = ROLE_STEP[req.user.role];
    if (!myStep) return res.json({ quotations: [], workOrders: [], prs: [] });

    const [quotations, workOrders, prs] = await Promise.all([
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
    ]);

    res.json({ quotations, workOrders, prs });
  } catch (e) { next(e); }
});

module.exports = router;
