const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getStepRoleMapping } = require('../lib/approvalFlow');

// GET /api/approvals/pending  — items waiting for current user's approval
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const { roleStep } = await getStepRoleMapping();
    const myStep = roleStep[req.user.role];
    if (!myStep) return res.json({ quotations: [], workOrders: [], prs: [], handovers: [] });

    // Step 1 is a peer-review step: the approver must not be the document creator
    const notOwn = myStep === 1 ? { NOT: { salesId: req.user.id } } : {};

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
