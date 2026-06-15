const ROLE_ALIASES = {
  sales2: 'sales',
};

function normalizeRole(role) {
  if (!role) return role;
  return ROLE_ALIASES[role] || role;
}

function expandRoleAliases(role) {
  const normalized = normalizeRole(role);
  if (normalized === 'sales') return ['sales', 'sales2'];
  return [normalized];
}

module.exports = {
  normalizeRole,
  expandRoleAliases,
};
