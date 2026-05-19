'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { WorkOrdersAPI, QuotationsAPI } from '@/lib/api'
import type { Quotation } from '@/types'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

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
}

export default function EditWorkOrderPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', customerName: '', contactName: '', contactTel: '',
    project: '', location: '', products: '', responsibility: '',
    teamAssignment: '', installDate: '', qcDate: '', remark: '',
  })

  useEffect(() => {
    Promise.all([
      QuotationsAPI.list({ status: 'approved' }),
      WorkOrdersAPI.get(id),
    ])
      .then(([qList, doc]) => {
        setQuotations(qList)
        if (doc.status !== 'draft') {
          toast.error('แก้ไขได้เฉพาะเอกสารสถานะ Draft เท่านั้น')
          router.replace(`/workorders/${id}`)
          return
        }
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
      await WorkOrdersAPI.update(id, { ...form, docChecklist: {} })
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
          <input type="date" className="form-input" {...f('installDate')} />
        </div>
        <div>
          <label className="form-label">วัน QC</label>
          <input type="date" className="form-input" {...f('qcDate')} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">หมายเหตุ</label>
          <textarea className="form-input" rows={2} {...f('remark')} />
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
