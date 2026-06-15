import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/types'
import { AuthAPI } from '@/lib/api'
import { normalizeUserRole } from '@/lib/roleAliases'

function normalizeAuthUser(user: AuthUser | null): AuthUser | null {
  if (!user) return null
  return { ...user, role: normalizeUserRole(user.role) }
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      login: async (username, password) => {
        const data = await AuthAPI.login(username, password)
        localStorage.setItem('gd_token', data.token)
        localStorage.setItem('gd_refresh', data.refreshToken)
        const normalizedUser = normalizeAuthUser(data.user as AuthUser)
        localStorage.setItem('gd_user', JSON.stringify(normalizedUser))
        set({ user: normalizedUser, token: data.token })
      },

      logout: () => {
        const refreshToken = localStorage.getItem('gd_refresh')
        if (refreshToken) {
          // Fire-and-forget revoke; never block logout on the network call.
          AuthAPI.logout(refreshToken).catch(() => {})
        }
        localStorage.removeItem('gd_token')
        localStorage.removeItem('gd_refresh')
        localStorage.removeItem('gd_user')
        set({ user: null, token: null })
        window.location.href = '/login'
      },

      refreshMe: async () => {
        const user = await AuthAPI.me()
        const normalizedUser = normalizeAuthUser(user as AuthUser)
        set({ user: normalizedUser })
      },
    }),
    {
      name: 'gd-auth',
      partialize: (s) => ({ user: s.user, token: s.token }),
      onRehydrateStorage: () => (state) => {
        if (state?.user) state.user = normalizeAuthUser(state.user)
        state?.setHasHydrated(true)
      },
    }
  )
)
