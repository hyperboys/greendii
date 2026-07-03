'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { WorkOrdersAPI, SettingsAPI, downloadBlob, resolveFileUrl } from '@/lib/api'
import { DEFAULT_APPROVAL_FLOW } from '@/types'
import type { WorkOrder, Settings } from '@/types'
import WorkOrderPrint from '@/components/WorkOrderPrint'
import { STATUS_LABELS } from '@/types'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import { normalizeUserRole } from '@/lib/roleAliases'
import { getWorkOrderItemsSource } from '@/lib/workOrderItems'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Pencil, Printer, Trash2, Loader2, Eye, X, ExternalLink, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import toast from 'react-hot-toast'
import WorkOrderAttachmentsSection from '@/components/WorkOrderAttachmentsSection'
import ApprovalFlowSteps from '@/components/ApprovalFlowSteps'

const WO_APPROVED_PO_ATTACH_ROLES_KEY = 'workOrderApprovedPoAttachRoles'
const DEFAULT_WO_APPROVED_PO_ATTACH_ROLES = ['sales', 'coordinator']

const CHECKLIST_GROUPS = {
  team: [
    { label: 'ส่งของอย่างเดียว', key: 'team_delivery_only' },
    { label: 'ทีมพื้น', key: 'team_floor' },
    { label: 'ทีมโรงงาน 2', key: 'team_factory2' },
    { label: 'ทีมติดตั้ง', key: 'team_install' },
    { label: 'ทีมประตู', key: 'team_door' },
    { label: 'ผู้รับเหมา', key: 'team_contractor' },
  ],
  docs: [
    { label: 'PR', key: 'doc_pr' },
    { label: 'Quotation', key: 'doc_quotation' },
    { label: 'Min', key: 'doc_min' },
    { label: 'Drawing Confirm', key: 'doc_drawing_confirm' },
    { label: 'Other', key: 'doc_other' },
    { label: 'PO', key: 'doc_po' },
    { label: 'Waiting Confirm', key: 'doc_waiting_confirm' },
    { label: 'Hand Over Job', key: 'doc_handover' },
    { label: 'Check List', key: 'doc_checklist' },
  ],
} as const

const DEFAULT_DOC_CHECKLIST: Record<string, boolean> = Object.fromEntries(
  [...CHECKLIST_GROUPS.team, ...CHECKLIST_GROUPS.docs].map(item => [item.key, false]),
)

export default function WorkOrderDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const { stepRoleConfig, getRoleLabel, hasPerm } = useSettingsStore()
  const [doc, setDoc] = useState<WorkOrder | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [approvalChecklist, setApprovalChecklist] = useState<Record<string, boolean>>({ ...DEFAULT_DOC_CHECKLIST })
  const [poAmount, setPoAmount] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = () => {
    setLoading(true)
    WorkOrdersAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { SettingsAPI.get().then(setSettings).catch(() => {}) }, [])
  useEffect(() => {
    setApprovalChecklist({ ...DEFAULT_DOC_CHECKLIST, ...(doc?.docChecklist ?? {}) })
  }, [doc])

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

  const previewQuotationId = doc?.quotationId
  const previewHandoverId = doc?.handOverJobs?.[0]?.id
  const previewToken = typeof window !== 'undefined' ? localStorage.getItem('gd_token') || '' : ''
  const quotationPreviewUrl = previewQuotationId
    ? `/print/quotation/${previewQuotationId}${previewToken ? `?token=${encodeURIComponent(previewToken)}` : ''}`
    : ''
  const handoverPreviewUrl = previewHandoverId
    ? `/print/handover/${previewHandoverId}${previewToken ? `?token=${encodeURIComponent(previewToken)}` : ''}`
    : ''

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const isAdmin = ['admin', 'director', 'admin_mgr'].includes(user?.role ?? '')
  const canEdit = (isMine || isAdmin) && isEditableApprovalDocStatus(doc.status)
  const canSubmit = isMine && doc.status === 'draft'
  const canResubmit = isMine && doc.status === 'rejected'
  const canDelete = (isMine || isAdmin) && isEditableApprovalDocStatus(doc.status)
  const canManageAttachments = (isMine || isAdmin) && isEditableApprovalDocStatus(doc.status)
  const approvedPoAttachRolesRaw = settings?.approvalFlowConfig?.[WO_APPROVED_PO_ATTACH_ROLES_KEY]
  const approvedPoAttachRoles = (
    Array.isArray(approvedPoAttachRolesRaw) && approvedPoAttachRolesRaw.length > 0
      ? approvedPoAttachRolesRaw
      : DEFAULT_WO_APPROVED_PO_ATTACH_ROLES
  ).map(role => normalizeUserRole(String(role)))
  const canUploadPoAfterApproved = doc.status === 'approved'
    && approvedPoAttachRoles.includes(normalizeUserRole(user?.role))
  const canManageAttachmentsInCurrentState = canManageAttachments || canUploadPoAfterApproved
  const editableAttachmentCategories: Array<'other' | 'drawing' | 'mom' | 'po'> | undefined = canManageAttachments
    ? undefined
    : (canUploadPoAfterApproved ? ['po'] : [])
  const canEmailWorkOrder = hasPerm('workorder_email_view', user?.role ?? '')

  const currentStep = doc.approvalStep
  const currentStepRole = stepRoleConfig[String(currentStep)]
  const canApprove = doc.status === 'pending' && normalizeUserRole(currentStepRole) === normalizeUserRole(user?.role)
  const canEditTeamChecklistOnApprove = canApprove
    && normalizeUserRole(user?.role) === 'project_mgr'
    && normalizeUserRole(currentStepRole) === 'project_mgr'
  const checklist = approvalChecklist
  const workOrderItems = getWorkOrderItemsSource(doc)
  const checklistItemClass = (checked: boolean) =>
    `inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${checked
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-gray-200 bg-white text-gray-700'}`

  const workOrderFlowSteps = settings?.approvalFlowConfig?.workOrder?.length
    ? settings.approvalFlowConfig.workOrder
    : DEFAULT_APPROVAL_FLOW.workOrder
  const selectedHandover = doc.handOverJobs?.[0]
  const mergedPdfParts = [
    `1. WorkOrder: ${doc.woNo || '-'}`,
    doc.quotation?.quoNo ? `2. Quotation: ${doc.quotation.quoNo}` : '2. Quotation: -',
    selectedHandover?.hoNo ? `3. HandOver: ${selectedHandover.hoNo}` : '3. HandOver: -',
    `4. เอกสารแนบ PDF: ${(doc.attachments ?? []).filter(a => a.mimeType === 'application/pdf').length} ไฟล์`,
  ]
  const previewAttachments = doc.attachments ?? []

  const act = async (action: 'submit' | 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm('ยืนยันการลบ/ยกเลิกเอกสารนี้?')) return
    setActing(true)
    try {
      if (action === 'submit') await WorkOrdersAPI.submit(id, comment)
      else if (action === 'approve') await WorkOrdersAPI.approve(id, comment, canEditTeamChecklistOnApprove ? checklist : undefined)
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

  const toggleTeamChecklistOnApprove = (key: string) => {
    if (!canEditTeamChecklistOnApprove) return
    if (!CHECKLIST_GROUPS.team.some(item => item.key === key)) return
    setApprovalChecklist(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
    <WorkOrderPrint doc={doc} settings={settings} />
    <div className="screen-only max-w-4xl mx-auto space-y-5">
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
        {canEmailWorkOrder && (
          <button className="btn-outline btn-sm" onClick={() => router.push(`/workorders/email?woId=${id}`)}>
            ส่งอีเมล
          </button>
        )}
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
            const blob = await WorkOrdersAPI.pdf(id)
            downloadBlob(blob, `${doc.woNo || 'workorder'}.pdf`)
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
        <div><span className="form-label">ลูกค้า</span><p>{doc.customerName}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.contactName || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.contactTel || '-'}</p></div>
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">สถานที่</span><p>{doc.location || '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">ใบเสนอราคา</span><p>{doc.quotation?.quoNo || '-'}</p></div>
        <div><span className="form-label">HandOver</span><p>{doc.handOverJobs?.[0]?.hoNo || '-'}</p></div>
        <div><span className="form-label">สินค้า/บริการ</span><p>{doc.products || '-'}</p></div>
        <div><span className="form-label">ผู้รับผิดชอบ</span><p>{doc.responsibility || '-'}</p></div>
        <div><span className="form-label">ทีมงาน</span><p>{doc.teamAssignment || '-'}</p></div>
        <div><span className="form-label">วันติดตั้ง</span><p>{doc.installDate ? new Date(doc.installDate).toLocaleDateString('en-GB') : '-'}</p></div>
        <div><span className="form-label">วัน QC</span><p>{doc.qcDate ? new Date(doc.qcDate).toLocaleDateString('en-GB') : '-'}</p></div>
        {doc.remark && <div className="col-span-full"><span className="form-label">หมายเหตุ</span><p>{doc.remark}</p></div>}
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">ทีมงาน (ใบ Work Order)</h3>
          {canEditTeamChecklistOnApprove && (
            <p className="mb-2 text-xs text-emerald-700">Project Manager สามารถเลือกทีมงานก่อนกดอนุมัติได้</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {CHECKLIST_GROUPS.team.map(item => (
              <label key={item.key} className={checklistItemClass(!!checklist[item.key])}>
                <input
                  type="checkbox"
                  checked={!!checklist[item.key]}
                  onChange={() => toggleTeamChecklistOnApprove(item.key)}
                  disabled={!canEditTeamChecklistOnApprove}
                  className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">เอกสารประกอบ (ใบ Work Order)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {CHECKLIST_GROUPS.docs.map(item => (
              <label key={item.key} className={checklistItemClass(!!checklist[item.key])}>
                <input
                  type="checkbox"
                  checked={!!checklist[item.key]}
                  readOnly
                  disabled
                  className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <WorkOrderAttachmentsSection
        attachments={doc.attachments ?? []}
        docField="workOrderId"
        docId={id}
        onRefresh={load}
        readOnly={!canManageAttachmentsInCurrentState}
        readOnlyMessage={canUploadPoAfterApproved ? 'แนบเพิ่มได้เฉพาะ PO ตามสิทธิ์ role ที่ตั้งค่าไว้' : undefined}
        allowedCategories={editableAttachmentCategories}
        poAmount={poAmount}
        onPoAmountChange={setPoAmount}
      />

      {/* Quotation items / Details of Work */}
      {workOrderItems.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3">
            รายการงาน {doc.quotation?.quoNo ? `— อ้างอิงจากใบเสนอราคา ${doc.quotation.quoNo}` : ''}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="border px-2 py-1.5 w-8 text-center">#</th>
                  <th className="border px-2 py-1.5 text-left">รายละเอียด</th>
                  <th className="border px-2 py-1.5 w-16 text-right">จำนวน</th>
                  <th className="border px-2 py-1.5 w-16 text-center">หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {workOrderItems.map((item, i) => (
                  <tr key={i} className="border-b">
                    <td className="border px-2 py-1.5 text-center text-gray-500">{(item.seq !== undefined ? item.seq : i) + 1}</td>
                    <td className="border px-2 py-1.5">
                      <div>{item.desc}</div>
                      {item.note && <div className="whitespace-pre-line text-xs text-gray-400">{item.note}</div>}
                      {Array.isArray(item.images) && item.images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.images.map((url, imageIndex) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={`${i}-${imageIndex}`}
                              src={resolveFileUrl(url)}
                              alt="รูปประกอบจากใบเสนอราคา"
                              className="h-24 w-24 rounded border border-gray-200 object-contain bg-white p-1"
                            />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="border px-2 py-1.5 text-right">{item.qty}</td>
                    <td className="border px-2 py-1.5 text-center">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval chain */}
      <div>
        <ApprovalFlowSteps
          title="สายการอนุมัติ"
          steps={workOrderFlowSteps}
          currentStep={currentStep}
          status={doc.status}
          approvalLogs={doc.approvalLogs}
          stepRoleConfig={stepRoleConfig}
          getRoleLabel={getRoleLabel}
          creatorName={doc.sales?.fullName ?? doc.salesId}
          showSubmitState
        />
        {doc.approvalLogs && doc.approvalLogs.length > 0 && (
          <div className="mt-3 space-y-1">
            {doc.approvalLogs.map(log => (
              <div key={log.id} className="text-xs text-gray-500 flex gap-2">
                <span className={
                  log.action === 'approve'
                    ? 'text-green-dark'
                    : log.action === 'reject'
                      ? 'text-red-500'
                      : 'text-blue-600'
                }>
                  {log.action === 'approve' ? '✓' : log.action === 'reject' ? '✕' : '↗'}
                </span>
                <span>{log.approver?.fullName ?? log.approverId}</span>
                {log.comment && <span className="text-gray-400">— {log.comment}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {(canSubmit || canResubmit || canApprove) && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          {canEditTeamChecklistOnApprove && (
            <p className="text-xs text-emerald-700">ค่าทีมงานจะถูกบันทึกพร้อมการอนุมัติ</p>
          )}
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
    {previewOpen && (
      <div className="quotation-preview-modal fixed inset-0 z-50 flex flex-col bg-gray-950/75 p-2 sm:p-4 lg:p-6">
        <div className="quotation-preview-toolbar flex flex-wrap items-center gap-2 rounded-t-lg border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800">พรีวิวใบสั่งงาน (Work Order)</div>
            <div className="truncate text-xs text-gray-500">{doc.woNo} · {doc.project}</div>
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
          <div className="mx-auto mb-3 w-full max-w-[210mm] rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold text-gray-700">ลำดับเอกสารที่รวมใน PDF</div>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {mergedPdfParts.map((part, index) => (
                <li key={index}>{part}</li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[210mm] bg-white">
            <WorkOrderPrint doc={doc} settings={settings} embedPdfAttachments={false} fastPreview />
          </div>
          <div className="mx-auto mt-3 w-full max-w-[210mm] rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-gray-800">เอกสารอ้างอิงที่ผูกไว้</div>
            <div className="space-y-3">
              <div className="rounded-md border border-gray-200 p-3">
                <div className="mb-2 text-xs font-medium text-gray-700">ใบเสนอราคา {doc.quotation?.quoNo ? `(${doc.quotation.quoNo})` : ''}</div>
                {!doc.quotationId ? (
                  <div className="text-xs text-gray-500">ไม่ได้ผูกใบเสนอราคา</div>
                ) : (
                  <a
                    href={quotationPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    เปิดไฟล์ <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="rounded-md border border-gray-200 p-3">
                <div className="mb-2 text-xs font-medium text-gray-700">HandOver {selectedHandover?.hoNo ? `(${selectedHandover.hoNo})` : ''}</div>
                {!selectedHandover?.id ? (
                  <div className="text-xs text-gray-500">ไม่ได้ผูก HandOver</div>
                ) : (
                  <a
                    href={handoverPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    เปิดไฟล์ <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mx-auto mt-3 w-full max-w-[210mm] rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Paperclip size={14} /> ไฟล์แนบทั้งหมด
            </div>
            {previewAttachments.length === 0 ? (
              <div className="text-xs text-gray-500">ไม่มีไฟล์แนบ</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {previewAttachments.map(att => {
                  const url = resolveFileUrl(att.fileUrl || '')
                  const isImage = !!att.mimeType?.startsWith('image/')
                  const isPdf = att.mimeType === 'application/pdf'
                  const name = att.originalName || att.fileUrl || 'attachment'
                  return (
                    <div key={att.id} className="rounded-md border border-gray-200 p-2">
                      {isImage ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <ImageIcon size={14} />
                            <span className="truncate">{name}</span>
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={name}
                            loading="lazy"
                            className="max-h-64 w-full rounded border border-gray-100 bg-white object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <FileText size={14} />
                              <span className="truncate">{name}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-gray-400">{isPdf ? 'PDF' : (att.mimeType || 'ไฟล์แนบ')}</div>
                          </div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            เปิดไฟล์ <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
