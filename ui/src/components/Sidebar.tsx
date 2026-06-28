'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { type UserRole, ROLE_LABELS } from '@/types'
import {
  ChevronLeft, ChevronRight, LogOut, X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useSettingsStore } from '@/store/settings'
import { hasRole } from '@/lib/roleAliases'

interface NavItem {
  href: string
  label: string
  roles?: UserRole[]
  menuKey?: string
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: '📊 Dashboard', menuKey: 'dashboard' },
  { href: '/quotations', label: ' 📋 Quotation', menuKey: 'quotations' },
  { href: '/workorders', label: ' 🔧 Work Order', menuKey: 'workorders' },
  { href: '/workorders/email', label: ' ✉️ ส่งอีเมล WO', menuKey: 'workorder-email', roles: ['admin', 'sales', 'sale_mgr', 'admin_mgr', 'project_mgr', 'director'] },
  { href: '/handovers', label: ' 🤝 Handover', menuKey: 'handovers' },
  { href: '/pr', label: ' 🛒 Purchase Request', menuKey: 'pr' },
  { href: '/approvals', label: ' ✅ Pending Approvals', menuKey: 'approvals' },
  { href: '/reports', label: ' 📊 Reports', menuKey: 'reports', roles: ['admin', 'sale_mgr', 'admin_mgr', 'project_mgr', 'director'] },
]

const MASTER: NavItem[] = [
  { href: '/customers', label: '👥 Customers', roles: ['admin', 'sale_mgr', 'admin_mgr', 'director'], menuKey: 'customers' },
  { href: '/products', label: '📦 Products', roles: ['admin', 'sale_mgr', 'admin_mgr', 'director'], menuKey: 'products' },
  { href: '/units', label: '📏 Units', roles: ['admin', 'sale_mgr', 'admin_mgr', 'director'], menuKey: 'units' },
]

const ADMIN_MENU: NavItem[] = [
  { href: '/users',                label: '👤 Users', roles: ['admin', 'admin_mgr', 'director'], menuKey: 'users' },
  { href: '/admin/approval-flow',  label: '🏢 Approval Flow', roles: ['admin', 'director'], menuKey: 'approval-flow' },
  { href: '/admin/pr-types',       label: '🛒 PR Types', roles: ['admin', 'director'], menuKey: 'pr-types' },
  { href: '/admin/roles',          label: '🔒 Roles & Permissions', roles: ['admin', 'director'], menuKey: 'roles' },
  { href: '/admin/audit-log',      label: '📜 Audit Log', roles: ['admin', 'admin_mgr', 'director'], menuKey: 'audit-log' },
  { href: '/admin/activity-log',   label: '📋 Activity Log', roles: ['admin', 'director'], menuKey: 'activity-log' },
  { href: '/admin/email-log',      label: '📧 Email Log', roles: ['admin', 'admin_mgr', 'director'], menuKey: 'email-log' },
  { href: '/settings',             label: '⚙️ System Settings', roles: ['admin', 'director'], menuKey: 'settings' },
]

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { menuAccessConfig, canViewMenuByPermission } = useSettingsStore()
  const [collapsed, setCollapsed] = useState(false)

  // Persist collapsed state across reloads
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sidebar-collapsed') : null
    if (saved === '1') setCollapsed(true)
  }, [])
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0')
    }
  }, [collapsed])

  // Close mobile drawer on route change
  useEffect(() => { onClose() /* close on nav */ }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const navClass = (active: boolean) =>
    collapsed
      ? clsx(
          'flex items-center justify-center p-2.5 rounded-lg mx-1 transition-all duration-200',
          active ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
        )
      : clsx(
          'flex items-center gap-3 py-2.5 pr-4 pl-3 text-sm font-medium transition-all duration-200 border-l-[3px] rounded-r-xl',
          active
            ? 'bg-white/15 text-white border-green-light shadow-sm'
            : 'border-transparent text-white/70 hover:bg-white/10 hover:text-white hover:border-white/10'
        )

  // For NAV/MASTER menus: check against DB-driven menuAccessConfig (falls back to hardcoded roles)
  const canSeeMenu = (menuKey: string, fallbackRoles?: UserRole[]) => {
    if (!user) return false
    const configRoles = menuAccessConfig[menuKey]
    const roles = configRoles ?? fallbackRoles
    const allowedByRole = !roles || hasRole(user.role, roles)
    const allowedByPermission = canViewMenuByPermission(menuKey, user.role)
    return allowedByRole && allowedByPermission
  }

  const canSeeAdminMenu = (menuKey: string, roles?: UserRole[]) => {
    if (!user) return false
    return (!roles || hasRole(user.role, roles)) && canViewMenuByPermission(menuKey, user.role)
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}
      <aside className={clsx(
        'flex flex-col h-screen bg-gradient-to-b from-[#1b5e20] via-[#2d6a2e] to-[#264e27] text-white transition-all duration-300 shrink-0 shadow-xl md:shadow-none',
        'fixed md:static inset-y-0 left-0 z-50',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'w-14' : 'w-60'
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
        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto hidden md:inline-flex p-1 rounded hover:bg-green-main/30 transition-colors"
          title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {/* Close drawer (mobile) */}
        <button
          onClick={onClose}
          className="ml-auto md:hidden p-1 rounded hover:bg-green-main/30 transition-colors"
          title="ปิดเมนู"
        >
          <X size={18} />
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
        {NAV.filter(item => canSeeMenu(item.menuKey || item.href.replace('/', ''), item.roles)).map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={navClass(active)}
            >
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* Master Data section */}
        {MASTER.some(item => canSeeMenu(item.menuKey || item.href.replace('/', ''), item.roles)) && (
          <>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 pt-4 pb-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase text-white/40 tracking-widest">ข้อมูลหลัก</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            )}
            {MASTER.filter(item => canSeeMenu(item.menuKey || item.href.replace('/', ''), item.roles)).map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={navClass(active)}
                >
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </>
        )}

        {/* Admin section */}
        {ADMIN_MENU.some(item => canSeeAdminMenu(item.menuKey || item.href.replace('/', ''), item.roles)) && (
          <>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 pt-4 pb-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase text-white/40 tracking-widest">ผู้ดูแลระบบ</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            )}
            {ADMIN_MENU.filter(item => canSeeAdminMenu(item.menuKey || item.href.replace('/', ''), item.roles)).map(item => {
              const active = pathname === item.href || (item.href !== '/settings' && item.href !== '/users' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={navClass(active)}
                >
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/10 p-3">
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
