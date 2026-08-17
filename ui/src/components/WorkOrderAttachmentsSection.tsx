'use client'

import { useEffect, useRef, useState } from 'react'
import { UploadAPI, resolveFileUrl } from '@/lib/api'
import { APPROVAL_ATTACHMENT_LOCK_MESSAGE } from '@/lib/approvalFlowRules'
import { decodeDisplayFileName } from '@/lib/filename'
import type { Attachment } from '@/types'
import { Paperclip, Trash2, FileText, Image as ImageIcon, File, FileSpreadsheet, PenTool, ClipboardList, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export interface PendingAttachment {
  id: string
  category: string
  file: File
}

interface DeleteDialogState {
  id: string
  displayName: string
  isPending: boolean
  downloadUrl: string
  hasDownloaded: boolean
}

interface Props {
  /** Saved attachments (immediate mode — requires docId). */
  attachments?: Attachment[]
  docField: 'quotationId' | 'workOrderId' | 'purchaseRequestId' | 'handOverJobId'
  /** When provided, files upload immediately. When empty, the component runs in deferred mode. */
  docId?: string
  onRefresh?: () => void
  /** Deferred mode: files chosen before the document exists (e.g. create page). */
  pending?: PendingAttachment[]
  onPendingChange?: (files: PendingAttachment[]) => void
  readOnly?: boolean
  readOnlyMessage?: string
  allowedCategories?: CategoryKey[]
  poAmount?: string
  onPoAmountChange?: (value: string) => void
}

const CATEGORIES = [
  { key: 'po',      label: 'PO (Purchase Order)', accept: '.pdf,.jpg,.jpeg,.png',                           hint: 'PDF, JPG, PNG',         Icon: FileSpreadsheet },
  { key: 'drawing', label: 'Drawing / แบบ',       accept: '.pdf,.dwg,.dxf,image/*',  hint: 'PDF, รูปภาพ, CAD',      Icon: PenTool         },
  { key: 'mom',     label: 'Min',                 accept: '.pdf,.doc,.docx,image/*', hint: 'PDF, รูปภาพ, Word',     Icon: ClipboardList   },
  { key: 'other',   label: 'อื่นๆ (Other)',         accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,image/*', hint: 'PDF, รูปภาพ, Office, ZIP', Icon: File },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon size={13} className="text-blue-400 shrink-0" />
  if (mime === 'application/pdf') return <FileText size={13} className="text-red-400 shrink-0" />
  return <File size={13} className="text-gray-400 shrink-0" />
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatThousands(intPart: string) {
  const normalized = intPart.replace(/^0+(\d)/, '$1') || '0'
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function sanitizePoAmountInput(value: string) {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const dotIndex = cleaned.indexOf('.')
  if (dotIndex < 0) return cleaned
  const intPart = cleaned.slice(0, dotIndex)
  const decPart = cleaned.slice(dotIndex + 1).replace(/\./g, '')
  return `${intPart}.${decPart}`
}

function formatPoAmountInput(value: string, forceTwoDecimals = false) {
  const raw = sanitizePoAmountInput(value)
  if (!raw) return ''

  const hasDot = raw.includes('.')
  const endsWithDot = raw.endsWith('.')
  const [intRaw, decRaw = ''] = raw.split('.')
  const intFormatted = formatThousands(intRaw || '0')

  if (forceTwoDecimals) {
    const dec = decRaw.slice(0, 2).padEnd(2, '0')
    return `${intFormatted}.${dec}`
  }

  if (!hasDot) return intFormatted
  if (endsWithDot) return `${intFormatted}.`
  return `${intFormatted}.${decRaw.slice(0, 2)}`
}

let pendingSeq = 0
const DELETE_COMMIT_DELAY_MS = 5000

export default function AttachmentsSection({
  attachments = [],
  docField,
  docId,
  onRefresh,
  pending = [],
  onPendingChange,
  readOnly = false,
  readOnlyMessage,
  allowedCategories,
  poAmount = '',
  onPoAmountChange,
}: Props) {
  const inputRefs = useRef<Partial<Record<CategoryKey, HTMLInputElement | null>>>({})
  const dragDepthRef = useRef<Partial<Record<CategoryKey, number>>>({})
  const deleteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [uploading, setUploading] = useState<CategoryKey | null>(null)
  const [draggingCategory, setDraggingCategory] = useState<CategoryKey | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null)
  const [stagedDeleteIds, setStagedDeleteIds] = useState<string[]>([])

  const deferred = !docId
  const isCategoryAllowed = (key: CategoryKey) => !allowedCategories || allowedCategories.includes(key)
  const rawPoAmount = String(poAmount || '').replace(/,/g, '').trim()
  const parsedPoAmount = Number(rawPoAmount)
  const isPoAmountValid = rawPoAmount !== '' && Number.isFinite(parsedPoAmount) && parsedPoAmount >= 0

  useEffect(() => {
    const timers = deleteTimersRef.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

  const handleUpload = async (catKey: CategoryKey, files: File[]) => {
    if (!files.length) return
    if (readOnly) return
    if (!isCategoryAllowed(catKey)) return
    if (catKey === 'po' && !isPoAmountValid) {
      toast.error('กรุณากรอกยอดเงิน PO ก่อนแนบไฟล์')
      const el = inputRefs.current[catKey]
      if (el) el.value = ''
      return
    }

    // Deferred mode — buffer files locally until the document is created.
    if (deferred) {
      const added = files.map(file => ({ id: `p${++pendingSeq}`, category: catKey, file }))
      onPendingChange?.([...pending, ...added])
      const el = inputRefs.current[catKey]
      if (el) el.value = ''
      return
    }

    setUploading(catKey)
    try {
      await UploadAPI.upload(files, {
        [docField]: docId as string,
        category: catKey,
        ...(catKey === 'po' ? { poAmount: parsedPoAmount } : {}),
      })
      toast.success(`แนบ ${files.length} ไฟล์และบันทึกแล้ว`)
      onRefresh?.()
    } catch {
      toast.error('อัพโหลดไม่สำเร็จ')
    } finally {
      setUploading(null)
      const el = inputRefs.current[catKey]
      if (el) el.value = ''
    }
  }

  const clearDragState = (catKey: CategoryKey) => {
    dragDepthRef.current[catKey] = 0
    setDraggingCategory(prev => (prev === catKey ? null : prev))
  }

  const onDragEnterCategory = (catKey: CategoryKey, categoryLocked: boolean) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (readOnly || categoryLocked) return
    dragDepthRef.current[catKey] = (dragDepthRef.current[catKey] || 0) + 1
    setDraggingCategory(catKey)
  }

  const onDragOverCategory = (catKey: CategoryKey, categoryLocked: boolean) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (readOnly || categoryLocked) return
    event.dataTransfer.dropEffect = 'copy'
    if (draggingCategory !== catKey) setDraggingCategory(catKey)
  }

  const onDragLeaveCategory = (catKey: CategoryKey, categoryLocked: boolean) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (readOnly || categoryLocked) return
    const nextDepth = Math.max((dragDepthRef.current[catKey] || 1) - 1, 0)
    dragDepthRef.current[catKey] = nextDepth
    if (nextDepth === 0) setDraggingCategory(prev => (prev === catKey ? null : prev))
  }

  const onDropCategory = (catKey: CategoryKey, categoryLocked: boolean) => async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    clearDragState(catKey)
    if (readOnly || categoryLocked) return
    const files = Array.from(event.dataTransfer.files || [])
    if (!files.length) return
    await handleUpload(catKey, files)
  }

  const requestDelete = (id: string) => {
    if (readOnly) return
    const target = attachments.find(a => a.id === id)
    const pendingTarget = pending.find(p => p.id === id)
    if (target && !isCategoryAllowed(target.category as CategoryKey)) return
    const displayName = target
      ? decodeDisplayFileName(target.originalName || target.filename)
      : (pendingTarget?.file?.name || '')
    const downloadUrl = target ? resolveFileUrl(target.fileUrl || (target.filename ? `/uploads/${target.filename}` : '')) : ''
    setDeleteDialog({
      id,
      displayName,
      isPending: Boolean(pendingTarget),
      downloadUrl,
      hasDownloaded: Boolean(pendingTarget),
    })
  }

  const handleDialogDownload = () => {
    if (!deleteDialog?.downloadUrl) return
    const link = document.createElement('a')
    link.href = deleteDialog.downloadUrl
    link.download = deleteDialog.displayName || 'attachment'
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setDeleteDialog(prev => (prev ? { ...prev, hasDownloaded: true } : prev))
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteDialog) return
    if (readOnly) return
    const { id, isPending, displayName } = deleteDialog
    setDeleteDialog(null)
    setStagedDeleteIds(prev => (prev.includes(id) ? prev : [...prev, id]))

    const toastId = toast((toastInstance) => (
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">ย้ายไฟล์ออกจากรายการชั่วคราว</p>
          <p className="text-xs text-gray-500 truncate">
            {displayName || 'ไฟล์นี้'} จะถูกลบถาวรในอีก {DELETE_COMMIT_DELAY_MS / 1000} วินาที
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          onClick={() => {
            const timer = deleteTimersRef.current[id]
            if (timer) {
              clearTimeout(timer)
              delete deleteTimersRef.current[id]
            }
            setStagedDeleteIds(prev => prev.filter(item => item !== id))
            toast.dismiss(toastInstance.id)
            toast.success('คืนค่าไฟล์กลับมาแล้ว')
          }}
        >
          Undo
        </button>
      </div>
    ), { duration: DELETE_COMMIT_DELAY_MS })

    deleteTimersRef.current[id] = setTimeout(async () => {
      delete deleteTimersRef.current[id]
      if (isPending || deferred) {
        onPendingChange?.(pending.filter(p => p.id !== id))
        setStagedDeleteIds(prev => prev.filter(item => item !== id))
        toast.dismiss(toastId)
        toast.success('ลบไฟล์สำเร็จ')
        return
      }

      setDeleting(id)
      try {
        await UploadAPI.delete(id)
        toast.dismiss(toastId)
        toast.success('ลบไฟล์สำเร็จ')
        onRefresh?.()
      } catch {
        toast.dismiss(toastId)
        toast.error('ลบไม่สำเร็จ')
        setStagedDeleteIds(prev => prev.filter(item => item !== id))
      } finally {
        setDeleting(null)
      }
    }, DELETE_COMMIT_DELAY_MS)
  }

  return (
    <div className="card p-3 md:p-5 space-y-3 md:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-1.5 md:gap-2">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Paperclip size={16} />
          เอกสารแนบ
        </h3>
        {deferred ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
            <Clock size={12} /> ไฟล์จะถูกบันทึกเมื่อกดสร้าง/บันทึกเอกสาร
          </span>
        ) : readOnly ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            <Clock size={12} /> {readOnlyMessage || APPROVAL_ATTACHMENT_LOCK_MESSAGE}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-pale px-2.5 py-1 text-xs font-medium text-green-dark">
            <CheckCircle2 size={12} /> แนบแล้วบันทึกอัตโนมัติทันที
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {CATEGORIES.map(({ key, label, accept, hint, Icon }) => {
          const savedFiles = attachments.filter(a => a.category === key && !stagedDeleteIds.includes(a.id))
          const pendingFiles = pending.filter(p => p.category === key && !stagedDeleteIds.includes(p.id))
          const isUploading = uploading === key
          const categoryLocked = !isCategoryAllowed(key)

          return (
            <div key={key} className="space-y-2.5 md:space-y-3">
              {key === 'po' && (
                <div>
                  <label className="text-sm font-semibold text-slate-600">ยอดเงิน PO (บาท) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={poAmount}
                    onChange={e => onPoAmountChange?.(formatPoAmountInput(e.target.value))}
                    onBlur={e => onPoAmountChange?.(formatPoAmountInput(e.target.value, true))}
                    placeholder="เช่น 1,500,000.00"
                    disabled={readOnly || categoryLocked}
                    className="form-input mt-2"
                  />
                </div>
              )}

              {(key === 'drawing' || key === 'mom') && (
                <div className="hidden md:block invisible" aria-hidden="true">
                  <label className="text-sm font-semibold text-slate-600">ยอดเงิน PO (บาท) *</label>
                  <input
                    type="text"
                    disabled
                    tabIndex={-1}
                    className="form-input mt-2"
                  />
                </div>
              )}

              {/* Drop zone */}
              {readOnly || categoryLocked ? (
                <div className="min-h-[184px] border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 text-center select-none">
                  <p className="mb-2 text-[18px] leading-6 font-semibold text-slate-700 tracking-[0.01em]">{label}</p>
                  <div className="flex min-h-[122px] flex-col items-center justify-center gap-1.5">
                    <Icon size={31} className="text-slate-300" />
                    <span className="text-sm font-medium text-slate-500">เพิ่มไฟล์ไม่ได้</span>
                    <span className="text-xs text-slate-400">{categoryLocked ? 'หมวดนี้ยังไม่อนุญาตในสถานะปัจจุบัน' : 'ต้องถูก reject ก่อนจึงจะแนบเพิ่มได้'}</span>
                  </div>
                </div>
              ) : (
                <div
                  className={`min-h-[184px] border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors select-none ${draggingCategory === key ? 'border-emerald-500 bg-emerald-50/70' : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'}`}
                  onClick={() => {
                    if (isUploading) return
                    if (key === 'po' && !isPoAmountValid) {
                      toast.error('กรุณากรอกยอดเงิน PO ก่อนแนบไฟล์')
                      return
                    }
                    inputRefs.current[key]?.click()
                  }}
                  onDragEnter={onDragEnterCategory(key, categoryLocked)}
                  onDragOver={onDragOverCategory(key, categoryLocked)}
                  onDragLeave={onDragLeaveCategory(key, categoryLocked)}
                  onDrop={onDropCategory(key, categoryLocked)}
                >
                  <p className="mb-2 text-[18px] leading-6 font-semibold text-slate-700 tracking-[0.01em]">{label}</p>
                  <div className="flex min-h-[122px] flex-col items-center justify-center gap-1.5">
                    <Icon size={31} className="text-slate-300" />
                    <span className="text-sm font-medium text-blue-600">
                      {isUploading ? 'กำลังอัพโหลด…' : (draggingCategory === key ? 'ปล่อยไฟล์เพื่ออัปโหลด' : 'คลิกไฟล์')}
                    </span>
                    <span className="text-xs text-slate-400">{hint}</span>
                    <span className="text-[11px] text-slate-400">ลากไฟล์มาวางได้เช่นกัน</span>
                  </div>
                </div>
              )}

              <input
                type="file"
                multiple
                hidden
                accept={accept}
                ref={el => { inputRefs.current[key] = el }}
                onChange={e => handleUpload(key, Array.from(e.target.files || []))}
              />

              {/* Saved file list (immediate mode) */}
              {savedFiles.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {savedFiles.map(att => (
                    <li key={att.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                      {fileIcon(att.mimeType)}
                      <div className="flex-1 min-w-0">
                        {att.fileUrl ? (
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline truncate block"
                          >
                            {decodeDisplayFileName(att.originalName)}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-700 truncate block">{decodeDisplayFileName(att.originalName)}</span>
                        )}
                        <span className="text-xs text-slate-400">
                          {fmtSize(att.size)}
                          {key === 'po' && typeof att.poAmount === 'number' ? ` · ยอด PO ${att.poAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท` : ''}
                        </span>
                      </div>
                      {!readOnly && !categoryLocked && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                          onClick={() => requestDelete(att.id)}
                          disabled={deleting === att.id}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Pending file list (deferred mode) */}
              {pendingFiles.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {pendingFiles.map(p => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                      {fileIcon(p.file.type)}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700 truncate block">{p.file.name}</span>
                        <span className="text-xs text-slate-400">{fmtSize(p.file.size)} · รอบันทึก</span>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                          onClick={() => requestDelete(p.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {deleteDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="ยืนยันการลบไฟล์แนบ">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h4 className="text-base font-semibold text-gray-900">ยืนยันการลบเอกสารแนบ</h4>
              <p className="mt-1 text-sm text-gray-500">
                คุณกำลังจะลบไฟล์
                {deleteDialog.displayName ? ` "${deleteDialog.displayName}"` : ' นี้'}
              </p>
            </div>
            <div className="px-5 py-4 bg-gray-50/80 text-sm text-gray-600 space-y-3">
              <p>หากลบแล้วจะไม่สามารถเรียกคืนไฟล์เดิมได้</p>
              {!deleteDialog.isPending && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="text-sm font-medium text-amber-900">ต้องดาวน์โหลดไฟล์ก่อนจึงจะลบได้</p>
                  <p className="mt-1 text-xs text-amber-700">กดดาวน์โหลดเพื่อตรวจสอบไฟล์และปลดล็อกปุ่มลบ</p>
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                    onClick={handleDialogDownload}
                  >
                    {deleteDialog.hasDownloaded ? 'ดาวน์โหลดอีกครั้ง' : 'ดาวน์โหลดไฟล์นี้ก่อน'}
                  </button>
                </div>
              )}
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setDeleteDialog(null)}
                disabled={deleting === deleteDialog.id}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDeleteConfirmed}
                disabled={deleting === deleteDialog.id || (!deleteDialog.isPending && !deleteDialog.hasDownloaded)}
              >
                {deleting === deleteDialog.id ? 'กำลังลบ...' : 'ลบไฟล์'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


