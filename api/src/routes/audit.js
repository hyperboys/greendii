const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const ALLOWED = ['admin', 'director', 'admin_mgr'];

// GET /api/audit?page=1&limit=50&docType=quotation&action=approve&userId=xxx
router.get('/', authenticate, requireRole(...ALLOWED), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, docType, action, userId } = req.query;
    const where = {};
    if (docType) where.docType = docType;
    if (action)  where.action  = action;
    if (userId)  where.approverId = userId;

    const [total, rows] = await Promise.all([
      prisma.approvalLog.count({ where }),
      prisma.approvalLog.findMany({
        where,
        take: +limit,
        skip: (+page - 1) * +limit,
        orderBy: { actedAt: 'desc' },
        include: {
          approver: { select: { fullName: true, role: true } },
          quotation: { select: { quoNo: true } },
          workOrder: { select: { woNo: true } },
          handOverJob: { select: { hoNo: true } },
          pr: { select: { prNo: true } },
        },
      }),
    ]);

    res.json({ rows, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
});

module.exports = router;
