import { create } from 'zustand'
import { SettingsAPI } from '@/lib/api'
import type { UserRole, RolePermissionsConfig } from '@/types'
import { DEFAULT_MENU_ACCESS, DEFAULT_ROLES, DEFAULT_PERMISSIONS } from '@/types'

interface SettingsState {
  menuAccessConfig: Record<string, UserRole[]>
  rolePermissionsConfig: RolePermissionsConfig
  loaded: boolean
  fetchSettings: () => Promise<void>
  hasPerm: (permKey: string, userRole: string) => boolean
  getRoleLabel: (roleKey: string) => string
}

const DEFAULT_ROLE_PERMISSIONS: RolePermissionsConfig = {
  roles: DEFAULT_ROLES,
  permissions: DEFAULT_PERMISSIONS,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  menuAccessConfig: DEFAULT_MENU_ACCESS,
  rolePermissionsConfig: DEFAULT_ROLE_PERMISSIONS,
  loaded: false,

  fetchSettings: async () => {
    if (get().loaded) return
    try {
      const s = await SettingsAPI.get()
      set({
        menuAccessConfig: (s.menuAccessConfig as Record<string, UserRole[]>) ?? DEFAULT_MENU_ACCESS,
        rolePermissionsConfig: (s.rolePermissionsConfig as RolePermissionsConfig) ?? DEFAULT_ROLE_PERMISSIONS,
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  hasPerm: (permKey, userRole) => {
    const { rolePermissionsConfig } = get()
    const perm = rolePermissionsConfig.permissions.find(p => p.key === permKey)
    return perm?.roles.includes(userRole) ?? false
  },

  getRoleLabel: (roleKey) => {
    const { rolePermissionsConfig } = get()
    const role = rolePermissionsConfig.roles.find(r => r.key === roleKey)
    return role?.label ?? roleKey
  },
}))
