'use client'

import { useRef, useState } from 'react'
import { UploadAPI } from '@/lib/api'
import type { Attachment } from '@/types'
import { Paperclip, Trash2, Upload, FileText, Image, File } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  attachments: Attachment[]
  docField: 'quotationId' | 'workOrderId' | 'purchaseRequestId' | 'handOverJobId'
  docId: string
  onRefresh: () => void
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image size={14} className="text-blue-400" />
  if (mime === 'application/pdf') return <FileText size={14} className="text-red-400" />
  return <File size={14} className="text-gray-400" />
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AttachmentsSection({ attachments, docField, docId, onRefresh }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      await UploadAPI.upload(files, { [docField]: docId })
      toast.success(`อัพโหลด ${files.length} ไฟล์สำเร็จ`)
      onRefresh()
    } catch {
      toast.error('อัพโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await UploadAPI.delete(id)
      toast.success('ลบไฟล์สำเร็จ')
      onRefresh()
    } catch {
      toast.error('ลบไม่สำเร็จ')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Paperclip size={16} />
          ไฟล์แนบ
          {attachments.length > 0 && (
            <span className="text-xs text-gray-400 font-normal">({attachments.length} ไฟล์)</span>
          )}
        </h3>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload size={14} />
          {uploading ? 'กำลังอัพโหลด…' : 'อัพโหลด'}
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={handleUpload} />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีไฟล์แนบ</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {attachments.map(att => (
            <li key={att.id} className="flex items-center gap-3 py-2">
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
              <button
                type="button"
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                onClick={() => handleDelete(att.id)}
                disabled={deleting === att.id}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
