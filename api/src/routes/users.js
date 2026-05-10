const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { isR2Enabled, uploadToR2, deleteFromR2 } = require('../lib/r2');

const USER_SELECT = {
  id: true, username: true, fullName: true, initials: true,
  role: true, email: true, phone: true, department: true, position: true,
  lineUserId: true, signatureUrl: true, active: true, createdAt: true,
};

// multer for signature upload
const sigStorage = isR2Enabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => {
        const fs = require('fs');
        const dir = path.join(__dirname, '../../uploads/signatures');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
      },
    });
const uploadSig = multer({
  storage: sigStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only image files are allowed (jpeg/jpg/png/webp)'));
  },
});

// GET /api/users
router.get('/', authenticate, requireRole('admin', 'director', 'admin_mgr'), async (req, res, next) => {
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
    const { username, password, fullName, initials, role, lineUserId, email, phone, department, position } = req.body;
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ message: 'username, password, fullName, role required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username, passwordHash: hash, fullName, initials: initials || '', role,
        lineUserId: lineUserId || null, email: email || null,
        phone: phone || null, department: department || null, position: position || null,
      },
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
    const { fullName, initials, lineUserId, email, phone, department, position, role, active } = req.body;
    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (initials !== undefined) data.initials = initials;
    if (lineUserId !== undefined) data.lineUserId = lineUserId;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (department !== undefined) data.department = department;
    if (position !== undefined) data.position = position;
    // Only admin can change role/active
    if (['admin', 'director', 'admin_mgr'].includes(req.user.role)) {
      if (role !== undefined) data.role = role;
      if (active !== undefined) data.active = active;
    }
    const user = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
    res.json(user);
  } catch (e) { next(e); }
});

// POST /api/users/:id/signature  (admin or self)
router.post('/:id/signature', authenticate, uploadSig.single('signature'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const isAdmin = ['admin', 'director', 'admin_mgr'].includes(req.user.role);
    if (req.user.id !== id && !isAdmin) return res.status(403).json({ message: 'Forbidden' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    let signatureUrl;
    if (isR2Enabled) {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const key = 'signatures/' + unique + path.extname(req.file.originalname);
      signatureUrl = await uploadToR2(key, req.file.buffer, req.file.mimetype);
    } else {
      signatureUrl = `/uploads/signatures/${req.file.filename}`;
    }

    const user = await prisma.user.update({ where: { id }, data: { signatureUrl }, select: USER_SELECT });
    res.json(user);
  } catch (e) { next(e); }
});

// DELETE /api/users/:id/signature  (admin or self)
router.delete('/:id/signature', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const isAdmin = ['admin', 'director', 'admin_mgr'].includes(req.user.role);
    if (req.user.id !== id && !isAdmin) return res.status(403).json({ message: 'Forbidden' });
    const existing = await prisma.user.findUnique({ where: { id }, select: { signatureUrl: true } });
    if (existing?.signatureUrl && isR2Enabled) {
      const key = existing.signatureUrl.split('/').pop();
      await deleteFromR2('signatures/' + key).catch(() => {});
    }
    const user = await prisma.user.update({ where: { id }, data: { signatureUrl: null }, select: USER_SELECT });
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
