'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandoversAPI, QuotationsAPI } from '@/lib/api'
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
  comment: string
}

export default function NewHandoverPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', project: '', contractor: '', location: '',
    contactName: '', contactTel: '', product: '', responsibility: '',
    serviceDate: '', comment: '',
  })

  useEffect(() => {
    QuotationsAPI.list({ status: 'approved' }).then(setQuotations)
  }, [])

  const handleQuotation = (id: string) => {
    const q = quotations.find(x => x.id === id)
    setForm(f => ({
      ...f, quotationId: id,
      project: q?.project ?? f.project,
      contactName: q?.attn ?? f.contactName,
      contactTel: q?.tel ?? f.contactTel,
      product: q?.items?.map(item => item.desc).join('\n') ?? f.product,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.project) { toast.error('กรุณากรอกชื่อโครงการ'); return }
    setSaving(true)
    try {
      const created = await HandoversAPI.create(form)
      toast.success('สร้างเอกสารส่งมอบงานสำเร็จ')
      router.replace(`/handovers/${created.id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">สร้างเอกสารส่งมอบงาน (HO)</h2>
      </div>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="form-label">อ้างอิงใบเสนอราคา</label>
          <select className="form-input" value={form.quotationId} onChange={e => handleQuotation(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {quotations.map(q => <option key={q.id} value={q.id}>{q.quoNo} — {q.customerName}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ชื่อโครงการ *</label>
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

      <div className="card p-5">
        <div>
          <label className="form-label">ความคิดเห็น</label>
          <textarea className="form-input" rows={3} value={form.comment}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'สร้างเอกสาร'}
        </button>
      </div>
    </form>
  )
}
