'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw, FileSpreadsheet, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ReportsAPI, UsersAPI } from '@/lib/api'
import type { User, WorkStatusAgingFilter, WorkStatusPoFilter, WorkStatusReport, WorkStatusRow } from '@/types'
import { hasRole } from '@/lib/roleAliases'
import DateInput from '@/components/DateInput'
import MultiSelectDropdown from '@/components/MultiSelectDropdown'

const PAGE_SIZE = 50

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultRange30Days() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from: isoDate(from), to: isoDate(to) }
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))
}

function fmtDate(iso?: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('th-TH')
}

function truncate50(v: string) {
  if (!v) return '-'
  return v.length > 50 ? `${v.slice(0, 50)}...` : v
}

function rowClass(row: WorkStatusRow) {
  if (row.poStatusKey === 'has') return 'bg-emerald-50/60'
  if (row.agingDays > 30) return 'bg-red-50'
  if (row.agingDays > 15) return 'bg-amber-50'
  return ''
}

function poBadge(poStatus: WorkStatusRow['poStatus']) {
  if (poStatus === 'Received') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (poStatus === 'Partial') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

const PO_PIE_COLORS = ['#16a34a', '#ef4444']

export default function WorkStatusReportPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const defaultRange = useMemo(() => defaultRange30Days(), [])

  const [from, setFrom] = useState(searchParams.get('from') || defaultRange.from)
  const [to, setTo] = useState(searchParams.get('to') || defaultRange.to)
  const [salesIds, setSalesIds] = useState<string[]>(() => {
    const raw = searchParams.get('salesIds') || ''
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
  })
  const [poStatus, setPoStatus] = useState<WorkStatusPoFilter>((searchParams.get('poStatus') as WorkStatusPoFilter) || 'all')
  const [customer, setCustomer] = useState(searchParams.get('customer') || '')
  const [agingRange, setAgingRange] = useState<WorkStatusAgingFilter>((searchParams.get('agingRange') as WorkStatusAgingFilter) || 'all')
  const [page, setPage] = useState(() => {
    const p = Number.parseInt(searchParams.get('page') || '1', 10)
    return Number.isFinite(p) && p > 0 ? p : 1
  })

  const [salesUsers, setSalesUsers] = useState<User[]>([])
  const [report, setReport] = useState<WorkStatusReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const salesOptions = useMemo(() => salesUsers.map(u => ({ value: u.id, label: u.fullName })), [salesUsers])

  const buildParams = useCallback((overrides?: Record<string, string>) => {
    const params: Record<string, string> = {
      from,
      to,
      poStatus,
      agingRange,
      page: String(page),
      limit: String(PAGE_SIZE),
    }
    if (salesIds.length > 0) params.salesIds = salesIds.join(',')
    if (customer.trim()) params.customer = customer.trim()
    if (overrides) Object.assign(params, overrides)
    return params
  }, [from, to, poStatus, agingRange, page, salesIds, customer])

  const syncUrl = useCallback(() => {
    const q = new URLSearchParams()
    q.set('from', from)
    q.set('to', to)
    q.set('poStatus', poStatus)
    q.set('agingRange', agingRange)
    if (salesIds.length > 0) q.set('salesIds', salesIds.join(','))
    if (customer.trim()) q.set('customer', customer.trim())
    if (page > 1) q.set('page', String(page))
    router.replace(`${pathname}?${q.toString()}`)
  }, [router, pathname, from, to, poStatus, agingRange, salesIds, customer, page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await ReportsAPI.workStatus(buildParams())
      setReport(data)
    } catch {
      toast.error('Failed to load work status report')
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => {
    UsersAPI.list({ active: 'true', forReport: 'true' })
      .then(users => setSalesUsers(users.filter(u => hasRole(u.role, ['sales', 'sale_mgr']))))
      .catch(() => setSalesUsers([]))
  }, [])

  useEffect(() => {
    syncUrl()
  }, [syncUrl])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [from, to, poStatus, salesIds, customer, agingRange])

  const pendingBySales = report?.charts.pendingBySales || []
  const pieData = report?.charts.poSplit || []
  const rows = report?.rows || []

  async function getExportRows() {
    const data = await ReportsAPI.workStatus(buildParams({ page: '1', limit: '5000' }))
    return data.rows
  }

  async function exportExcel() {
    try {
      setExporting(true)
      const data = await getExportRows()
      const sheetRows = data.map((r, i) => ({
        '#': i + 1,
        'Work No.': r.workNo,
        'Work Date': fmtDate(r.workDate),
        Customer: r.customerName,
        'Sales Person': r.salesName,
        'Project / Description': r.project,
        'QT No.': r.quotationNo,
        'QT Amount': Number(r.qtAmount || 0),
        'PO No.': r.poNo || '-',
        'PO Amount': Number(r.poAmount || 0),
        'PO Status': r.poStatus,
        'Aging (Days)': r.poStatusKey === 'pending' ? r.agingDays : 0,
        'Expected PO Date': r.expectedPoDate ? fmtDate(r.expectedPoDate) : '-',
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Work Status')
      XLSX.writeFile(wb, `work-status-${from}-${to}.xlsx`)
      toast.success('Export Excel completed')
    } catch {
      toast.error('Export Excel failed')
    } finally {
      setExporting(false)
    }
  }

  async function exportPdf() {
    try {
      setExporting(true)
      const data = await getExportRows()
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      doc.setFontSize(14)
      doc.text('Work Status Report', 40, 34)
      doc.setFontSize(10)
      doc.text(`Date Range: ${from} - ${to}`, 40, 52)

      autoTable(doc, {
        startY: 64,
        head: [[
          '#', 'Work No', 'Date', 'Customer', 'Sales', 'Project', 'QT No', 'QT Amount', 'PO No', 'PO Amount', 'PO Status', 'Aging',
        ]],
        body: data.map((r, i) => [
          i + 1,
          r.workNo,
          fmtDate(r.workDate),
          r.customerName,
          r.salesName,
          truncate50(r.project),
          r.quotationNo,
          fmtMoney(r.qtAmount),
          r.poNo || '-',
          fmtMoney(r.poAmount),
          r.poStatus,
          r.poStatusKey === 'pending' ? String(r.agingDays) : '-',
        ]),
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: { fillColor: [21, 128, 61] },
      })

      doc.save(`work-status-${from}-${to}.pdf`)
      toast.success('Export PDF completed')
    } catch {
      toast.error('Export PDF failed')
    } finally {
      setExporting(false)
    }
  }

  const summary = report?.summary

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Work Status Report</h2>
          <p className="page-sub">Framework: Next.js + Tailwind | Database: PostgreSQL via Prisma</p>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div>
            <label className="field-label">From</label>
            <DateInput value={from} onChange={setFrom} />
          </div>
          <div>
            <label className="field-label">To</label>
            <DateInput value={to} onChange={setTo} />
          </div>
          <div>
            <label className="field-label">Sales Person</label>
            <MultiSelectDropdown
              options={salesOptions}
              selected={salesIds}
              onChange={setSalesIds}
              placeholder="All"
            />
          </div>
          <div>
            <label className="field-label">Customer</label>
            <input className="form-input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="field-label">Aging Range</label>
            <select className="form-input" value={agingRange} onChange={(e) => setAgingRange(e.target.value as WorkStatusAgingFilter)}>
              <option value="all">All</option>
              <option value="0-7">0-7 days</option>
              <option value="8-15">8-15 days</option>
              <option value="16-30">16-30 days</option>
              <option value="30+">30+ days</option>
            </select>
          </div>
          <div>
            <label className="field-label">PO Status</label>
            <div className="grid grid-cols-1 gap-1.5 rounded-lg border p-2">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={poStatus === 'all'} onChange={() => setPoStatus('all')} />
                <span>All Works</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={poStatus === 'has'} onChange={() => setPoStatus('has')} />
                <span>Has PO</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-red-700 font-semibold">
                <input type="radio" checked={poStatus === 'pending'} onChange={() => setPoStatus('pending')} />
                <span>Pending PO</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={load} className="btn-main inline-flex items-center gap-2" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button type="button" onClick={exportExcel} className="btn-secondary inline-flex items-center gap-2" disabled={loading || exporting}>
            <FileSpreadsheet size={16} />
            Export Excel
          </button>
          <button type="button" onClick={exportPdf} className="btn-secondary inline-flex items-center gap-2" disabled={loading || exporting}>
            <FileText size={16} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="card p-4 border-l-4 border-slate-500">
          <p className="text-xs text-gray-500">Total Works</p>
          <p className="text-2xl font-bold mt-1">{summary?.totalWorks || 0}</p>
        </div>
        <div className="card p-4 border-l-4 border-emerald-500">
          <p className="text-xs text-gray-500">Works with PO</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{summary?.worksWithPo || 0}</p>
          <p className="text-xs text-gray-500 mt-1">{(summary?.worksWithPoPct || 0).toFixed(1)}%</p>
        </div>
        <div className="card p-4 border-l-4 border-red-500 bg-red-50/40">
          <p className="text-xs text-gray-500">Works Pending PO</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{summary?.worksPendingPo || 0}</p>
          <p className="text-xs text-gray-500 mt-1">{(summary?.worksPendingPoPct || 0).toFixed(1)}%</p>
        </div>
        <div className="card p-4 border-l-4 border-amber-500">
          <p className="text-xs text-gray-500">Total QT Amount at Risk</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{fmtMoney(summary?.totalQtAmountAtRisk || 0)}</p>
        </div>
        <div className="card p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">Average Aging (Pending)</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{(summary?.averagePendingAging || 0).toFixed(1)} days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4 h-[320px]">
          <p className="text-sm font-semibold mb-2">Pending PO by Sales</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pendingBySales} margin={{ left: 0, right: 12, top: 12, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="salesName" tick={{ fontSize: 11 }} interval={0} angle={-15} height={60} textAnchor="end" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4 h-[320px]">
          <p className="text-sm font-semibold mb-2">PO Split</p>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={100}>
                {pieData.map((entry, index) => (
                  <Cell key={entry.key} fill={PO_PIE_COLORS[index % PO_PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 text-xs text-gray-600">
          {report?.pagination?.total || 0} rows | page {report?.pagination?.page || 1} / {report?.pagination?.totalPages || 1}
        </div>
        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading report...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No data found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1600px]">
              <thead>
                <tr>
                  <th>Work No.</th>
                  <th>Work Date</th>
                  <th>Customer</th>
                  <th>Sales Person</th>
                  <th>Project / Description</th>
                  <th>QT No.</th>
                  <th className="text-right">QT Amount</th>
                  <th>PO No.</th>
                  <th className="text-right">PO Amount</th>
                  <th>PO Status</th>
                  <th className="text-right">Aging (Days)</th>
                  <th>Expected PO Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={rowClass(row)}>
                    <td>
                      <Link href={`/workorders/${row.id}`} className="text-blue-700 hover:underline font-medium">
                        {row.workNo}
                      </Link>
                    </td>
                    <td>{fmtDate(row.workDate)}</td>
                    <td>{row.customerName}</td>
                    <td>{row.salesName}</td>
                    <td title={row.project}>{truncate50(row.project)}</td>
                    <td>
                      {row.quotationId ? (
                        <Link href={`/quotations/${row.quotationId}`} className="text-blue-700 hover:underline">
                          {row.quotationNo}
                        </Link>
                      ) : row.quotationNo}
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(row.qtAmount)}</td>
                    <td>{row.poNo || '-'}</td>
                    <td className="text-right tabular-nums">{fmtMoney(row.poAmount)}</td>
                    <td>
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${poBadge(row.poStatus)}`}>
                        {row.poStatus}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{row.poStatusKey === 'pending' ? row.agingDays : '-'}</td>
                    <td>{fmtDate(row.expectedPoDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(report?.pagination?.totalPages || 1) > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} / {report?.pagination?.totalPages || 1}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPage(p => Math.min(report?.pagination?.totalPages || 1, p + 1))}
            disabled={page >= (report?.pagination?.totalPages || 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
