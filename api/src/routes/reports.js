const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

// GET /api/reports/overview
router.get('/overview', authenticate, async (req, res, next) => {
  try {
    const [
      quoTotal, quoApproved, quoGrandTotal,
      woTotal, woApproved, woPending,
      hoTotal, prTotal, recentLogs,
    ] = await Promise.all([
      prisma.quotation.count(),
      prisma.quotation.count({ where: { status: 'approved' } }),
      prisma.quotation.aggregate({ _sum: { grandTotal: true }, where: { status: 'approved' } }),
      prisma.workOrder.count(),
      prisma.workOrder.count({ where: { status: 'approved' } }),
      prisma.workOrder.count({ where: { status: 'pending' } }),
      prisma.handOverJob.count(),
      prisma.purchaseRequest.count(),
      prisma.approvalLog.findMany({
        take: 10,
        orderBy: { actedAt: 'desc' },
        include: { approver: { select: { fullName: true } } },
      }),
    ]);
    res.json({
      quotations: { total: quoTotal, approved: quoApproved, grandTotal: quoGrandTotal._sum.grandTotal || 0 },
      workOrders: { total: woTotal, approved: woApproved, pending: woPending },
      handOverJobs: { total: hoTotal },
      purchaseRequests: { total: prTotal },
      recentLogs,
    });
  } catch (e) { next(e); }
});

// GET /api/reports/sales  — per-customer totals
router.get('/sales', authenticate, async (req, res, next) => {
  try {
    const quotations = await prisma.quotation.findMany({
      where: { status: { not: 'cancelled' } },
      select: { customerName: true, grandTotal: true, status: true, createdAt: true },
    });
    // Group by customerName
    const map = {};
    for (const q of quotations) {
      if (!map[q.customerName]) map[q.customerName] = { customer: q.customerName, total: 0, approved: 0, count: 0 };
      map[q.customerName].count++;
      map[q.customerName].total += Number(q.grandTotal);
      if (q.status === 'approved') map[q.customerName].approved += Number(q.grandTotal);
    }
    res.json(Object.values(map).sort((a, b) => b.total - a.total));
  } catch (e) { next(e); }
});

// GET /api/reports/approval-performance
router.get('/approval-performance', authenticate, async (req, res, next) => {
  try {
    const logs = await prisma.approvalLog.findMany({
      include: { approver: { select: { id: true, fullName: true, role: true } } },
      orderBy: { actedAt: 'desc' },
    });
    const map = {};
    for (const l of logs) {
      const key = l.approverId;
      if (!map[key]) map[key] = { id: key, name: l.approver.fullName, role: l.approver.role, approve: 0, reject: 0 };
      if (l.action === 'approve') map[key].approve++;
      else map[key].reject++;
    }
    res.json(Object.values(map));
  } catch (e) { next(e); }
});

module.exports = router;
