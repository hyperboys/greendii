'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { HandoversAPI, QuotationsAPI } from '@/lib/api'
import { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import type { Quotation } from '@/types'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import DateInput from '@/components/DateInput'

interface FormData {
  quotationId: string
  project: string
  contractor: string
  location: string
  contactName: string
  contactTel: string
  product: string
  responsibility: string
  serviceDate: string
  qualityProduct: number
  qualitySales: number
  qualityInstall: number
  comment: string
}

const RATING_OPTIONS = [
  { value: 5, label: 'ดีมาก' },
  { value: 4, label: 'ดี' },
  { value: 3, label: 'ปานกลาง' },
  { value: 2, label: 'พอใช้' },
  { value: 1, label: 'ปรับปรุง' },
]

const RatingCheckbox = ({ label, name, value, onChange }: { label: string; name: string; value: number; onChange: (v: number) => void }) => (
  <div>
    <label className="form-label">{label}</label>
    <div className="flex flex-wrap gap-4 mt-1">
      {RATING_OPTIONS.map(opt => (
        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-green-600 w-4 h-4"
          />
          {opt.label} ({opt.value})
        </label>
      ))}
    </div>
  </div>
)

export default function EditHandoverPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', project: '', contractor: '', location: '',
    contactName: '', contactTel: '', product: '', responsibility: '',
    serviceDate: '', qualityProduct: 5, qualitySales: 5, qualityInstall: 5, comment: '',
  })

  useEffect(() => {
    QuotationsAPI.list({ status: 'approved' }).then(setQuotations)
    HandoversAPI.get(id).then(doc => {
      if (!isEditableApprovalDocStatus(doc.status)) {
        toast.error(EDITABLE_APPROVAL_DOC_MESSAGE)
        router.replace(`/handovers/${id}`)
        return
      }
      setForm({
        quotationId: doc.quotationId ?? doc.workOrder?.quotation?.id ?? '',
        project: doc.project ?? '',
        contractor: doc.contractor ?? '',
        location: doc.location ?? '',
        contactName: doc.contactName ?? '',
        contactTel: doc.contactTel ?? '',
        product: doc.product ?? '',
        responsibility: doc.responsibility ?? '',
        serviceDate: doc.serviceDate ? doc.serviceDate.slice(0, 10) : '',
        qualityProduct: doc.qualityProduct ?? 5,
        qualitySales: doc.qualitySales ?? 5,
        qualityInstall: doc.qualityInstall ?? 5,
        comment: doc.comment ?? '',
      })
      setLoading(false)
    }).catch(() => {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
      router.back()
    })
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.project) { toast.error('กรุณากรอกชื่อโครงการ'); return }
    setSaving(true)
    try {
      await HandoversAPI.update(id, form)
      toast.success('บันทึกการแก้ไขสำเร็จ')
      router.replace(`/handovers/${id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">แก้ไขเอกสารส่งมอบงาน (HO)</h2>
      </div>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">          <label className="form-label">อ้างอิงใบเสนอราคา</label>
          <select className="form-input" value={form.quotationId} onChange={e => {
            const id = e.target.value
            const q = quotations.find(x => x.id === id)
            setForm(f => ({
              ...f,
              quotationId: id,
              project: q?.project ?? f.project,
              contactName: q?.attn ?? f.contactName,
              contactTel: q?.tel ?? f.contactTel,
              product: q?.items?.map(item => item.desc).join('\n') ?? f.product,
            }))
          }}>
            <option value="">— ไม่ระบุ —</option>
            {quotations.map(q => <option key={q.id} value={q.id}>{q.quoNo} — {q.customerName}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">          <label className="form-label">ชื่อโครงการ *</label>
          <input className="form-input" required value={form.project}
            onChange={e => setForm(f => ({ ...f, project: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">ผู้รับเหมา</label>
          <input className="form-input" value={form.contractor}
            onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">สถานที่</label>
          <input className="form-input" value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">ผู้ติดต่อ</label>
          <input className="form-input" value={form.contactName}
            onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">โทร</label>
          <input className="form-input" value={form.contactTel}
            onChange={e => setForm(f => ({ ...f, contactTel: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">สินค้า/บริการ</label>
          <input className="form-input" value={form.product}
            onChange={e => setForm(f => ({ ...f, product: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">ผู้รับผิดชอบ</label>
          <input className="form-input" value={form.responsibility}
            onChange={e => setForm(f => ({ ...f, responsibility: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">วันให้บริการ</label>
          <DateInput className="w-48" value={form.serviceDate}
            onChange={iso => setForm(f => ({ ...f, serviceDate: iso }))} />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">การประเมินคุณภาพ</h3>
        <RatingCheckbox label="คุณภาพสินค้า" name="qualityProduct" value={form.qualityProduct}
          onChange={v => setForm(f => ({ ...f, qualityProduct: v }))} />
        <RatingCheckbox label="คุณภาพงานขาย" name="qualitySales" value={form.qualitySales}
          onChange={v => setForm(f => ({ ...f, qualitySales: v }))} />
        <RatingCheckbox label="คุณภาพการติดตั้ง" name="qualityInstall" value={form.qualityInstall}
          onChange={v => setForm(f => ({ ...f, qualityInstall: v }))} />
        <div>
          <label className="form-label">ความคิดเห็น</label>
          <textarea className="form-input" rows={3} value={form.comment}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
        </button>
      </div>
    </form>
  )
}
