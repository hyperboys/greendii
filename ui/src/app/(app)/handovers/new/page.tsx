'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandoversAPI, QuotationsAPI, UnitsAPI, UploadAPI, resolveFileUrl } from '@/lib/api'
import { toPlainColoredLine, toPlainColoredMultiline } from '@/lib/coloredText'
import type { HandOverItem, Quotation, Unit } from '@/types'
import { ArrowLeft, Plus, Trash2, ImagePlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import DateInput from '@/components/DateInput'

const createEmptyItem = (seq: number): HandOverItem => ({ seq, desc: '', note: '', qty: 1, unit: '', images: [] })
const DEFAULT_RESPONSIBILITY = 'K.Sarayut'
const parseDescLines = (note?: string): string[] => {
  const lines = (note ?? '').split('\n')
  return lines.length > 0 ? lines : ['']
}
const stringifyDescLines = (lines: string[]): string => lines.join('\n')

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

export default function NewHandoverPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    quotationId: '', project: '', contractor: '', location: '',
    contactName: '', contactTel: '', product: '', responsibility: DEFAULT_RESPONSIBILITY,
    serviceDate: '', items: [createEmptyItem(0)],
  })

  useEffect(() => {
    Promise.all([QuotationsAPI.list({ status: 'approved' }), UnitsAPI.list()])
      .then(([q, u]) => {
        setQuotations(q)
        setUnits(u)
      })
  }, [])

  const handleQuotation = (id: string) => {
    const q = quotations.find(x => x.id === id)
    setForm(f => ({
      ...f, quotationId: id,
      project: q?.project ?? f.project,
      contactName: q?.attn ?? f.contactName,
      contactTel: q?.tel ?? f.contactTel,
      product: q?.items?.map(item => toPlainColoredLine(item.desc)).join('\n') ?? f.product,
      items: q?.items?.length
        ? q.items.map((item, index) => ({
            seq: item.seq ?? index,
        desc: toPlainColoredLine(item.desc),
        note: toPlainColoredMultiline(item.note),
            qty: Number(item.qty ?? 0),
            unit: item.unit ?? '',
            images: Array.isArray(item.images) ? item.images : [],
          }))
        : f.items,
    }))
  }

  const setItemField = (index: number, key: keyof HandOverItem, value: string | number | string[]) => {
    setForm(f => ({
      ...f,
      items: f.items.map((item, i) => i === index ? { ...item, [key]: value } : item),
    }))
  }

  const setDescriptionLine = (itemIdx: number, lineIdx: number, value: string) => {
    setForm(f => {
      const items = [...f.items]
      const lines = parseDescLines(items[itemIdx].note)
      while (lines.length <= lineIdx) lines.push('')
      lines[lineIdx] = value
      items[itemIdx] = { ...items[itemIdx], note: stringifyDescLines(lines) }
      return { ...f, items }
    })
  }

  const addDescriptionLine = (itemIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const lines = parseDescLines(items[itemIdx].note)
      lines.push('')
      items[itemIdx] = { ...items[itemIdx], note: stringifyDescLines(lines) }
      return { ...f, items }
    })
  }

  const removeDescriptionLine = (itemIdx: number, lineIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const lines = parseDescLines(items[itemIdx].note)
      if (lines.length <= 1) {
        items[itemIdx] = { ...items[itemIdx], note: '' }
      } else {
        lines.splice(lineIdx, 1)
        items[itemIdx] = { ...items[itemIdx], note: stringifyDescLines(lines) }
      }
      return { ...f, items }
    })
  }

  const uploadItemImages = async (itemIdx: number, files: FileList | null) => {
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return toast.error('รองรับเฉพาะไฟล์รูปภาพ')
    const tId = toast.loading('กำลังอัปโหลดรูป...')
    try {
      const saved = await UploadAPI.upload(imageFiles, { category: 'handover-item' })
      const urls = saved.map((a: any) => a.fileUrl).filter(Boolean)
      setForm(f => {
        const items = [...f.items]
        items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...urls] }
        return { ...f, items }
      })
      toast.success('อัปโหลดรูปสำเร็จ', { id: tId })
    } catch {
      toast.error('อัปโหลดไม่สำเร็จ', { id: tId })
    }
  }

  const removeItemImage = (itemIdx: number, urlIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const imgs = [...(items[itemIdx].images || [])]
      imgs.splice(urlIdx, 1)
      items[itemIdx] = { ...items[itemIdx], images: imgs }
      return { ...f, items }
    })
  }

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, createEmptyItem(f.items.length)] }))
  }

  const removeItem = (index: number) => {
    setForm(f => {
      const next = f.items.filter((_, i) => i !== index)
      return { ...f, items: next.length ? next : [createEmptyItem(0)] }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.project) { toast.error('กรุณากรอกชื่อโครงการ'); return }
    const normalizedItems = form.items
      .map((item, index) => ({
        seq: index,
        desc: String(item.desc ?? '').trim(),
        note: String(item.note ?? ''),
        qty: Number(item.qty ?? 0),
        unit: String(item.unit ?? '').trim(),
        images: Array.isArray(item.images) ? item.images : [],
      }))
      .filter(item => item.desc)
    if (normalizedItems.length === 0) { toast.error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ'); return }
    setSaving(true)
    try {
      const created = await HandoversAPI.create({ ...form, items: normalizedItems })
      toast.success('สร้างเอกสารส่งมอบงานสำเร็จ')
      router.replace(`/handovers/${created.id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 space-y-5 pb-24">
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">รายการงาน HandOver</h3>
          <button type="button" className="btn-outline btn-sm" onClick={addItem}>
            <Plus size={14} /> เพิ่มรายการ
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="border border-gray-100 rounded-lg">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-green-dark to-[#2f6a34] text-white shadow-sm [text-shadow:0_1px_0_rgba(0,0,0,0.28)]">
                <tr>
                  <th className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-10 align-middle border-b border-white/20">#</th>
                  <th className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white align-middle border-b border-white/20">Description</th>
                  <th className="text-right py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-20 align-middle border-b border-white/20">Q&apos;ty</th>
                  <th className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-24 align-middle border-b border-white/20">Unit</th>
                  <th className="w-9 border-b border-white/20"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="py-2.5 px-2 text-gray-400 text-xs pt-3.5">{i + 1}</td>
                    <td className="py-2 px-2">
                      <input
                        className="form-input py-1 w-full"
                        value={item.desc}
                        required
                        onChange={e => setItemField(i, 'desc', e.target.value)}
                        placeholder="ชื่อสินค้า/บริการ *"
                      />
                      <div className="mt-1.5 space-y-1.5">
                        {parseDescLines(item.note).map((line, lineIdx) => (
                          <div key={lineIdx} className="flex items-center gap-1.5">
                            <input
                              className="form-input py-1 text-xs w-full text-gray-700"
                              value={line}
                              onChange={e => setDescriptionLine(i, lineIdx, e.target.value)}
                              placeholder={`รายละเอียดบรรทัดที่ ${lineIdx + 1} (ไม่บังคับ)`}
                            />
                            <button
                              type="button"
                              className="p-1 text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => removeDescriptionLine(i, lineIdx)}
                              title="ลบบรรทัด"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
                          onClick={() => addDescriptionLine(i)}
                        >
                          <Plus size={12} /> เพิ่มบรรทัด
                        </button>
                      </div>
                      <div className="mt-2">
                        {item.images && item.images.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {item.images.map((url, imgIdx) => (
                              <div key={imgIdx} className="relative group">
                                <img src={resolveFileUrl(url)} alt="" className="w-14 h-14 object-cover rounded border border-gray-200" />
                                <button
                                  type="button"
                                  onClick={() => removeItemImage(i, imgIdx)}
                                  className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="ลบรูป"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 font-medium cursor-pointer">
                          <ImagePlus size={12} /> เพิ่มรูปภาพ
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={e => {
                              uploadItemImages(i, e.target.files)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={0}
                        max={99999}
                        step="any"
                        className="form-input py-1 text-right"
                        value={item.qty}
                        onChange={e => setItemField(i, 'qty', Number(e.target.value || 0))}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        list="handover-units-datalist"
                        className="form-input py-1"
                        value={item.unit}
                        onChange={e => setItemField(i, 'unit', e.target.value)}
                        placeholder="-"
                      />
                    </td>
                    <td className="py-2.5 px-2 pt-3">
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'สร้างเอกสาร'}
        </button>
      </div>

      <datalist id="handover-units-datalist">
        {units.map(u => <option key={u.id} value={u.name} />)}
      </datalist>
    </form>
  )
}
