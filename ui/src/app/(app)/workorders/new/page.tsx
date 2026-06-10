'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WorkOrdersAPI, QuotationsAPI, UploadAPI, resolveFileUrl } from '@/lib/api'
import type { Quotation } from '@/types'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import DateInput from '@/components/DateInput'
import AttachmentsSection, { type PendingAttachment } from '@/components/AttachmentsSection'

const CHECKLIST_GROUPS = {
  team: [
    { key: 'team_delivery_only', label: 'ส่งของอย่างเดียว' },
    { key: 'team_floor', label: 'ทีมพื้น' },
    { key: 'team_factory2', label: 'ทีมโรงงาน 2' },
    { key: 'team_install', label: 'ทีมติดตั้ง' },
    { key: 'team_door', label: 'ทีมประตู' },
    { key: 'team_contractor', label: 'ผู้รับเหมา' },
  ],
  docs: [
    { key: 'doc_po', label: 'PO' },
    { key: 'doc_pr', label: 'PR' },
    { key: 'doc_quotation', label: 'Quotation' },
    { key: 'doc_min', label: 'Min' },
    { key: 'doc_drawing_confirm', label: 'Drawing Confirm' },
    { key: 'doc_waiting_confirm', label: 'Waiting Confirm' },
    { key: 'doc_handover', label: 'Hand Over Job' },
    { key: 'doc_checklist', label: 'Check List' },
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

export default function NewWorkOrderPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [sourceWorkOrder, setSourceWorkOrder] = useState<{ woNo: string; project: string; customerName: string } | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', customerName: '', contactName: '', contactTel: '',
    project: '', location: '', products: '', responsibility: '',
    teamAssignment: '', installDate: '', qcDate: '', remark: '',
    docChecklist: { ...DEFAULT_DOC_CHECKLIST },
  })

  useEffect(() => {
    QuotationsAPI.list({ status: 'approved' }).then(setQuotations)
  }, [])

  const handleQuotation = async (id: string) => {
    const q = quotations.find(x => x.id === id)
    setForm(f => ({
      ...f,
      quotationId: id,
      customerName: q?.customerName ?? f.customerName,
      project: q?.project ?? f.project,
      contactName: q?.attn ?? f.contactName,
      contactTel: q?.tel ?? f.contactTel,
    }))

    setSourceWorkOrder(null)
    if (!id || !q?.revisionNo || q.revisionNo <= 0) return

    try {
      const source = await WorkOrdersAPI.previousByQuotation(id)
      if (!source) return

      setSourceWorkOrder({
        woNo: source.woNo,
        project: source.project,
        customerName: source.customerName,
      })

      // Prefill with previous WO data in revision flow; user can still edit before save.
      setForm(f => ({
        ...f,
        quotationId: id,
        customerName: source.customerName || f.customerName,
        project: source.project || f.project,
        location: source.location ?? f.location,
        products: source.products ?? f.products,
        responsibility: source.responsibility ?? f.responsibility,
        contactName: source.contactName ?? f.contactName,
        contactTel: source.contactTel ?? f.contactTel,
        teamAssignment: source.teamAssignment ?? f.teamAssignment,
        installDate: source.installDate ? source.installDate.slice(0, 10) : f.installDate,
        qcDate: source.qcDate ? source.qcDate.slice(0, 10) : f.qcDate,
        remark: source.remark ?? f.remark,
        docChecklist: { ...DEFAULT_DOC_CHECKLIST, ...f.docChecklist, ...(source.docChecklist ?? {}) },
      }))
    } catch {
      // If lookup fails, keep quotation-based defaults.
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName || !form.project) { toast.error('กรุณากรอกลูกค้าและโครงการ'); return }
    setSaving(true)
    try {
      const created = await WorkOrdersAPI.create({ ...form })
      if (pendingAttachments.length > 0) {
        const byCategory = pendingAttachments.reduce<Record<string, File[]>>((acc, p) => {
          (acc[p.category] ??= []).push(p.file)
          return acc
        }, {})
        try {
          for (const [category, files] of Object.entries(byCategory)) {
            await UploadAPI.upload(files, { workOrderId: created.id, category })
          }
        } catch {
          toast.error('สร้างใบสั่งงานแล้ว แต่แนบไฟล์บางส่วนไม่สำเร็จ')
        }
      }
      toast.success('สร้างใบสั่งงานสำเร็จ')
      router.replace(`/workorders/${created.id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
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

  const selectedQuotation = quotations.find(q => q.id === form.quotationId)

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">สร้างใบสั่งงาน (WO) ใหม่</h2>
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

      {sourceWorkOrder && (
        <div className="card p-4 text-sm">
          <p className="font-medium text-gray-800">ดึงข้อมูลจาก Work Order เดิมในสายเอกสารแล้ว</p>
          <p className="mt-1 text-gray-600">อ้างอิง: {sourceWorkOrder.woNo} · {sourceWorkOrder.project} · {sourceWorkOrder.customerName}</p>
        </div>
      )}

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
        docField="workOrderId"
        pending={pendingAttachments}
        onPendingChange={setPendingAttachments}
      />

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'สร้างใบสั่งงาน'}
        </button>
      </div>
    </form>
  )
}
