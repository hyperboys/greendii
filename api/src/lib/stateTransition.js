/**
 * stateTransition.js — Document State Transition Rules & Validation
 *
 * Enforces valid state transition matrix and action rules across all modules.
 */

const { STANDARD_STATUS, normalizeStatus, getStatusLabelTh } = require('./statusModel');

// Matrix of allowed state transitions
const VALID_TRANSITIONS = {
  [STANDARD_STATUS.DRAFT]: [
    STANDARD_STATUS.SUBMITTED,
    STANDARD_STATUS.PENDING_APPROVAL,
    STANDARD_STATUS.APPROVED, // Auto-approve flow when no steps
    STANDARD_STATUS.CANCELLED,
  ],
  [STANDARD_STATUS.SUBMITTED]: [
    STANDARD_STATUS.PENDING_APPROVAL,
    STANDARD_STATUS.APPROVED,
    STANDARD_STATUS.RETURNED,
    STANDARD_STATUS.REJECTED,
    STANDARD_STATUS.CANCELLED,
    STANDARD_STATUS.DRAFT,
  ],
  [STANDARD_STATUS.PENDING_APPROVAL]: [
    STANDARD_STATUS.PENDING_APPROVAL, // Advance to next step
    STANDARD_STATUS.APPROVED,
    STANDARD_STATUS.REJECTED,
    STANDARD_STATUS.RETURNED,
    STANDARD_STATUS.CANCELLED,
  ],
  [STANDARD_STATUS.APPROVED]: [
    STANDARD_STATUS.COMPLETED,
    STANDARD_STATUS.CANCELLED,
    STANDARD_STATUS.DRAFT, // Direct revision creation
  ],
  [STANDARD_STATUS.REJECTED]: [
    STANDARD_STATUS.DRAFT,
    STANDARD_STATUS.SUBMITTED,
    STANDARD_STATUS.PENDING_APPROVAL,
    STANDARD_STATUS.CANCELLED,
  ],
  [STANDARD_STATUS.RETURNED]: [
    STANDARD_STATUS.DRAFT,
    STANDARD_STATUS.SUBMITTED,
    STANDARD_STATUS.PENDING_APPROVAL,
    STANDARD_STATUS.CANCELLED,
  ],
  [STANDARD_STATUS.CANCELLED]: [], // Terminal state
  [STANDARD_STATUS.COMPLETED]: [], // Terminal state
};

// Actions requiring a non-empty reason
const REASON_REQUIRED_ACTIONS = ['reject', 'return', 'cancel'];

/**
 * Validate document status transition.
 * Throws a 400 Bad Request error if invalid.
 */
function validateStateTransition(currentStatus, targetStatus, action = '', options = {}) {
  const from = normalizeStatus(currentStatus);
  const to = normalizeStatus(targetStatus);
  const act = String(action || '').trim().toLowerCase();
  const reason = String(options.reason || '').trim();

  // 1. Terminal state check
  if ([STANDARD_STATUS.CANCELLED, STANDARD_STATUS.COMPLETED].includes(from)) {
    const err = new Error(`ไม่สามารถเปลี่ยนสถานะเอกสารที่${getStatusLabelTh(from)}แล้วได้`);
    err.status = 400;
    throw err;
  }

  // 2. Transition matrix check
  const allowedNextStates = VALID_TRANSITIONS[from] || [];
  if (from !== to && !allowedNextStates.includes(to)) {
    const err = new Error(
      `ไม่สามารถเปลี่ยนสถานะจาก "${getStatusLabelTh(from)}" เป็น "${getStatusLabelTh(to)}" ได้`,
    );
    err.status = 400;
    throw err;
  }

  // 3. Reason requirement check
  if (REASON_REQUIRED_ACTIONS.includes(act) && !reason) {
    const err = new Error(`ต้องระบุเหตุผลสำหรับการทำรายการ "${act}"`);
    err.status = 400;
    throw err;
  }

  return true;
}

module.exports = {
  VALID_TRANSITIONS,
  REASON_REQUIRED_ACTIONS,
  validateStateTransition,
};
