const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { normalizeRole } = require('../lib/roleAliases');
const {
  signAccessToken, issueRefreshToken, findValidRefreshToken,
  revokeRefreshToken, rotateRefreshToken,
} = require('../lib/tokens');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const usernameInput = String(req.body?.username ?? '').trim();
    const password = req.body?.password;
    if (!usernameInput || !password) {
      return res.status(400).json({ message: 'username and password required' });
    }
    const user = await prisma.user.findFirst({
      where: { username: { equals: usernameInput, mode: 'insensitive' } },
    });
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const normalizedUser = { ...user, role: normalizeRole(user.role) };
    const token = signAccessToken(normalizedUser);
    const refreshToken = await issueRefreshToken(user.id);
    res.json({
      token,
      refreshToken,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        initials: user.initials,
        role: normalizedUser.role,
        lineUserId: user.lineUserId,
        mustChangePassword: user.mustChangePassword,
        firstName: user.firstName,
        lastName: user.lastName,
        firstNameEn: user.firstNameEn,
        lastNameEn: user.lastNameEn,
        email: user.email,
        phone: user.phone,
        department: user.department,
        position: user.position,
        signatureUrl: user.signatureUrl,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'oldPassword and newPassword required' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ message: 'Old password incorrect' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: hash, mustChangePassword: false } });
    res.json({ message: 'Password changed' });
  } catch (e) { next(e); }
});

// POST /api/auth/refresh — exchange a refresh token for a new access token (with rotation)
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const record = await findValidRefreshToken(refreshToken);
    if (!record) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    const token = signAccessToken(record.user);
    const newRefreshToken = await rotateRefreshToken(refreshToken, record.userId);
    res.json({ token, refreshToken: newRefreshToken });
  } catch (e) { next(e); }
});

// POST /api/auth/logout — revoke the supplied refresh token
router.post('/logout', async (req, res, next) => {
  try {
    await revokeRefreshToken(req.body?.refreshToken);
    res.json({ message: 'Logged out' });
  } catch (e) { next(e); }
});

module.exports = router;
