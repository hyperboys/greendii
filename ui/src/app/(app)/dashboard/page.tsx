'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReportsAPI, ApprovalsAPI } from '@/lib/api'
import type { ReportOverview, PendingApprovals } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { hasRole } from '@/lib/roleAliases'
import { FileText, ClipboardList, Handshake, ShoppingCart, CheckSquare } from 'lucide-react'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { fetchSettings, menuAccessConfig } = useSettingsStore()
  const router = useRouter()
  const [overview, setOverview] = useState<ReportOverview | null>(null)
  const [pending, setPending] = useState<PendingApprovals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSettings()
    Promise.all([
      ReportsAPI.overview().catch(() => null),
      ApprovalsAPI.pending().catch(() => null),
    ]).then(([ov, pend]) => {
      setOverview(ov)
      setPending(pend)
      setLoading(false)
    })
  }, [])

  const canSeeMenu = (menuKey: string) => {
    if (!user) return false
    const roles = menuAccessConfig[menuKey]
    return !roles || hasRole(user.role, roles)
  }

  const canViewQuotations = canSeeMenu('quotations')
  const canViewWorkOrders = canSeeMenu('workorders')
  const canViewHandovers = canSeeMenu('handovers')
  const canViewPrs = canSeeMenu('pr')
  const canViewApprovals = canSeeMenu('approvals')
  const canViewRecentLogs = canSeeMenu('reports') || hasRole(user?.role || '', ['admin', 'director', 'admin_mgr'])

  const visiblePendingQuotations = canViewQuotations ? (pending?.quotations ?? []) : []
  const visiblePendingWorkOrders = canViewWorkOrders ? (pending?.workOrders ?? []) : []
  const visiblePendingPrs = canViewPrs ? (pending?.prs ?? []) : []
  const visiblePendingHandovers = canViewHandovers ? (pending?.handovers ?? []) : []

  const pendingCount =
    visiblePendingQuotations.length +
    visiblePendingWorkOrders.length +
    visiblePendingPrs.length +
    visiblePendingHandovers.length

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
        {canViewQuotations && (
        <div className="stat-card border-l-4 border-green-main" onClick={() => router.push('/quotations')}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-pale rounded-lg shrink-0">
              <FileText size={18} className="text-green-dark" />
            </div>
            <span className="text-sm font-medium text-gray-600">Quotation</span>
          </div>
          <div className="stat-value text-green-dark">{overview?.quotations.total ?? '-'}</div>
          <div className="stat-label">
            อนุมัติแล้ว {overview?.quotations.approved ?? 0} รายการ
          </div>
          <div className="text-xs text-gray-400 mt-1">
            ฿{fmtMoney(overview?.quotations.grandTotal ?? 0)}
          </div>
        </div>
        )}

        {canViewWorkOrders && (
        <div className="stat-card border-l-4 border-blue-500" onClick={() => router.push('/workorders')}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <ClipboardList size={18} className="text-blue-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Work Order</span>
          </div>
          <div className="stat-value text-blue-600">{overview?.workOrders.total ?? '-'}</div>
          <div className="stat-label">
            อนุมัติแล้ว {overview?.workOrders.approved ?? 0} รายการ
          </div>
        </div>
        )}

        {canViewHandovers && (
        <div className="stat-card border-l-4 border-orange-400" onClick={() => router.push('/handovers')}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg shrink-0">
              <Handshake size={18} className="text-orange-500" />
            </div>
            <span className="text-sm font-medium text-gray-600">Handovers</span>
          </div>
          <div className="stat-value text-orange-500">{overview?.handOverJobs.total ?? '-'}</div>
          <div className="stat-label">รายการทั้งหมด</div>
        </div>
        )}

        {canViewPrs && (
        <div className="stat-card border-l-4 border-purple-500" onClick={() => router.push('/pr')}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg shrink-0">
              <ShoppingCart size={18} className="text-purple-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Purchase Requests</span>
          </div>
          <div className="stat-value text-purple-600">{overview?.purchaseRequests.total ?? '-'}</div>
          <div className="stat-label">รายการทั้งหมด</div>
        </div>
        )}
      </div>

      {/* Pending approvals */}
      {canViewApprovals && pendingCount > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare size={18} className="text-orange-500" />
            <h3 className="font-semibold text-gray-800">Pending Approvals ({pendingCount} items)</h3>
          </div>
          <div className="space-y-2">
            {visiblePendingQuotations.map(q => (
              <div
                key={q.id}
                className="flex items-center justify-between p-3 rounded-lg bg-orange-50 cursor-pointer hover:bg-orange-100 transition-colors"
                onClick={() => router.push(`/quotations/${q.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{q.quoNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{q.customerName}</span>
                </div>
                <span className="badge badge-pending">Quotation</span>
              </div>
            ))}
            {visiblePendingWorkOrders.map(w => (
              <div
                key={w.id}
                className="flex items-center justify-between p-3 rounded-lg bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => router.push(`/workorders/${w.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{w.woNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{w.customerName}</span>
                </div>
                <span className="badge badge-pending">Work Order</span>
              </div>
            ))}
            {visiblePendingPrs.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors"
                onClick={() => router.push(`/pr/${p.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{p.prNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.customer}</span>
                </div>
                <span className="badge badge-pending">Purchase Request</span>
              </div>
            ))}
            {visiblePendingHandovers.map(h => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 rounded-lg bg-orange-50 cursor-pointer hover:bg-orange-100 transition-colors"
                onClick={() => router.push(`/handovers/${h.id}`)}
              >
                <div>
                  <span className="font-medium text-sm text-gray-800">{h.hoNo}</span>
                  <span className="text-xs text-gray-500 ml-2">{h.project}</span>
                </div>
                <span className="badge badge-pending">Handovers</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {canViewRecentLogs && overview?.recentLogs && overview.recentLogs.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Recent Activities</h3>
          <div className="space-y-2">
            {overview.recentLogs.slice(0, 8).map(log => (
              <div key={log.id} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full shrink-0 ${log.action === 'approve' ? 'bg-green-main' : 'bg-red-500'}`} />
                <span className="text-gray-600 flex-1">
                  <span className="font-medium">{log.approver?.fullName ?? log.approverId}</span>
                  {' '}{log.action === 'approve' ? 'Approved' : 'Rejected'}{' '}
                  <span className="text-gray-400">{log.docType}</span>
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(log.actedAt).toLocaleDateString('en-GB')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
