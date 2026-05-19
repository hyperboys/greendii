'use client'

import { useRef, useState } from 'react'
import { UploadAPI } from '@/lib/api'
import type { Attachment } from '@/types'
import { Paperclip, Trash2, FileText, Image, File, FileSpreadsheet, PenTool, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  attachments: Attachment[]
  docField: 'quotationId' | 'workOrderId' | 'purchaseRequestId' | 'handOverJobId'
  docId: string
  onRefresh: () => void
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

export default function AttachmentsSection({ attachments, docField, docId, onRefresh }: Props) {
  const inputRefs = useRef<Partial<Record<CategoryKey, HTMLInputElement | null>>>({})
  const [uploading, setUploading] = useState<CategoryKey | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleUpload = async (catKey: CategoryKey, files: File[]) => {
    if (!files.length) return
    setUploading(catKey)
    try {
      await UploadAPI.upload(files, { [docField]: docId, category: catKey })
      toast.success(`อัพโหลด ${files.length} ไฟล์สำเร็จ`)
      onRefresh()
    } catch {
      toast.error('อัพโหลดไม่สำเร็จ')
    } finally {
      setUploading(null)
      const el = inputRefs.current[catKey]
      if (el) el.value = ''
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
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
        <Paperclip size={16} />
        เอกสารแนบ
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORIES.map(({ key, label, accept, hint, Icon }) => {
          const catFiles = attachments.filter(a => a.category === key)
          const isUploading = uploading === key

          return (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium text-gray-700">{label}</p>

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors select-none"
                onClick={() => !isUploading && inputRefs.current[key]?.click()}
              >
                <Icon size={28} className="text-gray-300" />
                <span className="text-sm text-blue-500">
                  {isUploading ? 'กำลังอัพโหลด…' : 'คลิกหรือลากไฟล์'}
                </span>
                <span className="text-xs text-gray-400">{hint}</span>
              </div>

              <input
                type="file"
                multiple
                hidden
                accept={accept}
                ref={el => { inputRefs.current[key] = el }}
                onChange={e => handleUpload(key, Array.from(e.target.files || []))}
              />

              {/* File list */}
              {catFiles.length > 0 && (
                <ul className="space-y-1">
                  {catFiles.map(att => (
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
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        onClick={() => handleDelete(att.id)}
                        disabled={deleting === att.id}
                      >
                        <Trash2 size={13} />
                      </button>
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


