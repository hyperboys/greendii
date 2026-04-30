'use client'

import { useAuthStore } from '@/store/auth'
import { ROLE_LABELS } from '@/types'
import { Bell, Menu } from 'lucide-react'

export default function Header({ title, onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  const { user } = useAuthStore()

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="text-lg font-bold text-gray-800">{title || 'GreenDii'}</h1>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <Bell size={18} />
        </button>
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-main text-white flex items-center justify-center text-sm font-bold shrink-0">
              {user.initials || user.fullName?.charAt(0)}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-gray-800 leading-tight">{user.fullName}</p>
              <p className="text-xs text-gray-400">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
