'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user, _hasHydrated } = useAuthStore()
  const { fetchSettings } = useSettingsStore()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDashboard = pathname === '/dashboard'

  useEffect(() => {
    if (!_hasHydrated) return
    if (!token) {
      router.replace('/login')
    } else if (user?.mustChangePassword) {
      router.replace('/change-password')
    } else {
      fetchSettings()
    }
  }, [token, user, _hasHydrated, router, fetchSettings])

  if (!_hasHydrated) return null
  if (!token) return null
  if (user?.mustChangePassword) return null

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(o => !o)} />
        <main className={`flex-1 overflow-y-auto ${isDashboard ? 'p-3 sm:p-4 md:p-5 lg:p-6' : 'p-3 sm:p-4 md:p-6 lg:p-8'}`}>
          <div className={isDashboard ? 'w-full' : 'max-w-[1600px] mx-auto w-full'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
