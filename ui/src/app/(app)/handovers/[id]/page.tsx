'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { HandoversAPI, SettingsAPI, downloadBlob, resolveFileUrl } from '@/lib/api'
import type { HandOverJob, Settings } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useSettingsStore } from '@/store/settings'
import HandoverPrint from '@/components/HandoverPrint'
import { useAuthStore } from '@/store/auth'
import { isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Pencil, Printer, Trash2, Loader2, Eye, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function HandoverDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const { stepRoleConfig } = useSettingsStore()
  const [doc, setDoc] = useState<HandOverJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = () => {
    setLoading(true)
    HandoversAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { SettingsAPI.get().then(setSettings).catch(() => {}) }, [])

  useEffect(() => {
    if (!previewOpen) return
    const originalOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewOpen(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [previewOpen])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const isAdmin = ['admin', 'director', 'admin_mgr'].includes(user?.role ?? '')
  const canEdit = (isMine || isAdmin) && isEditableApprovalDocStatus(doc.status)
  const canSubmit = isMine && doc.status === 'draft'
  const canResubmit = isMine && doc.status === 'rejected'
  const canDelete = (isMine || isAdmin) && isEditableApprovalDocStatus(doc.status)

  const nextStep = doc.approvalStep + 1
  const nextStepRole = stepRoleConfig[String(nextStep)]
  const canApprove = doc.status === 'pending' && nextStepRole === user?.role

  const previewToken = typeof window !== 'undefined' ? (localStorage.getItem('gd_token') || '') : ''
  const previewUrl = previewToken ? `/print/handover/${id}?token=${encodeURIComponent(previewToken)}` : ''
  const quotationItems = doc.items?.length
    ? doc.items
    : (doc.quotation?.items?.length
        ? doc.quotation.items
        : (doc.workOrder?.quotation?.items || []))

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
        <button className="btn-outline btn-sm no-print" onClick={() => setPreviewOpen(true)}>
          <Eye size={14} /> พรีวิว
        </button>
        <button
          className="btn-outline btn-sm no-print"
          disabled={pdfLoading}
          onClick={async () => {
          if (pdfLoading) return
          setPdfLoading(true)
          toast.loading('กำลังสร้าง PDF…', { id: 'pdf' })
          try {
            const blob = await HandoversAPI.pdf(id)
            downloadBlob(blob, `${doc.hoNo || 'handover'}.pdf`)
            toast.success('สำเร็จ', { id: 'pdf' })
          } catch { toast.error('สร้าง PDF ไม่สำเร็จ', { id: 'pdf' }) }
          finally { setPdfLoading(false) }
        }}>
          {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
          {pdfLoading ? 'กำลังสร้าง PDF…' : 'พิมพ์'}
        </button>
        </div>
      </div>

      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">ผู้รับเหมา</span><p>{doc.contractor || '-'}</p></div>
        <div><span className="form-label">สถานที่</span><p>{doc.location || '-'}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.contactName || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.contactTel || '-'}</p></div>
        <div><span className="form-label">อ้างอิงใบเสนอราคา</span><p>{doc.quotation?.quoNo ?? doc.workOrder?.quotation?.quoNo ?? '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">สินค้า/บริการ</span><p>{doc.product || '-'}</p></div>
        <div><span className="form-label">ผู้รับผิดชอบ</span><p>{doc.responsibility || '-'}</p></div>
        <div><span className="form-label">วันให้บริการ</span><p>{doc.serviceDate ? new Date(doc.serviceDate).toLocaleDateString('en-GB') : '-'}</p></div>
        {doc.comment && <div className="col-span-full"><span className="form-label">ความคิดเห็น</span><p>{doc.comment}</p></div>}
      </div>

      {quotationItems.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3">รายละเอียดงานจากใบเสนอราคา</h3>
          <div className="space-y-4">
            {quotationItems.map((item, idx) => (
              <div key={item.id || idx} className="border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-800 mb-1">{idx + 1}. {item.desc}</div>
                <div className="text-xs text-gray-500 mb-2">จำนวน: {item.qty} {item.unit}</div>
                {item.images && item.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={resolveFileUrl(url)} alt="quotation item" className="w-28 h-28 object-cover rounded border" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
    {previewOpen && (
      <div className="quotation-preview-modal fixed inset-0 z-50 flex flex-col bg-gray-950/75 p-2 sm:p-4 lg:p-6">
        <div className="quotation-preview-toolbar flex flex-wrap items-center gap-2 rounded-t-lg border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800">พรีวิวใบส่งมอบงาน (Hand Over)</div>
            <div className="truncate text-xs text-gray-500">{doc.hoNo} · {doc.project}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
            onClick={() => setPreviewOpen(false)}
            aria-label="ปิดพรีวิว"
          >
            <X size={16} />
          </button>
        </div>
        <div className="quotation-preview-frame flex-1 overflow-auto bg-gray-200 p-3 sm:p-5">
          <div className="mx-auto w-fit">
            {previewUrl ? (
              <iframe
                title={`Hand Over preview ${doc.hoNo}`}
                src={previewUrl}
                className="block h-[calc(100vh-10rem)] min-h-[297mm] w-[210mm] max-w-full border-0 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.22)]"
              />
            ) : (
              <div className="flex min-h-[297mm] w-[210mm] max-w-full items-center justify-center bg-white px-6 text-center text-sm text-gray-500 shadow-[0_12px_30px_rgba(15,23,42,0.22)]">
                ไม่สามารถโหลดพรีวิวได้ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
