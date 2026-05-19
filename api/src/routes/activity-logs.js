const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const ALLOWED = ['admin', 'director', 'admin_mgr'];

// GET /api/activity-logs?page=1&limit=50&userId=xxx&method=POST&status=error&search=xxx&dateFrom=xxx&dateTo=xxx
router.get('/', authenticate, requireRole(...ALLOWED), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, method, status, search, dateFrom, dateTo } = req.query;

    const where = {};
    if (userId) where.userId = userId;
    if (method) where.method = method.toUpperCase();
    if (status === 'error')   where.statusCode = { gte: 400 };
    if (status === 'success') where.statusCode = { lt: 400 };
    if (search) {
      where.OR = [
        { path:     { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo);
    }

    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        take: +limit,
        skip: (+page - 1) * +limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { fullName: true, role: true } },
        },
      }),
    ]);

    res.json({ rows, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
});

module.exports = router;
