'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileText, FileSpreadsheet, RefreshCw, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ReportsAPI, UsersAPI } from '@/lib/api'
import type { SalesPerformanceReport, SalesPerformanceRow, SalesPerformanceStatus, User } from '@/types'
import DateInput from '@/components/DateInput'
import MultiSelectDropdown from '@/components/MultiSelectDropdown'
import { hasRole } from '@/lib/roleAliases'

const PAGE_SIZE = 50

function getCurrentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`,
    to: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`,
  }
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))
}

function fmtDate(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('th-TH')
}

function sourceBadge(source: SalesPerformanceRow['source']) {
  if (source === 'PO') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (source === 'QT') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

export default function SalesPerformanceReportPage() {
  const range = useMemo(() => getCurrentMonthRange(), [])

  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [salesIds, setSalesIds] = useState<string[]>([])
  const [customer, setCustomer] = useState('')
  const [status, setStatus] = useState<SalesPerformanceStatus>('all')
  const [groupBySales, setGroupBySales] = useState(false)

  const [page, setPage] = useState(1)
  const [report, setReport] = useState<SalesPerformanceReport | null>(null)
  const [salesUsers, setSalesUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const salesOptions = useMemo(
    () => salesUsers.map(u => ({ value: u.id, label: u.fullName })),
    [salesUsers]
  )

  const buildParams = useCallback((overrides?: Record<string, string>) => {
    const base: Record<string, string> = {
      from,
      to,
      status,
      page: String(page),
      limit: String(groupBySales ? 5000 : PAGE_SIZE),
    }
    if (salesIds.length > 0) base.salesIds = salesIds.join(',')
    if (customer.trim()) base.customer = customer.trim()
    if (overrides) Object.assign(base, overrides)
    return base
  }, [from, to, status, page, salesIds, customer, groupBySales])

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const data = await ReportsAPI.salesPerformance(buildParams())
      setReport(data)
    } catch {
      toast.error('Failed to load report data')
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
    loadReport()
  }, [loadReport])

  useEffect(() => {
    setPage(1)
  }, [from, to, status, customer, salesIds, groupBySales])

  const groupedRows = useMemo(() => {
    const rows = report?.rows || []
    const map: Record<string, { salesId: string; salesName: string; rows: SalesPerformanceRow[]; subtotal: number }> = {}
    for (const row of rows) {
      if (!map[row.salesId]) {
        map[row.salesId] = { salesId: row.salesId, salesName: row.salesName, rows: [], subtotal: 0 }
      }
      map[row.salesId].rows.push(row)
      map[row.salesId].subtotal += Number(row.recognizedAmount || 0)
    }
    return Object.values(map).sort((a, b) => b.subtotal - a.subtotal)
  }, [report?.rows])

  async function getExportRows() {
    const data = await ReportsAPI.salesPerformance(buildParams({ page: '1', limit: '5000' }))
    return data.rows
  }

  async function handleExportExcel() {
    try {
      setExporting(true)
      const rows = await getExportRows()
      const out = rows.map((r, i) => ({
        '#': i + 1,
        'Sales Person': r.salesName,
        'Quotation No.': r.quotationNo,
        'QT Date': fmtDate(r.qtDate),
        Customer: r.customerName,
        'QT Amount': Number(r.qtAmount || 0),
        'PO No.': r.poNo || '',
        'PO Amount': Number(r.poAmount || 0),
        'Recognized Amount': Number(r.recognizedAmount || 0),
        Source: r.source,
      }))
      const ws = XLSX.utils.json_to_sheet(out)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Performance')
      XLSX.writeFile(wb, `sales-performance-${from}-${to}.xlsx`)
      toast.success('Export Excel completed')
    } catch {
      toast.error('Export Excel failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPdf() {
    try {
      setExporting(true)
      const rows = await getExportRows()
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      doc.setFontSize(14)
      doc.text('Sales Performance Report', 40, 34)
      doc.setFontSize(10)
      doc.text(`Date: ${from} - ${to}`, 40, 52)

      autoTable(doc, {
        startY: 64,
        head: [[
          '#', 'Sales', 'QT No.', 'QT Date', 'Customer', 'QT Amount', 'PO No.', 'PO Amount', 'Recognized', 'Source',
        ]],
        body: rows.map((r, i) => [
          i + 1,
          r.salesName,
          r.quotationNo,
          fmtDate(r.qtDate),
          r.customerName,
          fmtMoney(r.qtAmount),
          r.poNo || '-',
          fmtMoney(r.poAmount),
          fmtMoney(r.recognizedAmount),
          r.source,
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [17, 94, 89] },
      })

      doc.save(`sales-performance-${from}-${to}.pdf`)
      toast.success('Export PDF completed')
    } catch {
      toast.error('Export PDF failed')
    } finally {
      setExporting(false)
    }
  }

  const summary = report?.summary
  const pagination = report?.pagination

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Sales Performance Report</h2>
          <p className="page-sub">Recognized Amount based on PO/QT latest active revision</p>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter size={16} />
          Filter Panel
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
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
            <input
              list="sales-report-customers"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="form-input"
              placeholder="Search customer"
            />
            <datalist id="sales-report-customers">
              {(report?.customers || []).map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="field-label">Status</label>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value as SalesPerformanceStatus)}>
              <option value="all">All</option>
              <option value="has_po">Has PO</option>
              <option value="qt_only">QT Only</option>
              <option value="no_document">No Document</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={loadReport} className="btn-main inline-flex items-center gap-2" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button type="button" onClick={handleExportExcel} className="btn-secondary inline-flex items-center gap-2" disabled={loading || exporting}>
            <FileSpreadsheet size={16} />
            Export Excel
          </button>
          <button type="button" onClick={handleExportPdf} className="btn-secondary inline-flex items-center gap-2" disabled={loading || exporting}>
            <FileText size={16} />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => setGroupBySales(v => !v)}
            className={`btn-secondary inline-flex items-center gap-2 ${groupBySales ? 'bg-green-50 border-green-300 text-green-700' : ''}`}
          >
            <Download size={16} />
            {groupBySales ? 'Grouping: ON' : 'Grouping: OFF'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="card p-4 border-l-4 border-emerald-500">
          <p className="text-xs text-gray-500">Total Recognized Amount</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">THB {fmtMoney(summary?.totalRecognizedAmount || 0)}</p>
        </div>
        <div className="card p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">Total QT Count</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{summary?.totalQtCount || 0}</p>
        </div>
        <div className="card p-4 border-l-4 border-amber-500">
          <p className="text-xs text-gray-500">Conversion Rate (QT with PO)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{(summary?.conversionRate || 0).toFixed(1)}%</p>
        </div>
        <div className="card p-4 border-l-4 border-purple-500">
          <p className="text-xs text-gray-500">Top Sales (Top 5)</p>
          <div className="mt-1 space-y-1 text-sm">
            {(summary?.topSales || []).slice(0, 5).map((s, idx) => (
              <div key={s.salesId} className="flex justify-between gap-2">
                <span className="truncate">{idx + 1}. {s.salesName}</span>
                <span className="tabular-nums font-semibold">THB {fmtMoney(s.recognizedAmount)}</span>
              </div>
            ))}
            {(summary?.topSales || []).length === 0 && <p className="text-gray-400">-</p>}
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Sales Performance Table</p>
          {!groupBySales && (
            <p className="text-xs text-gray-500">
              {pagination?.total || 0} rows, page {pagination?.page || 1} / {pagination?.totalPages || 1}
            </p>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading report...</div>
        ) : !report || report.rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No data found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1200px]">
              <thead>
                <tr>
                  <th>Sales Person</th>
                  <th>Quotation No.</th>
                  <th>QT Date</th>
                  <th>Customer</th>
                  <th className="text-right">QT Amount</th>
                  <th>PO No.</th>
                  <th className="text-right">PO Amount</th>
                  <th className="text-right">Recognized Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {groupBySales ? (
                  groupedRows.map(group => (
                    <>
                      <tr key={`g-${group.salesId}`} className="bg-green-50/60">
                        <td colSpan={9} className="font-semibold text-green-900">
                          {group.salesName} ({group.rows.length} QT) - Subtotal: THB {fmtMoney(group.subtotal)}
                        </td>
                      </tr>
                      {group.rows.map(row => (
                        <tr key={row.quotationId}>
                          <td>{row.salesName}</td>
                          <td>
                            <Link href={`/quotations/${row.quotationId}`} className="text-blue-700 hover:underline font-medium">
                              {row.quotationNo}
                            </Link>
                          </td>
                          <td>{fmtDate(row.qtDate)}</td>
                          <td>{row.customerName}</td>
                          <td className="text-right tabular-nums">{fmtMoney(row.qtAmount)}</td>
                          <td>
                            {row.poWorkOrderId ? (
                              <Link href={`/workorders/${row.poWorkOrderId}`} className="text-blue-700 hover:underline">
                                {row.poNo || row.poRefName || '-'}
                              </Link>
                            ) : (row.poNo || row.poRefName || '-')}
                          </td>
                          <td className="text-right tabular-nums">{fmtMoney(row.poAmount)}</td>
                          <td className="text-right tabular-nums font-semibold">{fmtMoney(row.recognizedAmount)}</td>
                          <td>
                            <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${sourceBadge(row.source)}`}>
                              {row.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))
                ) : (
                  report.rows.map(row => (
                    <tr key={row.quotationId}>
                      <td>{row.salesName}</td>
                      <td>
                        <Link href={`/quotations/${row.quotationId}`} className="text-blue-700 hover:underline font-medium">
                          {row.quotationNo}
                        </Link>
                      </td>
                      <td>{fmtDate(row.qtDate)}</td>
                      <td>{row.customerName}</td>
                      <td className="text-right tabular-nums">{fmtMoney(row.qtAmount)}</td>
                      <td>
                        {row.poWorkOrderId ? (
                          <Link href={`/workorders/${row.poWorkOrderId}`} className="text-blue-700 hover:underline">
                            {row.poNo || row.poRefName || '-'}
                          </Link>
                        ) : (row.poNo || row.poRefName || '-')}
                      </td>
                      <td className="text-right tabular-nums">{fmtMoney(row.poAmount)}</td>
                      <td className="text-right tabular-nums font-semibold">{fmtMoney(row.recognizedAmount)}</td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${sourceBadge(row.source)}`}>
                          {row.source}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
                {groupBySales && (
                  <tr className="bg-gray-100 font-bold">
                    <td colSpan={7}>Grand Total</td>
                    <td className="text-right tabular-nums">{fmtMoney(summary?.totalRecognizedAmount || 0)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!groupBySales && (report?.pagination?.totalPages || 1) > 1 && (
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
