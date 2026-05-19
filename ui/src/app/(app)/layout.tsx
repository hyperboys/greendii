'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  const { fetchSettings } = useSettingsStore()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!token) {
      router.replace('/login')
    } else if (user?.mustChangePassword) {
      router.replace('/change-password')
    } else {
      fetchSettings()
    }
  }, [token, user, router, fetchSettings])

  if (!token) return null
  if (user?.mustChangePassword) return null

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
