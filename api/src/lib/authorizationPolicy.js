/**
 * authorizationPolicy.js — Backend Authorization Policy Engine
 *
 * Centralizes permission checks for document actions, roles, and bypass settings.
 * Enforces security on Backend (never rely solely on UI buttons).
 */

const prisma = require('./prisma');
const { normalizeRole } = require('./roleAliases');
const { canManageAllDocs, canDeleteOthersDocs } = require('./roles');
const { getBypassRolesForDocType } = require('./approvalBypass');

/**
 * Check if user is document owner (salesId matches user.id).
 */
function isDocOwner(user, doc) {
  if (!user || !doc) return false;
  return String(doc.salesId) === String(user.id);
}

/**
 * Assert user has permission to perform action on document.
 * Throws 403 error if unauthorized.
 */
async function assertActionAuthorized(user, action, doc = null, context = {}) {
  if (!user) {
    const err = new Error('กรุณาเข้าสู่ระบบก่อนดำเนินการ');
    err.status = 401;
    throw err;
  }

  const role = normalizeRole(user.role);
  const act = String(action || '').trim().toLowerCase();
  const docType = context.docType || (doc ? doc.docType : '');

  // Admin bypass for generic administrative commands
  if (role === 'admin') return true;

  switch (act) {
    case 'view':
    case 'print':
      if (doc) {
        if (canManageAllDocs(role) || isDocOwner(user, doc)) return true;
        // Check if user was an approver in approval logs
        if (Array.isArray(doc.approvalLogs) && doc.approvalLogs.some(log => String(log.approverId) === String(user.id))) {
          return true;
        }
        const err = new Error('ไม่มีสิทธิ์เข้าถึงเอกสารนี้');
        err.status = 403;
        throw err;
      }
      return true;

    case 'create':
      return true;

    case 'edit':
      if (doc) {
        // Editable only in draft/rejected unless user is bypass/manager
        const isEditable = ['draft', 'rejected'].includes(doc.status);
        const canEdit = isEditable && (isDocOwner(user, doc) || canManageAllDocs(role));
        if (!canEdit) {
          const err = new Error('ไม่มีสิทธิ์แก้ไขเอกสารนี้ในสถานะปัจจุบัน');
          err.status = 403;
          throw err;
        }
      }
      return true;

    case 'submit':
      if (doc) {
        if (!isDocOwner(user, doc) && !canManageAllDocs(role)) {
          const err = new Error('เฉพาะเจ้าของเอกสารหรือผู้ดูแลจึงจะส่งอนุมัติได้');
          err.status = 403;
          throw err;
        }
      }
      return true;

    case 'approve':
    case 'reject':
    case 'return':
      if (docType) {
        const bypassRoles = await getBypassRolesForDocType(docType);
        if (bypassRoles.includes(role)) return true;
      }
      if (context.requiredRole) {
        const reqRole = normalizeRole(context.requiredRole);
        if (role !== reqRole && !canManageAllDocs(role)) {
          const err = new Error(`ไม่มีสิทธิ์ดำเนินการอนุมัติ (ต้องการสิทธิ์: ${reqRole})`);
          err.status = 403;
          throw err;
        }
      }
      return true;

    case 'cancel':
      if (doc) {
        if (!isDocOwner(user, doc) && !canDeleteOthersDocs(role)) {
          const err = new Error('ไม่มีสิทธิ์ยกเลิกเอกสารของผู้อื่น');
          err.status = 403;
          throw err;
        }
      }
      return true;

    case 'export':
    case 'view_audit':
      if (!canManageAllDocs(role)) {
        const err = new Error('ไม่มีสิทธิ์ดูประวัติ Audit Log หรือ Export ข้อมูล');
        err.status = 403;
        throw err;
      }
      return true;

    default:
      return true;
  }
}

module.exports = {
  isDocOwner,
  assertActionAuthorized,
};
