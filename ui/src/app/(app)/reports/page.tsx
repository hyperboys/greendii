'use client'

import { useEffect, useMemo, useState } from 'react'
import { ReportsAPI } from '@/lib/api'
import type { ReportOverview, ReportSales, ReportApprovalPerf } from '@/types'
import { ROLE_LABELS } from '@/types'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { normalizeUserRole } from '@/lib/roleAliases'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function cleanCustomerName(name: string) {
  return String(name || '')
    .replace(/^[:\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function ReportsPage() {
  const [overview, setOverview] = useState<ReportOverview | null>(null)
  const [sales, setSales] = useState<ReportSales[]>([])
  const [perf, setPerf] = useState<ReportApprovalPerf[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      ReportsAPI.overview(),
      ReportsAPI.sales(),
      ReportsAPI.approvalPerformance(),
    ]).then(([ov, s, p]) => {
      setOverview(ov)
      setSales(s)
      setPerf(p)
    }).catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  const salesRows = useMemo(() => {
    return sales.map((s) => ({ ...s, customer: cleanCustomerName(s.customer) }))
  }, [sales])

  const topSalesTotal = salesRows[0]?.total || 0
  const salesGrandTotal = salesRows.reduce((sum, row) => sum + Number(row.total || 0), 0)

  const perfRows = useMemo(() => {
    return perf.map((p) => {
      const normalizedRole = normalizeUserRole(p.role)
      return {
        ...p,
        roleLabel: ROLE_LABELS[normalizedRole as keyof typeof ROLE_LABELS] || p.role,
      }
    })
  }, [perf])

  const totalApproved = perfRows.reduce((sum, row) => sum + Number(row.approve || 0), 0)
  const totalRejected = perfRows.reduce((sum, row) => sum + Number(row.reject || 0), 0)

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-sub">Operational Overview</p>
        </div>
      </div>

      {/* Report shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/reports/quotations" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-green-300 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📋</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-green-700">Quotation Summary Report</p>
              <p className="text-xs text-gray-500">Win Rate, Pipeline, Top Customers, Trend</p>
            </div>
          </div>
        </Link>
        <Link href="/reports/workorders" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-blue-300 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔧</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-blue-700">Work Order Report</p>
              <p className="text-xs text-gray-500">Progress, Deadlines, On-Time Rate, Trend</p>
            </div>
          </div>
        </Link>
        <Link href="/reports/workorders/no-po" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-red-300 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📎</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-red-700">WO ที่ยังไม่มี PO</p>
              <p className="text-xs text-gray-500">แยกตาม Sales พร้อม Export Excel</p>
            </div>
          </div>
        </Link>
        <Link href="/reports/workorders/po-overview" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-rose-300 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-rose-700">WO ภาพรวม PO</p>
              <p className="text-xs text-gray-500">Filter + Highlight + Export Excel/PDF</p>
            </div>
          </div>
        </Link>
        <Link href="/reports/pr" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-purple-300 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛒</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-purple-700">Purchase Request Report</p>
              <p className="text-xs text-gray-500">Approvals, Spending, PR Types, Trend</p>
            </div>
          </div>
        </Link>
        <Link href="/reports/sales" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-blue-400 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-blue-700">Sales Performance</p>
              <p className="text-xs text-gray-500">Rankings, Win Rate, Revenue Trend, Leaderboard</p>
            </div>
          </div>
        </Link>
        <Link href="/reports/workflow" className="card p-5 hover:shadow-md transition-shadow border border-transparent hover:border-indigo-400 group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔗</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-indigo-700">Workflow Tracking</p>
              <p className="text-xs text-gray-500">End-to-End Lifecycle, Funnel, Bottlenecks, Timeline</p>
            </div>
          </div>
        </Link>
      </div>

      {/* KPI row */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-5">
            <p className="text-sm text-gray-500">Total Quotations</p>
            <p className="stat-value text-green-dark">{overview.quotations.total}</p>
            <p className="stat-label">Approved {overview.quotations.approved} items</p>
            <p className="text-xs text-gray-400 mt-1">฿{fmtMoney(overview.quotations.grandTotal)}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">Total Work Orders</p>
            <p className="stat-value text-blue-600">{overview.workOrders.total}</p>
            <p className="stat-label">Pending {overview.workOrders.pending} items</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">Handed Over Jobs</p>
            <p className="stat-value text-orange-500">{overview.handOverJobs.total}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">Purchase Requests</p>
            <p className="stat-value text-purple-600">{overview.purchaseRequests.total}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by customer */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Sales by Customer</h3>
            <span className="text-xs text-gray-500">{salesRows.length} ลูกค้า</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5">
              <p className="text-[11px] text-emerald-700/80">ยอดรวมทั้งหมด</p>
              <p className="text-sm font-semibold text-emerald-700">฿{fmtMoney(salesGrandTotal)}</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5">
              <p className="text-[11px] text-blue-700/80">ลูกค้าสูงสุด (Top 1)</p>
              <p className="text-sm font-semibold text-blue-700">฿{fmtMoney(topSalesTotal)}</p>
            </div>
          </div>
          {salesRows.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No data available</p>
          ) : (
            <div className="max-h-[460px] overflow-auto rounded-xl border border-gray-100">
              <table className="data-table">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>Customer</th>
                    <th className="text-right">Count</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRows.map((s, i) => (
                    <tr key={`${s.customer}-${i}`} className="odd:bg-white even:bg-gray-50/50 hover:bg-green-50/40">
                      <td className="text-center text-xs text-gray-500">{i + 1}</td>
                      <td className="max-w-[260px] truncate" title={s.customer}>{s.customer}</td>
                      <td className="text-right tabular-nums">{s.count}</td>
                      <td className="text-right font-medium tabular-nums">฿{fmtMoney(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Approval performance */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Approval Performance</h3>
            <span className="text-xs text-gray-500">{perfRows.length} คน</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-lg bg-green-50 border border-green-100 p-2.5">
              <p className="text-[11px] text-green-700/80">Approved รวม</p>
              <p className="text-sm font-semibold text-green-700">{totalApproved}</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-2.5">
              <p className="text-[11px] text-red-700/80">Rejected รวม</p>
              <p className="text-sm font-semibold text-red-700">{totalRejected}</p>
            </div>
          </div>
          {perfRows.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No data available</p>
          ) : (
            <div className="max-h-[460px] overflow-auto rounded-xl border border-gray-100">
              <table className="data-table">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th className="text-right text-green-dark">Approved</th>
                    <th className="text-right text-red-500">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {perfRows.map((p, i) => (
                    <tr key={p.id} className="odd:bg-white even:bg-gray-50/50 hover:bg-blue-50/40">
                      <td className="text-center text-xs text-gray-500">{i + 1}</td>
                      <td>{p.name}</td>
                      <td className="text-xs text-gray-500">{p.roleLabel}</td>
                      <td className="text-right font-medium text-green-dark tabular-nums">{p.approve}</td>
                      <td className="text-right font-medium text-red-500 tabular-nums">{p.reject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
