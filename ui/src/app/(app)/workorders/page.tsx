'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WorkOrdersAPI } from '@/lib/api'
import type { WorkOrder, DocStatus } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { Plus, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<DocStatus, string> = {
  draft: 'badge-draft', pending: 'badge-pending', approved: 'badge-approved',
  rejected: 'badge-rejected', cancelled: 'badge-draft',
}

export default function WorkOrdersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [rows, setRows] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.search = search
    if (statusFilter) params.status = statusFilter
    WorkOrdersAPI.list(params)
      .then(setRows)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const canCreate = ['sales', 'sales2', 'sale_mgr', 'admin_mgr'].includes(user?.role ?? '')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">ใบสั่งงาน</h2>
          <p className="page-sub">รายการใบสั่งงานทั้งหมด</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => router.push('/workorders/new')}>
            <Plus size={16} /> สร้างใหม่
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหา เลขที่ / ลูกค้า / โครงการ"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <select className="form-input w-auto py-1.5" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> รีเฟรช</button>
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
              <tr key={w.id} className="cursor-pointer" onClick={() => router.push(`/workorders/${w.id}`)}>
                <td className="font-mono text-xs font-semibold text-blue-700">{w.woNo}</td>
                <td>{w.customerName}</td>
                <td className="max-w-[180px] truncate">{w.project}</td>
                <td>{w.sales?.fullName ?? w.salesId}</td>
                <td className="text-xs text-gray-500">{w.installDate ? new Date(w.installDate).toLocaleDateString('th-TH') : '-'}</td>
                <td><span className={STATUS_COLORS[w.status]}>{STATUS_LABELS[w.status]}</span></td>
                <td>{w.isClosed ? <span className="badge bg-gray-800 text-white">ปิดแล้ว</span> : '-'}</td>
                <td className="text-xs text-gray-500">{new Date(w.createdAt).toLocaleDateString('th-TH')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
