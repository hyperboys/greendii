'use client'

import { useRef, useState } from 'react'
import { UploadAPI } from '@/lib/api'
import { APPROVAL_ATTACHMENT_LOCK_MESSAGE } from '@/lib/approvalFlowRules'
import { decodeDisplayFileName } from '@/lib/filename'
import type { Attachment } from '@/types'
import { Paperclip, Trash2, FileText, Image, File, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export interface PendingAttachment {
  id: string
  category: string
  file: File
}

interface Props {
  attachments?: Attachment[]
  docField: 'quotationId' | 'workOrderId' | 'purchaseRequestId' | 'handOverJobId'
  docId?: string
  onRefresh?: () => void
  pending?: PendingAttachment[]
  onPendingChange?: (files: PendingAttachment[]) => void
  readOnly?: boolean
  readOnlyMessage?: string
}

const CATEGORY_KEY = 'other'

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
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const deferred = !docId

  const handleUpload = async (files: File[]) => {
    if (!files.length || readOnly) return

    if (deferred) {
      const added = files.map(file => ({ id: `p${++pendingSeq}`, category: CATEGORY_KEY, file }))
      onPendingChange?.([...pending, ...added])
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      await UploadAPI.upload(files, {
        [docField]: docId as string,
        category: CATEGORY_KEY,
      })
      toast.success(`แนบ ${files.length} ไฟล์และบันทึกแล้ว`)
      onRefresh?.()
    } catch {
      toast.error('อัพโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    if (readOnly) return
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

  const savedFiles = attachments.filter(a => String(a.category || '').toLowerCase() === CATEGORY_KEY)
  const pendingFiles = pending.filter(p => String(p.category || '').toLowerCase() === CATEGORY_KEY)

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

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">อื่นๆ (Other)</p>

        {readOnly ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex flex-col items-center gap-1 bg-gray-50 text-center select-none">
            <File size={28} className="text-gray-300" />
            <span className="text-sm text-gray-500">เพิ่มไฟล์ไม่ได้</span>
            <span className="text-xs text-gray-400">{readOnlyMessage || APPROVAL_ATTACHMENT_LOCK_MESSAGE}</span>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors select-none"
            onClick={() => {
              if (uploading) return
              inputRef.current?.click()
            }}
          >
            <File size={28} className="text-gray-300" />
            <span className="text-sm text-blue-500">{uploading ? 'กำลังอัพโหลด…' : 'คลิกไฟล์'}</span>
            <span className="text-xs text-gray-400">PDF, รูปภาพ, Office, ZIP</span>
          </div>
        )}

        <input
          type="file"
          multiple
          hidden
          accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,image/*"
          ref={inputRef}
          onChange={e => handleUpload(Array.from(e.target.files || []))}
        />

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
                      {decodeDisplayFileName(att.originalName)}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-700 truncate block">{decodeDisplayFileName(att.originalName)}</span>
                  )}
                  <span className="text-xs text-gray-400">{fmtSize(att.size)}</span>
                </div>
                {!readOnly && (
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
    </div>
  )
}
