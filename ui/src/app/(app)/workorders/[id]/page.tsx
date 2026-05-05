'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { WorkOrdersAPI } from '@/lib/api'
import type { WorkOrder } from '@/types'
import { STATUS_LABELS, APPROVAL_STEPS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Pencil, Printer, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import AttachmentsSection from '@/components/AttachmentsSection'

export default function WorkOrderDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [doc, setDoc] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)

  const load = () => {
    setLoading(true)
    WorkOrdersAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const isAdmin = ['admin', 'director', 'admin_mgr'].includes(user?.role ?? '')
  const canEdit = (isMine || isAdmin) && doc.status === 'draft'
  const canSubmit = isMine && doc.status === 'draft'
  const canResubmit = isMine && doc.status === 'rejected'
  const canDelete = (isMine || isAdmin) && ['draft', 'rejected'].includes(doc.status)

  const nextStep = doc.approvalStep + 1
  const stepDef = APPROVAL_STEPS.find(s => s.step === nextStep)
  const canApprove = doc.status === 'pending' && stepDef?.role === user?.role

  const act = async (action: 'submit' | 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm('ยืนยันการลบ/ยกเลิกเอกสารนี้?')) return
    setActing(true)
    try {
      if (action === 'submit') await WorkOrdersAPI.submit(id, comment)
      else if (action === 'approve') await WorkOrdersAPI.approve(id, comment)
      else if (action === 'reject') await WorkOrdersAPI.reject(id, comment)
      else if (action === 'delete') { await WorkOrdersAPI.cancel(id); router.push('/workorders'); return }
      toast.success('ดำเนินการสำเร็จ')
      load()
      setComment('')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="page-title">{doc.woNo}</h2>
            <span className={`badge badge-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
            {doc.isClosed && <span className="badge bg-gray-800 text-white">ปิดงานแล้ว</span>}
          </div>
          <p className="page-sub">{doc.project}</p>
        </div>
        <div className="flex gap-2">
        {canEdit && (
          <button className="btn-outline btn-sm" onClick={() => router.push(`/workorders/${id}/edit`)}>
            <Pencil size={14} /> แก้ไข
          </button>
        )}
        {canDelete && (
          <button className="btn-danger btn-sm" onClick={() => act('delete')} disabled={acting}>
            <Trash2 size={14} /> ลบ
          </button>
        )}
        <button className="btn-outline btn-sm no-print" onClick={() => window.print()}>
          <Printer size={14} /> พิมพ์
        </button>
        </div>
      </div>

      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="form-label">ลูกค้า</span><p>{doc.customerName}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.contactName || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.contactTel || '-'}</p></div>
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">สถานที่</span><p>{doc.location || '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">สินค้า/บริการ</span><p>{doc.products || '-'}</p></div>
        <div><span className="form-label">ผู้รับผิดชอบ</span><p>{doc.responsibility || '-'}</p></div>
        <div><span className="form-label">ทีมงาน</span><p>{doc.teamAssignment || '-'}</p></div>
        <div><span className="form-label">วันติดตั้ง</span><p>{doc.installDate ? new Date(doc.installDate).toLocaleDateString('th-TH') : '-'}</p></div>
        <div><span className="form-label">วัน QC</span><p>{doc.qcDate ? new Date(doc.qcDate).toLocaleDateString('th-TH') : '-'}</p></div>
        {doc.remark && <div className="col-span-full"><span className="form-label">หมายเหตุ</span><p>{doc.remark}</p></div>}
      </div>

      {/* Approval chain */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-3">สายการอนุมัติ</h3>
        <div className="flex flex-wrap gap-2">
          {APPROVAL_STEPS.map(s => {
            const log = doc.approvalLogs?.find(l => l.step === s.step)
            const isNext = s.step === nextStep && doc.status === 'pending'
            return (
              <div key={s.step} className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs text-center min-w-[80px] ${
                log?.action === 'approve' ? 'bg-green-pale border-green-main text-green-dark' :
                log?.action === 'reject' ? 'bg-red-50 border-red-300 text-red-700' :
                isNext ? 'bg-orange-50 border-orange-300 text-orange-700' :
                'bg-gray-50 border-gray-200 text-gray-500'
              }`}>
                <span className="font-semibold">{s.label}</span>
                {log ? <span>{log.action === 'approve' ? '✓' : '✕'}</span> : isNext ? <span>รออนุมัติ</span> : null}
              </div>
            )
          })}
        </div>
        {doc.approvalLogs && doc.approvalLogs.length > 0 && (
          <div className="mt-3 space-y-1">
            {doc.approvalLogs.map(log => (
              <div key={log.id} className="text-xs text-gray-500 flex gap-2">
                <span className={log.action === 'approve' ? 'text-green-dark' : 'text-red-500'}>
                  {log.action === 'approve' ? '✓' : '✕'}
                </span>
                <span>{log.approver?.fullName ?? log.approverId}</span>
                {log.comment && <span className="text-gray-400">— {log.comment}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <AttachmentsSection
        attachments={doc.attachments ?? []}
        docField="workOrderId"
        docId={id}
        onRefresh={load}
      />

      {(canSubmit || canResubmit || canApprove) && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          <textarea className="form-input" rows={2} placeholder="ความคิดเห็น (ไม่บังคับ)"
            value={comment} onChange={e => setComment(e.target.value)} />
          <div className="flex gap-2">
            {(canSubmit || canResubmit) && (
              <button className="btn-primary" onClick={() => act('submit')} disabled={acting}>
                <SendHorizonal size={15} /> {canResubmit ? 'ส่งอนุมัติอีกครั้ง' : 'ส่งอนุมัติ'}
              </button>
            )}
            {canApprove && (
              <>
                <button className="btn-primary" onClick={() => act('approve')} disabled={acting}>
                  <CheckCircle size={15} /> อนุมัติ
                </button>
                <button className="btn-danger" onClick={() => act('reject')} disabled={acting}>
                  <XCircle size={15} /> ปฏิเสธ
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
