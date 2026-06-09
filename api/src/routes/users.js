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
  firstName: true, lastName: true, firstNameEn: true, lastNameEn: true,
  lineUserId: true, signatureText: true, signatureUrl: true, active: true, createdAt: true,
  docCounters: true,
};

const sigUpload = multer({
  storage: isR2Enabled ? multer.memoryStorage() : multer.diskStorage({
    destination: require('path').join(__dirname, '../../uploads'),
    filename: (_req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/jpeg|jpg|png|webp/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpg/png/webp allowed'));
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
    const { username, password, fullName, initials, role, lineUserId, email, phone, department, position, signatureText,
            firstName, lastName, firstNameEn, lastNameEn } = req.body;
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ message: 'username, password, fullName, role required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username, passwordHash: hash, fullName, initials: initials || '', role,
        lineUserId: lineUserId || null, email: email || null,
        phone: phone || null, department: department || null, position: position || null,
        signatureText: signatureText || null,
        firstName: firstName || null, lastName: lastName || null,
        firstNameEn: firstNameEn || null, lastNameEn: lastNameEn || null,
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
    const { fullName, initials, lineUserId, email, phone, department, position, signatureText, role, active,
            firstName, lastName, firstNameEn, lastNameEn } = req.body;
    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (initials !== undefined) data.initials = initials;
    if (lineUserId !== undefined) data.lineUserId = lineUserId;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (department !== undefined) data.department = department;
    if (position !== undefined) data.position = position;
    if (signatureText !== undefined) data.signatureText = signatureText;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (firstNameEn !== undefined) data.firstNameEn = firstNameEn;
    if (lastNameEn !== undefined) data.lastNameEn = lastNameEn;
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

// POST /api/users/:id/signature  (upload signature image)
router.post('/:id/signature', authenticate, requireRole('admin', 'director', 'admin_mgr'),
  sigUpload.single('file'), async (req, res, next) => {
  try {
    let signatureUrl;
    if (isR2Enabled) {
      const key = `signatures/${req.params.id}-${Date.now()}${path.extname(req.file.originalname)}`;
      signatureUrl = await uploadToR2(key, req.file.buffer, req.file.mimetype);
    } else {
      signatureUrl = `/uploads/${req.file.filename}`;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { signatureUrl },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (e) { next(e); }
});

// DELETE /api/users/:id/signature  (remove signature image)
router.delete('/:id/signature', authenticate, requireRole('admin', 'director', 'admin_mgr'), async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, select: { signatureUrl: true } });
    if (user.signatureUrl && isR2Enabled) {
      const key = user.signatureUrl.split('/').pop();
      await deleteFromR2(`signatures/${key}`).catch(() => {});
    }
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { signatureUrl: null },
      select: USER_SELECT,
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// PUT /api/users/:id/doc-counter  (admin only — ตั้ง floor ลำดับใบเสนอราคาของ sale คนนั้น)
// body: { mmyy: "0626", nextSeq: 3 }
router.put('/:id/doc-counter', authenticate, requireRole('admin', 'director', 'admin_mgr'), async (req, res, next) => {
  try {
    const { mmyy, nextSeq } = req.body;
    if (!mmyy || !/^\d{4}$/.test(mmyy)) {
      return res.status(400).json({ message: 'mmyy ต้องเป็นตัวเลข 4 หลัก เช่น 0626' });
    }
    const seq = parseInt(nextSeq, 10);
    if (!Number.isInteger(seq) || seq < 1) {
      return res.status(400).json({ message: 'nextSeq ต้องเป็นจำนวนเต็มบวก' });
    }
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { docCounters: true },
    });
    const counters = (current.docCounters && typeof current.docCounters === 'object')
      ? { ...current.docCounters }
      : {};
    counters[mmyy] = seq;
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { docCounters: counters },
      select: USER_SELECT,
    });
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
