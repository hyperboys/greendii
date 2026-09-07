'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { HandoversAPI, QuotationsAPI, UnitsAPI } from '@/lib/api'
import { toPlainColoredLine } from '@/lib/coloredText'
import type { HandOverItem, Quotation, Unit } from '@/types'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import DateInput from '@/components/DateInput'
import HandOverItemsEditor from '@/components/HandOverItemsEditor'
import {
  createEmptyHandOverItem,
  mapHandOverItems,
  mapQuotationItemsToHandOverItems,
  normalizeHandOverItems,
} from '@/lib/handOverItems'

const DEFAULT_RESPONSIBILITY = 'K.Sarayut'

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
  items: HandOverItem[]
}

export default function EditHandoverPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', project: '', contractor: '', location: '',
    contactName: '', contactTel: '', product: '', responsibility: DEFAULT_RESPONSIBILITY,
    serviceDate: '', items: [createEmptyHandOverItem(0)],
  })

  useEffect(() => {
    QuotationsAPI.list({ status: 'approved' }).then(setQuotations)
    UnitsAPI.list().then(setUnits).catch(() => {})
    HandoversAPI.get(id).then(doc => {
      setForm({
        quotationId: doc.quotationId ?? doc.workOrder?.quotation?.id ?? '',
        project: doc.project ?? '',
        contractor: doc.contractor ?? '',
        location: doc.location ?? '',
        contactName: doc.contactName ?? '',
        contactTel: doc.contactTel ?? '',
        product: doc.product ?? '',
        responsibility: doc.responsibility ?? DEFAULT_RESPONSIBILITY,
        serviceDate: doc.serviceDate ? doc.serviceDate.slice(0, 10) : '',
        items: doc.items?.length
          ? mapHandOverItems(doc.items)
          : (doc.quotation?.items?.length
              ? mapQuotationItemsToHandOverItems(doc.quotation.items)
              : (doc.workOrder?.quotation?.items?.length
                  ? mapQuotationItemsToHandOverItems(doc.workOrder.quotation.items)
                  : [createEmptyHandOverItem(0)])),
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
    const normalizedItems = normalizeHandOverItems(form.items)
    if (normalizedItems.length === 0) { toast.error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ'); return }
    setSaving(true)
    try {
      await HandoversAPI.update(id, { ...form, items: normalizedItems })
      toast.success('บันทึกการแก้ไขสำเร็จ')
      router.replace(`/handovers/${id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 space-y-5 pb-24">
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
              product: q?.items?.map(item => toPlainColoredLine(item.desc)).join('\n') ?? f.product,
              items: q?.items?.length ? mapQuotationItemsToHandOverItems(q.items) : f.items,
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

      <HandOverItemsEditor items={form.items} units={units} onChange={items => setForm(prev => ({ ...prev, items }))} />

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
        </button>
      </div>
    </form>
  )
}
