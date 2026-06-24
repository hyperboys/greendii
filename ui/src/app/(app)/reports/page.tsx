'use client'

import { useEffect, useState } from 'react'
import { ReportsAPI } from '@/lib/api'
import type { ReportOverview, ReportSales, ReportApprovalPerf } from '@/types'
import { ROLE_LABELS } from '@/types'
import toast from 'react-hot-toast'
import Link from 'next/link'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
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
          <h3 className="font-semibold text-gray-800 mb-4">Sales by Customer</h3>
          {sales.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No data available</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Customer</th><th className="text-right">Count</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={i}>
                    <td className="max-w-[180px] truncate">{s.customer}</td>
                    <td className="text-right">{s.count}</td>
                    <td className="text-right font-medium">฿{fmtMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Approval performance */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Approval Performance</h3>
          {perf.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No data available</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Role</th><th className="text-right text-green-dark">Approved</th><th className="text-right text-red-500">Rejected</th></tr>
              </thead>
              <tbody>
                {perf.map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="text-xs text-gray-500">{ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role}</td>
                    <td className="text-right font-medium text-green-dark">{p.approve}</td>
                    <td className="text-right font-medium text-red-500">{p.reject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
