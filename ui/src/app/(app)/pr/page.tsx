'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PRAPI } from '@/lib/api'
import type { PurchaseRequest, DocStatus } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Plus, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<DocStatus, string> = {
  draft: 'badge-draft', pending: 'badge-pending', approved: 'badge-approved',
  rejected: 'badge-rejected', cancelled: 'badge-draft',
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function PRPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<PurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (statusFilter) params.status = statusFilter
    PRAPI.list(params)
      .then(setRows)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const canCreate = hasPerm('pr_create', user?.role ?? '')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">ใบขอซื้อ (PR)</h2>
          <p className="page-sub">รายการใบขอซื้อทั้งหมด</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => router.push('/pr/new')}>
            <Plus size={16} /> สร้างใหม่
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหา เลขที่ / ลูกค้า"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <select className="form-input w-auto py-1.5" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> ค้นหา</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>เลขที่ PR</th>
              <th>ลูกค้า</th>
              <th>อ้างอิง WO</th>
              <th className="text-right">ยอดสุทธิ</th>
              <th>สถานะ</th>
              <th>วันที่</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(p => (
              <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/pr/${p.id}`)}>
                <td className="font-mono text-xs font-semibold text-purple-700">{p.prNo}</td>
                <td>{p.customer}</td>
                <td className="text-xs text-gray-500">{p.workOrder?.woNo || '-'}</td>
                <td className="text-right font-medium">฿{fmtMoney(p.netTotal)}</td>
                <td><span className={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</span></td>
                <td className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
