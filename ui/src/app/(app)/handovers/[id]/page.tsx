'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { HandoversAPI, SettingsAPI, downloadBlob } from '@/lib/api'
import type { HandOverJob, Settings } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useSettingsStore } from '@/store/settings'
import HandoverPrint from '@/components/HandoverPrint'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Pencil, Printer, Trash2, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import AttachmentsSection from '@/components/AttachmentsSection'

export default function HandoverDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const { stepRoleConfig, getRoleLabel } = useSettingsStore()
  const [doc, setDoc] = useState<HandOverJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)

  const load = () => {
    setLoading(true)
    HandoversAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { SettingsAPI.get().then(setSettings).catch(() => {}) }, [])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const isAdmin = ['admin', 'director', 'admin_mgr'].includes(user?.role ?? '')
  const canEdit = (isMine || isAdmin) && doc.status === 'draft'
  const canSubmit = isMine && doc.status === 'draft'
  const canResubmit = isMine && doc.status === 'rejected'
  const canDelete = (isMine || isAdmin) && ['draft', 'rejected'].includes(doc.status)

  const nextStep = doc.approvalStep + 1
  const nextStepRole = stepRoleConfig[String(nextStep)]
  const canApprove = doc.status === 'pending' && nextStepRole === user?.role

  const act = async (action: 'submit' | 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm('ยืนยันการลบ/ยกเลิกเอกสารนี้?')) return
    setActing(true)
    try {
      if (action === 'submit') await HandoversAPI.submit(id, comment)
      else if (action === 'approve') await HandoversAPI.approve(id, comment)
      else if (action === 'reject') await HandoversAPI.reject(id, comment)
      else if (action === 'delete') { await HandoversAPI.cancel(id); router.push('/handovers'); return }
      toast.success('ดำเนินการสำเร็จ')
      load()
      setComment('')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setActing(false)
    }
  }

  const RATING_OPTIONS = [
    { value: 5, label: 'ดีมาก' },
    { value: 4, label: 'ดี' },
    { value: 3, label: 'ปานกลาง' },
    { value: 2, label: 'พอใช้' },
    { value: 1, label: 'ปรับปรุง' },
  ]

  const ratingLabel = (val: number) => {
    const opt = RATING_OPTIONS.find(o => o.value === val)
    return opt ? `${opt.label} (${val}/5)` : `${val}/5`
  }

  const RatingDisplay = ({ val }: { val: number }) => (
    <div className="flex flex-wrap gap-3 mt-1">
      {RATING_OPTIONS.map(opt => (
        <label key={opt.value} className={`flex items-center gap-1.5 text-sm ${val === opt.value ? 'font-semibold text-green-700' : 'text-gray-400'}`}>
          <input type="radio" readOnly checked={val === opt.value} className="accent-green-600 w-4 h-4" />
          {opt.label} ({opt.value})
        </label>
      ))}
    </div>
  )

  return (
    <>
    <HandoverPrint doc={doc} settings={settings} />
    <div className="screen-only max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="page-title">{doc.hoNo}</h2>
            <span className={`badge badge-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
          </div>
          <p className="page-sub">{doc.project}</p>
        </div>
        <div className="flex gap-2">
        {canEdit && (
          <button className="btn-outline btn-sm" onClick={() => router.push(`/handovers/${id}/edit`)}>
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
        <button className="btn-outline btn-sm no-print" onClick={async () => {
          toast.loading('กำลังสร้าง PDF…', { id: 'pdf' })
          try {
            const blob = await HandoversAPI.pdf(id)
            downloadBlob(blob, `${doc.hoNo || 'handover'}.pdf`)
            toast.success('สำเร็จ', { id: 'pdf' })
          } catch { toast.error('สร้าง PDF ไม่สำเร็จ', { id: 'pdf' }) }
        }}>
          <Download size={14} /> PDF
        </button>
        </div>
      </div>

      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">ผู้รับเหมา</span><p>{doc.contractor || '-'}</p></div>
        <div><span className="form-label">สถานที่</span><p>{doc.location || '-'}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.contactName || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.contactTel || '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">สินค้า/บริการ</span><p>{doc.product || '-'}</p></div>
        <div><span className="form-label">ผู้รับผิดชอบ</span><p>{doc.responsibility || '-'}</p></div>
        <div><span className="form-label">วันให้บริการ</span><p>{doc.serviceDate ? new Date(doc.serviceDate).toLocaleDateString('th-TH') : '-'}</p></div>
        {doc.comment && <div className="col-span-full"><span className="form-label">ความคิดเห็น</span><p>{doc.comment}</p></div>}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-4">การประเมินคุณภาพ</h3>
        <div className="space-y-3">
          <div>
            <span className="form-label">คุณภาพสินค้า</span>
            <RatingDisplay val={doc.qualityProduct} />
          </div>
          <div>
            <span className="form-label">คุณภาพงานขาย</span>
            <RatingDisplay val={doc.qualitySales} />
          </div>
          <div>
            <span className="form-label">คุณภาพการติดตั้ง</span>
            <RatingDisplay val={doc.qualityInstall} />
          </div>
        </div>
      </div>

      {/* Approval chain */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-3">สายการอนุมัติ</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stepRoleConfig)
            .map(([step, role]) => ({ step: Number(step), role, label: getRoleLabel(role) }))
            .sort((a, b) => a.step - b.step)
            .map(s => {
            const log = doc.approvalLogs?.find(l => l.step === s.step)
            const isNext = s.step === nextStep && doc.status === 'pending'
            return (
              <div key={s.step} className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-xs min-w-[120px]
                ${log?.action === 'approve' ? 'border-green-300 bg-green-50' :
                  log?.action === 'reject'  ? 'border-red-300 bg-red-50' :
                  isNext                    ? 'border-yellow-300 bg-yellow-50' :
                                              'border-gray-200 bg-gray-50'}`}>
                <span className="font-medium text-gray-700">{s.label}</span>
                {log ? (
                  <>
                    <span className={log.action === 'approve' ? 'text-green-600' : 'text-red-600'}>
                      {log.action === 'approve' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
                    </span>
                    <span className="text-gray-400">{log.approver?.fullName}</span>
                    {log.comment && <span className="text-gray-500 italic">{log.comment}</span>}
                  </>
                ) : isNext ? (
                  <span className="text-yellow-600">รออนุมัติ</span>
                ) : (
                  <span className="text-gray-400">รอดำเนินการ</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <AttachmentsSection
        attachments={doc.attachments ?? []}
        docField="handOverJobId"
        docId={id}
        onRefresh={load}
      />

      {/* Action area */}
      {(canSubmit || canResubmit || canApprove) && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          <textarea
            className="form-input"
            rows={2}
            placeholder="หมายเหตุ/ความคิดเห็น (ถ้ามี)"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            {(canSubmit || canResubmit) && (
              <button className="btn-primary" disabled={acting} onClick={() => act('submit')}>
                <SendHorizonal size={15} /> {canResubmit ? 'ส่งอนุมัติอีกครั้ง' : 'ส่งอนุมัติ'}
              </button>
            )}
            {canApprove && (
              <>
                <button className="btn-success" disabled={acting} onClick={() => act('approve')}>
                  <CheckCircle size={15} /> อนุมัติ
                </button>
                <button className="btn-danger" disabled={acting} onClick={() => act('reject')}>
                  <XCircle size={15} /> ปฏิเสธ
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
