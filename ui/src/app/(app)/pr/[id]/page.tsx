'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PRAPI, SettingsAPI, downloadBlob, resolveFileUrl } from '@/lib/api'
import { isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import type { PurchaseRequest, Settings } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { normalizeUserRole } from '@/lib/roleAliases'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Pencil, Printer, Trash2, Loader2, Eye, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PRPrint from '@/components/PRPrint'
import ApprovalFlowSteps from '@/components/ApprovalFlowSteps'
import AttachmentsSection from '@/components/AttachmentsSection'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const DETAIL_ROWS_MARKER = '__PR_DETAIL_ROWS__'

function parseNoteParts(note?: string): { noteText: string; detailLines: string[] } {
  const raw = note ?? ''
  const markerIdx = raw.indexOf(DETAIL_ROWS_MARKER)
  if (markerIdx === -1) return { noteText: raw, detailLines: [] }
  const noteText = raw.slice(0, markerIdx).replace(/\n$/, '')
  const detailBlock = raw.slice(markerIdx + DETAIL_ROWS_MARKER.length).replace(/^\n/, '')
  const detailLines = detailBlock.length > 0 ? detailBlock.split('\n') : []
  return { noteText, detailLines }
}

export default function PRDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const { stepRoleConfig, getRoleLabel } = useSettingsStore()
  const [doc, setDoc] = useState<PurchaseRequest | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = () => {
    setLoading(true)
    PRAPI.get(id)
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
  const canRevise = isMine && doc.status === 'approved' && (doc.active ?? true)
  const currentStep = doc.approvalStep
  const currentStepRole = stepRoleConfig[String(currentStep)]
  const canApprove = doc.status === 'pending' && normalizeUserRole(currentStepRole) === normalizeUserRole(user?.role)
  const prFlowSteps = Array.isArray(doc.prType?.approvalSteps) ? doc.prType.approvalSteps : []
  const vatIncluded = Number(doc.vat ?? 0) > 0

  const previewToken = typeof window !== 'undefined' ? (localStorage.getItem('gd_token') || '') : ''
  const previewUrl = previewToken ? `/print/pr/${id}?token=${encodeURIComponent(previewToken)}` : ''

  const createRevision = async () => {
    if (!canRevise || acting) return
    setActing(true)
    try {
      const revised = await PRAPI.revise(id)
      toast.success('สร้างฉบับ Revision สำเร็จ')
      router.push(`/pr/${revised.id}/edit`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'สร้าง Revision ไม่สำเร็จ')
    } finally {
      setActing(false)
    }
  }

  const act = async (action: 'submit' | 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm('ยืนยันการลบ/ยกเลิกเอกสารนี้?')) return
    setActing(true)
    try {
      if (action === 'submit') await PRAPI.submit(id)
      else if (action === 'approve') await PRAPI.approve(id, comment)
      else if (action === 'reject') await PRAPI.reject(id, comment)
      else if (action === 'delete') { await PRAPI.cancel(id); router.push('/pr'); return }
      toast.success('ดำเนินการสำเร็จ')
      load(); setComment('')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setActing(false)
    }
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-5">
      <PRPrint doc={doc} settings={settings} />
      <div className="flex items-center gap-3 no-print">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="page-title">{doc.prNo}</h2>
            <span className={`badge badge-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
          </div>
          <p className="page-sub">{doc.customer}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button className="btn-outline btn-sm" onClick={() => router.push(`/pr/${id}/edit`)}>
              <Pencil size={14} /> แก้ไข
            </button>
          )}
          {canRevise && (
            <button className="btn-outline btn-sm" onClick={createRevision} disabled={acting}>
              <Pencil size={14} /> สร้าง Revision
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
              const blob = await PRAPI.pdf(id)
              downloadBlob(blob, `${doc.prNo || 'pr'}.pdf`)
              toast.success('สำเร็จ', { id: 'pdf' })
            } catch { toast.error('สร้าง PDF ไม่สำเร็จ', { id: 'pdf' }) }
            finally { setPdfLoading(false) }
          }}>
            {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {pdfLoading ? 'กำลังสร้าง PDF…' : 'พิมพ์'}
          </button>
          {canDelete && (
            <button className="btn-danger btn-sm" onClick={() => act('delete')} disabled={acting}>
              <Trash2 size={14} /> ลบ
            </button>
          )}
        </div>
      </div>

      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm no-print">
        <div><span className="form-label">Supplier</span><p>{doc.customer}</p></div>
        <div><span className="form-label">คนสร้าง</span><p>{doc.sales?.fullName || doc.salesId || '-'}</p></div>
        <div><span className="form-label">ประเภท PR</span><p>{doc.prType?.name || '-'}</p></div>
        <div><span className="form-label">Project Ref</span><p>{doc.projectRef || '-'}</p></div>
        <div><span className="form-label">อ้างอิง WO</span><p>{doc.workOrder?.woNo || '-'}</p></div>
        <div><span className="form-label">Date of Issue</span><p>{doc.dateIssue ? new Date(doc.dateIssue).toLocaleDateString('en-GB') : '-'}</p></div>
        <div><span className="form-label">Date of Required</span><p>{doc.dateRequired ? new Date(doc.dateRequired).toLocaleDateString('en-GB') : '-'}</p></div>
        {doc.remarks && <div className="col-span-full"><span className="form-label">Remarks</span><p>{doc.remarks}</p></div>}
      </div>

      <AttachmentsSection
        attachments={doc.attachments ?? []}
        docField="purchaseRequestId"
        docId={id}
        onRefresh={load}
        readOnly={!canEdit}
      />

      <div className="card overflow-x-auto no-print">
        <table className="data-table">
          <thead>
            <tr><th>#</th><th>P/N</th><th>รายการ</th><th className="text-right">จำนวน</th><th>หน่วย</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">จำนวนเงิน</th></tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td className="text-gray-400">{item.seq ?? i + 1}</td>
                <td className="text-gray-500 text-xs">{item.partNo || '-'}</td>
                <td>
                  {item.desc}
                  {parseNoteParts(item.note).noteText && (
                    <p className="text-xs text-gray-400 mt-0.5">{parseNoteParts(item.note).noteText}</p>
                  )}
                  {parseNoteParts(item.note).detailLines.length > 0 && (
                    <div className="mt-0.5 space-y-0.5 text-xs text-gray-400">
                      {parseNoteParts(item.note).detailLines.map((line, lineIdx) => (
                        <p key={`${item.id ?? i}-note-${lineIdx}`}>{line || '\u00a0'}</p>
                      ))}
                    </div>
                  )}
                  {Array.isArray(item.images) && item.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.images.map((url, imgIdx) => (
                        <img
                          key={`${item.id || i}-img-${imgIdx}`}
                          src={resolveFileUrl(url)}
                          alt=""
                          className="h-14 w-14 rounded border border-gray-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                </td>
                <td className="text-right">{fmtMoney(item.qty)}</td>
                <td>{item.unit}</td>
                <td className="text-right">{fmtMoney(item.price)}</td>
                <td className="text-right font-medium">{fmtMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50"><td colSpan={6} className="text-right font-semibold px-4 py-3">ยอดรวม</td><td className="text-right font-semibold px-4 py-3">฿{fmtMoney(doc.subTotal)}</td></tr>
            {Number(doc.specialDiscount) > 0 && (
              <tr className="bg-gray-50"><td colSpan={6} className="text-right text-gray-500 px-4 py-2">ส่วนลดพิเศษ</td><td className="text-right text-gray-500 px-4 py-2">-฿{fmtMoney(doc.specialDiscount)}</td></tr>
            )}
            <tr className="bg-gray-50"><td colSpan={6} className="text-right text-gray-500 px-4 py-2">VAT</td><td className="text-right text-gray-500 px-4 py-2">฿{fmtMoney(vatIncluded ? doc.vat : 0)}</td></tr>
            <tr className="bg-green-pale"><td colSpan={6} className="text-right font-bold text-green-dark px-4 py-3">ยอดสุทธิ</td><td className="text-right font-bold text-green-dark px-4 py-3 text-base">฿{fmtMoney(doc.netTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <ApprovalFlowSteps
        title="สายการอนุมัติ"
        steps={prFlowSteps}
        currentStep={currentStep}
        status={doc.status}
        approvalLogs={doc.approvalLogs}
        stepRoleConfig={stepRoleConfig}
        getRoleLabel={getRoleLabel}
        creatorName={doc.sales?.fullName ?? doc.salesId}
        showSubmitState
      />

      {(canSubmit || canResubmit || canApprove) && (
        <div className="card p-5 space-y-3 no-print">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          <textarea className="form-input" rows={2} placeholder="ความคิดเห็น"
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
    {previewOpen && (
      <div className="quotation-preview-modal fixed inset-0 z-50 flex flex-col bg-gray-950/75 p-2 sm:p-4 lg:p-6">
        <div className="quotation-preview-toolbar flex flex-wrap items-center gap-2 rounded-t-lg border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800">พรีวิวใบขอซื้อ (PR)</div>
            <div className="truncate text-xs text-gray-500">{doc.prNo} · {doc.customer}</div>
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
                title={`PR preview ${doc.prNo}`}
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
