const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const USER_SELECT = {
  id: true, username: true, fullName: true, initials: true,
  role: true, lineUserId: true, active: true, createdAt: true,
};

// GET /api/users
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { q, role, active } = req.query;
    const where = {};
    if (q) where.OR = [
      { username: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
    ];
    if (role) where.role = role;
    if (active !== undefined) where.active = active === 'true';
    const users = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (e) { next(e); }
});

// POST /api/users  (admin/director only)
router.post('/', authenticate, requireRole('admin', 'director', 'admin_mgr'), async (req, res, next) => {
  try {
    const { username, password, fullName, initials, role, lineUserId } = req.body;
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ message: 'username, password, fullName, role required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, passwordHash: hash, fullName, initials: initials || '', role, lineUserId: lineUserId || '' },
      select: USER_SELECT,
    });
    res.status(201).json(user);
  } catch (e) { next(e); }
});

// PUT /api/users/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Non-admin may only edit themselves (except role)
    if (req.user.id !== id && !['admin', 'director', 'admin_mgr'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { fullName, initials, lineUserId, role, active } = req.body;
    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (initials !== undefined) data.initials = initials;
    if (lineUserId !== undefined) data.lineUserId = lineUserId;
    // Only admin can change role/active
    if (['admin', 'director', 'admin_mgr'].includes(req.user.role)) {
      if (role !== undefined) data.role = role;
      if (active !== undefined) data.active = active;
    }
    const user = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
    res.json(user);
  } catch (e) { next(e); }
});

// PUT /api/users/:id/password  (admin or self)
router.put('/:id/password', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const isAdmin = ['admin', 'director', 'admin_mgr'].includes(req.user.role);
    if (req.user.id !== id && !isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be >= 6 chars' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    res.json({ message: 'Password updated' });
  } catch (e) { next(e); }
});

// PUT /api/users/:id/force-change-password  (admin only)
router.put('/:id/force-change-password', authenticate, requireRole('admin', 'director', 'admin_mgr'), async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { mustChangePassword: true } });
    res.json({ message: 'User must change password on next login' });
  } catch (e) { next(e); }
});

// DELETE /api/users/:id  (admin only — soft delete)
router.delete('/:id', authenticate, requireRole('admin', 'director', 'admin_mgr'), async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'User deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
