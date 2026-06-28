'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Mail, Paperclip, Search, Send, Trash2, Upload } from 'lucide-react'
import { WorkOrderEmailsAPI } from '@/lib/api'
import type { WorkOrderEmailAttachment, WorkOrderEmailCandidate, WorkOrderEmailContext } from '@/types'
import EmailChipInput from '@/components/EmailChipInput'
import SimpleRichTextEditor from '@/components/SimpleRichTextEditor'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

export default function WorkOrderEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const { hasPerm } = useSettingsStore()

  const [loadingList, setLoadingList] = useState(false)
  const [sending, setSending] = useState(false)
  const [workOrders, setWorkOrders] = useState<WorkOrderEmailCandidate[]>([])
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('')
  const [context, setContext] = useState<WorkOrderEmailContext | null>(null)

  const [woNo, setWoNo] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [toEmails, setToEmails] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')

  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([])
  const [extraFiles, setExtraFiles] = useState<File[]>([])

  const canViewMenu = hasPerm('workorder_email_view', user?.role ?? '')

  const loadWorkOrders = useCallback(async () => {
    setLoadingList(true)
    try {
      const rows = await WorkOrderEmailsAPI.listApprovedWorkOrders({ woNo, customerName, dateFrom, dateTo })
      setWorkOrders(rows)
    } catch {
      toast.error('โหลดรายการ Work Order ไม่สำเร็จ')
    } finally {
      setLoadingList(false)
    }
  }, [woNo, customerName, dateFrom, dateTo])

  useEffect(() => {
    loadWorkOrders()
  }, [loadWorkOrders])

  useEffect(() => {
    const ownEmail = normalizeEmail(user?.email)
    if (!ownEmail) return
    setCcEmails(prev => (prev.includes(ownEmail) ? prev : [...prev, ownEmail]))
  }, [user?.email])

  useEffect(() => {
    if (!canViewMenu) {
      toast.error('ไม่มีสิทธิ์เข้าถึงเมนูนี้')
      router.replace('/workorders')
    }
  }, [canViewMenu, router])

  useEffect(() => {
    const woId = searchParams.get('woId')
    if (woId) setSelectedWorkOrderId(woId)
  }, [searchParams])

  useEffect(() => {
    if (!selectedWorkOrderId) {
      setContext(null)
      setSelectedAttachmentIds([])
      return
    }

    let active = true
    WorkOrderEmailsAPI.getContext(selectedWorkOrderId)
      .then((ctx) => {
        if (!active) return
        setContext(ctx)
        setSubject(ctx.defaultSubject)
        setBodyHtml(ctx.defaultBodyHtml)
        setSelectedAttachmentIds(ctx.attachments.map(att => att.id))
      })
      .catch(() => {
        if (active) toast.error('โหลดข้อมูลเอกสารประกอบไม่สำเร็จ')
      })
    return () => { active = false }
  }, [selectedWorkOrderId])

  const fetchSuggestions = useCallback(async (query: string, customerId?: string | null) => {
    const rows = await WorkOrderEmailsAPI.history({ q: query, customerId: customerId || undefined, limit: 8 })
    return rows.map(row => row.email)
  }, [])

  const selectedAttachments = useMemo<WorkOrderEmailAttachment[]>(() => {
    if (!context) return []
    return context.attachments.filter(att => selectedAttachmentIds.includes(att.id))
  }, [context, selectedAttachmentIds])

  const totalAttachmentSize = useMemo(() => {
    const selectedSize = selectedAttachments.reduce((sum, att) => sum + (att.size || 0), 0)
    const extraSize = extraFiles.reduce((sum, f) => sum + f.size, 0)
    return selectedSize + extraSize
  }, [selectedAttachments, extraFiles])

  const submit = async () => {
    if (!selectedWorkOrderId) return toast.error('กรุณาเลือก Work Order')
    if (!toEmails.length) return toast.error('กรุณาระบุผู้รับอย่างน้อย 1 คน')
    if (!subject.trim()) return toast.error('กรุณาระบุ Subject')

    const fd = new FormData()
    fd.append('workOrderId', selectedWorkOrderId)
    fd.append('to', JSON.stringify(toEmails))
    fd.append('cc', JSON.stringify(ccEmails))
    fd.append('bcc', JSON.stringify(bccEmails))
    fd.append('subject', subject)
    fd.append('bodyHtml', bodyHtml)
    fd.append('selectedAttachmentIds', JSON.stringify(selectedAttachmentIds))
    extraFiles.forEach(file => fd.append('extraFiles', file))

    setSending(true)
    try {
      const result = await WorkOrderEmailsAPI.send(fd)
      toast.success(`${result.message} (${result.recipientCount} ผู้รับ)`)
      if (result.historySynced === false) {
        toast.error('ส่งเมลสำเร็จ แต่บันทึก Email History ไม่สมบูรณ์ (สามารถ Re-sync ได้จาก Email Log)')
      }
      setToEmails([])
      setCcEmails([])
      setBccEmails([])
      setExtraFiles([])
    } catch (e) {
      toast.error(typeof e === 'string' ? e : 'ส่งอีเมลไม่สำเร็จ')
    } finally {
      setSending(false)
    }
  }

  if (!canViewMenu) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="page-title">ส่งอีเมล Work Order</h2>
            <p className="page-sub">เลือก Work Order ที่อนุมัติแล้ว แล้วส่งอีเมลพร้อมไฟล์แนบให้ทีมงานภายใน</p>
          </div>
        </div>
        <button className="btn-outline" onClick={loadWorkOrders}>
          <Search size={14} /> ค้นหาใหม่
        </button>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input className="form-input" placeholder="เลขที่ WO" value={woNo} onChange={e => setWoNo(e.target.value)} />
        <input className="form-input" placeholder="ชื่อลูกค้า" value={customerName} onChange={e => setCustomerName(e.target.value)} />
        <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button className="btn-primary" onClick={loadWorkOrders}>
          <Search size={14} /> ค้นหา
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-5">
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
            รายการ Work Order (Approved / Completed)
          </div>
          <div className="overflow-auto max-h-[640px]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>WO No.</th>
                  <th>โครงการ</th>
                  <th>ฝ่ายขาย</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">กำลังโหลด...</td></tr>
                ) : workOrders.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">ไม่พบ Work Order</td></tr>
                ) : workOrders.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedWorkOrderId(row.id)}
                    className={`cursor-pointer ${selectedWorkOrderId === row.id ? 'bg-green-pale/40' : ''}`}
                  >
                    <td className="font-mono text-xs font-semibold text-blue-700">{row.woNo}</td>
                    <td className="max-w-[240px] truncate">{row.project}</td>
                    <td>{row.sales?.fullName || '-'}</td>
                    <td>
                      <span className={`badge ${row.workflowStatus === 'Completed' ? 'badge-approved' : 'badge-pending'}`}>
                        {row.workflowStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Mail size={16} /> Compose Email</h3>
            <span className="text-xs text-gray-500">{context?.workOrder.woNo || '-'}</span>
          </div>

          <EmailChipInput
            label="To"
            value={toEmails}
            onChange={setToEmails}
            customerId={context?.customerId}
            fetchSuggestions={fetchSuggestions}
          />
          <EmailChipInput
            label="CC"
            value={ccEmails}
            onChange={setCcEmails}
            customerId={context?.customerId}
            fetchSuggestions={fetchSuggestions}
          />
          <EmailChipInput
            label="BCC"
            value={bccEmails}
            onChange={setBccEmails}
            customerId={context?.customerId}
            fetchSuggestions={fetchSuggestions}
          />

          <div>
            <label className="form-label">Subject</label>
            <input className="form-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="ระบุหัวข้ออีเมล" />
          </div>

          <div>
            <label className="form-label">Body</label>
            <SimpleRichTextEditor value={bodyHtml} onChange={setBodyHtml} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
              <Paperclip size={14} /> ไฟล์แนบที่เลือก ({selectedAttachmentIds.length + extraFiles.length} ไฟล์)
            </div>
            <div className="max-h-52 overflow-auto rounded-lg border border-gray-200">
              <ul className="divide-y divide-gray-100">
                {(context?.attachments || []).map(att => {
                  const checked = selectedAttachmentIds.includes(att.id)
                  return (
                    <li key={att.id} className="px-3 py-2 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAttachmentIds(Array.from(new Set([...selectedAttachmentIds, att.id])))
                          } else {
                            setSelectedAttachmentIds(selectedAttachmentIds.filter(id => id !== att.id))
                          }
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-gray-800">{att.originalName}</p>
                        <p className="text-xs text-gray-500">
                          {att.sourceLabel} {att.sourceDocNo}
                          {att.virtualType ? ' • generated PDF' : ` • ${formatSize(att.size)}`}
                        </p>
                      </div>
                    </li>
                  )
                })}
                {context && context.attachments.length === 0 && (
                  <li className="px-3 py-4 text-sm text-gray-400">ไม่มีไฟล์แนบจากเอกสาร</li>
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <label className="form-label">แนบไฟล์เพิ่ม</label>
            <label className="btn-outline inline-flex cursor-pointer">
              <Upload size={14} /> เลือกไฟล์
              <input
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  if (!files.length) return
                  setExtraFiles(prev => [...prev, ...files])
                  e.currentTarget.value = ''
                }}
              />
            </label>
            {extraFiles.length > 0 && (
              <ul className="space-y-1 border border-gray-200 rounded-lg p-2 max-h-32 overflow-auto">
                {extraFiles.map((f, idx) => (
                  <li key={`${f.name}-${idx}`} className="text-sm flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{f.name} ({formatSize(f.size)})</span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-500"
                      onClick={() => setExtraFiles(extraFiles.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-500">ขนาดไฟล์รวมประมาณ {formatSize(totalAttachmentSize)}</p>
            <button className="btn-primary" onClick={submit} disabled={sending || !context}>
              <Send size={14} /> {sending ? 'กำลังส่ง...' : 'ส่งอีเมล'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
