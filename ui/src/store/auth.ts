import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/types'
import { AuthAPI } from '@/lib/api'

interface AuthState {
  user: AuthUser | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,

      login: async (username, password) => {
        const data = await AuthAPI.login(username, password)
        localStorage.setItem('gd_token', data.token)
        localStorage.setItem('gd_user', JSON.stringify(data.user))
        set({ user: data.user as AuthUser, token: data.token })
      },

      logout: () => {
        localStorage.removeItem('gd_token')
        localStorage.removeItem('gd_user')
        set({ user: null, token: null })
        window.location.href = '/login'
      },

      refreshMe: async () => {
        const user = await AuthAPI.me()
        set({ user: user as AuthUser })
      },
    }),
    {
      name: 'gd-auth',
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
)
