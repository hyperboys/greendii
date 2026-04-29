'use client'

import { useEffect, useState } from 'react'
import { ReportsAPI } from '@/lib/api'
import type { ReportOverview, ReportSales, ReportApprovalPerf } from '@/types'
import { ROLE_LABELS } from '@/types'
import toast from 'react-hot-toast'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n)
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
          <h2 className="page-title">รายงาน</h2>
          <p className="page-sub">ภาพรวมการดำเนินงาน</p>
        </div>
      </div>

      {/* KPI row */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-5">
            <p className="text-sm text-gray-500">ใบเสนอราคาทั้งหมด</p>
            <p className="stat-value text-green-dark">{overview.quotations.total}</p>
            <p className="stat-label">อนุมัติ {overview.quotations.approved} รายการ</p>
            <p className="text-xs text-gray-400 mt-1">฿{fmtMoney(overview.quotations.grandTotal)}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">ใบสั่งงานทั้งหมด</p>
            <p className="stat-value text-blue-600">{overview.workOrders.total}</p>
            <p className="stat-label">รออนุมัติ {overview.workOrders.pending} รายการ</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">ส่งมอบงาน</p>
            <p className="stat-value text-orange-500">{overview.handOverJobs.total}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">ใบขอซื้อ</p>
            <p className="stat-value text-purple-600">{overview.purchaseRequests.total}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by customer */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">ยอดขายตามลูกค้า</h3>
          {sales.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">ไม่มีข้อมูล</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>ลูกค้า</th><th className="text-right">จำนวน</th><th className="text-right">ยอดรวม</th></tr>
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
          <h3 className="font-semibold text-gray-800 mb-4">ประสิทธิภาพการอนุมัติ</h3>
          {perf.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">ไม่มีข้อมูล</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>ชื่อ</th><th>ตำแหน่ง</th><th className="text-right text-green-dark">อนุมัติ</th><th className="text-right text-red-500">ปฏิเสธ</th></tr>
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
