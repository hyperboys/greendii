'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Download, RefreshCw, Search, ShoppingCart, Wallet, Hourglass,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown,
  FileText, ChevronRight, ChevronUp, ChevronDown, Eye,
  ChevronsLeft, ChevronsRight, ShieldCheck, BarChart2, Printer, Edit3, Calendar,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import { PRAPI, PrTypesAPI, UsersAPI } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { PurchaseRequest, User, PrType } from '@/types'
import { STATUS_LABELS, type DocStatus } from '@/types'
import { hasRole } from '@/lib/roleAliases'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}
function fmtDate(iso: string | undefined | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

// ─── Constants ────────────────────────────────────────────────────────────────
const MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director', 'procurement']
const PAGE_SIZES    = [10, 25, 50]
const DATE_PRESETS  = [
  { value: 'all',          label: 'ทั้งหมด' },
  { value: 'this_month',   label: 'เดือนนี้' },
  { value: 'this_quarter', label: 'ไตรมาสนี้' },
  { value: 'this_year',    label: 'ปีนี้' },
]

const STATUS_BADGE: Record<DocStatus, string> = {
  draft:     'bg-slate-100 text-slate-600',
  pending:   'bg-yellow-100 text-yellow-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const DONUT_COLORS: Partial<Record<DocStatus, string>> = {
  approved:  '#10B981',
  pending:   '#F59E0B',
  draft:     '#94A3B8',
  rejected:  '#EF4444',
  cancelled: '#CBD5E1',
}

// ─── Date-range helper ────────────────────────────────────────────────────────
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
      {[36, 100, 100, 120, 200, 70, 80, 90, 70, 120, 80, 60].map((w, i) => (
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
  icon: React.ReactNode; iconBg: string; valueColor?: string; accent: string; loading?: boolean
}
function KpiCard({ label, value, sub, icon, iconBg, valueColor = 'text-gray-900', accent, loading }: KpiCardProps) {
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
        </div>
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                         transition-transform duration-200 group-hover:scale-110 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ─── Status card ──────────────────────────────────────────────────────────────
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
        <div className={`absolute right-4 top-4 opacity-[0.08] ${iconColor}`}
             style={{ fontSize: 80, lineHeight: 1 }}>{icon}</div>
      </div>
      <div className="mt-4 h-1.5 bg-black/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`}
             style={{ width: `${Math.min(ratio, 100)}%` }} />
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">{ratio.toFixed(1)}% ของทั้งหมด</p>
    </div>
  )
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp size={11} className="opacity-20" />
  return dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
}

// ─── Pager ────────────────────────────────────────────────────────────────────
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
  payload?: { color: string; name: string; dataKey: string; value: number }[]
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
          <span className="font-semibold text-gray-800">
            {p.dataKey === 'value' ? `฿${fmtCompact(p.value)}` : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function PurchaseRequestReportPage() {
  const router    = useRouter()
  const { user }  = useAuthStore()
  const isManager = MANAGER_ROLES.includes(user?.role ?? '')

  const [rows, setRows]           = useState<PurchaseRequest[]>([])
  const [prTypes, setPrTypes]     = useState<PrType[]>([])
  const [salesList, setSalesList] = useState<User[]>([])
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)

  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('')
  const [prTypeFilter, setPrTypeFilter]   = useState('')
  const [requesterFilter, setRequesterFilter] = useState('')
  const [datePreset, setDatePreset]       = useState('all')

  const [sortKey, setSortKey] = useState<'prNo' | 'customer' | 'netTotal' | 'createdAt' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load static data once
  useEffect(() => {
    PrTypesAPI.list({ active: 'true' })
      .then(setPrTypes)
      .catch(() => {})
    if (isManager) {
      UsersAPI.list({ active: 'true' })
        .then(users => setSalesList(users.filter(u =>
          hasRole(u.role, ['sales', 'sale_mgr', 'admin_mgr', 'procurement'])
        )))
        .catch(() => {})
    }
  }, [isManager])

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search.trim())                  params.q        = search.trim()
    if (statusFilter)                   params.status   = statusFilter
    if (prTypeFilter)                   params.prTypeId = prTypeFilter
    if (isManager && requesterFilter)   params.salesId  = requesterFilter
    PRAPI.list(params)
      .then(data => { setRows(data); setPage(1) })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [search, statusFilter, prTypeFilter, isManager, requesterFilter])

  useEffect(() => { load() }, [load])

  // Client-side date filter
  const dateFilteredRows = useMemo(() => {
    const { from, to } = getDateRange(datePreset)
    if (!from) return rows
    return rows.filter(pr => { const d = new Date(pr.createdAt); return d >= from && d <= to! })
  }, [rows, datePreset])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return dateFilteredRows
    return [...dateFilteredRows].sort((a, b) => {
      const va = sortKey === 'netTotal'   ? +a.netTotal
               : sortKey === 'createdAt'  ? a.createdAt
               : (a[sortKey as keyof PurchaseRequest] as string) ?? ''
      const vb = sortKey === 'netTotal'   ? +b.netTotal
               : sortKey === 'createdAt'  ? b.createdAt
               : (b[sortKey as keyof PurchaseRequest] as string) ?? ''
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [dateFilteredRows, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const pagedRows  = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize]
  )

  // ─── Insights ──────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const total        = dateFilteredRows.length
    const totalValue   = dateFilteredRows.reduce((s, pr) => s + +pr.netTotal, 0)
    const approvedList = dateFilteredRows.filter(pr => pr.status === 'approved')
    const pendingList  = dateFilteredRows.filter(pr => pr.status === 'pending')
    const rejectedList = dateFilteredRows.filter(pr => pr.status === 'rejected')

    const approvedValue  = approvedList.reduce((s, pr) => s + +pr.netTotal, 0)
    const pendingValue   = pendingList.reduce((s, pr) => s + +pr.netTotal, 0)
    const rejectedValue  = rejectedList.reduce((s, pr) => s + +pr.netTotal, 0)

    // Average approval time: createdAt → last approvalLog with action=approve
    const times = approvedList
      .map(pr => {
        const lastApproval = pr.approvalLogs
          ?.filter(l => l.action === 'approve')
          .sort((a, b) => b.actedAt.localeCompare(a.actedAt))[0]
        if (!lastApproval) return null
        return (new Date(lastApproval.actedAt).getTime() - new Date(pr.createdAt).getTime()) / 86_400_000
      })
      .filter((v): v is number => v !== null)
    const avgApprovalDays = times.length > 0
      ? times.reduce((s, n) => s + n, 0) / times.length
      : 0

    return {
      total, totalValue,
      approvedCount: approvedList.length, approvedValue,
      pendingCount:  pendingList.length,  pendingValue,
      rejectedCount: rejectedList.length, rejectedValue,
      avgApprovalDays,
    }
  }, [dateFilteredRows])

  // ─── Monthly chart (last 12 months, from ALL rows) ─────────────────────────
  const monthlyChartData = useMemo(() => {
    const buckets: Record<string, { month: string; value: number; count: number }> = {}
    for (const pr of rows) {
      const d   = new Date(pr.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const lbl = d.toLocaleDateString('th-TH', { month: 'short' })
      if (!buckets[key]) buckets[key] = { month: lbl, value: 0, count: 0 }
      buckets[key].value += +pr.netTotal
      buckets[key].count++
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => v)
  }, [rows])

  // ─── Donut (from date-filtered rows) ──────────────────────────────────────
  const donutData = useMemo(() => {
    const counts: Partial<Record<DocStatus, number>> = {}
    for (const pr of dateFilteredRows) counts[pr.status] = (counts[pr.status] ?? 0) + 1
    return (Object.entries(counts) as [DocStatus, number][])
      .map(([status, value]) => ({
        name:  STATUS_LABELS[status],
        value,
        color: DONUT_COLORS[status] ?? '#94A3B8',
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [dateFilteredRows])

  // ─── Animated counts ────────────────────────────────────────────────────────
  const animTotal   = useCountUp(insights.total, 900, !loading)
  const animPending = useCountUp(insights.pendingCount, 900, !loading)
  const animApproved = useCountUp(insights.approvedCount, 900, !loading)

  // ─── Export ────────────────────────────────────────────────────────────────
  async function exportExcel() {
    if (!sortedRows.length) { toast('ไม่มีข้อมูลสำหรับ Export'); return }
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()
      const ws   = XLSX.utils.aoa_to_sheet([
        ['Purchase Request Report'],
        ['Export Date', new Date().toLocaleDateString('th-TH')],
        ['ช่วงเวลา', DATE_PRESETS.find(p => p.value === datePreset)?.label ?? 'ทั้งหมด'],
        ['สถานะ', statusFilter ? (STATUS_LABELS[statusFilter as DocStatus] ?? statusFilter) : 'ทั้งหมด'],
        [],
        ['เลขที่', 'ประเภท', 'ผู้ขอ', 'ลูกค้า', 'อ้างอิง WO', 'มูลค่าสุทธิ', 'สถานะ', 'วันที่ขอ', 'วันที่อนุมัติ'],
        ...sortedRows.map(pr => {
          const lastApproval = pr.approvalLogs
            ?.filter(l => l.action === 'approve')
            .sort((a, b) => b.actedAt.localeCompare(a.actedAt))[0]
          return [
            pr.prNo,
            pr.prType?.name ?? '—',
            pr.sales?.fullName ?? pr.salesId,
            pr.customer,
            pr.workOrder?.woNo ?? '—',
            +pr.netTotal,
            STATUS_LABELS[pr.status],
            new Date(pr.createdAt).toLocaleDateString('th-TH'),
            lastApproval ? new Date(lastApproval.actedAt).toLocaleDateString('th-TH') : '—',
          ]
        }),
      ])
      ws['!cols'] = [14, 18, 20, 28, 14, 14, 12, 14, 14].map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, 'ใบขอซื้อ')
      XLSX.writeFile(wb, `pr-report-${Date.now()}.xlsx`)
      toast.success('Export Excel สำเร็จ')
    } catch {
      toast.error('Export Excel ไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  type SortableKey = 'prNo' | 'customer' | 'netTotal' | 'createdAt'
  const columns: { label: string; key: SortableKey | null; right: boolean }[] = [
    { label: '#',           key: null,        right: false },
    { label: 'เลขที่',      key: 'prNo',      right: false },
    { label: 'ประเภท',      key: null,        right: false },
    { label: 'ผู้ขอ',       key: null,        right: false },
    { label: 'รายการ/คำอธิบาย', key: null,   right: false },
    { label: 'จำนวน',       key: null,        right: true  },
    { label: 'ราคา/หน่วย',  key: null,        right: true  },
    { label: 'มูลค่าสุทธิ', key: 'netTotal',  right: true  },
    { label: 'สถานะ',       key: null,        right: false },
    { label: 'ผู้อนุมัติ',  key: null,        right: false },
    { label: 'วันที่ขอ',    key: 'createdAt', right: false },
    { label: 'วันที่อนุมัติ', key: null,      right: false },
    { label: '',             key: null,        right: false },
  ]

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
          <span className="text-white/90">ใบขอซื้อ</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-white/10 border border-white/20 text-[11px] text-green-100
                            font-semibold tracking-widest mb-2.5">
              <ShieldCheck size={11} /> OWNER VIEW
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Purchase Request Report
            </h1>
            <p className="text-green-200/75 text-sm mt-1.5">
              Track purchase requests, approvals, and procurement spending
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

      {/* ══════ KPI CARDS ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard loading={loading}
          label="ใบขอซื้อทั้งหมด"
          value={loading ? '—' : animTotal.toLocaleString()}
          sub={`${dateFilteredRows.filter(pr => pr.status === 'draft').length} แบบร่าง`}
          icon={<ShoppingCart size={18} className="text-slate-500" />}
          iconBg="bg-slate-100" accent="border-l-slate-400" />

        <KpiCard loading={loading}
          label="มูลค่ารวม"
          value={loading ? '—' : `฿${fmtCompact(insights.totalValue)}`}
          sub={`฿${fmtMoney(insights.totalValue)}`}
          valueColor="text-blue-700"
          icon={<Wallet size={18} className="text-blue-500" />}
          iconBg="bg-blue-50" accent="border-l-blue-500" />

        <KpiCard loading={loading}
          label="รออนุมัติ"
          value={loading ? '—' : animPending.toLocaleString()}
          sub={`฿${fmtCompact(insights.pendingValue)} รอดำเนินการ`}
          valueColor={insights.pendingCount > 0 ? 'text-amber-600' : 'text-gray-900'}
          icon={<Hourglass size={18} className="text-amber-500" />}
          iconBg="bg-amber-50" accent={insights.pendingCount > 0 ? 'border-l-amber-500' : 'border-l-gray-200'} />

        <KpiCard loading={loading}
          label="อนุมัติแล้ว"
          value={loading ? '—' : animApproved.toLocaleString()}
          sub={`฿${fmtCompact(insights.approvedValue)} ที่อนุมัติ`}
          valueColor="text-emerald-700"
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          iconBg="bg-emerald-50" accent="border-l-emerald-500" />

        <KpiCard loading={loading}
          label="เวลาอนุมัติเฉลี่ย"
          value={loading ? '—' : `${insights.avgApprovalDays.toFixed(1)} วัน`}
          sub="นับจากวันที่ยื่นขอ"
          valueColor="text-indigo-700"
          icon={<Clock size={18} className="text-indigo-500" />}
          iconBg="bg-indigo-50" accent="border-l-indigo-500" />
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
              placeholder="ค้นหาเลขที่ / รายการ / ผู้ขอ"
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
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* PR Type */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">ประเภท PR</label>
            <select className="form-input py-2 text-sm" value={prTypeFilter}
              onChange={e => { setPrTypeFilter(e.target.value); setPage(1) }}>
              <option value="">ทั้งหมด</option>
              {prTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Requester (manager only) */}
          {isManager && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">ผู้ขอ</label>
              <select className="form-input py-2 text-sm" value={requesterFilter}
                onChange={e => setRequesterFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {salesList.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
          )}

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

          {/* Result badge */}
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
              <h3 className="text-sm font-semibold text-gray-700">PR Status Distribution</h3>
              <p className="text-xs text-gray-400 mt-0.5">การกระจายตามสถานะใบขอซื้อ</p>
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
                  <p className="text-2xl font-bold text-gray-800 tabular-nums">{insights.total}</p>
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

        {/* Monthly value bar — 3/5 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Monthly PR Value Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">มูลค่าใบขอซื้อรายเดือน 12 เดือนล่าสุด</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                       tickFormatter={(v: number) => fmtCompact(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="มูลค่า" fill="#BBF7D0" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ
            </div>
          )}
        </div>
      </div>

      {/* ══════ STATUS VALUE CARDS ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          label="Approved Value"
          value={`฿${fmtMoney(insights.approvedValue)}`}
          sub={`${insights.approvedCount} รายการที่อนุมัติแล้ว`}
          count={insights.approvedCount} total={insights.total}
          icon={<CheckCircle2 />}
          gradient="bg-gradient-to-br from-emerald-50 to-white"
          bar="bg-emerald-500" text="text-emerald-700" iconColor="text-emerald-500"
          tip="มูลค่าใบขอซื้อที่ได้รับการอนุมัติทั้งหมด" />
        <StatusCard
          label="Pending Value"
          value={`฿${fmtMoney(insights.pendingValue)}`}
          sub={`${insights.pendingCount} รายการรออนุมัติ`}
          count={insights.pendingCount} total={insights.total}
          icon={<Hourglass />}
          gradient="bg-gradient-to-br from-amber-50 to-white"
          bar="bg-amber-400" text="text-amber-600" iconColor="text-amber-500"
          tip="มูลค่าใบขอซื้อที่ยังรออนุมัติ" />
        <StatusCard
          label="Rejected Value"
          value={`฿${fmtMoney(insights.rejectedValue)}`}
          sub={`${insights.rejectedCount} รายการที่ถูกปฏิเสธ`}
          count={insights.rejectedCount} total={insights.total}
          icon={<AlertTriangle />}
          gradient="bg-gradient-to-br from-red-50 to-white"
          bar="bg-red-400" text="text-red-600" iconColor="text-red-500"
          tip="มูลค่าใบขอซื้อที่ถูกปฏิเสธ" />
      </div>

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
                  <td colSpan={13} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <FileText size={48} strokeWidth={1} />
                      <p className="text-base font-semibold text-gray-500">ไม่พบใบขอซื้อ</p>
                      <p className="text-sm text-gray-400">ลองเปลี่ยนคำค้นหาหรือตัวกรองแล้วลองใหม่</p>
                      <button onClick={load} className="btn-outline mt-1 text-sm px-4 py-1.5">
                        รีเฟรชข้อมูล
                      </button>
                    </div>
                  </td>
                </tr>
              ) : pagedRows.map((pr, idx) => {
                const lastApproval = pr.approvalLogs
                  ?.filter(l => l.action === 'approve')
                  .sort((a, b) => b.actedAt.localeCompare(a.actedAt))[0]
                const firstItem = pr.items?.[0]
                const itemCount = pr.items?.length ?? 0

                return (
                  <tr key={pr.id}
                      className={`border-b border-gray-50 transition-colors duration-100
                                  hover:bg-[#E8F5E9]/60 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>

                    {/* # */}
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums text-center w-10">
                      {(page - 1) * pageSize + idx + 1}
                    </td>

                    {/* PR No */}
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1B5E20] whitespace-nowrap">
                      {pr.prNo}
                    </td>

                    {/* PR Type */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {pr.prType?.name
                        ? <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium border border-purple-100">
                            {pr.prType.name}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Requester */}
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {pr.sales?.fullName ?? pr.salesId}
                    </td>

                    {/* Description (first item) */}
                    <td className="px-4 py-3 max-w-[220px]">
                      {firstItem ? (
                        <div>
                          <p className="text-sm text-gray-800 truncate">{firstItem.desc}</p>
                          {itemCount > 1 && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              +{itemCount - 1} รายการเพิ่มเติม
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>

                    {/* Quantity (first item) */}
                    <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {firstItem ? (
                        <span>{firstItem.qty.toLocaleString()} {firstItem.unit}</span>
                      ) : '—'}
                    </td>

                    {/* Unit price (first item) */}
                    <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {firstItem ? `฿${fmtMoney(firstItem.price)}` : '—'}
                    </td>

                    {/* Net total */}
                    <td className="px-4 py-3 text-sm font-semibold text-right tabular-nums text-gray-900 whitespace-nowrap">
                      ฿{fmtMoney(+pr.netTotal)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                                       ${STATUS_BADGE[pr.status]}`}>
                        {STATUS_LABELS[pr.status]}
                      </span>
                    </td>

                    {/* Approver */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {lastApproval?.approver?.fullName ?? (
                        pr.status === 'approved' ? '—' : <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Request date */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(pr.createdAt)}
                    </td>

                    {/* Approval date */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {lastApproval ? (
                        <span className="text-emerald-600">{fmtDate(lastApproval.actedAt)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => router.push(`/pr/${pr.id}`)} title="ดูรายละเอียด"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B5E20] hover:bg-[#E8F5E9]
                                     transition-all duration-150">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => router.push(`/pr/${pr.id}`)} title="แก้ไข"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50
                                     transition-all duration-150">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => router.push(`/print/pr/${pr.id}`)} title="พิมพ์"
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
