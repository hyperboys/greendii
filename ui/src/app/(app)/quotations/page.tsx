'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuotationsAPI } from '@/lib/api'
import type { Quotation, DocStatus } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Plus, Search, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

type SortKey = 'quoNo' | 'customerName' | 'project' | 'salesId' | 'grandTotal' | 'status' | 'createdAt'
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('quoNo')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const defaultDirFor = (key: SortKey): SortDir => (key === 'grandTotal' || key === 'createdAt' || key === 'quoNo' ? 'desc' : 'asc')

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (statusFilter) params.status = statusFilter
    params.orderBy = sortBy
    params.orderDir = sortDir
    QuotationsAPI.list(params)
      .then(setRows)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter, sortBy, sortDir])

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
            onKeyDown={e => e.key === 'Enter' && load()}
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
        <button className="btn-outline btn-sm" onClick={load}>
          <RefreshCw size={14} /> ค้นหา
        </button>
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
                <button type="button" className="inline-flex items-center" onClick={() => toggleSort('createdAt')}>
                  วันที่{sortIcon('createdAt')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(q => (
              <tr
                key={q.id}
                className="cursor-pointer"
                onClick={() => router.push(`/quotations/${q.id}`)}
              >
                <td className="font-mono text-xs font-semibold text-green-dark">{q.quoNo}</td>
                <td>{q.customerName}</td>
                <td className="max-w-[200px] truncate">{q.project}</td>
                <td>{q.sales?.fullName ?? q.salesId}</td>
                <td className="text-right font-medium">฿{fmtMoney(q.grandTotal)}</td>
                <td><span className={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</span></td>
                <td className="text-xs text-gray-500">
                  {new Date(q.createdAt).toLocaleDateString('en-GB')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
