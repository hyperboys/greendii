'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { ROLE_LABELS } from '@/types'
import type { AppNotification } from '@/types'
import { NotificationsAPI } from '@/lib/api'
import { Bell, Menu, User, KeyRound, LogOut, ChevronDown } from 'lucide-react'

const POLL_INTERVAL = 30_000 // 30 seconds

export default function Header({ title, onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(() => {
    if (!user) return
    NotificationsAPI.list()
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications)
        setUnreadCount(unreadCount)
      })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    fetchNotifications()
    const timer = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchNotifications])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    setOpen(prev => !prev)
  }

  const handleMarkAllRead = async () => {
    await NotificationsAPI.markAllRead().catch(() => {})
    setNotifications(n => n.map(x => ({ ...x, read: true })))
    setUnreadCount(0)
  }

  const handleMarkRead = async (id: string) => {
    await NotificationsAPI.markRead(id).catch(() => {})
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000
    if (diff < 60) return 'เมื่อกี้'
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`
    return d.toLocaleDateString('en-GB')
  }

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-3 sm:px-5 py-3 flex items-center justify-between shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600"
            aria-label="เปิดเมนู"
          >
            <Menu size={22} />
          </button>
        )}
        <h1 className="text-base sm:text-lg font-bold text-green-dark truncate">{title || 'GreenDii Sales Workflow System'}</h1>
      </div>
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleOpen}
            className="relative p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500"
            aria-label="การแจ้งเตือน"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full sm:mt-1 w-[calc(100vw-1rem)] sm:w-80 max-w-sm bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                <span className="font-semibold text-gray-800 text-sm">การแจ้งเตือน</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-green-700 hover:underline">
                    อ่านทั้งหมด
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-6">ไม่มีการแจ้งเตือน</p>
                ) : (
                  notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => !n.read && handleMarkRead(n.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.read ? 'bg-green-50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                        <div className={!n.read ? '' : 'ml-4'}>
                          <p className="text-sm text-gray-700 leading-snug">{n.text}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtTime(n.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex items-center gap-2 hover:bg-gray-50 active:bg-gray-100 rounded-lg px-1.5 sm:px-2 py-1 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-green-main text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                {user.initials || user.fullName?.charAt(0)}
              </div>
              <div className="hidden sm:block text-left max-w-[160px]">
                <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{user.fullName}</p>
                <p className="text-xs text-gray-400 truncate">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
              <ChevronDown size={14} className="hidden sm:block text-gray-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); router.push('/profile') }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User size={15} className="text-gray-400" /> โปรไฟล์ของฉัน
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); router.push('/change-password') }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <KeyRound size={15} className="text-gray-400" /> เปลี่ยนรหัสผ่าน
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={logout}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={15} /> ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
