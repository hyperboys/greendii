'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react'
import { AdminAPI } from '@/lib/api'
import type { EmailLogEntry } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { useRouter } from 'next/navigation'
import DateInput from '@/components/DateInput'
import { decodeDisplayFileName } from '@/lib/filename'

const LIMIT = 40

export default function EmailLogPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()
  const [rows, setRows] = useState<EmailLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [syncingLogId, setSyncingLogId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const canView = hasPerm('email_log_view', user?.role ?? '')

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(nextPage),
        limit: String(LIMIT),
      }
      if (status) params.status = status
      if (q) params.q = q
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo

      const data = await AdminAPI.getEmailLogs(params)
      setRows(data.rows)
      setTotal(data.total)
      setPage(nextPage)
    } catch {
      toast.error('โหลด Email Log ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [status, q, dateFrom, dateTo])

  useEffect(() => {
    if (!canView) {
      toast.error('ไม่มีสิทธิ์เข้าถึง Email Log')
      router.replace('/dashboard')
      return
    }
    load(1)
  }, [canView, load, router])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / LIMIT)), [total])
  const pendingSyncRows = useMemo(
    () => rows.filter(row => row.status === 'sent' && row.errorMessage?.includes('email_history sync failed')),
    [rows],
  )

  if (!canView) return null

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Email Log</h2>
          <p className="page-sub">ประวัติการส่งอีเมล Work Order พร้อม Audit Trail</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingSyncRows.length > 0 && (
            <button
              className="btn-outline btn-sm"
              disabled={syncingAll}
              onClick={async () => {
                setSyncingAll(true)
                try {
                  const ids = pendingSyncRows.map(r => r.id)
                  const result = await AdminAPI.bulkResyncEmailHistory(ids)
                  toast.success(`Re-sync แล้ว ${result.synced}/${result.total} รายการ`)
                  if (result.failed > 0) {
                    toast.error(`ยังเหลือที่ไม่สำเร็จ ${result.failed} รายการ`)
                  }
                  await load(page)
                } catch {
                  toast.error('Re-sync แบบกลุ่มไม่สำเร็จ')
                } finally {
                  setSyncingAll(false)
                }
              }}
            >
              {syncingAll ? 'กำลัง Re-sync ทั้งหมด...' : `Re-sync ที่ค้าง (${pendingSyncRows.length})`}
            </button>
          )}
          <button className="btn-outline btn-sm" onClick={() => load(page)}>
            <RefreshCw size={14} /> ค้นหา
          </button>
        </div>
      </div>

      <div className="toolbar flex-wrap gap-2">
        <select className="form-input w-44" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="sent">ส่งสำเร็จ</option>
          <option value="failed">ส่งไม่สำเร็จ</option>
        </select>

        <DateInput className="w-40" value={dateFrom} onChange={setDateFrom} />
        <DateInput className="w-40" value={dateTo} onChange={setDateTo} />

        <form
          className="flex gap-1 ml-auto"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(searchInput)
          }}
        >
          <input
            className="form-input w-64"
            placeholder="ค้นหา subject หรือข้อความ"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn-outline btn-sm"><Search size={14} /></button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>Work Order</th>
                <th>Subject</th>
                <th>ผู้ส่ง</th>
                <th>ผู้รับ</th>
                <th>สถานะ</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">กำลังโหลด...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : rows.map((row) => {
                const isExpanded = expandedId === row.id
                const historyPending = row.status === 'sent' && row.errorMessage?.includes('email_history sync failed')
                return (
                  <Fragment key={row.id}>
                    <tr key={row.id} className={row.status === 'failed' ? 'bg-red-50/50' : ''}>
                      <td className="text-xs text-gray-500 whitespace-nowrap">{new Date(row.sentAt).toLocaleString('en-GB')}</td>
                      <td>
                        <div className="font-mono text-xs text-blue-700">{row.workOrder?.woNo || '-'}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[220px]">{row.workOrder?.project || '-'}</div>
                      </td>
                      <td className="max-w-[320px] truncate" title={row.subject}>{row.subject}</td>
                      <td className="text-sm">{row.sentBy?.fullName || row.sentById}</td>
                      <td className="text-xs">{(row.toRecipients || []).slice(0, 2).join(', ')}{(row.toRecipients || []).length > 2 ? ` +${(row.toRecipients || []).length - 2}` : ''}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <span className={`badge ${row.status === 'sent' ? 'badge-approved' : 'badge-rejected'}`}>
                            {row.status === 'sent' ? 'sent' : 'failed'}
                          </span>
                          {row.status === 'sent' && (
                            <span className={`badge ${historyPending ? 'badge-rejected' : 'badge-approved'}`}>
                              {historyPending ? 'History Pending' : 'History Synced'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button className="btn-outline btn-sm" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                          {isExpanded ? 'ซ่อน' : 'ดู'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50">
                          <div className="p-3 text-sm space-y-2">
                            <div><span className="font-medium">TO:</span> {(row.toRecipients || []).join(', ') || '-'}</div>
                            <div><span className="font-medium">CC:</span> {(row.ccRecipients || []).join(', ') || '-'}</div>
                            <div><span className="font-medium">BCC:</span> {(row.bccRecipients || []).join(', ') || '-'}</div>
                            <div><span className="font-medium">Quotation:</span> {row.quotation?.quoNo || '-'}</div>
                            <div><span className="font-medium">Handover:</span> {row.handOverJob?.hoNo || '-'}</div>
                            <div><span className="font-medium">IP:</span> {row.ipAddress || '-'} | <span className="font-medium">UA:</span> {row.userAgent || '-'}</div>
                            {row.errorMessage && <div className="text-red-600"><span className="font-medium">Error:</span> {row.errorMessage}</div>}
                            {row.errorMessage?.includes('email_history sync failed') && (
                              <div>
                                <button
                                  className="btn-outline btn-sm"
                                  disabled={syncingLogId === row.id}
                                  onClick={async () => {
                                    setSyncingLogId(row.id)
                                    try {
                                      const result = await AdminAPI.resyncEmailHistory(row.id)
                                      toast.success(`Re-sync สำเร็จ (${result.recipients} recipients)`)
                                      await load(page)
                                    } catch {
                                      toast.error('Re-sync ไม่สำเร็จ')
                                    } finally {
                                      setSyncingLogId(null)
                                    }
                                  }}
                                >
                                  {syncingLogId === row.id ? 'กำลัง Re-sync...' : 'Re-sync Email History'}
                                </button>
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Attachments:</span>
                              <ul className="list-disc ml-5 mt-1">
                                {(row.attachments || []).length === 0 && <li>-</li>}
                                {(row.attachments || []).map((att, index) => (
                                  <li key={`${row.id}-att-${index}`}>{decodeDisplayFileName(att.filename) || att.filename} ({att.sourceLabel} {att.sourceDocNo}){att.generated ? ' [generated]' : ''}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t bg-gray-50">
            <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm text-gray-600">หน้า {page} / {totalPages}</span>
            <button className="btn-outline btn-sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      {(syncingAll || !!syncingLogId) && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="card p-5 w-full max-w-sm text-center space-y-3">
            <div className="flex items-center justify-center text-green-dark">
              <Loader2 size={24} className="animate-spin" />
            </div>
            <h4 className="font-semibold text-gray-800">
              {syncingAll ? 'กำลัง Re-sync รายการที่ค้าง...' : 'กำลัง Re-sync Email History...'}
            </h4>
            <p className="text-sm text-gray-500">กรุณารอสักครู่ ระบบกำลังอัปเดตประวัติอีเมล</p>
          </div>
        </div>
      )}
    </div>
  )
}
