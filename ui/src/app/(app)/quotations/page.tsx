'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuotationsAPI } from '@/lib/api'
import type { Quotation, DocStatus } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { normalizeUserRole } from '@/lib/roleAliases'
import { Plus, Search, RefreshCw, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import ListPager from '@/components/ListPager'
import { armPersistentListState, usePersistentListState } from '@/lib/persistentListState'

const PAGE_LIMIT = 20
const QUOTATION_LIST_DEFAULTS = {
  filters: { search: '', statusFilter: '' },
  pagination: { page: 1, pageSize: PAGE_LIMIT },
  sorting: { sortBy: 'quoNo' as SortKey, sortDir: 'desc' as SortDir },
  selectedTab: null,
  scrollPosition: 0,
  shouldRestore: true,
}

type SortKey = 'quoNo' | 'customerName' | 'project' | 'salesId' | 'grandTotal' | 'status' | 'updatedAt'
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<DocStatus, string> = {
  draft: 'badge-draft',
  pending: 'badge-pending',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
  cancelled: 'badge-draft',
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function QuotationsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const { state: listState, setState: setListState, hydrated, clear: clearListState } = usePersistentListState('quotations', QUOTATION_LIST_DEFAULTS)
  const search = listState.filters.search
  const statusFilter = listState.filters.statusFilter
  const sortBy = listState.sorting.sortBy
  const sortDir = listState.sorting.sortDir
  const page = listState.pagination.page
  const setSearch = (value: string) => setListState(prev => ({ ...prev, filters: { ...prev.filters, search: value } }))
  const setStatusFilter = (value: string) => setListState(prev => ({ ...prev, filters: { ...prev.filters, statusFilter: value }, pagination: { ...prev.pagination, page: 1 } }))
  const setSortBy = (value: SortKey) => setListState(prev => ({ ...prev, sorting: { ...prev.sorting, sortBy: value } }))
  const setSortDir = (value: SortDir | ((prev: SortDir) => SortDir)) => setListState(prev => ({ ...prev, sorting: { ...prev.sorting, sortDir: typeof value === 'function' ? value(prev.sorting.sortDir) : value } }))
  const [totalPages, setTotalPages] = useState(1)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const defaultDirFor = (key: SortKey): SortDir => (key === 'grandTotal' || key === 'updatedAt' || key === 'quoNo' ? 'desc' : 'asc')

  const load = (nextPage = 1, filters = { search, statusFilter }) => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filters.search) params.q = filters.search
    if (filters.statusFilter) params.status = filters.statusFilter
    params.orderBy = sortBy
    params.orderDir = sortDir
    params.page = String(nextPage)
    params.pageSize = String(PAGE_LIMIT)
    QuotationsAPI.listPage(params)
      .then((data) => {
        setRows(data.rows)
        setListState(prev => ({ ...prev, pagination: { ...prev.pagination, page: Math.max(1, Math.min(data.page, data.totalPages || 1)) } }))
        setTotalPages(data.totalPages)
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (hydrated) load(listState.pagination.page) }, [hydrated, statusFilter, sortBy, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(key)
    setSortDir(defaultDirFor(key))
  }

  const sortIcon = (key: SortKey) => {
    if (sortBy !== key) return <span className="ml-1 text-[10px] text-gray-400">↕</span>
    return <span className="ml-1 text-[10px] text-green-dark">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const canCreate = hasPerm('quo_create', user?.role ?? '')

  const duplicateQuotation = async (e: React.MouseEvent, quotationId: string) => {
    e.stopPropagation()
    if (duplicatingId) return
    setDuplicatingId(quotationId)
    try {
      armPersistentListState('quotations')
      const copied = await QuotationsAPI.duplicate(quotationId)
      toast.success('ทำสำเนาใบเสนอราคาสำเร็จ')
      router.push(`/quotations/${copied.id}/edit`)
    } catch {
      toast.error('ทำสำเนาไม่สำเร็จ')
    } finally {
      setDuplicatingId(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Quotation</h2>
          <p className="page-sub">All quotations</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => router.push('/quotations/new')}>
            <Plus size={16} /> Create New
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="form-input pl-8 py-1.5"
            placeholder="ค้นหา เลขที่ / ลูกค้า / โครงการ"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(1)}
          />
        </div>
        <select
          className="form-input w-auto py-1.5"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn-outline btn-sm" onClick={() => load(1)}>
          <RefreshCw size={14} /> ค้นหา
        </button>
        <button className="btn-outline btn-sm" onClick={() => { clearListState(); load(1, { search: '', statusFilter: '' }) }}>ล้าง</button>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('quoNo')}>
                  เลขที่{sortIcon('quoNo')}
                </button>
              </th>
              <th>
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('customerName')}>
                  ลูกค้า{sortIcon('customerName')}
                </button>
              </th>
              <th>
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('project')}>
                  โครงการ{sortIcon('project')}
                </button>
              </th>
              <th>
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('salesId')}>
                  เซลล์{sortIcon('salesId')}
                </button>
              </th>
              <th className="text-right">
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('grandTotal')}>
                  ยอดรวม{sortIcon('grandTotal')}
                </button>
              </th>
              <th>
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('status')}>
                  สถานะ{sortIcon('status')}
                </button>
              </th>
              <th>
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('updatedAt')}>
                  วันที่{sortIcon('updatedAt')}
                </button>
              </th>
              <th className="text-right">ทำสำเนา</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(q => (
              <tr
                key={q.id}
                className="cursor-pointer"
                onClick={() => { armPersistentListState('quotations'); router.push(`/quotations/${q.id}`) }}
              >
                <td className="font-mono text-xs font-semibold text-green-dark">{q.quoNo}</td>
                <td>{q.customerName}</td>
                <td className="max-w-[200px] truncate">{q.project}</td>
                <td>{q.sales?.fullName ?? q.salesId}</td>
                <td className="text-right font-medium">฿{fmtMoney(q.grandTotal)}</td>
                <td><span className={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</span></td>
                <td className="text-xs text-gray-500">
                  {new Date(q.updatedAt || q.createdAt).toLocaleDateString('en-GB')}
                </td>
                <td className="text-right">
                  {normalizeUserRole(user?.role) === 'sales' && q.salesId === user?.id ? (
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={(e) => duplicateQuotation(e, q.id)}
                      disabled={duplicatingId === q.id}
                    >
                      <Copy size={14} /> {duplicatingId === q.id ? 'กำลังคัดลอก…' : 'ทำสำเนา'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListPager page={page} totalPages={totalPages} onPageChange={load} />
    </div>
  )
}
