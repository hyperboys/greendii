import { create } from 'zustand'
import { SettingsAPI } from '@/lib/api'
import type { UserRole, RolePermissionsConfig } from '@/types'
import { DEFAULT_MENU_ACCESS, DEFAULT_ROLES, DEFAULT_PERMISSIONS, DEFAULT_STEP_ROLE } from '@/types'
import { normalizeUserRole } from '@/lib/roleAliases'

interface SettingsState {
  menuAccessConfig: Record<string, UserRole[]>
  rolePermissionsConfig: RolePermissionsConfig
  // stepRoleConfig: step number (string key) → role key, e.g. { "1": "sales", "8": "hr_mgr" }
  stepRoleConfig: Record<string, string>
  loaded: boolean
  fetchSettings: () => Promise<void>
  hasPerm: (permKey: string, userRole: string) => boolean
  getRoleLabel: (roleKey: string) => string
  getStepLabel: (step: number) => string
}

const DEFAULT_ROLE_PERMISSIONS: RolePermissionsConfig = {
  roles: DEFAULT_ROLES,
  permissions: DEFAULT_PERMISSIONS,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  menuAccessConfig: DEFAULT_MENU_ACCESS,
  rolePermissionsConfig: DEFAULT_ROLE_PERMISSIONS,
  stepRoleConfig: DEFAULT_STEP_ROLE,
  loaded: false,

  fetchSettings: async () => {
    if (get().loaded) return
    try {
      const s = await SettingsAPI.get()
      set({
        menuAccessConfig: (s.menuAccessConfig as Record<string, UserRole[]>) ?? DEFAULT_MENU_ACCESS,
        rolePermissionsConfig: (s.rolePermissionsConfig as RolePermissionsConfig) ?? DEFAULT_ROLE_PERMISSIONS,
        stepRoleConfig: (s.stepRoleConfig as Record<string, string>) ?? DEFAULT_STEP_ROLE,
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  hasPerm: (permKey, userRole) => {
    const { rolePermissionsConfig } = get()
    const perm = rolePermissionsConfig.permissions.find(p => p.key === permKey)
    const normalizedRole = normalizeUserRole(userRole)
    return perm?.roles.map(normalizeUserRole).includes(normalizedRole) ?? false
  },

  getRoleLabel: (roleKey) => {
    const { rolePermissionsConfig } = get()
    const role = rolePermissionsConfig.roles.find(r => r.key === roleKey)
    return role?.label ?? roleKey
  },

  getStepLabel: (step) => {
    const { stepRoleConfig, rolePermissionsConfig } = get()
    const roleKey = stepRoleConfig[String(step)]
    if (!roleKey) return `Step ${step}`
    const role = rolePermissionsConfig.roles.find(r => r.key === roleKey)
    return role?.label ?? roleKey
  },
}))
