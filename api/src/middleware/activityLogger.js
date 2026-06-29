const prisma = require('../lib/prisma');

// Paths to skip (health check, docs, static files)
const SKIP_PATHS = ['/health', '/docs', '/api/docs'];
const SKIP_PREFIXES = ['/uploads/'];

/**
 * Non-blocking middleware that records every API request to the activity_logs table.
 * Uses res.on('finish') so req.user is available (set by authenticate middleware).
 * Silently ignores any DB errors — never blocks the main request.
 */
function activityLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const requestPath = req.originalUrl || req.path;

    // Skip non-API and noisy paths
    if (SKIP_PATHS.includes(requestPath)) return;
    if (SKIP_PREFIXES.some(p => requestPath.startsWith(p))) return;

    const durationMs = Date.now() - start;
    const requestId = req.requestId;
    const errorSummary =
      res.statusCode >= 400 && res.locals.activityErrorMessage
        ? String(res.locals.activityErrorMessage).replace(/\s+/g, ' ').slice(0, 200)
        : '';
    const pathWithMeta = [
      requestPath,
      requestId ? `[rid:${requestId}]` : '',
      errorSummary ? `[err:${errorSummary}]` : '',
    ].filter(Boolean).join(' ');

    // Fire-and-forget — do NOT await
    prisma.activityLog.create({
      data: {
        userId:     req.user?.id     ?? null,
        username:   req.user?.username ?? null,
        method:     req.method,
        path: pathWithMeta,
        statusCode: res.statusCode,
        ipAddress:  req.ip ?? null,
        userAgent:  (req.get('User-Agent') ?? '').slice(0, 512) || null,
        durationMs,
      },
    }).catch(() => { /* silent — never crash the server */ });
  });

  next();
}

module.exports = { activityLogger };
