const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

// Long-lived refresh token lifetime (default 30 days).
const REFRESH_TTL_MS = (parseInt(process.env.REFRESH_TOKEN_DAYS, 10) || 30) * 24 * 60 * 60 * 1000;

/** Sign a short-lived access token. Expiry is controlled by JWT_EXPIRES_IN. */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Create and persist a new refresh token for a user.
 * Only the SHA-256 hash is stored; the raw token is returned to the caller once.
 */
async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return raw;
}

/**
 * Validate a raw refresh token. Returns the token record (incl. user) when
 * valid, otherwise null. Does not mutate state.
 */
async function findValidRefreshToken(raw) {
  if (!raw) return null;
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt < new Date()) return null;
  if (!record.user || !record.user.active) return null;
  return record;
}

/** Revoke a single refresh token by its raw value (no-op if not found). */
async function revokeRefreshToken(raw) {
  if (!raw) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rotate a refresh token: revoke the old one and issue a fresh one atomically.
 * Returns the new raw refresh token.
 */
async function rotateRefreshToken(oldRaw, userId) {
  const newRaw = crypto.randomBytes(48).toString('hex');
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(oldRaw), revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRaw),
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    }),
  ]);
  return newRaw;
}

module.exports = {
  signAccessToken,
  issueRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
};
