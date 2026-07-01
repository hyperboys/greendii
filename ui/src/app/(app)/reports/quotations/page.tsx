'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Download, RefreshCw, Search, TrendingUp, TrendingDown, Wallet,
  CheckCircle2, AlertTriangle, Trophy, Building2, FileText, ChevronRight,
  ChevronUp, ChevronDown, Eye, ChevronsLeft, ChevronsRight, ShieldCheck,
  BarChart2, Clock, Printer, Edit3, Calendar,
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import toast from 'react-hot-toast'
import { QuotationsAPI, UsersAPI } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Quotation, User } from '@/types'
import { STATUS_LABELS, type DocStatus } from '@/types'
import { hasRole } from '@/lib/roleAliases'

// Helpers
function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

// Constants
const STATUS_COLORS: Record<DocStatus, string> = {
  draft:     'badge-draft',
  pending:   'badge-pending',
  approved:  'badge-approved',
  rejected:  'badge-rejected',
  cancelled: 'badge-draft',
}
const DONUT_COLORS: Partial<Record<DocStatus, string>> = {
  approved:  '#10B981',
  pending:   '#F59E0B',
  draft:     '#94A3B8',
  rejected:  '#EF4444',
  cancelled: '#FB923C',
}
const MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director']
const PAGE_SIZES    = [10, 25, 50]
const DATE_PRESETS  = [
  { value: 'all',          label: 'ทั้งหมด' },
  { value: 'this_month',   label: 'เดือนนี้' },
  { value: 'this_quarter', label: 'ไตรมาสนี้' },
  { value: 'this_year',    label: 'ปีนี้' },
]

// Date range helper
function getDateRange(preset: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (preset === 'this_month')   return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) }
  if (preset === 'this_quarter') { const q = Math.floor(now.getMonth() / 3); return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) } }
  if (preset === 'this_year')    return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) }
  return { from: null, to: null }
}

// Count-up hook
function useCountUp(target: number, duration = 900, enabled = true) {
  const [val, setVal] = useState(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    if (!enabled) { setVal(target); return }
    let start: number | null = null
    const animate = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) raf.current = requestAnimationFrame(animate)
    }
    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration, enabled])
  return val
}

// Skeleton
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 border-l-4 border-gray-200 shadow-sm animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2.5">
          <div className="h-2.5 bg-gray-100 rounded w-20" />
          <div className="h-7 bg-gray-100 rounded w-24" />
          <div className="h-2.5 bg-gray-100 rounded w-16" />
        </div>
        <div className="w-9 h-9 bg-gray-100 rounded-xl shrink-0" />
      </div>
    </div>
  )
}
function SkeletonRow() {
  return (
    <tr>
      {[36, 120, 160, 160, 110, 80, 64, 70, 60].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// KPI card
interface KpiCardProps {
  label: string; value: string; sub?: string; trend?: number
  icon: React.ReactNode; iconBg: string; valueColor?: string; accent: string; loading?: boolean
}
function KpiCard({ label, value, sub, trend, icon, iconBg, valueColor = 'text-gray-900', accent, loading }: KpiCardProps) {
  if (loading) return <SkeletonCard />
  return (
    <div className={`group relative bg-white rounded-2xl p-5 border-l-4 ${accent}
                     border border-gray-100 shadow-sm cursor-default
                     hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider leading-none">{label}</p>
          <p className={`text-2xl font-bold mt-2.5 tabular-nums leading-none truncate ${valueColor}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1.5 truncate">{sub}</p>}
          {trend !== undefined && (
            <div className={`inline-flex items-center gap-0.5 text-[11px] font-medium mt-1.5
                             ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(trend).toFixed(1)}% vs เดือนที่แล้ว
            </div>
          )}
        </div>
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                         transition-transform duration-200 group-hover:scale-110 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// Status card
interface StatusCardProps {
  label: string; value: string; sub: string; count: number; total: number
  icon: React.ReactNode; gradient: string; bar: string; text: string; iconColor: string; tip: string
}
function StatusCard({ label, value, sub, count, total, icon, gradient, bar, text, iconColor, tip }: StatusCardProps) {
  const ratio = total > 0 ? (count / total) * 100 : 0
  return (
    <div className={`relative rounded-2xl p-5 overflow-hidden shadow-sm border border-gray-100
                     hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${gradient}`} title={tip}>
      <div className="flex items-start justify-between gap-3">
        <div className="relative z-10">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold mt-2 tabular-nums ${text}`}>{value}</p>
          <p className="text-sm text-gray-500 mt-1">{sub}</p>
        </div>
        <div className={`absolute right-4 top-4 opacity-[0.08] ${iconColor}`} style={{ fontSize: 80, lineHeight: 1 }}>{icon}</div>
      </div>
      <div className="mt-4 h-1.5 bg-black/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`}
             style={{ width: `${Math.min(ratio, 100)}%` }} />
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">{ratio.toFixed(1)}% ของทั้งหมด</p>
    </div>
  )
}

// Sort icon
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={11} className="opacity-20" />
  return dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
}

// Pager
function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  const start = Math.max(1, Math.min(page - 3, total - 6))
  const pages = Array.from({ length: Math.min(7, total - start + 1) }, (_, i) => start + i)
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(1)} disabled={page === 1}
        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
        <ChevronsLeft size={15} />
      </button>
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
        <ChevronDown size={15} className="rotate-90" />
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors
                      ${page === p ? 'bg-[#1B5E20] text-white shadow-sm' : 'hover:bg-gray-100 text-gray-600'}`}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page === total}
        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
        <ChevronDown size={15} className="-rotate-90" />
      </button>
      <button onClick={() => onChange(total)} disabled={page === total}
        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
        <ChevronsRight size={15} />
      </button>
    </div>
  )
}

// Chart tooltip
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-800">
            {p.dataKey === 'value' ? `฿${fmtCompact(p.value)}` : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// Main Page
export default function QuotationSummaryReportPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const isManager = MANAGER_ROLES.includes(user?.role ?? '')

  const [rows, setRows]               = useState<Quotation[]>([])
  const [salesList, setSalesList]     = useState<User[]>([])
  const [loading, setLoading]         = useState(true)
  const [exporting, setExporting]     = useState(false)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [salesFilter, setSalesFilter] = useState('')
  const [datePreset, setDatePreset]   = useState('all')
  const [sortKey, setSortKey]   = useState<'quoNo' | 'customerName' | 'grandTotal' | 'createdAt' | null>(null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isManager) return
    UsersAPI.list({ active: 'true' })
      .then(users => setSalesList(users.filter(u => hasRole(u.role, ['sales', 'sale_mgr']))))
      .catch(() => {})
  }, [isManager])

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = { active: 'true' }
    if (search.trim())            params.q       = search.trim()
    if (statusFilter)             params.status  = statusFilter
    if (isManager && salesFilter) params.salesId = salesFilter
    QuotationsAPI.list(params)
      .then(data => { setRows(data); setPage(1) })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [search, statusFilter, isManager, salesFilter])

  useEffect(() => { load() }, [load])

  // Client-side date filter
  const dateFilteredRows = useMemo(() => {
    const { from, to } = getDateRange(datePreset)
    if (!from) return rows
    return rows.filter(q => { const d = new Date(q.createdAt); return d >= from && d <= to! })
  }, [rows, datePreset])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return dateFilteredRows
    return [...dateFilteredRows].sort((a, b) => {
      const va = sortKey === 'grandTotal' ? +a.grandTotal
               : sortKey === 'createdAt'  ? a.createdAt
               : (a[sortKey as keyof Quotation] as string) ?? ''
      const vb = sortKey === 'grandTotal' ? +b.grandTotal
               : sortKey === 'createdAt'  ? b.createdAt
               : (b[sortKey as keyof Quotation] as string) ?? ''
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [dateFilteredRows, sortKey, sortDir])

  const filteredRows = sortedRows
  const totalPages   = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows    = useMemo(() => filteredRows.slice((page - 1) * pageSize, page * pageSize), [filteredRows, page, pageSize])

  // Insights (computed from date-filtered rows)
  const insights = useMemo(() => {
    const totalCount    = filteredRows.length
    const totalValue    = filteredRows.reduce((s, q) => s + +q.grandTotal, 0)
    const approved      = filteredRows.filter(q => q.status === 'approved')
    const approvedCount = approved.length
    const approvedValue = approved.reduce((s, q) => s + +q.grandTotal, 0)
    const pendingList   = filteredRows.filter(q => q.status === 'pending' || q.status === 'draft')
    const pendingCount  = pendingList.length
    const pendingValue  = pendingList.reduce((s, q) => s + +q.grandTotal, 0)
    const rejectedCount = filteredRows.filter(q => q.status === 'rejected').length

    const salesMap:    Record<string, { name: string; total: number }> = {}
    const customerMap: Record<string, { name: string; total: number }> = {}

    for (const q of filteredRows) {
      const sn = q.sales?.fullName ?? q.salesId
      if (!salesMap[sn]) salesMap[sn] = { name: sn, total: 0 }
      salesMap[sn].total += +q.grandTotal
      const cn = q.customerName
      if (!customerMap[cn]) customerMap[cn] = { name: cn, total: 0 }
      customerMap[cn].total += +q.grandTotal
    }

    // Trend: this month vs last month (from ALL rows)
    const now            = new Date()
    const thisStart      = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastStart      = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastEnd        = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    const thisMonthRows  = rows.filter(q => new Date(q.createdAt) >= thisStart)
    const lastMonthRows  = rows.filter(q => { const d = new Date(q.createdAt); return d >= lastStart && d <= lastEnd })
    const lastCount      = lastMonthRows.length
    const lastValue      = lastMonthRows.reduce((s, q) => s + +q.grandTotal, 0)
    const countTrend     = lastCount > 0 ? ((thisMonthRows.length - lastCount) / lastCount) * 100 : undefined
    const valueTrend     = lastValue > 0 ? ((thisMonthRows.reduce((s, q) => s + +q.grandTotal, 0) - lastValue) / lastValue) * 100 : undefined

    return {
      totalCount, totalValue,
      approvedCount, approvedValue,
      pendingCount,  pendingValue,
      rejectedCount,
      avgDeal:      totalCount > 0 ? totalValue / totalCount : 0,
      approvalRate: totalCount > 0 ? (approvedCount / totalCount) * 100 : 0,
      rejectedRate: totalCount > 0 ? (rejectedCount / totalCount) * 100 : 0,
      topSales:    Object.values(salesMap).sort((a, b) => b.total - a.total)[0],
      topCustomer: Object.values(customerMap).sort((a, b) => b.total - a.total)[0],
      countTrend, valueTrend,
    }
  }, [filteredRows, rows])

  // Monthly chart (last 12 months from ALL rows, unaffected by date filter)
  const monthlyChartData = useMemo(() => {
    const buckets: Record<string, { month: string; count: number; value: number }> = {}
    for (const q of rows) {
      const d   = new Date(q.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const lbl = d.toLocaleDateString('th-TH', { month: 'short' })
      if (!buckets[key]) buckets[key] = { month: lbl, count: 0, value: 0 }
      buckets[key].count++
      buckets[key].value += +q.grandTotal
    }
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, v]) => v)
  }, [rows])

  // Donut data (from date-filtered rows)
  const donutData = useMemo(() => {
    const counts: Partial<Record<DocStatus, number>> = {}
    for (const q of filteredRows) counts[q.status] = (counts[q.status] ?? 0) + 1
    return (Object.entries(counts) as [DocStatus, number][])
      .map(([status, value]) => ({ name: STATUS_LABELS[status], value, color: DONUT_COLORS[status] ?? '#94A3B8' }))
      .filter(d => d.value > 0)
  }, [filteredRows])

  // Count-up animated values
  const animCount    = useCountUp(insights.totalCount, 900, !loading)
  const animApproved = useCountUp(insights.approvedCount, 900, !loading)

  async function exportExcel() {
    if (!filteredRows.length) { toast('ไม่มีข้อมูลสำหรับ Export'); return }
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()
      const ws   = XLSX.utils.aoa_to_sheet([
        ['Quotation Summary Report'],
        ['Export Date', new Date().toLocaleDateString('th-TH')],
        ['คำค้น', search || '-'],
        ['สถานะ', statusFilter ? (STATUS_LABELS[statusFilter as DocStatus] ?? statusFilter) : 'ทั้งหมด'],
        ['ช่วงเวลา', DATE_PRESETS.find(p => p.value === datePreset)?.label ?? 'ทั้งหมด'],
        [],
        ['เลขที่', 'ลูกค้า', 'โครงการ', 'พนักงานขาย', 'มูลค่ารวม', 'สถานะ', 'วันที่'],
        ...filteredRows.map(q => [
          q.quoNo, q.customerName, q.project,
          q.sales?.fullName ?? q.salesId,
          +q.grandTotal, STATUS_LABELS[q.status], fmtDate(q.createdAt),
        ]),
      ])
      ws['!cols'] = [18, 28, 30, 22, 16, 12, 16].map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, 'ใบเสนอราคา')
      XLSX.writeFile(wb, `quotation-summary-${Date.now()}.xlsx`)
      toast.success('Export Excel สำเร็จ')
    } catch {
      toast.error('Export Excel ไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { label: '#',            key: null,                    right: false },
    { label: 'เลขที่',       key: 'quoNo'        as const, right: false },
    { label: 'ลูกค้า',       key: 'customerName' as const, right: false },
    { label: 'โครงการ',      key: null,                    right: false },
    { label: 'พนักงานขาย',  key: null,                    right: false },
    { label: 'มูลค่ารวม',   key: 'grandTotal'   as const, right: true  },
    { label: 'สถานะ',        key: null,                    right: false },
    { label: 'วันที่',       key: 'createdAt'    as const, right: false },
    { label: '',              key: null,                    right: false },
  ]

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div className="rounded-2xl overflow-hidden shadow-md"
           style={{ background: 'linear-gradient(135deg, #1B5E20 0%, #2d6a2e 60%, #388E3C 100%)' }}>
        <div className="px-6 pt-4 flex items-center gap-1.5 text-green-200/70 text-[11px] font-medium">
          <Link href="/dashboard" className="hover:text-white transition-colors">หน้าหลัก</Link>
          <ChevronRight size={11} />
          <Link href="/reports" className="hover:text-white transition-colors">รายงาน</Link>
          <ChevronRight size={11} />
          <span className="text-white/90">ใบเสนอราคา</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-white/10 border border-white/20 text-[11px] text-green-100
                            font-semibold tracking-widest mb-2.5">
              <ShieldCheck size={11} /> OWNER VIEW
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Quotation Summary Report
            </h1>
            <p className="text-green-200/75 text-sm mt-1.5">
              Overview for management - Search, view data, and export to Excel
            </p>
          </div>
          <Link href="/reports"
                className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5
                           px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20
                           text-white text-sm font-medium transition-all duration-150 whitespace-nowrap">
            กลับหน้ารายงาน
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard loading={loading}
          label="ใบเสนอราคาทั้งหมด"
          value={loading ? '-' : animCount.toLocaleString()}
          sub={loading ? '' : `${animApproved} อนุมัติแล้ว`}
          trend={insights.countTrend}
          icon={<FileText size={18} className="text-slate-500" />}
          iconBg="bg-slate-100" accent="border-l-slate-400" />
        <KpiCard loading={loading}
          label="มูลค่ารวม"
          value={loading ? '-' : `฿${fmtMoney(insights.totalValue)}`}
          sub="THB"
          trend={insights.valueTrend}
          valueColor="text-blue-700"
          icon={<Wallet size={18} className="text-blue-500" />}
          iconBg="bg-blue-50" accent="border-l-blue-500" />
        <KpiCard loading={loading}
          label="อัตราอนุมัติ"
          value={loading ? '-' : fmtPct(insights.approvalRate)}
          sub={loading ? '' : `${insights.approvedCount} / ${insights.totalCount} ใบ`}
          valueColor={insights.approvalRate >= 50 ? 'text-emerald-700' : 'text-orange-600'}
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          iconBg="bg-emerald-50" accent="border-l-emerald-500" />
        <KpiCard loading={loading}
          label="Average Deal Size"
          value={loading ? '-' : `฿${fmtMoney(insights.avgDeal)}`}
          sub="ต่อใบเสนอราคา"
          valueColor="text-indigo-700"
          icon={<TrendingUp size={18} className="text-indigo-500" />}
          iconBg="bg-indigo-50" accent="border-l-indigo-500" />
        <KpiCard loading={loading}
          label="Top Sales"
          value={loading ? '-' : (insights.topSales?.name ?? '-')}
          sub={loading ? '' : `฿${fmtMoney(insights.topSales?.total ?? 0)}`}
          icon={<Trophy size={18} className="text-amber-500" />}
          iconBg="bg-amber-50" accent="border-l-amber-500" />
        <KpiCard loading={loading}
          label="Top Customer"
          value={loading ? '-' : (insights.topCustomer?.name ?? '-')}
          sub={loading ? '' : `฿${fmtMoney(insights.topCustomer?.total ?? 0)}`}
          icon={<Building2 size={18} className="text-purple-500" />}
          iconBg="bg-purple-50" accent="border-l-purple-500" />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              className="form-input pl-9 py-2 w-full text-sm"
              placeholder="ค้นหาเลขที่ / ลูกค้า / โครงการ"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">สถานะ</label>
            <select className="form-input py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {isManager && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">พนักงานขาย</label>
              <select className="form-input py-2 text-sm" value={salesFilter} onChange={e => setSalesFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {salesList.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">
              <Calendar size={10} className="inline mr-1" />ช่วงเวลา
            </label>
            <select className="form-input py-2 text-sm" value={datePreset} onChange={e => { setDatePreset(e.target.value); setPage(1) }}>
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="self-end">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full
                             bg-[#E8F5E9] text-[#1B5E20] text-xs font-semibold border border-green-200">
              {filteredRows.length.toLocaleString()} รายการ
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} title="ค้นหา"
              className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50
                         flex items-center justify-center text-gray-500 hover:text-gray-800
                         transition-all duration-150 shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportExcel} disabled={exporting || filteredRows.length === 0}
              className="btn-primary inline-flex items-center gap-1.5 px-4 disabled:opacity-50 text-sm">
              <Download size={15} />
              {exporting ? 'กำลัง Export...' : 'Export Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard label="Approved Value"
          value={`฿${fmtMoney(insights.approvedValue)}`}
          sub={`${insights.approvedCount} รายการที่อนุมัติแล้ว`}
          count={insights.approvedCount} total={insights.totalCount}
          icon={<CheckCircle2 />} gradient="bg-gradient-to-br from-emerald-50 to-white"
          bar="bg-emerald-500" text="text-emerald-700" iconColor="text-emerald-500"
          tip="มูลค่าใบเสนอราคาที่ได้รับการอนุมัติทั้งหมด" />
        <StatusCard label="Open Pipeline"
          value={`฿${fmtMoney(insights.pendingValue)}`}
          sub={`${insights.pendingCount} ดีลที่ยังเปิดอยู่`}
          count={insights.pendingCount} total={insights.totalCount}
          icon={<Clock />} gradient="bg-gradient-to-br from-amber-50 to-white"
          bar="bg-amber-400" text="text-amber-600" iconColor="text-amber-500"
          tip="มูลค่าดีลที่ยังเปิดอยู่ รอการดำเนินการ" />
        <StatusCard label="Rejected Risk"
          value={fmtPct(insights.rejectedRate)}
          sub="สัดส่วนใบที่ถูกปฏิเสธ"
          count={insights.rejectedCount} total={insights.totalCount}
          icon={<AlertTriangle />} gradient="bg-gradient-to-br from-red-50 to-white"
          bar="bg-red-400" text="text-red-600" iconColor="text-red-500"
          tip="ยิ่งต่ำยิ่งดี - สัดส่วนใบเสนอราคาที่ถูกปฏิเสธ" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Monthly trend - 3/5 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Monthly Quotation Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">จำนวนใบและมูลค่า 12 เดือนล่าสุด</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="count" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="value" orientation="right" tick={{ fontSize: 11, fill: '#94A3B8' }}
                       axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar yAxisId="count" dataKey="count" name="จำนวน (ใบ)" fill="#BBF7D0" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line yAxisId="value" dataKey="value" name="มูลค่า (฿)" type="monotone"
                      stroke="#1B5E20" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ
            </div>
          )}
        </div>

        {/* Status donut - 2/5 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Status Distribution</h3>
              <p className="text-xs text-gray-400 mt-0.5">การกระจายตามสถานะใบเสนอราคา</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {donutData.length > 0 ? (
            <div className="flex flex-col items-center">
              <div className="relative">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={52} outerRadius={78}
                         paddingAngle={3} dataKey="value">
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-2xl font-bold text-gray-800 tabular-nums">{insights.totalCount}</p>
                  <p className="text-[11px] text-gray-400">ทั้งหมด</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 w-full max-w-[180px]">
                {donutData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto font-semibold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              ยังไม่มีข้อมูล
            </div>
          )}
        </div>
      </div>

      {/* Data table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            แสดง <strong>{pagedRows.length}</strong> / {filteredRows.length.toLocaleString()} รายการ
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>แสดงทีละ</span>
            <select className="form-input py-1 text-xs" style={{ width: 64 }}
              value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1) }}>
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>รายการ</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: 'linear-gradient(90deg, #1B5E20 0%, #2d6a2e 100%)' }}>
                {columns.map((col, i) => (
                  <th key={i}
                      onClick={() => col.key && toggleSort(col.key)}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white select-none whitespace-nowrap
                                  ${col.right ? 'text-right' : 'text-left'}
                                  ${col.key ? 'cursor-pointer hover:bg-white/10' : ''}`}>
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.key && <SortIcon active={sortKey === col.key} dir={sortDir} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <FileText size={48} strokeWidth={1} />
                      <p className="text-base font-semibold text-gray-500">ไม่พบใบเสนอราคา</p>
                      <p className="text-sm text-gray-400">ลองเปลี่ยนคำค้นหาหรือตัวกรองแล้วลองใหม่</p>
                      <button onClick={load} className="btn-outline mt-1 text-sm px-4 py-1.5">รีเฟรชข้อมูล</button>
                    </div>
                  </td>
                </tr>
              ) : pagedRows.map((q, idx) => (
                <tr key={q.id}
                    className={`border-b border-gray-50 transition-colors duration-100 hover:bg-[#E8F5E9]/60
                                ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                  <td className="px-4 py-3 text-xs text-gray-400 tabular-nums text-center w-10">
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1B5E20] whitespace-nowrap">
                    {q.quoNo}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">{q.customerName}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">{q.project}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{q.sales?.fullName ?? q.salesId}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-right tabular-nums text-gray-800 whitespace-nowrap">
                    ฿{fmtMoney(+q.grandTotal)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                                     ${STATUS_COLORS[q.status]}`}>
                      {STATUS_LABELS[q.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(q.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => router.push(`/quotations/${q.id}`)} title="ดูรายละเอียด"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B5E20] hover:bg-[#E8F5E9]
                                   transition-all duration-150">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => router.push(`/quotations/${q.id}/edit`)} title="แก้ไข"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50
                                   transition-all duration-150">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => router.push(`/print/quotation/${q.id}`)} title="พิมพ์"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50
                                   transition-all duration-150">
                        <Printer size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500">หน้า {page} จาก {totalPages}</span>
            <Pager page={page} total={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

    </div>
  )
}
