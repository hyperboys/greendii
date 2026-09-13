/**
 * auditTrail.js — Domain Audit Trail Infrastructure & Secret Masking
 *
 * Records domain entity changes, computes diffs, and sanitizes/masks sensitive data.
 */

const prisma = require('./prisma');

// Sensitive field keys to mask
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'secret',
  'token',
  'authorization',
  'creditcard',
  'pin',
  'api_key',
  'apikey',
  'privatekey',
];

/**
 * Recursively mask sensitive fields in objects/arrays.
 */
function maskSensitiveData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '***MASKED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = maskSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Compute list of changed field names between old and new objects.
 */
function computeChangedFields(oldVal, newVal) {
  if (!oldVal || !newVal || typeof oldVal !== 'object' || typeof newVal !== 'object') {
    return [];
  }

  const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
  const changed = [];

  for (const key of allKeys) {
    if (JSON.stringify(oldVal[key]) !== JSON.stringify(newVal[key])) {
      changed.push(key);
    }
  }

  return changed;
}

/**
 * Record an audit log entry in DB inside or outside a transaction.
 */
async function recordAuditLog(payload = {}, client = null) {
  const {
    entityType,
    entityId,
    docNo,
    action,
    oldValue,
    newValue,
    performedById,
    reason,
    req,
  } = payload;

  if (!entityType || !entityId || !action) {
    throw new Error('AuditLog requires entityType, entityId, and action');
  }

  const maskedOld = maskSensitiveData(oldValue);
  const maskedNew = maskSensitiveData(newValue);
  const changedFields = computeChangedFields(maskedOld, maskedNew);

  const data = {
    entityType: String(entityType),
    entityId: String(entityId),
    docNo: docNo ? String(docNo) : null,
    action: String(action),
    oldValue: maskedOld ? maskedOld : null,
    newValue: maskedNew ? maskedNew : null,
    changedFields: changedFields.length > 0 ? changedFields : null,
    performedById: performedById || req?.user?.id || null,
    reason: reason ? String(reason) : null,
    requestId: req?.requestId || null,
    ipAddress: req?.ip || null,
    userAgent: req?.get ? req.get('User-Agent') || null : null,
  };

  const dbClient = client || prisma;
  return dbClient.auditLog.create({ data });
}

module.exports = {
  SENSITIVE_KEYS,
  maskSensitiveData,
  computeChangedFields,
  recordAuditLog,
};
