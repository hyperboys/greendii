'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!token) {
      router.replace('/login')
    } else if (user?.mustChangePassword) {
      router.replace('/change-password')
    }
  }, [token, user, router])

  if (!token) return null
  if (user?.mustChangePassword) return null

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
