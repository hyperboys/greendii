'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { WorkOrdersAPI, QuotationsAPI, resolveFileUrl } from '@/lib/api'
import { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import type { Quotation, Attachment } from '@/types'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import DateInput from '@/components/DateInput'
import AttachmentsSection from '@/components/AttachmentsSection'

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
    { label: 'PO', key: 'doc_po' },
    { label: 'PR', key: 'doc_pr' },
    { label: 'Quotation', key: 'doc_quotation' },
    { label: 'Min', key: 'doc_min' },
    { label: 'Drawing Confirm', key: 'doc_drawing_confirm' },
    { label: 'Waiting Confirm', key: 'doc_waiting_confirm' },
    { label: 'Hand Over Job', key: 'doc_handover' },
    { label: 'Check List', key: 'doc_checklist' },
  ],
} as const

const DEFAULT_DOC_CHECKLIST: Record<string, boolean> = Object.fromEntries(
  [...CHECKLIST_GROUPS.team, ...CHECKLIST_GROUPS.docs].map(item => [item.key, false]),
)

interface FormData {
  quotationId: string
  customerName: string
  contactName: string
  contactTel: string
  project: string
  location: string
  products: string
  responsibility: string
  teamAssignment: string
  installDate: string
  qcDate: string
  remark: string
  docChecklist: Record<string, boolean>
}

export default function EditWorkOrderPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', customerName: '', contactName: '', contactTel: '',
    project: '', location: '', products: '', responsibility: '',
    teamAssignment: '', installDate: '', qcDate: '', remark: '',
    docChecklist: { ...DEFAULT_DOC_CHECKLIST },
  })

  useEffect(() => {
    Promise.all([
      QuotationsAPI.list({ status: 'approved' }),
      WorkOrdersAPI.get(id),
    ])
      .then(([qList, doc]) => {
        setQuotations(qList)
        if (!isEditableApprovalDocStatus(doc.status)) {
          toast.error(EDITABLE_APPROVAL_DOC_MESSAGE)
          router.replace(`/workorders/${id}`)
          return
        }
        setAttachments(doc.attachments ?? [])
        setForm({
          quotationId: doc.quotationId ?? '',
          customerName: doc.customerName ?? '',
          contactName: doc.contactName ?? '',
          contactTel: doc.contactTel ?? '',
          project: doc.project ?? '',
          location: doc.location ?? '',
          products: doc.products ?? '',
          responsibility: doc.responsibility ?? '',
          teamAssignment: doc.teamAssignment ?? '',
          installDate: doc.installDate ? doc.installDate.slice(0, 10) : '',
          qcDate: doc.qcDate ? doc.qcDate.slice(0, 10) : '',
          remark: doc.remark ?? '',
          docChecklist: { ...DEFAULT_DOC_CHECKLIST, ...(doc.docChecklist ?? {}) },
        })
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [id])

  const handleQuotation = (qId: string) => {
    const q = quotations.find(x => x.id === qId)
    setForm(f => ({
      ...f,
      quotationId: qId,
      customerName: q?.customerName ?? f.customerName,
      project: q?.project ?? f.project,
      contactName: q?.attn ?? f.contactName,
      contactTel: q?.tel ?? f.contactTel,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName || !form.project) {
      toast.error('กรุณากรอกลูกค้าและโครงการ')
      return
    }
    setSaving(true)
    try {
      await WorkOrdersAPI.update(id, form)
      toast.success('บันทึกสำเร็จ')
      router.push(`/workorders/${id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const f = (key: keyof FormData) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  })

  const toggleChecklist = (key: string) => {
    setForm(prev => ({
      ...prev,
      docChecklist: {
        ...prev.docChecklist,
        [key]: !prev.docChecklist[key],
      },
    }))
  }
  const checklistItemClass = (checked: boolean) =>
    `inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${checked
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`

  const reloadAttachments = () => {
    WorkOrdersAPI.get(id)
      .then(doc => setAttachments(doc.attachments ?? []))
      .catch(() => {})
  }

  const selectedQuotation = quotations.find(q => q.id === form.quotationId)

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">แก้ไขใบสั่งงาน (WO)</h2>
      </div>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="form-label">อ้างอิงใบเสนอราคา (ถ้ามี)</label>
          <select className="form-input" value={form.quotationId} onChange={e => handleQuotation(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {quotations.map(q => <option key={q.id} value={q.id}>{q.quoNo} — {q.customerName}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">ลูกค้า *</label>
          <input className="form-input" required {...f('customerName')} />
        </div>
        <div>
          <label className="form-label">โครงการ *</label>
          <input className="form-input" required {...f('project')} />
        </div>
        <div>
          <label className="form-label">ผู้ติดต่อ</label>
          <input className="form-input" {...f('contactName')} />
        </div>
        <div>
          <label className="form-label">โทร</label>
          <input className="form-input" {...f('contactTel')} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">สถานที่</label>
          <input className="form-input" {...f('location')} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">สินค้า/บริการ</label>
          <input className="form-input" {...f('products')} />
        </div>
        <div>
          <label className="form-label">ผู้รับผิดชอบ</label>
          <input className="form-input" {...f('responsibility')} />
        </div>
        <div>
          <label className="form-label">ทีมงาน</label>
          <input className="form-input" {...f('teamAssignment')} />
        </div>
        <div>
          <label className="form-label">วันติดตั้ง</label>
          <DateInput value={form.installDate}
            onChange={iso => setForm(prev => ({ ...prev, installDate: iso }))} />
        </div>
        <div>
          <label className="form-label">วัน QC</label>
          <DateInput value={form.qcDate}
            onChange={iso => setForm(prev => ({ ...prev, qcDate: iso }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">หมายเหตุ</label>
          <textarea className="form-input" rows={2} {...f('remark')} />
        </div>
        <div className="md:col-span-2 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 via-white to-sky-50/30 p-4 space-y-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">ทีมงาน (ใบ Work Order)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {CHECKLIST_GROUPS.team.map(item => (
                <label key={item.key} className={checklistItemClass(!!form.docChecklist[item.key])}>
                  <input
                    type="checkbox"
                    checked={!!form.docChecklist[item.key]}
                    onChange={() => toggleChecklist(item.key)}
                    className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">เอกสารประกอบ (ใบ Work Order)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              {CHECKLIST_GROUPS.docs.map(item => (
                <label key={item.key} className={checklistItemClass(!!form.docChecklist[item.key])}>
                  <input
                    type="checkbox"
                    checked={!!form.docChecklist[item.key]}
                    onChange={() => toggleChecklist(item.key)}
                    className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedQuotation?.items && selectedQuotation.items.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-gray-800">
            รายละเอียดใบเสนอราคา {selectedQuotation.quoNo}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="w-8 border px-2 py-1.5 text-center">#</th>
                  <th className="border px-2 py-1.5 text-left">รายละเอียด</th>
                  <th className="w-16 border px-2 py-1.5 text-right">จำนวน</th>
                  <th className="w-16 border px-2 py-1.5 text-center">หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuotation.items.map((item, i) => (
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
                              className="h-24 w-24 rounded border border-gray-200 bg-white p-1 object-contain"
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

      <AttachmentsSection
        attachments={attachments}
        docField="workOrderId"
        docId={id}
        onRefresh={reloadAttachments}
      />

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
        </button>
      </div>
    </form>
  )
}
