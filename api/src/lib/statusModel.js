/**
 * statusModel.js — Centralized Document Status Model & Mapping
 *
 * Defines canonical document status values, mappings to DB Prisma enum (DocStatus),
 * Thai display labels, and badge metadata.
 */

const STANDARD_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PENDING_APPROVAL: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

const STATUS_LABELS_TH = {
  [STANDARD_STATUS.DRAFT]: 'แบบร่าง',
  [STANDARD_STATUS.SUBMITTED]: 'ยื่นเอกสารแล้ว',
  [STANDARD_STATUS.PENDING_APPROVAL]: 'รออนุมัติ',
  [STANDARD_STATUS.APPROVED]: 'อนุมัติแล้ว',
  [STANDARD_STATUS.REJECTED]: 'ปฏิเสธ',
  [STANDARD_STATUS.RETURNED]: 'ส่งกลับแก้ไข',
  [STANDARD_STATUS.CANCELLED]: 'ยกเลิก',
  [STANDARD_STATUS.COMPLETED]: 'เสร็จสิ้น',
};

const DB_TO_DOMAIN_STATUS_MAP = {
  draft: STANDARD_STATUS.DRAFT,
  submitted: STANDARD_STATUS.SUBMITTED,
  pending: STANDARD_STATUS.PENDING_APPROVAL,
  approved: STANDARD_STATUS.APPROVED,
  rejected: STANDARD_STATUS.REJECTED,
  returned: STANDARD_STATUS.RETURNED,
  cancelled: STANDARD_STATUS.CANCELLED,
  completed: STANDARD_STATUS.COMPLETED,
};

const DOMAIN_TO_DB_STATUS_MAP = {
  [STANDARD_STATUS.DRAFT]: 'draft',
  [STANDARD_STATUS.SUBMITTED]: 'pending', // DB fallback for submitted state
  [STANDARD_STATUS.PENDING_APPROVAL]: 'pending',
  [STANDARD_STATUS.APPROVED]: 'approved',
  [STANDARD_STATUS.REJECTED]: 'rejected',
  [STANDARD_STATUS.RETURNED]: 'rejected', // DB fallback for returned state
  [STANDARD_STATUS.CANCELLED]: 'cancelled',
  [STANDARD_STATUS.COMPLETED]: 'approved', // DB fallback for completed state
};

/**
 * Normalize status input to canonical lower-case status string.
 */
function normalizeStatus(status) {
  if (!status) return STANDARD_STATUS.DRAFT;
  const key = String(status).trim().toLowerCase();
  return DB_TO_DOMAIN_STATUS_MAP[key] || key;
}

/**
 * Map domain status to Prisma DocStatus enum value.
 */
function mapDomainStatusToDb(domainStatus) {
  const norm = normalizeStatus(domainStatus);
  return DOMAIN_TO_DB_STATUS_MAP[norm] || 'draft';
}

/**
 * Get Thai display label for status.
 */
function getStatusLabelTh(status) {
  const norm = normalizeStatus(status);
  return STATUS_LABELS_TH[norm] || norm;
}

module.exports = {
  STANDARD_STATUS,
  STATUS_LABELS_TH,
  DB_TO_DOMAIN_STATUS_MAP,
  DOMAIN_TO_DB_STATUS_MAP,
  normalizeStatus,
  mapDomainStatusToDb,
  getStatusLabelTh,
};
