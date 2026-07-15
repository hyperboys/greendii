'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandoversAPI, UsersAPI } from '@/lib/api'
import { normalizeUserRole } from '@/lib/roleAliases'
import type { HandOverJob, User } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Plus, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import ListPager from '@/components/ListPager'

const PAGE_LIMIT = 20

export default function HandoversPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<HandOverJob[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [salesFilter, setSalesFilter] = useState('')
  const [salesOptions, setSalesOptions] = useState<Array<{ id: string; name: string }>>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const canLoadSalesUsers = ['admin', 'director', 'admin_mgr'].includes(normalizeUserRole(user?.role))

  const mergeSalesOptionsFromRows = (list: HandOverJob[]) => {
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
    HandoversAPI.listPage(params)
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
                <td className="max-w-[160px] truncate">{h.contractor || '-'}</td>
                <td>{h.project}</td>
                <td>{h.sales?.fullName ?? h.salesId}</td>
                <td className="text-xs text-gray-500">{h.serviceDate ? new Date(h.serviceDate).toLocaleDateString('en-GB') : '-'}</td>
                <td><span className={`badge badge-${h.status}`}>{STATUS_LABELS[h.status]}</span></td>
                <td className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListPager page={page} totalPages={totalPages} onPageChange={load} />
    </div>
  )
}
