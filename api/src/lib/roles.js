// Centralized role groups for access control.
// Keeping these in one place avoids drift between routes.

// Roles that can view/manage documents belonging to other sales users.
const DOC_MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory'];

// Roles allowed to delete/cancel documents owned by other users.
const DOC_DELETE_ROLES = ['admin', 'director', 'admin_mgr'];

// Quotation is intentionally stricter than other document types because it is
// owned and handled by the originating sales user rather than cross-team flows.
const QUOTATION_MANAGER_ROLES = ['admin', 'admin_mgr', 'director'];

function canManageAllDocs(role) {
  return DOC_MANAGER_ROLES.includes(role);
}

function canDeleteOthersDocs(role) {
  return DOC_DELETE_ROLES.includes(role);
}

function canManageAllQuotations(role) {
  return QUOTATION_MANAGER_ROLES.includes(role);
}

/**
 * Throw a 403 error if a non-manager user tries to access a document
 * that does not belong to them.
 */
function assertDocAccessible(req, doc) {
  if (!doc) return;
  if (!canManageAllDocs(req.user.role) && doc.salesId !== req.user.id) {
    const error = new Error('ไม่มีสิทธิ์เข้าถึงเอกสารของผู้อื่น');
    error.status = 403;
    throw error;
  }
}

function assertQuotationAccessible(req, doc) {
  if (!doc) return;
  if (!canManageAllQuotations(req.user.role) && doc.salesId !== req.user.id) {
    const error = new Error('ไม่มีสิทธิ์เข้าถึงใบเสนอราคาของผู้อื่น');
    error.status = 403;
    throw error;
  }
}

module.exports = {
  DOC_MANAGER_ROLES,
  DOC_DELETE_ROLES,
  QUOTATION_MANAGER_ROLES,
  canManageAllDocs,
  canDeleteOthersDocs,
  canManageAllQuotations,
  assertDocAccessible,
  assertQuotationAccessible,
};
