'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Download, RefreshCw, Search, Flag, Play, PauseCircle, CheckCircle2,
  ChevronRight, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight,
  ShieldCheck, BarChart2, ChevronDown as ExpandIcon, Eye,
  AlertTriangle, Route, Calendar,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, LabelList, Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import { QuotationsAPI, WorkOrdersAPI, HandoversAPI, PRAPI, UsersAPI } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Quotation, WorkOrder, HandOverJob, PurchaseRequest, User } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function daysBetween(a: string, b?: string | null) {
  const end = b ? new Date(b) : new Date()
  return Math.max(0, Math.ceil((end.getTime() - new Date(a).getTime()) / 86_400_000))
}
function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

// ─── Stage constants ──────────────────────────────────────────────────────────
const STAGE_ORDER = ['quotation', 'workorder', 'inprogress', 'handover', 'complete'] as const
type Stage = typeof STAGE_ORDER[number]

const STAGE_CONFIG: Record<Stage, { label: string; color: string; bg: string; border: string; light: string }> = {
  quotation:  { label: 'ใบเสนอราคา',  color: '#3B82F6', bg: 'bg-blue-500',    border: 'border-blue-400',    light: 'bg-blue-50'    },
  workorder:  { label: 'ใบสั่งงาน',    color: '#8B5CF6', bg: 'bg-purple-500',  border: 'border-purple-400',  light: 'bg-purple-50'  },
  inprogress: { label: 'กำลังดำเนินการ',color: '#F59E0B', bg: 'bg-amber-500',   border: 'border-amber-400',   light: 'bg-amber-50'   },
  handover:   { label: 'ส่งมอบงาน',    color: '#10B981', bg: 'bg-emerald-500', border: 'border-emerald-400', light: 'bg-emerald-50' },
  complete:   { label: 'เสร็จสมบูรณ์',  color: '#059669', bg: 'bg-green-600',   border: 'border-green-500',   light: 'bg-green-50'   },
}

// Target days per stage (configurable)
const STAGE_TARGETS: Record<Stage, number> = {
  quotation:  7,
  workorder:  3,
  inprogress: 30,
  handover:   7,
  complete:   0,
}

const MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director', 'project_mgr']
const PAGE_SIZES    = [10, 25, 50]
const DATE_PRESETS  = [
  { value: 'all',          label: 'ทั้งหมด' },
  { value: 'this_month',   label: 'เดือนนี้' },
  { value: 'this_quarter', label: 'ไตรมาสนี้' },
  { value: 'this_year',    label: 'ปีนี้' },
]

// ─── Domain model ────────────────────────────────────────────────────────────

/** One "project chain" that tracks a quotation through to delivery */
interface ProjectChain {
  id: string                    // quotationId as primary key
  quoNo: string
  woNo?: string
  hoNo?: string
  prNos: string[]
  customer: string
  project: string
  salesId: string
  salesName: string
  grandTotal: number
  currentStage: Stage
  startDate: string             // quotation.createdAt
  woDate?: string
  inProgressDate?: string       // WO approved date
  handoverDate?: string
  completedDate?: string
  totalDays: number
  stageDays: Record<Stage, number>
  quoId: string
  woId?: string
  hoId?: string
}

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

/** Build project chains from all four collections */
function buildChains(
  quotations: Quotation[],
  workOrders: WorkOrder[],
  handovers: HandOverJob[],
  prs: PurchaseRequest[],
): ProjectChain[] {
  const woByQuo   = new Map<string, WorkOrder[]>()
  const hoByWo    = new Map<string, HandOverJob>()
  const prsByWo   = new Map<string, PurchaseRequest[]>()
  const hoByQuo   = new Map<string, HandOverJob>()

  for (const wo of workOrders) {
    if (wo.quotationId) {
      if (!woByQuo.has(wo.quotationId)) woByQuo.set(wo.quotationId, [])
      woByQuo.get(wo.quotationId)!.push(wo)
    }
  }
  for (const ho of handovers) {
    if (ho.workOrderId) hoByWo.set(ho.workOrderId, ho)
    if (ho.quotationId && !ho.workOrderId) hoByQuo.set(ho.quotationId, ho)
  }
  for (const pr of prs) {
    if (pr.workOrderId) {
      if (!prsByWo.has(pr.workOrderId)) prsByWo.set(pr.workOrderId, [])
      prsByWo.get(pr.workOrderId)!.push(pr)
    }
  }

  const chains: ProjectChain[] = []

  for (const q of quotations) {
    const wos = woByQuo.get(q.id) ?? []
    // Use the most recent / relevant WO
    const wo  = wos.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const ho  = wo ? (hoByWo.get(wo.id) ?? hoByQuo.get(q.id)) : hoByQuo.get(q.id)
    const prList = wo ? (prsByWo.get(wo.id) ?? []) : []

    // Determine current stage
    let currentStage: Stage = 'quotation'
    let inProgressDate: string | undefined

    if (wo) {
      currentStage = 'workorder'
      // WO "inprogress" = when WO was approved
      const approvedLog = wo.approvalLogs?.find(l => l.action === 'approve')
      inProgressDate = approvedLog?.actedAt ?? wo.updatedAt
      if (wo.status === 'approved' || wo.isClosed) currentStage = 'inprogress'
    }
    if (ho) {
      if (ho.status === 'approved') currentStage = 'complete'
      else currentStage = 'handover'
    }
    if (ho && (ho.status === 'approved')) currentStage = 'complete'

    const completedDate = currentStage === 'complete' ? (ho?.updatedAt ?? ho?.createdAt) : undefined
    const totalDays = daysBetween(q.createdAt, completedDate)

    // Stage durations
    const stageDays: Record<Stage, number> = {
      quotation:  wo ? daysBetween(q.createdAt, wo.createdAt) : daysBetween(q.createdAt),
      workorder:  wo && inProgressDate ? daysBetween(wo.createdAt, inProgressDate) : 0,
      inprogress: ho && inProgressDate ? daysBetween(inProgressDate, ho.createdAt) : (wo && inProgressDate ? daysBetween(inProgressDate) : 0),
      handover:   ho && completedDate ? daysBetween(ho.createdAt, completedDate) : (ho ? daysBetween(ho.createdAt) : 0),
      complete:   0,
    }

    chains.push({
      id:            q.id,
      quoId:         q.id,
      woId:          wo?.id,
      hoId:          ho?.id,
      quoNo:         q.quoNo,
      woNo:          wo?.woNo,
      hoNo:          ho?.hoNo,
      prNos:         prList.map(p => p.prNo),
      customer:      q.customerName,
      project:       q.project,
      salesId:       q.salesId,
      salesName:     q.sales?.fullName ?? q.salesId,
      grandTotal:    +q.grandTotal,
      currentStage,
      startDate:     q.createdAt,
      woDate:        wo?.createdAt,
      inProgressDate,
      handoverDate:  ho?.createdAt,
      completedDate,
      totalDays,
      stageDays,
    })
  }

  return chains.sort((a, b) => b.startDate.localeCompare(a.startDate))
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
        <div className="w-10 h-10 bg-gray-100 rounded-xl shrink-0" />
      </div>
    </div>
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
    <div className={`group bg-white rounded-2xl p-5 border-l-4 ${accent}
                     border border-gray-100 shadow-sm
                     hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
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

// ─── Stage Dot Progress ───────────────────────────────────────────────────────
function StageDots({ current }: { current: Stage }) {
  const idx = STAGE_ORDER.indexOf(current)
  return (
    <div className="flex items-center gap-1">
      {STAGE_ORDER.map((s, i) => {
        const cfg = STAGE_CONFIG[s]
        const done   = i < idx
        const active = i === idx
        return (
          <div key={s} className="flex items-center gap-1">
            <div title={cfg.label}
                 style={active ? { background: cfg.color } : done ? { background: cfg.color, opacity: 0.4 } : {}}
                 className={`w-2.5 h-2.5 rounded-full transition-all duration-200
                              ${!done && !active ? 'bg-gray-200' : ''}`} />
            {i < STAGE_ORDER.length - 1 && (
              <div className={`w-3 h-0.5 rounded ${done ? 'bg-gray-300' : 'bg-gray-100'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Row timeline (expanded) ──────────────────────────────────────────────────
function RowTimeline({ chain }: { chain: ProjectChain }) {
  const events: { label: string; date: string | undefined; days: number; color: string }[] = [
    { label: 'ใบเสนอราคา',    date: chain.startDate,       days: chain.stageDays.quotation,  color: STAGE_CONFIG.quotation.color  },
    { label: 'ใบสั่งงาน',      date: chain.woDate,          days: chain.stageDays.workorder,  color: STAGE_CONFIG.workorder.color  },
    { label: 'กำลังดำเนินการ', date: chain.inProgressDate,  days: chain.stageDays.inprogress, color: STAGE_CONFIG.inprogress.color },
    { label: 'ส่งมอบงาน',      date: chain.handoverDate,    days: chain.stageDays.handover,   color: STAGE_CONFIG.handover.color   },
    { label: 'เสร็จสมบูรณ์',   date: chain.completedDate,   days: 0,                          color: STAGE_CONFIG.complete.color   },
  ]
  return (
    <tr>
      <td colSpan={12} className="px-6 py-4 bg-gray-50/70 border-b border-gray-100">
        <div className="flex items-start gap-0">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center mr-0">
                <div className="w-3 h-3 rounded-full mt-1 shrink-0"
                     style={{ background: ev.date ? ev.color : '#E5E7EB' }} />
                {i < events.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ background: ev.date ? '#D1D5DB' : '#F3F4F6', minHeight: 24 }} />
                )}
              </div>
              <div className="ml-2 pb-4 flex-1 min-w-0">
                <p className="text-[11px] font-semibold" style={{ color: ev.date ? ev.color : '#9CA3AF' }}>{ev.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ev.date ? fmtDate(ev.date) : '—'}</p>
                {ev.days > 0 && (
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {ev.days} วัน
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {chain.prNos.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-gray-400">PR:</span>
            {chain.prNos.map(n => (
              <span key={n} className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">{n}</span>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Bar tooltip ──────────────────────────────────────────────────────────────
function BarTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mt-0.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold">{p.value.toFixed(1)} วัน</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function WorkflowTrackingReportPage() {
  const router   = useRouter()
  const { user } = useAuthStore()
  const isManager = MANAGER_ROLES.includes(user?.role ?? '')

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [handovers,  setHandovers]  = useState<HandOverJob[]>([])
  const [prs,        setPrs]        = useState<PurchaseRequest[]>([])
  const [salesUsers, setSalesUsers] = useState<User[]>([])
  const [loading,    setLoading]    = useState(true)
  const [exporting,  setExporting]  = useState(false)

  const [search,        setSearch]        = useState('')
  const [stageFilter,   setStageFilter]   = useState<Stage | ''>('')
  const [salesFilter,   setSalesFilter]   = useState('')
  const [customerFilter,setCustomerFilter] = useState('')
  const [datePreset,    setDatePreset]    = useState('all')

  const [sortKey, setSortKey] = useState<'quoNo' | 'customer' | 'totalDays' | 'startDate'>('startDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page,    setPage]    = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      QuotationsAPI.list(),
      WorkOrdersAPI.list(),
      HandoversAPI.list(),
      PRAPI.list(),
      isManager ? UsersAPI.list({ active: 'true' }) : Promise.resolve([] as User[]),
    ])
      .then(([qs, wos, hos, prList, users]) => {
        setQuotations(qs)
        setWorkOrders(wos)
        setHandovers(hos)
        setPrs(prList)
        setSalesUsers(users.filter(u => ['sales', 'sale_mgr'].includes(u.role)))
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [isManager])

  useEffect(() => { load() }, [load])

  // All chains (unfiltered by date/stage/search)
  const allChains = useMemo(
    () => buildChains(quotations, workOrders, handovers, prs),
    [quotations, workOrders, handovers, prs]
  )

  // Date-filtered
  const dateFilteredChains = useMemo(() => {
    const { from, to } = getDateRange(datePreset)
    if (!from) return allChains
    return allChains.filter(c => { const d = new Date(c.startDate); return d >= from && d <= to! })
  }, [allChains, datePreset])

  // All unique customers
  const uniqueCustomers = useMemo(
    () => Array.from(new Set(dateFilteredChains.map(c => c.customer))).sort(),
    [dateFilteredChains]
  )

  // Full search + filters
  const filteredChains = useMemo(() => {
    let list = dateFilteredChains
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.quoNo.toLowerCase().includes(q) ||
        (c.woNo?.toLowerCase().includes(q)) ||
        (c.hoNo?.toLowerCase().includes(q)) ||
        c.customer.toLowerCase().includes(q) ||
        c.project.toLowerCase().includes(q)
      )
    }
    if (stageFilter) list = list.filter(c => c.currentStage === stageFilter)
    if (salesFilter) list = list.filter(c => c.salesId === salesFilter)
    if (customerFilter) list = list.filter(c => c.customer === customerFilter)
    return list
  }, [dateFilteredChains, search, stageFilter, salesFilter, customerFilter])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortedChains = useMemo(() => {
    return [...filteredChains].sort((a, b) => {
      const va = sortKey === 'totalDays' ? a.totalDays
               : sortKey === 'startDate' ? a.startDate
               : (a[sortKey] as string)
      const vb = sortKey === 'totalDays' ? b.totalDays
               : sortKey === 'startDate' ? b.startDate
               : (b[sortKey] as string)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [filteredChains, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedChains.length / pageSize))
  const pagedChains = useMemo(
    () => sortedChains.slice((page - 1) * pageSize, page * pageSize),
    [sortedChains, page, pageSize]
  )

  // ─── Funnel & KPI stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = dateFilteredChains
    const stageCounts = Object.fromEntries(
      STAGE_ORDER.map(s => [s, all.filter(c => c.currentStage === s).length])
    ) as Record<Stage, number>

    const completed   = all.filter(c => c.currentStage === 'complete')
    const active      = all.filter(c => c.currentStage !== 'complete')
    const TARGET_TOTAL = 45 // total target days for full cycle
    const stuck       = active.filter(c => c.totalDays > TARGET_TOTAL)

    const avgCycle = completed.length > 0
      ? completed.reduce((s, c) => s + c.totalDays, 0) / completed.length
      : 0
    const completionRate = all.length > 0 ? (completed.length / all.length) * 100 : 0

    // Average time per stage (from chains that reached each stage)
    const avgStageDays = Object.fromEntries(
      STAGE_ORDER.map(s => {
        const chains = all.filter(c => STAGE_ORDER.indexOf(c.currentStage) >= STAGE_ORDER.indexOf(s))
        const avg = chains.length > 0
          ? chains.reduce((sum, c) => sum + c.stageDays[s], 0) / chains.length
          : 0
        return [s, avg]
      })
    ) as Record<Stage, number>

    // Conversion rates between stages
    const conversionRates: Record<string, number> = {}
    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      const from = STAGE_ORDER[i]
      const atFrom = all.filter(c => STAGE_ORDER.indexOf(c.currentStage) >= i).length
      const toNext = all.filter(c => STAGE_ORDER.indexOf(c.currentStage) >= i + 1).length
      conversionRates[`${from}->${STAGE_ORDER[i + 1]}`] = atFrom > 0 ? (toNext / atFrom) * 100 : 0
    }

    // Bottleneck: stage with highest avg days (excluding complete)
    const bottleneck = STAGE_ORDER.slice(0, -1).reduce((best, s) =>
      avgStageDays[s] > avgStageDays[best] ? s : best,
      STAGE_ORDER[0]
    )

    return {
      stageCounts, completed: completed.length, active: active.length,
      stuck: stuck.length, avgCycle, completionRate, avgStageDays,
      conversionRates, bottleneck,
      total: all.length,
    }
  }, [dateFilteredChains])

  // Monthly completion trend (last 12 months)
  const monthlyTrend = useMemo(() => {
    const completed = allChains.filter(c => c.currentStage === 'complete' && c.completedDate)
    const buckets: Record<string, number> = {}
    for (const c of completed) {
      const d = new Date(c.completedDate!)
      const k = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
      buckets[k] = (buckets[k] ?? 0) + 1
    }
    // Ensure last 12 months appear even if zero
    const result: { month: string; completed: number; target: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const k = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
      result.push({ month: k, completed: buckets[k] ?? 0, target: 3 })
    }
    return result
  }, [allChains])

  // Stage bar chart data
  const stageBarData = useMemo(() =>
    STAGE_ORDER.slice(0, -1).map(s => ({
      stage: STAGE_CONFIG[s].label,
      avg:   Math.round(stats.avgStageDays[s] * 10) / 10,
      target: STAGE_TARGETS[s],
      color: STAGE_CONFIG[s].color,
      over:  stats.avgStageDays[s] > STAGE_TARGETS[s] && STAGE_TARGETS[s] > 0,
    })),
    [stats]
  )

  // Count-up
  const animCompleted = useCountUp(stats.completed, 900, !loading)
  const animActive    = useCountUp(stats.active, 900, !loading)

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Export
  async function exportExcel() {
    if (!sortedChains.length) { toast('ไม่มีข้อมูลสำหรับ Export'); return }
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()
      const ws   = XLSX.utils.aoa_to_sheet([
        ['End-to-End Workflow Tracking Report'],
        ['Export Date', new Date().toLocaleDateString('th-TH')],
        [],
        ['QUO No', 'WO No', 'HO No', 'PR Nos', 'Customer', 'Project',
         'Salesperson', 'Current Stage', 'Start Date', 'Total Days'],
        ...sortedChains.map(c => [
          c.quoNo, c.woNo ?? '—', c.hoNo ?? '—', c.prNos.join(', '),
          c.customer, c.project, c.salesName,
          STAGE_CONFIG[c.currentStage].label,
          new Date(c.startDate).toLocaleDateString('th-TH'),
          c.totalDays,
        ]),
      ])
      ws['!cols'] = [14, 14, 14, 18, 28, 30, 20, 16, 14, 10].map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, 'Workflow Tracking')
      XLSX.writeFile(wb, `workflow-tracking-${Date.now()}.xlsx`)
      toast.success('Export Excel สำเร็จ')
    } catch {
      toast.error('Export Excel ไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { label: '',              key: null,          right: false }, // expand
    { label: 'QUO No.',       key: 'quoNo'  as const, right: false },
    { label: 'WO No.',        key: null,          right: false },
    { label: 'HO No.',        key: null,          right: false },
    { label: 'Customer',      key: 'customer' as const, right: false },
    { label: 'Project',       key: null,          right: false },
    { label: 'Salesperson',   key: null,          right: false },
    { label: 'ขั้นตอนปัจจุบัน', key: null,       right: false },
    { label: 'Start Date',    key: 'startDate' as const, right: false },
    { label: 'Total Days',    key: 'totalDays' as const, right: true  },
    { label: 'Status',        key: null,          right: false },
    { label: '',              key: null,          right: false },
  ]

  const TARGET_TOTAL = 45

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
          <span className="text-white/90">Workflow Tracking</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-white/10 border border-white/20 text-[11px] text-blue-100
                            font-semibold tracking-widest mb-2.5">
              <ShieldCheck size={11} /> MANAGEMENT VIEW
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              End-to-End Workflow Tracking
            </h1>
            <p className="text-blue-200/75 text-sm mt-1.5">
              Track complete project lifecycle from quotation to delivery
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
          label="Avg Cycle Time"
          value={loading ? '—' : `${stats.avgCycle.toFixed(1)} วัน`}
          sub="เฉลี่ยจากโปรเจกต์ที่เสร็จแล้ว"
          valueColor="text-blue-700"
          icon={<Route size={18} className="text-blue-500" />}
          iconBg="bg-blue-50" accent="border-l-blue-500" />

        <KpiCard loading={loading}
          label="Completed Projects"
          value={loading ? '—' : animCompleted.toLocaleString()}
          sub={`${stats.completionRate.toFixed(0)}% completion rate`}
          valueColor="text-emerald-700"
          icon={<Flag size={18} className="text-emerald-500" />}
          iconBg="bg-emerald-50" accent="border-l-emerald-500" />

        <KpiCard loading={loading}
          label="Active Projects"
          value={loading ? '—' : animActive.toLocaleString()}
          sub="กำลังดำเนินการ"
          valueColor="text-indigo-700"
          icon={<Play size={18} className="text-indigo-500" />}
          iconBg="bg-indigo-50" accent="border-l-indigo-500" />

        <KpiCard loading={loading}
          label="Stuck / Bottleneck"
          value={loading ? '—' : stats.stuck.toLocaleString()}
          sub={`เกิน ${TARGET_TOTAL} วัน`}
          valueColor={stats.stuck > 0 ? 'text-red-600' : 'text-gray-900'}
          icon={<PauseCircle size={18} className={stats.stuck > 0 ? 'text-red-500' : 'text-gray-400'} />}
          iconBg={stats.stuck > 0 ? 'bg-red-50' : 'bg-gray-50'}
          accent={stats.stuck > 0 ? 'border-l-red-500' : 'border-l-gray-200'} />

        <KpiCard loading={loading}
          label="Completion Rate"
          value={loading ? '—' : `${stats.completionRate.toFixed(1)}%`}
          sub={`${stats.completed} / ${stats.total} โปรเจกต์`}
          valueColor={stats.completionRate >= 60 ? 'text-emerald-700' : 'text-amber-600'}
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          iconBg="bg-emerald-50" accent="border-l-emerald-500" />
      </div>

      {/* ══════ WORKFLOW FUNNEL ═════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Workflow Funnel</h3>
            <p className="text-xs text-gray-400 mt-0.5">จำนวนโปรเจกต์ในแต่ละขั้นตอน · คลิกเพื่อกรองตาราง</p>
          </div>
          {/* Bottleneck badge */}
          {!loading && stats.avgStageDays[stats.bottleneck] > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                            bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-700">
              <AlertTriangle size={13} />
              Bottleneck: {STAGE_CONFIG[stats.bottleneck].label}
              &nbsp;·&nbsp;avg {stats.avgStageDays[stats.bottleneck].toFixed(1)} วัน
            </div>
          )}
        </div>

        <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
          {STAGE_ORDER.map((stage, i) => {
            const cfg   = STAGE_CONFIG[stage]
            const count = loading ? 0 : stats.stageCounts[stage]
            const isActive = stageFilter === stage
            const convKey  = i > 0 ? `${STAGE_ORDER[i - 1]}->${stage}` : null
            const convRate = convKey ? stats.conversionRates[convKey] : null
            const isBottleneck = !loading && stage === stats.bottleneck && stats.avgStageDays[stage] > STAGE_TARGETS[stage]

            return (
              <div key={stage} className="flex items-center flex-1 min-w-0">
                {/* Conversion arrow */}
                {i > 0 && (
                  <div className="flex flex-col items-center shrink-0 px-1">
                    <ChevronRight size={16} className="text-gray-300" />
                    {convRate !== null && (
                      <span className="text-[10px] text-gray-400 font-medium mt-0.5">
                        {convRate.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => { setStageFilter(isActive ? '' : stage); setPage(1) }}
                  className={`flex-1 rounded-xl p-3.5 text-center border-2 transition-all duration-200
                               hover:shadow-sm hover:-translate-y-0.5
                               ${isActive ? `${cfg.light} ${cfg.border} shadow` : 'border-gray-100 bg-gray-50 hover:border-gray-200'}
                               ${isBottleneck ? 'ring-2 ring-orange-300 ring-offset-1' : ''}`}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 text-white text-sm font-bold"
                       style={{ background: cfg.color }}>
                    {loading ? '—' : count}
                  </div>
                  <p className="text-[11px] font-semibold text-gray-700 leading-tight">{cfg.label}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    avg {loading ? '—' : `${stats.avgStageDays[stage].toFixed(1)}d`}
                  </p>
                  {isBottleneck && (
                    <span className="mt-1 inline-block text-[10px] text-orange-600 font-semibold">⚠ Bottleneck</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ══════ CHARTS ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Stage avg time bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Average Time per Stage</h3>
              <p className="text-xs text-gray-400 mt-0.5">เส้นประ = เป้าหมาย · แดง = เกินเป้า</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          {stageBarData.some(d => d.avg > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stageBarData} layout="vertical"
                        margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }}
                       axisLine={false} tickLine={false}
                       label={{ value: 'วัน', position: 'insideRight', offset: 10, fontSize: 10, fill: '#94A3B8' }} />
                <YAxis type="category" dataKey="stage" width={90}
                       tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="avg" name="เฉลี่ย" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {stageBarData.map((d, i) => (
                    <Cell key={i} fill={d.over ? '#EF4444' : d.color} />
                  ))}
                  <LabelList dataKey="avg" position="right"
                    formatter={(v: number) => `${v.toFixed(1)}d`}
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

        {/* Monthly completion trend */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Monthly Completion Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">โปรเจกต์ที่เสร็จสมบูรณ์ต่อเดือน</p>
            </div>
            <BarChart2 size={16} className="text-gray-300" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <ReferenceLine y={3} stroke="#E5E7EB" strokeDasharray="4 4"
                label={{ value: 'Target', position: 'right', fontSize: 10, fill: '#9CA3AF' }} />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#059669"
                    strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ══════ FILTER BAR ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              className="form-input pl-9 py-2 w-full text-sm"
              placeholder="ค้นหาเลขที่เอกสาร / ลูกค้า"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Stage */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">ขั้นตอน</label>
            <select className="form-input py-2 text-sm" value={stageFilter}
              onChange={e => { setStageFilter(e.target.value as Stage | ''); setPage(1) }}>
              <option value="">ทั้งหมด</option>
              {STAGE_ORDER.map(s => (
                <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          {/* Salesperson */}
          {isManager && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1">พนักงานขาย</label>
              <select className="form-input py-2 text-sm" value={salesFilter}
                onChange={e => setSalesFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {salesUsers.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
          )}

          {/* Customer */}
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">ลูกค้า</label>
            <select className="form-input py-2 text-sm" value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {uniqueCustomers.slice(0, 50).map(c => <option key={c} value={c}>{c}</option>)}
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

          {/* Count badge */}
          <div className="self-end">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full
                             bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
              {sortedChains.length.toLocaleString()} โปรเจกต์
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} title="รีเฟรช"
              className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50
                         flex items-center justify-center text-gray-500 hover:text-gray-800
                         transition-all duration-150 shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportExcel} disabled={exporting || sortedChains.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl
                         bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                         disabled:opacity-50 transition-all duration-150 shadow-sm">
              <Download size={15} />
              {exporting ? 'กำลัง Export…' : 'Export Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* ══════ DATA TABLE ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            แสดง <strong>{pagedChains.length}</strong> / {sortedChains.length.toLocaleString()} โปรเจกต์
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
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {[20, 110, 100, 90, 140, 160, 110, 140, 90, 60, 70, 60].map((w, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pagedChains.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Route size={48} strokeWidth={1} />
                      <p className="text-base font-semibold text-gray-500">ไม่พบข้อมูล Workflow</p>
                      <p className="text-sm text-gray-400">ลองเปลี่ยนคำค้นหาหรือตัวกรองแล้วลองใหม่</p>
                      <button onClick={load} className="btn-outline mt-1 text-sm px-4 py-1.5">รีเฟรชข้อมูล</button>
                    </div>
                  </td>
                </tr>
              ) : pagedChains.flatMap((chain, idx) => {
                const isExpanded = expandedIds.has(chain.id)
                const cfg        = STAGE_CONFIG[chain.currentStage]
                const isDelayed  = chain.totalDays > TARGET_TOTAL * 0.7 && chain.currentStage !== 'complete'
                const isCritical = chain.totalDays > TARGET_TOTAL && chain.currentStage !== 'complete'
                const statusLabel = chain.currentStage === 'complete' ? 'On Track'
                  : isCritical ? 'Critical'
                  : isDelayed ? 'Delayed'
                  : 'On Track'
                const statusColor = chain.currentStage === 'complete' ? 'bg-emerald-100 text-emerald-700'
                  : isCritical ? 'bg-red-100 text-red-700 font-bold'
                  : isDelayed  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'

                const daysColor = chain.currentStage === 'complete'
                  ? 'text-emerald-600 font-semibold'
                  : isCritical ? 'text-red-600 font-bold'
                  : isDelayed  ? 'text-amber-600 font-semibold'
                  : 'text-gray-700'

                return [
                  <tr key={chain.id}
                      className={`border-b border-gray-50 transition-colors duration-100
                                  ${isCritical ? 'bg-red-50/30 hover:bg-red-50/60'
                                    : isDelayed ? 'bg-amber-50/20 hover:bg-amber-50/40'
                                    : `hover:bg-blue-50/30 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}`}>
                    {/* Expand toggle */}
                    <td className="px-3 py-3 w-8">
                      <button onClick={() => toggleExpand(chain.id)}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <ExpandIcon size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </td>

                    {/* QUO No */}
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {chain.quoNo}
                    </td>

                    {/* WO No */}
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      {chain.woNo
                        ? <span className="text-purple-600 font-semibold">{chain.woNo}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* HO No */}
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      {chain.hoNo
                        ? <span className="text-emerald-600 font-semibold">{chain.hoNo}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap max-w-[160px] truncate">
                      {chain.customer}
                    </td>

                    {/* Project */}
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate">
                      {chain.project}
                    </td>

                    {/* Salesperson */}
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {chain.salesName}
                    </td>

                    {/* Current Stage with dots */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StageDots current={chain.currentStage} />
                        <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </div>
                    </td>

                    {/* Start Date */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(chain.startDate)}
                    </td>

                    {/* Total Days */}
                    <td className={`px-4 py-3 text-sm tabular-nums text-right whitespace-nowrap ${daysColor}`}>
                      {chain.totalDays}d
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button onClick={() => router.push(`/quotations/${chain.quoId}`)} title="ดูใบเสนอราคา"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50
                                   transition-all duration-150">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>,

                  ...(isExpanded ? [
                    <RowTimeline key={`${chain.id}-timeline`} chain={chain} />
                  ] : []),
                ]
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
