'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { type UserRole, ROLE_LABELS } from '@/types'
import {
  LayoutDashboard, FileText, ClipboardList, Handshake,
  ShoppingCart, CheckSquare, BarChart2, Users, Package,
  Ruler, ChevronLeft, ChevronRight, LogOut, Settings, type LucideIcon,
  Shield, GitBranch, Lock, ActivitySquare, ScrollText,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useSettingsStore } from '@/store/settings'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles?: UserRole[]
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quotations', label: 'ใบเสนอราคา (QO)', icon: FileText },
  { href: '/workorders', label: 'ใบสั่งงาน (WO)', icon: ClipboardList },
  { href: '/handovers', label: 'ส่งมอบงาน (HO)', icon: Handshake },
  { href: '/pr', label: 'ใบขอซื้อ (PR)', icon: ShoppingCart },
  { href: '/approvals', label: 'รออนุมัติ', icon: CheckSquare },
  { href: '/reports', label: 'รายงาน', icon: BarChart2, roles: ['admin', 'sale_mgr', 'admin_mgr', 'project_mgr', 'director'] },
]

const MASTER: NavItem[] = [
  { href: '/customers', label: 'ลูกค้า', icon: Users, roles: ['admin', 'sale_mgr', 'admin_mgr', 'director'] },
  { href: '/products', label: 'สินค้า', icon: Package, roles: ['admin', 'sale_mgr', 'admin_mgr', 'director'] },
  { href: '/units', label: 'หน่วยนับ', icon: Ruler, roles: ['admin', 'sale_mgr', 'admin_mgr', 'director'] },
]

const ADMIN_MENU: NavItem[] = [
  { href: '/users',                label: 'ผู้ใช้งาน',       icon: Users,           roles: ['admin', 'admin_mgr', 'director'] },
  { href: '/admin/approval-flow',  label: 'สายการอนุมัติ',    icon: GitBranch,        roles: ['admin', 'director'] },
  { href: '/admin/roles',          label: 'บทบาท & สิทธิ์',  icon: Shield,           roles: ['admin', 'director'] },
  { href: '/admin/menu-access',    label: 'ควบคุมเมนู',       icon: Lock,             roles: ['admin', 'director'] },
  { href: '/admin/audit-log',      label: 'บันทึกกิจกรรม',   icon: ActivitySquare,   roles: ['admin', 'admin_mgr', 'director'] },
  { href: '/admin/activity-log',   label: 'Activity Log',     icon: ScrollText,        roles: ['admin', 'director'] },
  { href: '/settings',             label: 'ตั้งค่าระบบ',      icon: Settings,         roles: ['admin', 'director'] },
]

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { menuAccessConfig } = useSettingsStore()
  const [collapsed, setCollapsed] = useState(false)

  const navClass = (active: boolean) =>
    collapsed
      ? clsx(
          'flex items-center justify-center p-2.5 rounded-lg mx-1 transition-all duration-200',
          active ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
        )
      : clsx(
          'flex items-center gap-3 py-2.5 pr-4 pl-3 text-sm font-medium transition-all duration-200 border-l-[3px] rounded-r-xl',
          active
            ? 'bg-white/15 text-white border-green-light'
            : 'border-transparent text-white/70 hover:bg-white/10 hover:text-white hover:border-white/10'
        )

  // For NAV/MASTER menus: check against DB-driven menuAccessConfig (falls back to hardcoded roles)
  const canSeeMenu = (menuKey: string, fallbackRoles?: UserRole[]) => {
    if (!user) return false
    const configRoles = menuAccessConfig[menuKey]
    const roles = configRoles ?? fallbackRoles
    return !roles || roles.includes(user.role as UserRole)
  }

  // Admin menu always uses hardcoded roles (never DB-configurable)
  const canSee = (roles?: UserRole[]) =>
    !roles || !user || roles.includes(user.role as UserRole)

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside className={clsx(
        'flex flex-col h-screen bg-gradient-to-b from-[#1b5e20] via-[#2d6a2e] to-[#264e27] text-white transition-all duration-200 shrink-0',
        'fixed md:static inset-y-0 left-0 z-50',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'w-14' : 'w-56'
      )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-green-main/30">
        {!collapsed && (
          <Image
            src="/logo.jpg"
            alt="GreenDii Company Limited"
            width={140}
            height={60}
            className="object-contain"
            priority
          />
        )}
        {collapsed && (
          <span className="text-sm font-black text-white tracking-wide">GD</span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto p-1 rounded hover:bg-green-main/30 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-semibold uppercase text-white/40 tracking-widest">เมนูหลัก</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        )}
        {NAV.filter(item => canSeeMenu(item.href.replace('/', ''), item.roles)).map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={navClass(active)}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* Master Data section */}
        {MASTER.some(item => canSeeMenu(item.href.replace('/', ''), item.roles)) && (
          <>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 pt-4 pb-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase text-white/40 tracking-widest">ข้อมูลหลัก</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            )}
            {MASTER.filter(item => canSeeMenu(item.href.replace('/', ''), item.roles)).map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={navClass(active)}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </>
        )}

        {/* Admin section */}
        {ADMIN_MENU.some(item => canSee(item.roles)) && (
          <>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 pt-4 pb-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase text-white/40 tracking-widest">ผู้ดูแลระบบ</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            )}
            {ADMIN_MENU.filter(item => canSee(item.roles)).map(item => {
              const active = pathname === item.href || (item.href !== '/settings' && item.href !== '/users' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={navClass(active)}
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
      <div className="border-t border-white/10 p-3 space-y-2">
        {user && (
          <div className={clsx('flex items-center gap-2.5', collapsed && 'justify-center')}>
            <div className="w-8 h-8 rounded-full bg-green-main/40 border border-green-light/40 flex items-center justify-center text-xs font-bold shrink-0">
              {user.initials || user.fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.fullName}</p>
                <p className="text-xs text-white/50 truncate">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={logout}
          title="ออกจากระบบ"
          className={clsx(
            'flex items-center gap-3 w-full rounded-lg text-sm text-white/70 hover:bg-red-500/20 hover:text-red-300 transition-colors',
            collapsed ? 'justify-center p-2' : 'px-3 py-2'
          )}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>ออกจากระบบ</span>}
        </button>
      </div>
    </aside>
    </>
  )
}
