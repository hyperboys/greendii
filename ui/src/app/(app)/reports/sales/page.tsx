'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Download, RefreshCw, Users, TrendingUp, Target, Trophy, Calendar,
  ChevronRight, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight,
  Crown, ShieldCheck, BarChart2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, LabelList, Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import { QuotationsAPI, UsersAPI } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Quotation, User } from '@/types'
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
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

// ─── Constants ────────────────────────────────────────────────────────────────
const MANAGEMENT_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director']
const PAGE_SIZES       = [10, 25, 50]
const DATE_PRESETS = [
  { value: 'all',          label: 'ทั้งหมด' },
  { value: 'this_month',   label: 'เดือนนี้' },
  { value: 'this_quarter', label: 'ไตรมาสนี้' },
  { value: 'this_year',    label: 'ปีนี้' },
]

// Podium medal palette
const MEDAL = {
  1: { bg: 'from-yellow-50 to-amber-50', border: 'border-yellow-300', text: 'text-yellow-600', ring: 'ring-yellow-400', hex: '#FFD700' },
  2: { bg: 'from-slate-50 to-gray-100',  border: 'border-slate-300',  text: 'text-slate-500',  ring: 'ring-slate-400',  hex: '#C0C0C0' },
  3: { bg: 'from-orange-50 to-amber-50', border: 'border-orange-300', text: 'text-orange-600', ring: 'ring-orange-400', hex: '#CD7F32' },
} as const

// 8 distinct colors for trend lines
const LINE_COLORS = [
  '#1B5E20', '#1976D2', '#E65100', '#6A1B9A',
  '#00838F', '#AD1457', '#558B2F', '#4527A0',
]

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

// Last 12 calendar months
const LAST_12: { key: string; label: string }[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - (11 - i))
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
  }
})

// ─── SalesPerf model ──────────────────────────────────────────────────────────
interface SalesPerf {
  salesId: string
  name: string
  department?: string
  totalQuotations: number
  totalValue: number
  wonCount: number
  lostCount: number
  pipelineCount: number
  winRate: number
  revenue: number
  avgDealSize: number
  avgSalesCycle: number
  pipelineValue: number
  monthlyRevenue: Record<string, number>
}

function buildSalesPerf(quotations: Quotation[]): SalesPerf[] {
  const map: Record<string, SalesPerf> = {}

  for (const q of quotations) {
    const id   = q.salesId
    const name = q.sales?.fullName ?? q.salesId
    if (!map[id]) {
      map[id] = {
        salesId: id, name,
        totalQuotations: 0, totalValue: 0,
        wonCount: 0, lostCount: 0, pipelineCount: 0,
        winRate: 0, revenue: 0,
        avgDealSize: 0, avgSalesCycle: 0, pipelineValue: 0,
        monthlyRevenue: {},
      }
    }
    const p = map[id]
    p.totalQuotations++
    p.totalValue += +q.grandTotal

    if (q.status === 'approved') {
      p.wonCount++
      p.revenue += +q.grandTotal
      // Sales cycle = updatedAt - createdAt (days)
      const cycle = (new Date(q.updatedAt).getTime() - new Date(q.createdAt).getTime()) / 86_400_000
      p.avgSalesCycle = ((p.avgSalesCycle * (p.wonCount - 1)) + cycle) / p.wonCount

      // Monthly revenue bucket
      const d   = new Date(q.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      p.monthlyRevenue[key] = (p.monthlyRevenue[key] ?? 0) + +q.grandTotal
    } else if (q.status === 'rejected' || q.status === 'cancelled') {
      p.lostCount++
    } else {
      p.pipelineCount++
      p.pipelineValue += +q.grandTotal
    }
  }

  for (const p of Object.values(map)) {
    const closed = p.wonCount + p.lostCount
    p.winRate     = closed > 0 ? (p.wonCount / closed) * 100 : 0
    p.avgDealSize = p.wonCount > 0 ? p.revenue / p.wonCount : 0
  }

  return Object.values(map).sort((a, b) => b.revenue - a.revenue)
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
          <div className="h-7 bg-gray-100 rounded w-28" />
          <div className="h-2.5 bg-gray-100 rounded w-16" />
        </div>
        <div className="w-10 h-10 bg-gray-100 rounded-xl shrink-0" />
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[28, 100, 60, 80, 40, 40, 100, 80, 70, 70, 80].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string; value: string; sub?: string
  icon: React.ReactNode; iconBg: string; valueColor?: string; accent: string; loading?: boolean
}
function KpiCard({ label, value, sub, icon, iconBg, valueColor = 'text-gray-900', accent, loading }: KpiCardProps) {
  if (loading) return <SkeletonCard />
  return (
    <div className={`group relative bg-white rounded-2xl p-5 border-l-4 ${accent}
                     border border-gray-100 shadow-sm
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

// ─── Podium Card ──────────────────────────────────────────────────────────────
function PodiumCard({ rank, perf, showCrown }: {
  rank: 1 | 2 | 3; perf: SalesPerf; showCrown?: boolean
}) {
  const m = MEDAL[rank]
  const sizeClass = rank === 1
    ? 'py-7 px-5 col-span-1 scale-105'
    : 'py-5 px-4 col-span-1'

  return (
    <div className={`relative rounded-2xl bg-gradient-to-b ${m.bg} border-2 ${m.border}
                     shadow-sm flex flex-col items-center text-center overflow-hidden
                     hover:shadow-md transition-all duration-200 ${sizeClass}`}>
      {showCrown && rank === 1 && (
        <Crown size={22} className="text-yellow-500 mb-1" strokeWidth={1.5} />
      )}
      <div className={`w-12 h-12 rounded-full ring-2 ${m.ring} ring-offset-2
                       bg-white flex items-center justify-center mb-2 shadow-sm`}>
        <span className="text-lg font-black" style={{ color: m.hex }}>{rank}</span>
      </div>
      <p className="text-sm font-bold text-gray-800 leading-tight">{perf.name}</p>
      <p className="text-xs text-gray-500 mt-0.5">{perf.totalQuotations} ใบ</p>
      <div className="mt-3 w-full border-t border-black/5 pt-3 space-y-1">
        <div>
          <p className={`text-lg font-black tabular-nums ${m.text}`}>
            ฿{fmtCompact(perf.revenue)}
          </p>
          <p className="text-[10px] text-gray-400">Revenue</p>
        </div>
        <div className="flex items-center justify-center gap-3 text-xs">
          <span className="text-emerald-700 font-semibold">{perf.wonCount} Won</span>
          <span className="text-gray-300">|</span>
          <span className="font-semibold text-gray-600">{fmtPct(perf.winRate)} Win</span>
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

// ─── Chart Tooltips ───────────────────────────────────────────────────────────
function BarTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mt-0.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-800">฿{fmtCompact(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function LineTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].filter(p => p.value > 0).sort((a, b) => b.value - a.value)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {sorted.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mt-0.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-600 truncate">{p.name}:</span>
          <span className="font-semibold text-gray-800 shrink-0">฿{fmtCompact(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function SalesPerformanceReportPage() {
  const { user }  = useAuthStore()
  const isManager = MANAGEMENT_ROLES.includes(user?.role ?? '')

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [salesUsers, setSalesUsers] = useState<User[]>([])
  const [loading, setLoading]       = useState(true)
  const [exporting, setExporting]   = useState(false)

  const [salesFilter, setSalesFilter]   = useState('')
  const [deptFilter, setDeptFilter]     = useState('')
  const [datePreset, setDatePreset]     = useState('all')

  type PerfKey = keyof Omit<SalesPerf, 'salesId' | 'name' | 'department' | 'monthlyRevenue'>
  const [sortKey, setSortKey] = useState<PerfKey>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      QuotationsAPI.list(),
      UsersAPI.list({ active: 'true' }),
    ])
      .then(([qs, us]) => {
        setQuotations(qs)
        setSalesUsers(us.filter(u => hasRole(u.role, ['sales', 'sale_mgr'])))
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Unique departments from salesUsers
  const departments = useMemo(
    () => Array.from(new Set(salesUsers.map(u => u.department).filter((d): d is string => !!d))),
    [salesUsers]
  )

  // Date-filtered quotations
  const dateFilteredQs = useMemo(() => {
    const { from, to } = getDateRange(datePreset)
    if (!from) return quotations
    return quotations.filter(q => { const d = new Date(q.createdAt); return d >= from && d <= to! })
  }, [quotations, datePreset])

  // Full perf list (all salespeople, from date-filtered quotations)
  const allPerfList = useMemo(() => buildSalesPerf(dateFilteredQs), [dateFilteredQs])

  // Enrich with department from salesUsers lookup
  const enrichedPerfList = useMemo(() => allPerfList.map(p => {
    const u = salesUsers.find(u => u.id === p.salesId)
    return { ...p, department: u?.department }
  }), [allPerfList, salesUsers])

  // Filtered list (table + KPI cards)
  const filteredPerfList = useMemo(() => {
    let list = enrichedPerfList
    if (salesFilter) list = list.filter(p => p.salesId === salesFilter)
    if (deptFilter)  list = list.filter(p => p.department === deptFilter)
    return list
  }, [enrichedPerfList, salesFilter, deptFilter])

  function toggleSort(key: PerfKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortedPerfList = useMemo(() => {
    return [...filteredPerfList].sort((a, b) => {
      const va = a[sortKey] as number
      const vb = b[sortKey] as number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [filteredPerfList, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedPerfList.length / pageSize))
  const pagedPerf  = useMemo(
    () => sortedPerfList.slice((page - 1) * pageSize, page * pageSize),
    [sortedPerfList, page, pageSize]
  )

  // Podium: top 3 from enrichedPerfList (all, regardless of salesFilter)
  const top3 = useMemo(
    () => enrichedPerfList.slice(0, 3),
    [enrichedPerfList]
  )

  // KPI summary (from filteredPerfList)
  const kpi = useMemo(() => {
    const list       = filteredPerfList
    const totalRev   = list.reduce((s, p) => s + p.revenue, 0)
    const totalWon   = list.reduce((s, p) => s + p.wonCount, 0)
    const totalLost  = list.reduce((s, p) => s + p.lostCount, 0)
    const closed     = totalWon + totalLost
    const avgWinRate = closed > 0 ? (totalWon / closed) * 100 : 0
    const avgCycle   = list.length > 0
      ? list.reduce((s, p) => s + p.avgSalesCycle, 0) / list.length
      : 0
    const top = enrichedPerfList[0]
    return { totalRev, avgWinRate, avgCycle, top, count: list.length }
  }, [filteredPerfList, enrichedPerfList])

  // Animated counts
  const animRev   = useCountUp(Math.round(kpi.totalRev), 900, !loading)
  const animSales = useCountUp(kpi.count, 900, !loading)

  // Horizontal bar chart data (top 10 by revenue, from allPerfList)
  const rankingChartData = useMemo(() =>
    enrichedPerfList.slice(0, 10).map(p => ({ name: p.name, revenue: p.revenue, pipeline: p.pipelineValue })),
    [enrichedPerfList]
  )

  // Revenue vs Pipeline grouped bar
  const revPipelineData = useMemo(() =>
    enrichedPerfList.slice(0, 8).map(p => ({
      name: p.name.split(' ')[0],  // first name only for chart
      revenue: p.revenue,
      pipeline: p.pipelineValue,
    })),
    [enrichedPerfList]
  )

  // Multi-line trend chart data
  const trendChartData = useMemo(() => {
    const people = enrichedPerfList.slice(0, 8) // max 8 lines
    return LAST_12.map(({ key, label }) => {
      const entry: Record<string, string | number> = { month: label }
      for (const p of people) entry[p.name] = p.monthlyRevenue[key] ?? 0
      return entry
    })
  }, [enrichedPerfList])

  const trendPeople = useMemo(() => enrichedPerfList.slice(0, 8), [enrichedPerfList])

  function toggleLine(name: string) {
    setHiddenLines(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // Export Excel
  async function exportExcel() {
    if (!sortedPerfList.length) { toast('ไม่มีข้อมูลสำหรับ Export'); return }
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()
      const ws   = XLSX.utils.aoa_to_sheet([
        ['Sales Performance Report'],
        ['Export Date', new Date().toLocaleDateString('th-TH')],
        ['Period', DATE_PRESETS.find(p => p.value === datePreset)?.label ?? 'ทั้งหมด'],
        [],
        ['อันดับ', 'พนักงานขาย', 'ใบเสนอราคา', 'มูลค่ารวม', 'Won', 'Lost', 'Win Rate(%)',
         'Revenue', 'Avg Deal Size', 'Avg Cycle(วัน)', 'Pipeline Value'],
        ...sortedPerfList.map((p, i) => [
          i + 1, p.name, p.totalQuotations, +p.totalValue,
          p.wonCount, p.lostCount, +p.winRate.toFixed(2),
          +p.revenue, +p.avgDealSize.toFixed(0),
          +p.avgSalesCycle.toFixed(1), +p.pipelineValue,
        ]),
      ])
      ws['!cols'] = [8, 22, 14, 14, 8, 8, 12, 14, 14, 14, 14].map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Performance')
      XLSX.writeFile(wb, `sales-performance-${Date.now()}.xlsx`)
      toast.success('Export Excel สำเร็จ')
    } catch {
      toast.error('Export Excel ไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  type TableCol = { label: string; key: PerfKey | null; right: boolean }
  const columns: TableCol[] = [
    { label: '#',              key: null,               right: false },
    { label: 'พนักงานขาย',   key: null,               right: false },
    { label: 'ใบเสนอราคา',   key: 'totalQuotations',  right: true  },
    { label: 'มูลค่ารวม',    key: 'totalValue',        right: true  },
    { label: 'Won',            key: 'wonCount',         right: true  },
    { label: 'Lost',           key: 'lostCount',        right: true  },
    { label: 'Win Rate',       key: 'winRate',          right: false },
    { label: 'Revenue',        key: 'revenue',          right: true  },
    { label: 'Avg Deal',       key: 'avgDealSize',      right: true  },
    { label: 'Avg Cycle',      key: 'avgSalesCycle',    right: true  },
    { label: 'Pipeline',       key: 'pipelineValue',    right: true  },
  ]

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* ══════ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden shadow-md"
           style={{ background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 60%, #1E88E5 100%)' }}>
        <div className="px-6 pt-4 flex items-center gap-1.5 text-blue-200/70 text-[11px] font-medium">
          <Link href="/dashboard" className="hover:text-white transition-colors">หน้าหลัก</Link>
          <ChevronRight size={11} />
          <Link href="/reports" className="hover:text-white transition-colors">รายงาน</Link>
          <ChevronRight size={11} />
          <span className="text-white/90">Sales Performance</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-white/10 border border-white/20 text-[11px] text-blue-100
                            font-semibold tracking-widest mb-2.5">
              <ShieldCheck size={11} /> MANAGEMENT VIEW
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Sales Performance Report
            </h1>
            <p className="text-blue-200/75 text-sm mt-1.5">
              Analyze salesperson performance, rankings, and targets
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
          label="พนักงานขาย"
          value={loading ? '—' : animSales.toLocaleString()}
          sub="คนที่มีข้อมูล"
          icon={<Users size={18} className="text-slate-500" />}
          iconBg="bg-slate-100" accent="border-l-slate-400" />

        <KpiCard loading={loading}
          label="Revenue รวม"
          value={loading ? '—' : `฿${fmtCompact(animRev)}`}
          sub={`฿${fmtMoney(kpi.totalRev)}`}
          valueColor="text-blue-700"
          icon={<TrendingUp size={18} className="text-blue-500" />}
          iconBg="bg-blue-50" accent="border-l-blue-500" />

        <KpiCard loading={loading}
          label="Win Rate เฉลี่ย"
          value={loading ? '—' : fmtPct(kpi.avgWinRate)}
          sub="โดยรวมทุกคน"
          valueColor={kpi.avgWinRate >= 50 ? 'text-emerald-700' : kpi.avgWinRate >= 30 ? 'text-amber-600' : 'text-red-600'}
          icon={<Target size={18} className="text-indigo-500" />}
          iconBg="bg-indigo-50" accent="border-l-indigo-500" />

        <KpiCard loading={loading}
          label="Top Performer"
          value={loading ? '—' : (kpi.top?.name ?? '—')}
          sub={loading ? '' : `฿${fmtCompact(kpi.top?.revenue ?? 0)} revenue`}
          valueColor="text-amber-700"
          icon={<Trophy size={18} className="text-amber-500" />}
          iconBg="bg-amber-50" accent="border-l-amber-500" />

        <KpiCard loading={loading}
          label="Avg Sales Cycle"
          value={loading ? '—' : `${kpi.avgCycle.toFixed(1)} วัน`}
          sub="เฉลี่ยจากรายการ Won"
          valueColor="text-purple-700"
          icon={<Calendar size={18} className="text-purple-500" />}
          iconBg="bg-purple-50" accent="border-l-purple-500" />
      </div>

      {/* ══════ FILTER BAR ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Salesperson */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">พนักงานขาย</label>
            <select className="form-input py-2 text-sm" value={salesFilter}
              onChange={e => { setSalesFilter(e.target.value); setPage(1) }}>
              <option value="">ทั้งหมด</option>
              {salesUsers.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>

          {/* Department (only show if any user has dept set) */}
          {departments.length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">แผนก</label>
              <select className="form-input py-2 text-sm" value={deptFilter}
                onChange={e => { setDeptFilter(e.target.value); setPage(1) }}>
                <option value="">ทั้งหมด</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {/* Period */}
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
                             bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
              {filteredPerfList.length} คน
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} title="ค้นหา"
              className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50
                         flex items-center justify-center text-gray-500 hover:text-gray-800
                         transition-all duration-150 shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportExcel} disabled={exporting || sortedPerfList.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl
                         bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                         disabled:opacity-50 transition-all duration-150 shadow-sm">
              <Download size={15} />
              {exporting ? 'กำลัง Export…' : 'Export Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* ══════ PODIUM ══════════════════════════════════════════════════════════ */}
      {!loading && top3.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Sales Leaderboard</h3>
              <p className="text-xs text-gray-400 mt-0.5">Top performers for selected period</p>
            </div>
            <Trophy size={18} className="text-amber-400" />
          </div>
          {/* Podium: 2nd | 1st | 3rd */}
          <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto items-end">
            {top3[1] ? (
              <PodiumCard rank={2} perf={top3[1]} />
            ) : (
              <div className="col-span-1 h-32 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
                <span className="text-gray-300 text-xs">—</span>
              </div>
            )}
            {top3[0] && <PodiumCard rank={1} perf={top3[0]} showCrown />}
            {top3[2] ? (
              <PodiumCard rank={3} perf={top3[2]} />
            ) : (
              <div className="col-span-1 h-28 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
                <span className="text-gray-300 text-xs">—</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ CHARTS ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left: Horizontal ranking bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Sales Ranking by Revenue</h3>
              <p className="text-xs text-gray-400 mt-0.5">Top 10 พนักงานขาย</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {rankingChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(rankingChartData.length * 40, 200)}>
              <BarChart
                data={rankingChartData}
                layout="vertical"
                margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }}
                       axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} />
                <YAxis type="category" dataKey="name" width={80}
                       tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {rankingChartData.map((_, i) => (
                    <Cell key={i}
                      fill={i === 0 ? '#1B5E20' : i === 1 ? '#2E7D32' : i === 2 ? '#388E3C' : `hsl(120,${Math.max(30, 60 - i * 5)}%,${Math.min(65, 40 + i * 4)}%)`}
                    />
                  ))}
                  <LabelList dataKey="revenue" position="right"
                    formatter={(v: number) => `฿${fmtCompact(v)}`}
                    style={{ fontSize: 10, fill: '#6B7280' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
              ยังไม่มีข้อมูล
            </div>
          )}
        </div>

        {/* Right: Revenue vs Pipeline grouped bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Revenue vs Pipeline</h3>
              <p className="text-xs text-gray-400 mt-0.5">Revenue ที่ปิดได้ vs มูลค่าที่ยังเปิดอยู่</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {revPipelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revPipelineData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                        barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                       tickFormatter={(v: number) => fmtCompact(v)} />
                <Tooltip content={<BarTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="revenue"  name="Revenue"  fill="#6EE7B7" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="pipeline" name="Pipeline" fill="#FCD34D" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              ยังไม่มีข้อมูล
            </div>
          )}
        </div>
      </div>

      {/* ══════ TREND CHART ═════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Monthly Revenue Trend</h3>
            <p className="text-xs text-gray-400 mt-0.5">Revenue รายเดือน 12 เดือนล่าสุด · คลิก Legend เพื่อซ่อน/แสดง</p>
          </div>
          <BarChart2 size={16} className="text-gray-300" />
        </div>

        {/* Clickable legend */}
        {trendPeople.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {trendPeople.map((p, i) => (
              <button key={p.salesId}
                onClick={() => toggleLine(p.name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                             font-medium border transition-all duration-150
                             ${hiddenLines.has(p.name)
                               ? 'bg-gray-50 border-gray-200 text-gray-400 line-through opacity-60'
                               : 'bg-white border-gray-200 text-gray-700 hover:shadow-sm'
                             }`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: hiddenLines.has(p.name) ? '#CBD5E1' : LINE_COLORS[i] }} />
                {p.name}
              </button>
            ))}
          </div>
        )}

        {trendChartData.length > 0 && trendPeople.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                     tickFormatter={(v: number) => fmtCompact(v)} />
              <Tooltip content={<LineTooltip />} />
              {trendPeople.map((p, i) => (
                <Line
                  key={p.salesId}
                  type="monotone"
                  dataKey={p.name}
                  stroke={LINE_COLORS[i]}
                  strokeWidth={hiddenLines.has(p.name) ? 0 : 2}
                  dot={false}
                  hide={hiddenLines.has(p.name)}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">
            ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ
          </div>
        )}
      </div>

      {/* ══════ PERFORMANCE TABLE ═══════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            แสดง <strong>{pagedPerf.length}</strong> / {sortedPerfList.length} คน
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
              <tr style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1976D2 100%)' }}>
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
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : pagedPerf.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Users size={48} strokeWidth={1} />
                      <p className="text-base font-semibold text-gray-500">ไม่พบข้อมูลพนักงานขาย</p>
                      <p className="text-sm text-gray-400">ลองเปลี่ยนตัวกรองแล้วลองใหม่</p>
                    </div>
                  </td>
                </tr>
              ) : pagedPerf.map((perf, idx) => {
                const rank = (page - 1) * pageSize + idx + 1
                const globalRank = enrichedPerfList.findIndex(p => p.salesId === perf.salesId) + 1

                // Win rate conditional background
                const winBg = perf.winRate >= 50
                  ? 'bg-emerald-50/60'
                  : perf.winRate >= 30
                  ? 'bg-amber-50/60'
                  : perf.wonCount + perf.lostCount > 0
                  ? 'bg-red-50/40'
                  : ''

                return (
                  <tr key={perf.salesId}
                      className={`border-b border-gray-50 transition-colors duration-100
                                  hover:brightness-[0.97] ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    {/* Rank */}
                    <td className="px-4 py-3 text-center">
                      {globalRank <= 3 ? (
                        <span className="inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold"
                              style={{ background: MEDAL[globalRank as 1|2|3]?.hex ?? '#94A3B8', color: '#fff' }}>
                          {globalRank}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">{rank}</span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">{perf.name}</p>
                      {perf.department && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{perf.department}</p>
                      )}
                    </td>

                    {/* Total QUO */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700">
                      {perf.totalQuotations.toLocaleString()}
                    </td>

                    {/* Total Value */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700">
                      ฿{fmtCompact(perf.totalValue)}
                    </td>

                    {/* Won */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-semibold text-emerald-700">
                      {perf.wonCount}
                    </td>

                    {/* Lost */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-red-500">
                      {perf.lostCount}
                    </td>

                    {/* Win Rate with mini progress bar */}
                    <td className={`px-4 py-3 min-w-[120px] ${winBg}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500
                                          ${perf.winRate >= 50 ? 'bg-emerald-500'
                                            : perf.winRate >= 30 ? 'bg-amber-400'
                                            : 'bg-red-400'}`}
                               style={{ width: `${Math.min(perf.winRate, 100)}%` }} />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums shrink-0
                                         ${perf.winRate >= 50 ? 'text-emerald-700'
                                           : perf.winRate >= 30 ? 'text-amber-600'
                                           : 'text-red-600'}`}>
                          {fmtPct(perf.winRate)}
                        </span>
                      </div>
                    </td>

                    {/* Revenue */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-semibold text-gray-900">
                      ฿{fmtCompact(perf.revenue)}
                    </td>

                    {/* Avg Deal */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700">
                      {perf.wonCount > 0 ? `฿${fmtCompact(perf.avgDealSize)}` : '—'}
                    </td>

                    {/* Avg Cycle */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700">
                      {perf.wonCount > 0 ? `${perf.avgSalesCycle.toFixed(1)}d` : '—'}
                    </td>

                    {/* Pipeline */}
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-amber-700 font-medium">
                      {perf.pipelineCount > 0 ? `฿${fmtCompact(perf.pipelineValue)}` : '—'}
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
