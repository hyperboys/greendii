'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UsersAPI, WorkOrdersAPI } from '@/lib/api'
import { normalizeUserRole } from '@/lib/roleAliases'
import type { WorkOrder, DocStatus, User } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Plus, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import ListPager from '@/components/ListPager'

const PAGE_LIMIT = 20

const STATUS_COLORS: Record<DocStatus, string> = {
  draft: 'badge-draft', pending: 'badge-pending', approved: 'badge-approved',
  rejected: 'badge-rejected', cancelled: 'badge-draft',
}

export default function WorkOrdersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [salesFilter, setSalesFilter] = useState('')
  const [salesOptions, setSalesOptions] = useState<Array<{ id: string; name: string }>>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const canLoadSalesUsers = ['admin', 'director', 'admin_mgr'].includes(normalizeUserRole(user?.role))

  const mergeSalesOptionsFromRows = (list: WorkOrder[]) => {
    const nextFromRows = list
      .map((row) => ({ id: row.salesId, name: row.sales?.fullName || row.salesId }))
      .filter((item) => item.id)

    setSalesOptions((prev) => {
      const map = new Map<string, string>()
      for (const item of prev) map.set(item.id, item.name)
      for (const item of nextFromRows) {
        if (!map.has(item.id) || map.get(item.id) === item.id) map.set(item.id, item.name)
      }
      return Array.from(map.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'th'))
    })
  }

  const loadSalesUsers = async () => {
    if (!canLoadSalesUsers) return
    try {
      const users = await UsersAPI.list({ active: 'true' })
      const saleUsers = users
        .filter((u: User) => normalizeUserRole(u.role) === 'sales')
        .map((u: User) => ({ id: u.id, name: u.fullName || u.username }))
        .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      if (saleUsers.length > 0) setSalesOptions(saleUsers)
    } catch {
      // Fallback to deriving options from currently loaded rows for non-admin roles.
    }
  }

  const load = (nextPage = 1) => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (statusFilter) params.status = statusFilter
    if (salesFilter) params.salesId = salesFilter
    params.page = String(nextPage)
    params.pageSize = String(PAGE_LIMIT)
    WorkOrdersAPI.listPage(params)
      .then((data) => {
        setRows(data.rows)
        setPage(data.page)
        setTotalPages(data.totalPages)
        mergeSalesOptionsFromRows(data.rows)
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSalesUsers()
  }, [canLoadSalesUsers])

  useEffect(() => { load(1) }, [statusFilter, salesFilter])

  const canCreate = hasPerm('wo_create', user?.role ?? '')
  const canEmailWorkOrder = hasPerm('workorder_email_view', user?.role ?? '')

  const handleOpenWorkOrder = (workOrderId: string) => {
    const prevRows = rows
    setRows((current) => current.map((item) => (
      item.id === workOrderId ? { ...item, isRead: true } : item
    )))

    WorkOrdersAPI.markRead(workOrderId).catch(() => {
      setRows(prevRows)
      toast.error('อัปเดตสถานะอ่านแล้วไม่สำเร็จ')
    })

    router.push(`/workorders/${workOrderId}`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Work Orders</h2>
          <p className="page-sub">รายการใบสั่งงานทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
          {canEmailWorkOrder && (
            <button className="btn-outline" onClick={() => router.push('/workorders/email')}>
              Send email work orders
            </button>
          )}
          {canCreate && (
            <button className="btn-primary" onClick={() => router.push('/workorders/new')}>
              <Plus size={16} /> Create New
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหา เลขที่ / ลูกค้า / โครงการ"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} />
        </div>
        <select className="form-input w-auto py-1.5" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-input w-auto py-1.5" value={salesFilter} onChange={e => setSalesFilter(e.target.value)}>
          <option value="">ทุก Sale</option>
          {salesOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn-outline btn-sm" onClick={() => load(1)}><RefreshCw size={14} /> ค้นหา</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>เลขที่ WO</th>
              <th>ลูกค้า</th>
              <th>โครงการ</th>
              <th>เซลล์</th>
              <th>วันติดตั้ง</th>
              <th>สถานะ</th>
              <th>ปิดงาน</th>
              <th>วันที่</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(w => (
              <tr key={w.id} className="cursor-pointer" onClick={() => handleOpenWorkOrder(w.id)}>
                <td className={`font-mono text-xs ${w.isRead ? 'wo-read' : 'wo-unread'}`}>{w.woNo}</td>
                <td>{w.customerName}</td>
                <td className="max-w-[180px] truncate">{w.project}</td>
                <td>{w.sales?.fullName ?? w.salesId}</td>
                <td className="text-xs text-gray-500">{w.installDate ? new Date(w.installDate).toLocaleDateString('en-GB') : '-'}</td>
                <td><span className={STATUS_COLORS[w.status]}>{STATUS_LABELS[w.status]}</span></td>
                <td>{w.isClosed ? <span className="badge bg-gray-800 text-white">ปิดแล้ว</span> : '-'}</td>
                <td className="text-xs text-gray-500">{new Date(w.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListPager page={page} totalPages={totalPages} onPageChange={load} />
    </div>
  )
}
