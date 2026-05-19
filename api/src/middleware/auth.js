const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, username: true, fullName: true, initials: true,
        role: true, active: true, mustChangePassword: true,
        firstName: true, lastName: true, firstNameEn: true, lastNameEn: true,
        email: true, phone: true, department: true, position: true,
        lineUserId: true, signatureUrl: true,
      },
    });
    if (!user || !user.active) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
