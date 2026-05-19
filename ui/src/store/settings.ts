import { create } from 'zustand'
import { SettingsAPI } from '@/lib/api'
import type { UserRole } from '@/types'
import { DEFAULT_MENU_ACCESS } from '@/types'

interface SettingsState {
  menuAccessConfig: Record<string, UserRole[]>
  loaded: boolean
  fetchSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  menuAccessConfig: DEFAULT_MENU_ACCESS,
  loaded: false,

  fetchSettings: async () => {
    if (get().loaded) return
    try {
      const s = await SettingsAPI.get()
      set({
        menuAccessConfig: (s.menuAccessConfig as Record<string, UserRole[]>) ?? DEFAULT_MENU_ACCESS,
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },
}))
