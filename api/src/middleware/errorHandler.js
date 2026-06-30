const path = require('path');
const fs = require('fs/promises');

function summarizeValidationErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return '';
  return errors
    .map((e) => `${e.field || 'field'}: ${e.message || 'invalid'}`)
    .join(', ');
}

function mapPrismaError(err) {
  if (err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(', ')
      : (err.meta?.target ? String(err.meta.target) : 'unknown');
    return { status: 409, message: `ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว (field: ${target})` };
  }
  if (err.code === 'P2025') {
    return { status: 404, message: 'ไม่พบข้อมูลที่ต้องการ' };
  }
  if (err.code === 'P2003') {
    return { status: 400, message: 'ข้อมูลอ้างอิงไม่ถูกต้องหรือไม่มีอยู่ในระบบ' };
  }
  return null;
}

function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || '-';
  const prismaMapped = mapPrismaError(err);
  const status = prismaMapped?.status || err.status || err.statusCode || 500;
  const rawMessage = prismaMapped?.message || err.message || 'Internal server error';
  const validationDetail = summarizeValidationErrors(err.errors);
  const message = validationDetail && !String(rawMessage).includes(validationDetail)
    ? `${rawMessage}: ${validationDetail}`
    : rawMessage;

  res.locals.activityErrorMessage = message;

  console.error(`[ERROR][${requestId}]`, req.method, req.originalUrl, '-', message);
  if (process.env.NODE_ENV === 'development' && err.stack) console.error(err.stack);

  const payload = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    status,
    message,
    prismaCode: err.code || null,
    userId: req.user?.id || null,
    username: req.user?.username || null,
    ip: req.ip || null,
  };

  const errorLogPath = path.join(__dirname, '../../logs/error-details.log');
  fs.appendFile(errorLogPath, JSON.stringify(payload) + '\n').catch(() => {});

  res.status(status).json({
    message,
    requestId,
    ...(Array.isArray(err.errors) && err.errors.length ? { errors: err.errors } : {}),
  });
}

module.exports = { errorHandler };
