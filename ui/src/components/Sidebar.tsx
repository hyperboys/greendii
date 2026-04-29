'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import type { UserRole } from '@/types'
import {
  LayoutDashboard, FileText, ClipboardList, Handshake,
  ShoppingCart, CheckSquare, BarChart2, Users, Package,
  Ruler, ChevronLeft, ChevronRight, LogOut, type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles?: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quotations', label: 'ใบเสนอราคา', icon: FileText },
  { href: '/workorders', label: 'ใบสั่งงาน', icon: ClipboardList },
  { href: '/handovers', label: 'ส่งมอบงาน', icon: Handshake },
  { href: '/pr', label: 'ใบขอซื้อ', icon: ShoppingCart },
  { href: '/approvals', label: 'รออนุมัติ', icon: CheckSquare },
  { href: '/reports', label: 'รายงาน', icon: BarChart2, roles: ['sale_mgr', 'admin_mgr', 'project_mgr', 'director'] },
]

const MASTER: NavItem[] = [
  { href: '/customers', label: 'ลูกค้า', icon: Users, roles: ['sale_mgr', 'admin_mgr', 'director'] },
  { href: '/products', label: 'สินค้า', icon: Package, roles: ['sale_mgr', 'admin_mgr', 'director'] },
  { href: '/units', label: 'หน่วยนับ', icon: Ruler, roles: ['sale_mgr', 'admin_mgr', 'director'] },
  { href: '/users', label: 'ผู้ใช้งาน', icon: Users, roles: ['admin_mgr', 'director'] },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const canSee = (roles?: UserRole[]) =>
    !roles || !user || roles.includes(user.role as UserRole)

  return (
    <aside className={clsx(
      'flex flex-col h-screen bg-green-dark text-white transition-all duration-200 shrink-0',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-green-main/30">
        {!collapsed && (
          <span className="font-bold text-lg tracking-wide">Green Dii</span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto p-1 rounded hover:bg-green-main/30 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.filter(item => canSee(item.roles)).map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-green-main text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* Master Data section */}
        {MASTER.some(item => canSee(item.roles)) && (
          <>
            {!collapsed && (
              <p className="px-4 pt-4 pb-1 text-xs font-semibold uppercase text-white/40 tracking-wider">
                ข้อมูลหลัก
              </p>
            )}
            {MASTER.filter(item => canSee(item.roles)).map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-sm font-medium transition-colors',
                    active ? 'bg-green-main text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-green-main/30 p-3">
        {!collapsed && user && (
          <div className="mb-2 px-1">
            <p className="text-sm font-semibold truncate">{user.fullName}</p>
            <p className="text-xs text-white/50 truncate">{user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          title="ออกจากระบบ"
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-red-500/20 hover:text-red-300 transition-colors"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>ออกจากระบบ</span>}
        </button>
      </div>
    </aside>
  )
}
