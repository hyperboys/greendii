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
const { normalizeRole } = require('./roleAliases');

// ─── DEFAULTS (fallback when DB has no stepRoleConfig) ───────────────────────

// Role → step number
const DEFAULT_ROLE_STEP = {
  sales:       1,
  sale_mgr:    2,
  admin_mgr:   3,
  project_mgr: 4,
  director:    5,
  procurement: 6,
  factory:     7,
};

// Step number → role
const DEFAULT_STEP_ROLE = {
  1: 'sales',
  2: 'sale_mgr',
  3: 'admin_mgr',
  4: 'project_mgr',
  5: 'director',
  6: 'procurement',
  7: 'factory',
};

// Legacy exports (kept for backwards compat — prefer getStepRoleMapping())
const ROLE_STEP = DEFAULT_ROLE_STEP;
const STEP_ROLE = DEFAULT_STEP_ROLE;

// Default flow used when settings.approvalFlowConfig is not set
// quotation: [] means no approval steps — submit auto-approves
const DEFAULT_FLOW = {
  quotation: [],
  workOrder: [3, 4, 5],
  pr:        [3, 4, 5, 6],
  handover:  [3, 4, 5],
};

/**
 * Load step↔role mappings from DB settings.stepRoleConfig.
 * Falls back to DEFAULT_ROLE_STEP / DEFAULT_STEP_ROLE if not configured.
 *
 * stepRoleConfig in DB is stored as: { "1": "sales", "2": "sale_mgr", ... }
 *
 * Returns { stepRole, roleStep }:
 *   stepRole  = { 1: 'sales', 2: 'sale_mgr', ... }   (number key)
 *   roleStep  = { sales: 1, sale_mgr: 2, ... }
 */
async function getStepRoleMapping() {
  const settings = await prisma.settings.findUnique({ where: { id: 'main' } });
  const raw = settings?.stepRoleConfig;

  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
    return { stepRole: { ...DEFAULT_STEP_ROLE }, roleStep: { ...DEFAULT_ROLE_STEP } };
  }

  // raw keys are strings ("1", "2", ...) — convert to numbers for stepRole
  const stepRole = {};
  const roleStep = {};
  for (const [stepStr, role] of Object.entries(raw)) {
    const step = Number(stepStr);
    const normalizedRole = normalizeRole(role);
    stepRole[step] = normalizedRole;
    roleStep[normalizedRole] = step;
  }
  return { stepRole, roleStep };
}

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
 * e.g. quotation → 1 (sales), workOrder → 3 (admin_mgr)
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

// ─── PR — per-type flow + creator-role skipping ──────────────────────────────

/**
 * Remove any step whose mapped role equals the document creator's role.
 * Rationale: ผู้สร้างเอกสารไม่อนุมัติเอกสารของตัวเอง — ข้ามขั้นนั้นไปเลย
 * (เช่น ถ้าผู้สร้างเป็น sale_mgr และ flow มีขั้นของ sale_mgr ก็ข้ามขั้นนั้น)
 */
function filterCreatorSteps(steps, creatorRole, stepRole) {
  if (!creatorRole) return [...steps];
  const normalizedCreatorRole = normalizeRole(creatorRole);
  return steps.filter(step => normalizeRole(stepRole[step]) !== normalizedCreatorRole);
}

/**
 * Resolve the effective approval flow for a single PR.
 *  - prTypeSteps: array stored on the PR's PrType (may be empty/undefined)
 *  - creatorRole: role of the user who created the PR
 *
 * Falls back to the default 'pr' flow when the type has no custom steps,
 * then removes every step that belongs to the creator's own role.
 */
async function resolvePrFlow(prTypeSteps, creatorRole) {
  const { stepRole } = await getStepRoleMapping();
  const baseSteps = Array.isArray(prTypeSteps) && prTypeSteps.length > 0
    ? prTypeSteps.map(Number).filter(n => Number.isInteger(n) && n > 0)
    : await getFlowSteps('pr');
  return filterCreatorSteps(baseSteps, creatorRole, stepRole);
}

/** First effective step for a PR, or null when it should auto-approve. */
async function getPrFirstStep(prTypeSteps, creatorRole) {
  const steps = await resolvePrFlow(prTypeSteps, creatorRole);
  return steps.length > 0 ? steps[0] : null;
}

/** Next effective step after currentStep for a PR, or null when finished. */
async function getPrNextStep(prTypeSteps, creatorRole, currentStep) {
  const steps = await resolvePrFlow(prTypeSteps, creatorRole);
  const idx = steps.indexOf(currentStep);
  if (idx === -1 || idx >= steps.length - 1) return null;
  return steps[idx + 1];
}

module.exports = {
  ROLE_STEP, STEP_ROLE, DEFAULT_FLOW,
  getFlowSteps, getFirstStep, getNextStep, getStepRoleMapping,
  resolvePrFlow, getPrFirstStep, getPrNextStep,
};
