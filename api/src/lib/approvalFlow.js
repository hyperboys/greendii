/**
 * approvalFlow.js — Single source of truth for approval flow logic
 *
 * Step → Role mapping (must match APPROVAL_STEPS in ui/src/types/index.ts):
 *   Step 1 = sales       (เซลล์คนอื่น — ต้องไม่ใช่ผู้สร้างเอกสาร)
 *   Step 2 = sale_mgr     (ผู้จัดการฝ่ายขาย)
 *   Step 3 = admin_mgr    (ผู้จัดการฝ่ายบริหาร)
 *   Step 4 = project_mgr  (ผู้จัดการโครงการ)
 *   Step 5 = director     (กรรมการผู้จัดการ)
 *   Step 6 = procurement  (จัดซื้อ)
 *   Step 7 = factory      (โรงงาน/ผลิต)
 *
 * NOTE: Step 1 approver must be a 'sales' user who is NOT the document creator.
 *
 * Flow config is stored in settings.approvalFlowConfig (JSON) per doc type.
 * Example: { quotation:[1,2,3,4,5], workOrder:[3,4,5], pr:[3,4,5,6], handover:[3,4,5] }
 * Falls back to DEFAULT_FLOW if not configured.
 */

const prisma = require('./prisma');

// Role → step number (used to filter "my pending items" for a logged-in user)
const ROLE_STEP = {
  sales:       1,
  sale_mgr:    2,
  admin_mgr:   3,
  project_mgr: 4,
  director:    5,
  procurement: 6,
  factory:     7,
};

// Step number → role (used to notify the right people)
const STEP_ROLE = {
  1: 'sales',
  2: 'sale_mgr',
  3: 'admin_mgr',
  4: 'project_mgr',
  5: 'director',
  6: 'procurement',
  7: 'factory',
};

// Default flow used when settings.approvalFlowConfig is not set
const DEFAULT_FLOW = {
  quotation: [1, 2, 3, 4, 5],
  workOrder: [3, 4, 5],
  pr:        [3, 4, 5, 6],
  handover:  [3, 4, 5],
};

/**
 * Read approval steps for a doc type from DB settings.
 * Falls back to DEFAULT_FLOW if DB has no config.
 */
async function getFlowSteps(docType) {
  const settings = await prisma.settings.findUnique({ where: { id: 'main' } });
  const config = settings?.approvalFlowConfig ?? {};
  return config[docType] ?? DEFAULT_FLOW[docType] ?? [];
}

/**
 * Return the first step when a document is submitted.
 * e.g. quotation → 1 (sales2), workOrder → 3 (admin_mgr)
 */
async function getFirstStep(docType) {
  const steps = await getFlowSteps(docType);
  return steps.length > 0 ? steps[0] : null;
}

/**
 * Return the next step after currentStep, or null if currentStep is the last.
 * null means the document should be marked 'approved'.
 */
async function getNextStep(docType, currentStep) {
  const steps = await getFlowSteps(docType);
  const idx = steps.indexOf(currentStep);
  if (idx === -1 || idx >= steps.length - 1) return null;
  return steps[idx + 1];
}

module.exports = { ROLE_STEP, STEP_ROLE, DEFAULT_FLOW, getFlowSteps, getFirstStep, getNextStep };
