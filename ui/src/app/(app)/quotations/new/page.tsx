'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuotationsAPI, CustomersAPI, UnitsAPI } from '@/lib/api'
import type { Customer, Unit, QuotationItem } from '@/types'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface FormData {
  customerId: string
  customerName: string
  attn: string
  project: string
  address: string
  tel: string
  conditionTerm: string
  validityDays: number
  leadTime: string
  paymentTerm: string
  remark: string
  items: QuotationItem[]
}

const emptyItem = (): QuotationItem => ({ desc: '', note: '', qty: 1, unit: '', materialPrice: 0, labourPrice: 0, price: 0, amount: 0 })
const VAT_RATE = 0.07

const parseDescLines = (note?: string): string[] => {
  const lines = (note ?? '').split('\n')
  return lines.length > 0 ? lines : ['']
}

const stringifyDescLines = (lines: string[]): string => lines.join('\n')

export default function NewQuotationPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData & { specialDiscount: number }>({
    customerId: '', customerName: '', attn: '', project: '',
    address: '', tel: '', conditionTerm: '', validityDays: 30,
    leadTime: '', paymentTerm: '', remark: '', items: [emptyItem()], specialDiscount: 0,
  })

  useEffect(() => {
    Promise.all([CustomersAPI.list({ active: 'true' }), UnitsAPI.list()])
      .then(([c, u]) => { setCustomers(c); setUnits(u) })
  }, [])

  const subTotal = form.items.reduce((s, i) => s + Number(i.qty) * (Number(i.materialPrice) + Number(i.labourPrice)), 0)
  const afterDiscount = subTotal - Number(form.specialDiscount)
  const vat = Math.round(afterDiscount * VAT_RATE)
  const grandTotal = afterDiscount + vat

  const setItem = (idx: number, key: keyof QuotationItem, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [key]: val }
      items[idx].price = Number(items[idx].materialPrice) + Number(items[idx].labourPrice)
      items[idx].amount = Number(items[idx].qty) * items[idx].price
      return { ...f, items }
    })
  }

  const handleCustomer = (id: string) => {
    const c = customers.find(x => x.id === id)
    setForm(f => ({
      ...f, customerId: id,
      customerName: c?.name ?? f.customerName,
      attn: c?.contactPerson ?? f.attn,
      address: c?.address ?? f.address,
      tel: c?.tel ?? f.tel,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName || !form.project) { toast.error('กรุณากรอกลูกค้าและโครงการ'); return }
    if (form.items.some(i => !i.desc)) { toast.error('กรุณากรอกรายการสินค้า'); return }
    setSaving(true)
    try {
      // 1) Save any new units used by items
      const existingUnitNames = new Set(units.map(u => u.name.trim().toLowerCase()))
      const newUnitNames = Array.from(new Set(
        form.items
          .map(i => (i.unit || '').trim())
          .filter(n => n && !existingUnitNames.has(n.toLowerCase()))
      ))
      for (const name of newUnitNames) {
        try { await UnitsAPI.create({ name }) } catch { /* ignore */ }
      }

      // 2) Resolve customer
      let customerId = form.customerId
      if (!customerId) {
        try {
          const created = await CustomersAPI.create({
            name: form.customerName.trim(),
            contactPerson: form.attn || undefined,
            tel: form.tel || undefined,
            address: form.address || undefined,
          })
          customerId = created.id
        } catch { /* ignore */ }
      } else {
        const orig = customers.find(c => c.id === customerId)
        if (orig) {
          const patch: Partial<Customer> = {}
          if ((orig.name || '') !== (form.customerName || '')) patch.name = form.customerName
          if ((orig.contactPerson || '') !== (form.attn || '')) patch.contactPerson = form.attn
          if ((orig.tel || '') !== (form.tel || '')) patch.tel = form.tel
          if ((orig.address || '') !== (form.address || '')) patch.address = form.address
          if (Object.keys(patch).length > 0) {
            try { await CustomersAPI.update(customerId, patch) } catch { /* ignore */ }
          }
        }
      }

      const created = await QuotationsAPI.create({
        ...form, customerId, subTotal, vat, grandTotal,
        items: form.items.map((item, i) => ({ ...item, seq: i + 1 })),
      })
      toast.success('สร้างใบเสนอราคาสำเร็จ')
      router.replace(`/quotations/${created.id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
      setSaving(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">สร้างใบเสนอราคา (QO) ใหม่</h2>
      </div>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="form-label">ลูกค้า (เลือกจากรายการ)</label>
          <select className="form-input" value={form.customerId} onChange={e => handleCustomer(e.target.value)}>
            <option value="">— เลือกลูกค้า —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">ชื่อลูกค้า *</label>
          <input className="form-input" value={form.customerName} required
            onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">ผู้ติดต่อ</label>
          <input className="form-input" value={form.attn}
            onChange={e => setForm(f => ({ ...f, attn: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">โทร</label>
          <input className="form-input" value={form.tel}
            onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ชื่อโครงการ *</label>
          <input className="form-input" value={form.project} required
            onChange={e => setForm(f => ({ ...f, project: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ที่อยู่</label>
          <input className="form-input" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">การชำระเงิน</label>
          <input className="form-input" value={form.paymentTerm}
            onChange={e => setForm(f => ({ ...f, paymentTerm: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Lead Time</label>
          <input className="form-input" value={form.leadTime}
            onChange={e => setForm(f => ({ ...f, leadTime: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">อายุใบเสนอราคา (วัน)</label>
          <input type="number" min={1} className="form-input" value={form.validityDays}
            onChange={e => setForm(f => ({ ...f, validityDays: +e.target.value }))} />
        </div>
        <div>
          <label className="form-label">เงื่อนไขอื่นๆ</label>
          <input className="form-input" value={form.conditionTerm}
            onChange={e => setForm(f => ({ ...f, conditionTerm: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">หมายเหตุ</label>
          <textarea className="form-input" rows={2} value={form.remark}
            onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">รายการสินค้า/บริการ</h3>
          <button type="button" className="btn-outline btn-sm"
            onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}>
            <Plus size={14} /> เพิ่มรายการ
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-green-dark text-white">
                <tr>
                  <th rowSpan={2} className="text-left py-2 px-2 text-xs font-semibold uppercase w-8 align-middle">#</th>
                  <th rowSpan={2} className="text-left py-2 px-2 text-xs font-semibold uppercase align-middle">Description</th>
                  <th rowSpan={2} className="text-right py-2 px-2 text-xs font-semibold uppercase w-20 align-middle">Q&apos;ty</th>
                  <th rowSpan={2} className="text-left py-2 px-2 text-xs font-semibold uppercase w-24 align-middle">Unit</th>
                  <th colSpan={2} className="text-center py-2 px-2 text-xs font-semibold uppercase tracking-wide">Pricing / Unit</th>
                  <th rowSpan={2} className="text-right py-2 px-2 text-xs font-semibold uppercase w-32 align-middle">Total Amount</th>
                  <th rowSpan={2} className="w-8"></th>
                </tr>
                <tr>
                  <th className="text-right py-1.5 px-2 text-[11px] font-semibold uppercase w-32">Material</th>
                  <th className="text-right py-1.5 px-2 text-[11px] font-semibold uppercase w-32">Labour</th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="py-2.5 px-2 text-gray-400 text-xs pt-3.5">{i + 1}</td>
                    <td className="py-2 px-2">
                      <input className="form-input py-1 w-full" value={item.desc} required
                        onChange={e => setItem(i, 'desc', e.target.value)}
                        placeholder="ชื่อสินค้า/บริการ *" />
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
                          <Plus size={12} /> เพิ่มบรรทัด Description
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <input type="number" min={0} max={99999} step="any" className="form-input py-1 text-right"
                        value={item.qty} onChange={e => setItem(i, 'qty', +e.target.value)} />
                    </td>
                    <td className="py-2 px-2">
                      <input list="units-datalist" className="form-input py-1"
                        value={item.unit}
                        onChange={e => setItem(i, 'unit', e.target.value)}
                        placeholder="-" />
                    </td>
                    <td className="py-2 px-2">
                      <input type="number" min={0} step="any" className="form-input py-1 text-right"
                        value={item.materialPrice} onChange={e => setItem(i, 'materialPrice', +e.target.value)} />
                    </td>
                    <td className="py-2 px-2">
                      <input type="number" min={0} step="any" className="form-input py-1 text-right"
                        value={item.labourPrice} onChange={e => setItem(i, 'labourPrice', +e.target.value)} />
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium pr-2 pt-3.5">{fmt(Number(item.qty) * (Number(item.materialPrice) + Number(item.labourPrice)))}</td>
                    <td className="py-2.5 px-2 pt-3">
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-white shadow-[0_-1px_0_0_#e5e7eb]">
                <tr><td colSpan={6} className="text-right font-semibold px-2 py-2">ยอดรวม</td><td className="text-right font-semibold pr-2">{fmt(subTotal)}</td><td /></tr>
                <tr><td colSpan={6} className="text-right text-gray-500 px-2 py-1">ส่วนลดพิเศษ</td><td className="text-right pr-2"><input type="number" min={0} step="any" className="form-input py-0.5 text-right w-24 inline-block" value={form.specialDiscount} onChange={e => setForm(f => ({ ...f, specialDiscount: +e.target.value }))} /></td><td /></tr>
                <tr><td colSpan={6} className="text-right text-gray-500 px-2 py-1">VAT 7%</td><td className="text-right text-gray-500 pr-2">{fmt(vat)}</td><td /></tr>
                <tr className="bg-green-pale"><td colSpan={6} className="text-right font-bold text-green-dark px-2 py-2">ยอดรวมทั้งสิ้น</td><td className="text-right font-bold text-green-dark pr-2 text-base">฿{fmt(grandTotal)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'สร้างใบเสนอราคา'}
        </button>
      </div>

      <datalist id="units-datalist">
        {units.map(u => <option key={u.id} value={u.name} />)}
      </datalist>
    </form>
  )
}
