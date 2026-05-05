const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications  — list for current user (unread first, max 50)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (e) { next(e); }
});

// PATCH /api/notifications/read-all  — mark all as read
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ message: 'ok' });
  } catch (e) { next(e); }
});

// PATCH /api/notifications/:id/read  — mark one as read
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ message: 'ok' });
  } catch (e) { next(e); }
});

module.exports = router;
