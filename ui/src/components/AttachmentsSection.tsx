'use client'

import { useRef, useState } from 'react'
import { UploadAPI } from '@/lib/api'
import { APPROVAL_ATTACHMENT_LOCK_MESSAGE } from '@/lib/approvalFlowRules'
import type { Attachment } from '@/types'
import { Paperclip, Trash2, FileText, Image, File, FileSpreadsheet, PenTool, ClipboardList, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export interface PendingAttachment {
  id: string
  category: string
  file: File
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
}

const CATEGORIES = [
  { key: 'po',      label: 'PO (Purchase Order)',  accept: '.pdf,.doc,.docx,image/*', hint: 'PDF, รูปภาพ, Word',     Icon: FileSpreadsheet },
  { key: 'drawing', label: 'Drawing / แบบ',         accept: '.pdf,.dwg,.dxf,image/*',  hint: 'PDF, รูปภาพ, CAD',      Icon: PenTool         },
  { key: 'mom',     label: 'Minutes of Meeting',    accept: '.pdf,.doc,.docx,image/*', hint: 'PDF, รูปภาพ, Word',     Icon: ClipboardList   },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image size={13} className="text-blue-400 shrink-0" />
  if (mime === 'application/pdf') return <FileText size={13} className="text-red-400 shrink-0" />
  return <File size={13} className="text-gray-400 shrink-0" />
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

let pendingSeq = 0

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
}: Props) {
  const inputRefs = useRef<Partial<Record<CategoryKey, HTMLInputElement | null>>>({})
  const [uploading, setUploading] = useState<CategoryKey | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const deferred = !docId
  const isCategoryAllowed = (key: CategoryKey) => !allowedCategories || allowedCategories.includes(key)

  const handleUpload = async (catKey: CategoryKey, files: File[]) => {
    if (!files.length) return
    if (readOnly) return
    if (!isCategoryAllowed(catKey)) return

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
      await UploadAPI.upload(files, { [docField]: docId as string, category: catKey })
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

  const handleDelete = async (id: string) => {
    if (readOnly) return
    const target = attachments.find(a => a.id === id)
    if (target && !isCategoryAllowed(target.category as CategoryKey)) return
    if (deferred) {
      onPendingChange?.(pending.filter(p => p.id !== id))
      return
    }
    setDeleting(id)
    try {
      await UploadAPI.delete(id)
      toast.success('ลบไฟล์สำเร็จ')
      onRefresh?.()
    } catch {
      toast.error('ลบไม่สำเร็จ')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORIES.map(({ key, label, accept, hint, Icon }) => {
          const savedFiles = attachments.filter(a => a.category === key)
          const pendingFiles = pending.filter(p => p.category === key)
          const isUploading = uploading === key
          const categoryLocked = !isCategoryAllowed(key)

          return (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium text-gray-700">{label}</p>

              {/* Drop zone */}
              {readOnly || categoryLocked ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex flex-col items-center gap-1 bg-gray-50 text-center select-none">
                  <Icon size={28} className="text-gray-300" />
                  <span className="text-sm text-gray-500">เพิ่มไฟล์ไม่ได้</span>
                  <span className="text-xs text-gray-400">{categoryLocked ? 'หมวดนี้ยังไม่อนุญาตในสถานะปัจจุบัน' : 'ต้องถูก reject ก่อนจึงจะแนบเพิ่มได้'}</span>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors select-none"
                  onClick={() => !isUploading && inputRefs.current[key]?.click()}
                >
                  <Icon size={28} className="text-gray-300" />
                  <span className="text-sm text-blue-500">
                    {isUploading ? 'กำลังอัพโหลด…' : 'คลิกไฟล์'}
                  </span>
                  <span className="text-xs text-gray-400">{hint}</span>
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
                <ul className="space-y-1">
                  {savedFiles.map(att => (
                    <li key={att.id} className="flex items-center gap-2">
                      {fileIcon(att.mimeType)}
                      <div className="flex-1 min-w-0">
                        {att.fileUrl ? (
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline truncate block"
                          >
                            {att.originalName}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-700 truncate block">{att.originalName}</span>
                        )}
                        <span className="text-xs text-gray-400">{fmtSize(att.size)}</span>
                      </div>
                      {!readOnly && !categoryLocked && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                          onClick={() => handleDelete(att.id)}
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
                <ul className="space-y-1">
                  {pendingFiles.map(p => (
                    <li key={p.id} className="flex items-center gap-2">
                      {fileIcon(p.file.type)}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700 truncate block">{p.file.name}</span>
                        <span className="text-xs text-gray-400">{fmtSize(p.file.size)} · รอบันทึก</span>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                          onClick={() => handleDelete(p.id)}
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
    </div>
  )
}


