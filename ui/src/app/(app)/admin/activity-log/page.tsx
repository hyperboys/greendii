'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminAPI, UsersAPI } from '@/lib/api'
import { ROLE_LABELS, type ActivityLog, type User, type UserRole } from '@/types'
import { RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const METHOD_COLORS: Record<string, string> = {
  GET:    'bg-blue-100 text-blue-700',
  POST:   'bg-green-100 text-green-700',
  PUT:    'bg-yellow-100 text-yellow-700',
  PATCH:  'bg-orange-100 text-orange-700',
  DELETE: 'bg-red-100 text-red-700',
}

function parsePathMeta(value: string) {
  const src = String(value || '')
  const ridMatch = src.match(/\[rid:([^\]]+)\]/)
  const errMatch = src.match(/\[err:([^\]]+)\]/)
  let cleanPath = src
    .replace(/\s*\[rid:[^\]]+\]/g, '')
    .replace(/\s*\[err:[^\]]+\]/g, '')
    .trim()
  if (!cleanPath) cleanPath = '-'
  return {
    cleanPath,
    requestId: ridMatch?.[1] || null,
    errorSummary: errMatch?.[1] || null,
  }
}

function statusBadge(code: number) {
  if (code < 300) return 'bg-green-100 text-green-700'
  if (code < 400) return 'bg-blue-100 text-blue-700'
  if (code < 500) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

export default function ActivityLogPage() {
  const [rows, setRows]           = useState<ActivityLog[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [users, setUsers]         = useState<User[]>([])

  const [filterUserId, setFilterUserId]   = useState('')
  const [filterMethod, setFilterMethod]   = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterSearch, setFilterSearch]   = useState('')
  const [searchInput, setSearchInput]     = useState('')

  const LIMIT = 50

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const params: Record<string, string> = { page: String(p), limit: String(LIMIT) }
    if (filterUserId) params.userId = filterUserId
    if (filterMethod) params.method = filterMethod
    if (filterStatus) params.status = filterStatus
    if (filterSearch) params.search = filterSearch
    try {
      const data = await AdminAPI.getActivityLogs(params)
      setRows(data.rows)
      setTotal(data.total)
      setPage(p)
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [filterUserId, filterMethod, filterStatus, filterSearch])

  useEffect(() => { load(1) }, [load])

  useEffect(() => {
    UsersAPI.list().then(setUsers).catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / LIMIT)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilterSearch(searchInput)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Activity Log</h2>
          <p className="page-sub">บันทึกทุก HTTP Request ที่ User ทำกับระบบ</p>
        </div>
        <button className="btn-outline btn-sm" onClick={() => load(page)}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      {/* Filters */}
      <div className="toolbar flex-wrap gap-2">
        {/* User filter */}
        <select
          className="form-input w-52"
          value={filterUserId}
          onChange={e => setFilterUserId(e.target.value)}
        >
          <option value="">— ผู้ใช้ทั้งหมด —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
          ))}
        </select>

        {/* Method filter */}
        <select
          className="form-input w-36"
          value={filterMethod}
          onChange={e => setFilterMethod(e.target.value)}
        >
          <option value="">— Method —</option>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="form-input w-40"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">— สถานะ —</option>
          <option value="success">✅ สำเร็จ (2xx/3xx)</option>
          <option value="error">❌ Error (4xx/5xx)</option>
        </select>

        {/* Path search */}
        <form onSubmit={handleSearch} className="flex gap-1 ml-auto">
          <input
            className="form-input w-56"
            placeholder="ค้นหา path / username…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn-outline btn-sm">
            <Search size={14} />
          </button>
        </form>

        <span className="text-sm text-gray-500 self-center">
          {total.toLocaleString()} รายการ
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่/เวลา</th>
                <th>User</th>
                <th>Role</th>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Request ID</th>
                <th>สาเหตุ</th>
                <th className="text-right">ใช้เวลา (ms)</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-400">กำลังโหลด…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-400">ไม่มีข้อมูล</td>
                </tr>
              ) : rows.map(row => {
                const meta = parsePathMeta(row.path)
                return (
                <tr key={row.id} className={row.statusCode >= 400 ? 'bg-red-50/40' : ''}>
                  <td className="whitespace-nowrap text-xs text-gray-500">
                    {new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td>
                    <div className="font-medium text-sm">{row.user?.fullName ?? row.username ?? '—'}</div>
                    {row.username && <div className="text-xs text-gray-400">{row.username}</div>}
                  </td>
                  <td>
                    {row.user?.role ? (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                        {ROLE_LABELS[row.user.role as UserRole] ?? row.user.role}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td>
                    <span className={`badge text-xs font-mono ${METHOD_COLORS[row.method] ?? 'bg-gray-100 text-gray-600'}`}>
                      {row.method}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-gray-700 max-w-xs truncate" title={row.path}>
                    {meta.cleanPath}
                  </td>
                  <td>
                    <span className={`badge text-xs font-mono ${statusBadge(row.statusCode)}`}>
                      {row.statusCode}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-gray-500 max-w-[180px] truncate" title={meta.requestId || ''}>
                    {meta.requestId ?? '—'}
                  </td>
                  <td className="text-xs text-red-700 max-w-xs truncate" title={meta.errorSummary || ''}>
                    {meta.errorSummary ?? '—'}
                  </td>
                  <td className="text-right text-xs font-mono text-gray-500">
                    <span className={row.durationMs > 2000 ? 'text-red-600 font-semibold' : ''}>
                      {row.durationMs.toLocaleString()}
                    </span>
                  </td>
                  <td className="text-xs text-gray-400 font-mono">{row.ipAddress ?? '—'}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t bg-gray-50">
            <button
              className="btn-outline btn-sm"
              disabled={page <= 1}
              onClick={() => load(page - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm text-gray-600">
              หน้า {page} / {totalPages}
            </span>
            <button
              className="btn-outline btn-sm"
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
