'use client'

import { useEffect, useState } from 'react'
import { AdminAPI } from '@/lib/api'
import { ROLE_LABELS, type ApprovalLogEntry, type UserRole } from '@/types'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatBangkokDateTime } from '@/lib/timezone'

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  submit:  { label: 'ส่งอนุมัติ', cls: 'badge bg-blue-100 text-blue-700' },
  approve: { label: 'อนุมัติ',    cls: 'badge bg-green-pale text-green-dark' },
  reject:  { label: 'ปฏิเสธ',    cls: 'badge bg-red-100 text-red-700' },
}

const DOC_TYPE_LABELS: Record<string, string> = {
  quotation: 'ใบเสนอราคา',
  workorder: 'ใบสั่งงาน',
  pr:        'ใบขอซื้อ',
  handover:  'ส่งมอบงาน',
}

function docNo(row: ApprovalLogEntry) {
  return row.quotation?.quoNo ?? row.workOrder?.woNo ?? row.handOverJob?.hoNo ?? row.pr?.prNo ?? '—'
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<ApprovalLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterDocType, setFilterDocType] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const LIMIT = 50

  const load = async (p = 1) => {
    setLoading(true)
    const params: Record<string, string> = { page: String(p), limit: String(LIMIT) }
    if (filterDocType) params.docType = filterDocType
    if (filterAction)  params.action  = filterAction
    try {
      const data = await AdminAPI.getAuditLog(params)
      setRows(data.rows)
      setTotal(data.total)
      setPage(p)
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1) }, [filterDocType, filterAction])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">บันทึกกิจกรรม</h2>
          <p className="page-sub">ประวัติการ Submit / Approve / Reject เอกสารทุกประเภท</p>
        </div>
        <button className="btn-outline btn-sm" onClick={() => load(page)}>
          <RefreshCw size={14} /> ค้นหา
        </button>
      </div>

      {/* Filters */}
      <div className="toolbar">
        <select className="form-input w-44" value={filterDocType} onChange={e => setFilterDocType(e.target.value)}>
          <option value="">— ประเภทเอกสาร —</option>
          <option value="quotation">ใบเสนอราคา</option>
          <option value="workorder">ใบสั่งงาน</option>
          <option value="pr">ใบขอซื้อ</option>
          <option value="handover">ส่งมอบงาน</option>
        </select>
        <select className="form-input w-40" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">— Action —</option>
          <option value="submit">ส่งอนุมัติ</option>
          <option value="approve">อนุมัติ</option>
          <option value="reject">ปฏิเสธ</option>
        </select>
        <span className="text-sm text-gray-500 ml-auto">
          {total.toLocaleString()} รายการ
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่/เวลา</th>
                <th>ผู้ดำเนินการ</th>
                <th>Role</th>
                <th>Action</th>
                <th>ประเภท</th>
                <th>เลขที่เอกสาร</th>
                <th>ขั้นตอน</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">กำลังโหลด…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">ไม่มีข้อมูล</td></tr>
              ) : rows.map(row => {
                const act = ACTION_LABELS[row.action] ?? { label: row.action, cls: 'badge bg-gray-100 text-gray-600' }
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-xs text-gray-500">
                      {formatBangkokDateTime(row.actedAt)}
                    </td>
                    <td className="font-medium">{row.approver?.fullName ?? row.approverId}</td>
                    <td>
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                        {row.approver?.role ? (ROLE_LABELS[row.approver.role as UserRole] ?? row.approver.role) : '—'}
                      </span>
                    </td>
                    <td><span className={act.cls}>{act.label}</span></td>
                    <td className="text-xs">{DOC_TYPE_LABELS[row.docType] ?? row.docType}</td>
                    <td className="font-mono text-xs font-semibold text-green-dark">{docNo(row)}</td>
                    <td className="text-center text-xs text-gray-500">{row.step}</td>
                    <td className="text-xs text-gray-500 max-w-48 truncate">{row.comment || '—'}</td>
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
