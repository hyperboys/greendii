export function normalizeUserRole(role?: string | null): string {
  if (!role) return ''
  if (role === 'sales2') return 'sales'
  return role
}

export function hasRole(userRole: string | undefined | null, allowedRoles: string[]): boolean {
  const normalized = normalizeUserRole(userRole)
  return allowedRoles.map(normalizeUserRole).includes(normalized)
}
