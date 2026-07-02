const prisma = require('./prisma');
const { normalizeRole } = require('./roleAliases');

const BYPASS_CONFIG_KEY = 'approvalBypassConfig';
const DOC_KEYS = ['quotation', 'workOrder', 'pr', 'handover'];
const DEFAULT_DOC_BYPASS_ROLES = ['admin'];

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return Array.from(new Set(roles.map(role => normalizeRole(role)).filter(Boolean)));
}

function readBypassConfig(approvalFlowConfig) {
  const raw = approvalFlowConfig && typeof approvalFlowConfig === 'object'
    ? approvalFlowConfig[BYPASS_CONFIG_KEY]
    : null;

  const config = {};
  for (const key of DOC_KEYS) {
    const configured = normalizeRoles(raw?.[key]);
    config[key] = configured.length > 0 ? configured : [...DEFAULT_DOC_BYPASS_ROLES];
  }
  return config;
}

async function canBypassDocApproval(docType, role) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;

  const settings = await prisma.settings.findUnique({
    where: { id: 'main' },
    select: { approvalFlowConfig: true },
  });
  const config = readBypassConfig(settings?.approvalFlowConfig);
  const roles = config[docType] || [];
  return roles.includes(normalizedRole);
}

module.exports = {
  BYPASS_CONFIG_KEY,
  DOC_KEYS,
  readBypassConfig,
  canBypassDocApproval,
};
