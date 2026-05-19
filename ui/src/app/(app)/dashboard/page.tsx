'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReportsAPI, ApprovalsAPI } from '@/lib/api'
import type { ReportOverview, PendingApprovals } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { FileText, ClipboardList, Handshake, ShoppingCart, CheckSquare } from 'lucide-react'
import toast from 'react-hot-toast'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { style: 'decimal', maximumFractionDigits: 0 }).format(n)
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [overview, setOverview] = useState<ReportOverview | null>(null)
  const [pending, setPending] = useState<PendingApprovals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      ReportsAPI.overview().catch(() => null),
      ApprovalsAPI.pending().catch(() => null),
    ]).then(([ov, pend]) => {
      setOverview(ov)
      setPending(pend)
      setLoading(false)
    })
  }, [])

  const pendingCount =
    (pending?.quotations.length ?? 0) +
    (pending?.workOrders.length ?? 0) +
    (pending?.prs.length ?? 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        กำลังโหลด…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-sub">สวัสดี, {user?.fullName}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card" onClick={() => router.push('/quotations')}>
          <div className="flex items-center gap-2 text-gray-500">
            <FileText size={18} />
            <span className="text-sm font-medium">ใบเสนอราคา (QO)</span>
          </div>
          <div className="stat-value text-green-dark">{overview?.quotations.total ?? '-'}</div>
          <div className="stat-label">
            อนุมัติแล้ว {overview?.quotations.approved ?? 0} รายการ
          </div>
          <div className="text-xs text-gray-400 mt-1">
            ฿{fmtMoney(overview?.quotations.grandTotal ?? 0)}
          </div>
        </div>

        <div className="stat-card" onClick={() => router.push('/workorders')}>
          <div className="flex items-center gap-2 text-gray-500">
            <ClipboardList size={18} />
            <span className="text-sm font-medium">ใบสั่งงาน (WO)</span>
          </div>
          <div className="stat-value text-blue-600">{overview?.workOrders.total ?? '-'}</div>
          <div className="stat-label">
            อนุมัติแล้ว {overview?.workOrders.approved ?? 0} รายการ
          </div>
        </div>

        <div className="stat-card" onClick={() => router.push('/handovers')}>
          <div className="flex items-center gap-2 text-gray-500">
            <Handshake size={18} />
            <span className="text-sm font-medium">ส่งมอบงาน (HO)</span>
          </div>
          <div className="stat-value text-orange-500">{overview?.handOverJobs.total ?? '-'}</div>
          <div className="stat-label">รายการทั้งหมด</div>
        </div>

        <div className="stat-card" onClick={() => router.push('/pr')}>
          <div className="flex items-center gap-2 text-gray-500">
            <ShoppingCart size={18} />
            <span className="text-sm font-medium">ใบขอซื้อ (PR)</span>
          </div>
          <div className="stat-value text-purple-600">{overview?.purchaseRequests.total ?? '-'}</div>
          <div className="stat-label">รายการทั้งหมด</div>
        </div>
      </div>

      {/* Pending approvals */}
      {pendingCount > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare size={18} className="text-orange-500" />
            <h3 className="font-semibold text-gray-800">รออนุมัติ ({pendingCount} รายการ)</h3>
          </div>
          <div className="space-y-2">
            {pending?.quotations.map(q => (
              <div
                key={q.id}
                className="flex items-center justify-between p-3 rounded-lg bg-orange-50 cursor-pointer hover:bg-orange-100 transition-colors"
                onClick={() => router.push(`/quotations/${q.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{q.quoNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{q.customerName}</span>
                </div>
                <span className="badge badge-pending">ใบเสนอราคา</span>
              </div>
            ))}
            {pending?.workOrders.map(w => (
              <div
                key={w.id}
                className="flex items-center justify-between p-3 rounded-lg bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => router.push(`/workorders/${w.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{w.woNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{w.customerName}</span>
                </div>
                <span className="badge badge-pending">ใบสั่งงาน</span>
              </div>
            ))}
            {pending?.prs.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors"
                onClick={() => router.push(`/pr/${p.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{p.prNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.customer}</span>
                </div>
                <span className="badge badge-pending">ใบขอซื้อ</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {overview?.recentLogs && overview.recentLogs.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">กิจกรรมล่าสุด</h3>
          <div className="space-y-2">
            {overview.recentLogs.slice(0, 8).map(log => (
              <div key={log.id} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full shrink-0 ${log.action === 'approve' ? 'bg-green-main' : 'bg-red-500'}`} />
                <span className="text-gray-600 flex-1">
                  <span className="font-medium">{log.approver?.fullName ?? log.approverId}</span>
                  {' '}{log.action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}{' '}
                  <span className="text-gray-400">{log.docType}</span>
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(log.actedAt).toLocaleDateString('th-TH')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
