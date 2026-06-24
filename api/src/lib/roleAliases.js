const ROLE_ALIASES = {
  sales2: 'sales',
  managing_director: 'director',
};

function normalizeRole(role) {
  if (!role) return role;
  return ROLE_ALIASES[role] || role;
}

function expandRoleAliases(role) {
  const normalized = normalizeRole(role);
  if (normalized === 'sales') return ['sales', 'sales2'];
  if (normalized === 'director') return ['director', 'managing_director'];
  return [normalized];
}

module.exports = {
  normalizeRole,
  expandRoleAliases,
};
