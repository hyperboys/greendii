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
import ListPager from '@/components/ListPager'
import { armPersistentListState, usePersistentListState } from '@/lib/persistentListState'

const PAGE_LIMIT = 20
const PR_LIST_DEFAULTS = { filters: { search: '', statusFilter: '' }, pagination: { page: 1, pageSize: PAGE_LIMIT }, sorting: {}, selectedTab: null, scrollPosition: 0, shouldRestore: true }

const STATUS_COLORS: Record<DocStatus, string> = {
  draft: 'badge-draft', pending: 'badge-pending', approved: 'badge-approved',
  rejected: 'badge-rejected', cancelled: 'badge-draft',
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function currencyPrefix(code?: string) {
  const c = String(code || 'THB').trim().toUpperCase()
  if (c === 'THB') return '฿'
  if (c === 'USD') return '$'
  return `${c} `
}

export default function PRPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<PurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const { state: listState, setState: setListState, hydrated, clear: clearListState } = usePersistentListState('purchase-requests', PR_LIST_DEFAULTS)
  const search = listState.filters.search
  const statusFilter = listState.filters.statusFilter
  const page = listState.pagination.page
  const setSearch = (value: string) => setListState(prev => ({ ...prev, filters: { ...prev.filters, search: value } }))
  const setStatusFilter = (value: string) => setListState(prev => ({ ...prev, filters: { ...prev.filters, statusFilter: value }, pagination: { ...prev.pagination, page: 1 } }))
  const [totalPages, setTotalPages] = useState(1)

  const load = (nextPage = 1, filters = { search, statusFilter }) => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filters.search) params.q = filters.search
    if (filters.statusFilter) params.status = filters.statusFilter
    params.page = String(nextPage)
    params.pageSize = String(PAGE_LIMIT)
    PRAPI.listPage(params)
      .then((data) => {
        setRows(data.rows)
        setListState(prev => ({ ...prev, pagination: { ...prev.pagination, page: Math.max(1, Math.min(data.page, data.totalPages || 1)) } }))
        setTotalPages(data.totalPages)
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (hydrated) load(listState.pagination.page) }, [hydrated, statusFilter])

  const canCreate = hasPerm('pr_create', user?.role ?? '')

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Purchase Request</h2>
          <p className="page-sub">All Purchase Requests</p>
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
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหา เลขที่ PR / WO / Supplier"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} />
        </div>
        <select className="form-input w-auto py-1.5" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-outline btn-sm" onClick={() => load(1)}><RefreshCw size={14} /> ค้นหา</button>
        <button className="btn-outline btn-sm" onClick={() => { clearListState(); load(1, { search: '', statusFilter: '' }) }}>ล้าง</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table table-fixed min-w-[1260px]">
          <thead>
            <tr>
              <th className="w-[120px]">เลขที่ PR</th>
              <th className="w-[260px]">ประเภท PR</th>
              <th className="w-[110px]">WO</th>
              <th className="w-[360px]">Supplier</th>
              <th className="w-[170px]">ผู้สร้าง</th>
              <th className="w-[170px] text-right">ยอดสุทธิ</th>
              <th className="w-[120px]">สถานะ</th>
              <th className="w-[120px]">วันที่</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(p => (
              <tr key={p.id} className="cursor-pointer" onClick={() => { armPersistentListState('purchase-requests'); router.push(`/pr/${p.id}`) }}>
                <td className="font-mono text-xs font-semibold text-purple-700">{p.prNo}</td>
                <td>{p.prType?.name || '-'}</td>
                <td className="text-xs text-gray-500">{p.workOrder?.woNo || '-'}</td>
                <td>
                  <div className="truncate" title={p.customer}>{p.customer}</div>
                </td>
                <td>
                  <div className="truncate" title={p.sales?.fullName || '-'}>{p.sales?.fullName || '-'}</div>
                </td>
                <td className="text-right font-medium">{currencyPrefix(p.currency)}{fmtMoney(p.netTotal)}</td>
                <td><span className={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</span></td>
                <td className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListPager page={page} totalPages={totalPages} onPageChange={load} />
    </div>
  )
}
