'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Download, RefreshCw, Search, TrendingUp, Loader2, CheckCircle2,
  AlertTriangle, Clock, Timer, FileText, ChevronRight,
  ChevronUp, ChevronDown, Eye, ChevronsLeft, ChevronsRight, ShieldCheck,
  BarChart2, Printer, Edit3, Calendar, X, ArrowRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import { WorkOrdersAPI, UsersAPI } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { WorkOrder, User } from '@/types'
import { STATUS_LABELS, type DocStatus } from '@/types'
import { hasRole } from '@/lib/roleAliases'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

// ─── Constants ───────────────────────────────────────────────────────────────
const MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director', 'project_mgr']
const PAGE_SIZES    = [10, 25, 50]
const DATE_PRESETS  = [
  { value: 'all',          label: 'ทั้งหมด' },
  { value: 'this_month',   label: 'เดือนนี้' },
  { value: 'this_quarter', label: 'ไตรมาสนี้' },
  { value: 'this_year',    label: 'ปีนี้' },
]

// WO-specific status labels (friendlier display names)
const WO_STATUS_DISPLAY: Record<string, { label: string; badge: string }> = {
  draft:     { label: 'ใหม่',             badge: 'bg-slate-100 text-slate-600' },
  pending:   { label: 'รออนุมัติ',        badge: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'กำลังดำเนินการ',   badge: 'bg-blue-100 text-blue-700' },
  rejected:  { label: 'ถูกปฏิเสธ',        badge: 'bg-red-100 text-red-700' },
  cancelled: { label: 'ยกเลิก',           badge: 'bg-gray-100 text-gray-500' },
  closed:    { label: 'เสร็จสิ้น',        badge: 'bg-emerald-100 text-emerald-700' },
  overdue:   { label: 'เกินกำหนด',        badge: 'bg-red-100 text-red-700 font-bold' },
}

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: '#EF4444', bg: 'bg-red-500'    },
  medium: { label: 'Medium', color: '#F59E0B', bg: 'bg-amber-400'  },
  low:    { label: 'Low',    color: '#10B981', bg: 'bg-emerald-500' },
}

const DONUT_COLORS: Record<string, string> = {
  closed:    '#10B981',
  approved:  '#3B82F6',
  pending:   '#F59E0B',
  draft:     '#94A3B8',
  cancelled: '#CBD5E1',
  overdue:   '#EF4444',
}
const DONUT_LABELS: Record<string, string> = {
  closed:    'เสร็จสิ้น',
  approved:  'กำลังดำเนินการ',
  pending:   'รออนุมัติ',
  draft:     'ใหม่',
  cancelled: 'ยกเลิก',
  overdue:   'เกินกำหนด',
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getDateRange(preset: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (preset === 'this_month')
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) }
  if (preset === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) }
  }
  if (preset === 'this_year')
    return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) }
  return { from: null, to: null }
}

/** Days remaining until installDate. Negative = overdue. Null if no installDate. */
function daysRemaining(wo: WorkOrder): number | null {
  if (!wo.installDate) return null
  const due  = new Date(wo.installDate)
  const now  = new Date()
  due.setHours(23, 59, 59, 0)
  now.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000)
}

function isOverdue(wo: WorkOrder): boolean {
  if (wo.isClosed || wo.status === 'cancelled' || wo.status === 'rejected') return false
  const d = daysRemaining(wo)
  return d !== null && d < 0
}

function getDisplayStatus(wo: WorkOrder): string {
  if (wo.isClosed)           return 'closed'
  if (isOverdue(wo))         return 'overdue'
  return wo.status
}

function getPriority(wo: WorkOrder): 'high' | 'medium' | 'low' {
  if (wo.isClosed || wo.status === 'cancelled' || wo.status === 'rejected') return 'low'
  const d = daysRemaining(wo)
  if (d === null || d > 7) return 'low'
  if (d <= 3)              return 'high'
  return 'medium'
}

// ─── Count-up hook ────────────────────────────────────────────────────────────
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
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
      {[36, 100, 80, 140, 140, 110, 64, 80, 80, 80, 60].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string; value: string; sub?: string
  icon: React.ReactNode; iconBg: string; valueColor?: string; accent: string
  loading?: boolean; pulse?: boolean
}
function KpiCard({ label, value, sub, icon, iconBg, valueColor = 'text-gray-900', accent, loading, pulse }: KpiCardProps) {
  if (loading) return <SkeletonCard />
  return (
    <div className={`group relative bg-white rounded-2xl p-5 border-l-4 ${accent}
                     border border-gray-100 shadow-sm cursor-default
                     hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider leading-none">{label}</p>
          <p className={`text-2xl font-bold mt-2.5 tabular-nums leading-none truncate ${valueColor} ${pulse ? 'animate-pulse' : ''}`}>
            {value}
          </p>
          {sub && <p className="text-xs text-gray-400 mt-1.5 truncate">{sub}</p>}
        </div>
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                         transition-transform duration-200 group-hover:scale-110 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={11} className="opacity-20" />
  return dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
}

// ─── Pager ───────────────────────────────────────────────────────────────────
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

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { color: string; name: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mt-0.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-800">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Progress Tracker ─────────────────────────────────────────────────────────
interface TrackerStep { label: string; count: number; color: string; bg: string; active?: boolean }
function ProgressTracker({ steps }: { steps: TrackerStep[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Pipeline Progress</h3>
          <p className="text-xs text-gray-400 mt-0.5">จำนวนใบสั่งงานในแต่ละขั้นตอน</p>
        </div>
        <ArrowRight size={16} className="text-gray-300" />
      </div>
      <div className="flex items-stretch gap-0">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <div className={`flex-1 rounded-xl p-3 text-center border transition-all duration-200
                             hover:shadow-sm ${step.bg} ${step.active ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}>
              <p className={`text-2xl font-bold tabular-nums ${step.color}`}>{step.count}</p>
              <p className="text-[10px] font-medium text-gray-500 mt-0.5 leading-tight">{step.label}</p>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight size={14} className="text-gray-300 shrink-0 mx-0.5" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function WorkOrderReportPage() {
  const router   = useRouter()
  const { user } = useAuthStore()
  const isManager = MANAGER_ROLES.includes(user?.role ?? '')

  const [rows, setRows]               = useState<WorkOrder[]>([])
  const [salesList, setSalesList]     = useState<User[]>([])
  const [loading, setLoading]         = useState(true)
  const [exporting, setExporting]     = useState(false)
  const [alertDismissed, setAlertDismissed] = useState(false)

  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [salesFilter, setSalesFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [datePreset, setDatePreset]   = useState('all')

  const [sortKey, setSortKey]   = useState<'woNo' | 'customerName' | 'installDate' | 'createdAt' | null>(null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const searchRef               = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isManager) return
    UsersAPI.list({ active: 'true' })
      .then(users => setSalesList(users.filter(u => hasRole(u.role, ['sales', 'sale_mgr']))))
      .catch(() => {})
  }, [isManager])

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search.trim())            params.q       = search.trim()
    if (isManager && salesFilter) params.salesId = salesFilter
    WorkOrdersAPI.list(params)
      .then(data => { setRows(data); setPage(1) })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [search, isManager, salesFilter])

  useEffect(() => { load() }, [load])

  // Client-side filters
  const filteredRows = useMemo(() => {
    let r = rows

    // Date preset (on createdAt)
    const { from, to } = getDateRange(datePreset)
    if (from) r = r.filter(wo => { const d = new Date(wo.createdAt); return d >= from && d <= to! })

    // Status filter (uses display status)
    if (statusFilter) {
      r = r.filter(wo => getDisplayStatus(wo) === statusFilter)
    }

    // Priority filter
    if (priorityFilter) {
      r = r.filter(wo => getPriority(wo) === priorityFilter)
    }

    return r
  }, [rows, datePreset, statusFilter, priorityFilter])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const va = sortKey === 'installDate' ? (a.installDate ?? '')
               : sortKey === 'createdAt'   ? a.createdAt
               : (a[sortKey as keyof WorkOrder] as string) ?? ''
      const vb = sortKey === 'installDate' ? (b.installDate ?? '')
               : sortKey === 'createdAt'   ? b.createdAt
               : (b[sortKey as keyof WorkOrder] as string) ?? ''
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [filteredRows, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const pagedRows  = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page, pageSize])

  // ─── Insights ──────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const totalCount    = filteredRows.length
    const closedWos     = filteredRows.filter(wo => wo.isClosed)
    const completedCount = closedWos.length
    const inProgressCount = filteredRows.filter(wo => wo.status === 'approved' && !wo.isClosed).length
    const overdueList   = filteredRows.filter(wo => isOverdue(wo))
    const overdueCount  = overdueList.length

    // On-time rate: closed before or on installDate
    const onTimeCount = closedWos.filter(wo => {
      if (!wo.installDate || !wo.closedAt) return false
      return new Date(wo.closedAt) <= new Date(wo.installDate)
    }).length
    const onTimeRate = completedCount > 0 ? (onTimeCount / completedCount) * 100 : 0

    // Average completion time (days)
    const completionTimes = closedWos
      .filter(wo => wo.closedAt)
      .map(wo => (new Date(wo.closedAt!).getTime() - new Date(wo.createdAt).getTime()) / 86_400_000)
    const avgCompletionDays = completionTimes.length > 0
      ? completionTimes.reduce((s, n) => s + n, 0) / completionTimes.length
      : 0

    return { totalCount, completedCount, inProgressCount, overdueCount, onTimeRate, avgCompletionDays }
  }, [filteredRows])

  // ─── Monthly chart (last 12 months, from ALL rows) ─────────────────────────
  const monthlyChartData = useMemo(() => {
    const buckets: Record<string, { month: string; created: number; completed: number }> = {}
    for (const wo of rows) {
      const d   = new Date(wo.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const lbl = d.toLocaleDateString('th-TH', { month: 'short' })
      if (!buckets[key]) buckets[key] = { month: lbl, created: 0, completed: 0 }
      buckets[key].created++
      if (wo.isClosed) buckets[key].completed++
    }
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, v]) => v)
  }, [rows])

  // ─── Donut data (from filteredRows, using displayStatus) ──────────────────
  const donutData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const wo of filteredRows) {
      const s = getDisplayStatus(wo)
      counts[s] = (counts[s] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([status, value]) => ({ name: DONUT_LABELS[status] ?? status, value, color: DONUT_COLORS[status] ?? '#94A3B8' }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [filteredRows])

  // ─── Progress tracker steps ────────────────────────────────────────────────
  const trackerSteps: TrackerStep[] = useMemo(() => {
    const total      = rows.length
    const withRef    = rows.filter(wo => !!wo.quotationId).length
    const approval   = rows.filter(wo => wo.status === 'pending').length
    const inProgress = rows.filter(wo => wo.status === 'approved' && !wo.isClosed).length
    const completed  = rows.filter(wo => wo.isClosed).length
    return [
      { label: 'ทั้งหมด',         count: total,      color: 'text-slate-700',   bg: 'bg-slate-50 border border-slate-200' },
      { label: 'มีใบเสนอราคา',    count: withRef,    color: 'text-purple-700',  bg: 'bg-purple-50 border border-purple-200' },
      { label: 'รออนุมัติ',       count: approval,   color: 'text-amber-700',   bg: 'bg-amber-50 border border-amber-200' },
      { label: 'กำลังดำเนินการ',  count: inProgress, color: 'text-blue-700',    bg: 'bg-blue-50 border border-blue-200', active: true },
      { label: 'เสร็จสิ้น',       count: completed,  color: 'text-emerald-700', bg: 'bg-emerald-50 border border-emerald-200' },
    ]
  }, [rows])

  // ─── Count-up animations ────────────────────────────────────────────────────
  const animTotal    = useCountUp(insights.totalCount,    900, !loading)
  const animProgress = useCountUp(insights.inProgressCount, 900, !loading)
  const animDone     = useCountUp(insights.completedCount, 900, !loading)

  // ─── Export ────────────────────────────────────────────────────────────────
  async function exportExcel() {
    if (!sortedRows.length) { toast('ไม่มีข้อมูลสำหรับ Export'); return }
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()
      const ws   = XLSX.utils.aoa_to_sheet([
        ['Work Order Report'],
        ['Export Date', new Date().toLocaleDateString('th-TH')],
        ['ช่วงเวลา', DATE_PRESETS.find(p => p.value === datePreset)?.label ?? 'ทั้งหมด'],
        ['สถานะ',    statusFilter ? (WO_STATUS_DISPLAY[statusFilter]?.label ?? statusFilter) : 'ทั้งหมด'],
        [],
        ['เลขที่', 'อ้างอิง QUO', 'ลูกค้า', 'โครงการ', 'พนักงานขาย', 'Priority', 'สถานะ', 'วันที่สร้าง', 'กำหนดส่ง', 'วันที่ปิด'],
        ...sortedRows.map(wo => {
          const d = daysRemaining(wo)
          return [
            wo.woNo,
            wo.quotation?.quoNo ?? '',
            wo.customerName,
            wo.project,
            wo.sales?.fullName ?? wo.salesId,
            PRIORITY_CONFIG[getPriority(wo)].label,
            WO_STATUS_DISPLAY[getDisplayStatus(wo)]?.label ?? wo.status,
            new Date(wo.createdAt).toLocaleDateString('th-TH'),
            wo.installDate ? new Date(wo.installDate).toLocaleDateString('th-TH') : '',
            wo.closedAt ? new Date(wo.closedAt).toLocaleDateString('th-TH') : d !== null ? `${d} วัน` : '',
          ]
        }),
      ])
      ws['!cols'] = [14, 14, 28, 30, 20, 10, 14, 14, 14, 14].map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, 'ใบสั่งงาน')
      XLSX.writeFile(wb, `workorder-report-${Date.now()}.xlsx`)
      toast.success('Export Excel สำเร็จ')
    } catch {
      toast.error('Export Excel ไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { label: '#',               key: null,               right: false },
    { label: 'เลขที่',          key: 'woNo'        as const, right: false },
    { label: 'อ้างอิง QUO',     key: null,               right: false },
    { label: 'ลูกค้า',          key: 'customerName' as const, right: false },
    { label: 'โครงการ',         key: null,               right: false },
    { label: 'พนักงานขาย',     key: null,               right: false },
    { label: 'Priority',        key: null,               right: false },
    { label: 'สถานะ',           key: null,               right: false },
    { label: 'วันที่สร้าง',    key: 'createdAt'   as const, right: false },
    { label: 'กำหนดส่ง',       key: 'installDate' as const, right: false },
    { label: 'คงเหลือ',         key: null,               right: true  },
    { label: '',                key: null,               right: false },
  ]

  const overdueCount = insights.overdueCount

  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* ══════ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden shadow-md"
           style={{ background: 'linear-gradient(135deg, #1B5E20 0%, #2d6a2e 60%, #388E3C 100%)' }}>
        <div className="px-6 pt-4 flex items-center gap-1.5 text-green-200/70 text-[11px] font-medium">
          <Link href="/dashboard" className="hover:text-white transition-colors">หน้าหลัก</Link>
          <ChevronRight size={11} />
          <Link href="/reports" className="hover:text-white transition-colors">รายงาน</Link>
          <ChevronRight size={11} />
          <span className="text-white/90">ใบสั่งงาน</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-white/10 border border-white/20 text-[11px] text-green-100
                            font-semibold tracking-widest mb-2.5">
              <ShieldCheck size={11} /> OWNER VIEW
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Work Order Report
            </h1>
            <p className="text-green-200/75 text-sm mt-1.5">
              Track all work orders, deadlines, and progress
            </p>
          </div>
          <Link href="/reports"
                className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5
                           px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20
                           text-white text-sm font-medium transition-all duration-150 whitespace-nowrap">
            ← Back to Reports
          </Link>
        </div>
      </div>

      {/* ══════ OVERDUE ALERT ═══════════════════════════════════════════════════ */}
      {!loading && overdueCount > 0 && !alertDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
                        bg-red-50 border border-red-200 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              คำเตือน: มีใบสั่งงานเกินกำหนด {overdueCount} รายการ
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              กรุณาดำเนินการแก้ไขหรือติดตามสถานะงานที่เกินกำหนดโดยด่วน
            </p>
          </div>
          <button onClick={() => setAlertDismissed(true)}
            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ══════ KPI CARDS ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard loading={loading}
          label="ใบสั่งงานทั้งหมด"
          value={loading ? '—' : animTotal.toLocaleString()}
          sub={`${filteredRows.filter(wo => wo.status === 'draft').length} ใหม่`}
          icon={<FileText size={18} className="text-slate-500" />}
          iconBg="bg-slate-100" accent="border-l-slate-400" />
        <KpiCard loading={loading}
          label="กำลังดำเนินการ"
          value={loading ? '—' : animProgress.toLocaleString()}
          sub="approved + active"
          valueColor="text-blue-700"
          icon={<Loader2 size={18} className="text-blue-500" />}
          iconBg="bg-blue-50" accent="border-l-blue-500" />
        <KpiCard loading={loading}
          label="เสร็จสิ้น"
          value={loading ? '—' : animDone.toLocaleString()}
          sub={`${((insights.completedCount / Math.max(insights.totalCount, 1)) * 100).toFixed(0)}% ของทั้งหมด`}
          valueColor="text-emerald-700"
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          iconBg="bg-emerald-50" accent="border-l-emerald-500" />
        <KpiCard loading={loading}
          label="เกินกำหนด"
          value={loading ? '—' : overdueCount.toLocaleString()}
          sub="ต้องดำเนินการด่วน"
          valueColor={overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}
          pulse={overdueCount > 0}
          icon={<AlertTriangle size={18} className="text-red-500" />}
          iconBg="bg-red-50" accent={overdueCount > 0 ? 'border-l-red-500' : 'border-l-gray-200'} />
        <KpiCard loading={loading}
          label="On-Time Rate"
          value={loading ? '—' : `${insights.onTimeRate.toFixed(1)}%`}
          sub="ของงานที่ปิดแล้ว"
          valueColor={insights.onTimeRate >= 80 ? 'text-emerald-700' : insights.onTimeRate >= 50 ? 'text-amber-600' : 'text-red-600'}
          icon={<Clock size={18} className="text-indigo-500" />}
          iconBg="bg-indigo-50" accent="border-l-indigo-500" />
        <KpiCard loading={loading}
          label="เวลาเฉลี่ย"
          value={loading ? '—' : `${insights.avgCompletionDays.toFixed(1)} วัน`}
          sub="เวลาเฉลี่ยในการปิดงาน"
          valueColor="text-purple-700"
          icon={<Timer size={18} className="text-purple-500" />}
          iconBg="bg-purple-50" accent="border-l-purple-500" />
      </div>

      {/* ══════ FILTER BAR ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
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

          {/* Status */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">สถานะ</label>
            <select className="form-input py-2 text-sm" value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">ทั้งหมด</option>
              {Object.entries(WO_STATUS_DISPLAY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Salesperson (manager only) */}
          {isManager && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">พนักงานขาย</label>
              <select className="form-input py-2 text-sm" value={salesFilter}
                onChange={e => setSalesFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {salesList.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Priority</label>
            <select className="form-input py-2 text-sm" value={priorityFilter}
              onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}>
              <option value="">ทั้งหมด</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Date preset */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">
              <Calendar size={10} className="inline mr-1" />ช่วงเวลา
            </label>
            <select className="form-input py-2 text-sm" value={datePreset}
              onChange={e => { setDatePreset(e.target.value); setPage(1) }}>
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Result count */}
          <div className="self-end">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full
                             bg-[#E8F5E9] text-[#1B5E20] text-xs font-semibold border border-green-200">
              {sortedRows.length.toLocaleString()} รายการ
            </span>
          </div>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} title="ค้นหา"
              className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50
                         flex items-center justify-center text-gray-500 hover:text-gray-800
                         transition-all duration-150 shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportExcel} disabled={exporting || sortedRows.length === 0}
              className="btn-primary inline-flex items-center gap-1.5 px-4 disabled:opacity-50 text-sm">
              <Download size={15} />
              {exporting ? 'กำลัง Export…' : 'Export Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* ══════ CHARTS ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Donut — 2/5 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Status Distribution</h3>
              <p className="text-xs text-gray-400 mt-0.5">การกระจายตามสถานะใบสั่งงาน</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {donutData.length > 0 ? (
            <div className="flex flex-col items-center">
              <div className="relative">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%"
                         innerRadius={52} outerRadius={78}
                         paddingAngle={3} dataKey="value">
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="none" />
                      ))}
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

        {/* Monthly grouped bar — 3/5 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Monthly Work Order Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">สร้างใหม่ vs เสร็จสิ้น 12 เดือนล่าสุด</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                        barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="created" name="สร้างใหม่" fill="#93C5FD" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="completed" name="เสร็จสิ้น" fill="#6EE7B7" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ
            </div>
          )}
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded bg-blue-300" /> สร้างใหม่
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded bg-emerald-300" /> เสร็จสิ้น
            </div>
          </div>
        </div>
      </div>

      {/* ══════ PROGRESS TRACKER ════════════════════════════════════════════════ */}
      <ProgressTracker steps={trackerSteps} />

      {/* ══════ DATA TABLE ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            แสดง <strong>{pagedRows.length}</strong> / {sortedRows.length.toLocaleString()} รายการ
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
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white
                                  select-none whitespace-nowrap
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
                  <td colSpan={12} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <FileText size={48} strokeWidth={1} />
                      <p className="text-base font-semibold text-gray-500">ไม่พบใบสั่งงาน</p>
                      <p className="text-sm text-gray-400">ลองเปลี่ยนคำค้นหาหรือตัวกรองแล้วลองใหม่</p>
                      <button onClick={load} className="btn-outline mt-1 text-sm px-4 py-1.5">รีเฟรชข้อมูล</button>
                    </div>
                  </td>
                </tr>
              ) : pagedRows.map((wo, idx) => {
                const displayStatus = getDisplayStatus(wo)
                const overdue       = displayStatus === 'overdue'
                const priority      = getPriority(wo)
                const days          = daysRemaining(wo)
                const pCfg          = PRIORITY_CONFIG[priority]
                const sCfg          = WO_STATUS_DISPLAY[displayStatus] ?? WO_STATUS_DISPLAY['draft']

                return (
                  <tr key={wo.id}
                      className={`border-b border-gray-50 transition-colors duration-100
                                  ${overdue ? 'bg-red-50/60 hover:bg-red-50' : `hover:bg-[#E8F5E9]/60 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}`}>
                    {/* # */}
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums text-center w-10">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    {/* WO No */}
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1B5E20] whitespace-nowrap">
                      {wo.woNo}
                    </td>
                    {/* Ref QUO */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {wo.quotation?.quoNo
                        ? <span className="font-mono text-purple-600">{wo.quotation.quoNo}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Customer */}
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
                      {wo.customerName}
                    </td>
                    {/* Project */}
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">
                      {wo.project}
                    </td>
                    {/* Salesperson */}
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {wo.sales?.fullName ?? wo.salesId}
                    </td>
                    {/* Priority */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${pCfg.bg}`} />
                        <span className="text-xs text-gray-600 font-medium">{pCfg.label}</span>
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs
                                       ${sCfg.badge}`}>
                        {sCfg.label}
                      </span>
                    </td>
                    {/* Created */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(wo.createdAt)}
                    </td>
                    {/* Due date */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {wo.installDate
                        ? <span className={overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                            {fmtDate(wo.installDate)}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Days remaining */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {wo.isClosed ? (
                        <span className="text-xs text-emerald-600 font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 size={12} /> Done
                        </span>
                      ) : days === null ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : days < 0 ? (
                        <span className="text-xs font-bold text-red-600">{days} วัน</span>
                      ) : days <= 7 ? (
                        <span className="text-xs font-semibold text-amber-600">{days} วัน</span>
                      ) : (
                        <span className="text-xs text-emerald-600">{days} วัน</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => router.push(`/workorders/${wo.id}`)} title="ดูรายละเอียด"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B5E20] hover:bg-[#E8F5E9]
                                     transition-all duration-150">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => router.push(`/workorders/${wo.id}`)} title="แก้ไข"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50
                                     transition-all duration-150">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => router.push(`/print/workorder/${wo.id}`)} title="พิมพ์"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50
                                     transition-all duration-150">
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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
