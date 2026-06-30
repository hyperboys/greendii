'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandoversAPI } from '@/lib/api'
import type { HandOverJob } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Plus, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function HandoversPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<HandOverJob[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    HandoversAPI.list(params)
      .then(setRows)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const canCreate = hasPerm('ho_create', user?.role ?? '')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Handovers</h2>
          <p className="page-sub">รายการส่งมอบงานทั้งหมด</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => router.push('/handovers/new')}>
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
        <button className="btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> รีเฟรช</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>เลขที่ HO</th>
              <th>ลูกค้า</th>
              <th>โครงการ</th>
              <th>เซลล์</th>
              <th>วันให้บริการ</th>
              <th>สถานะ</th>
              <th>วันที่</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(h => (
              <tr key={h.id} className="cursor-pointer" onClick={() => router.push(`/handovers/${h.id}`)}>
                <td className="font-mono text-xs font-semibold text-orange-600">{h.hoNo}</td>
                <td>{h.project}</td>
                <td className="max-w-[160px] truncate">{h.contractor || '-'}</td>
                <td>{h.sales?.fullName ?? h.salesId}</td>
                <td className="text-xs text-gray-500">{h.serviceDate ? new Date(h.serviceDate).toLocaleDateString('en-GB') : '-'}</td>
                <td><span className={`badge badge-${h.status}`}>{STATUS_LABELS[h.status]}</span></td>
                <td className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
