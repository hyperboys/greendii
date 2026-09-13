const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');

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

// GET /api/audit/domain-logs — list domain audit logs
router.get('/domain-logs', authenticate, async (req, res, next) => {
  try {
    await assertActionAuthorized(req.user, 'view_audit');

    const {
      entityType,
      entityId,
      docNo,
      action,
      performedById,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (entityType) where.entityType = String(entityType);
    if (entityId) where.entityId = String(entityId);
    if (docNo) where.docNo = { contains: String(docNo), mode: 'insensitive' };
    if (action) where.action = { contains: String(action), mode: 'insensitive' };
    if (performedById) where.performedById = String(performedById);

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          performedBy: {
            select: { id: true, username: true, fullName: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
