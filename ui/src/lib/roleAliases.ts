const ROLE_ALIASES: Record<string, string> = {
  sales2: 'sales',
  managing_director: 'director',
}

export function normalizeUserRole(role?: string | null): string {
  if (!role) return ''
  return ROLE_ALIASES[role] ?? role
}

export function hasRole(userRole: string | undefined | null, allowedRoles: string[]): boolean {
  const normalized = normalizeUserRole(userRole)
  return allowedRoles.map(normalizeUserRole).includes(normalized)
}
