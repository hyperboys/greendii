'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QuotationsAPI, CustomersAPI, UnitsAPI } from '@/lib/api'
import type { Customer, Unit, QuotationItem } from '@/types'
import { useAuthStore } from '@/store/auth'
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

const emptyItem = (): QuotationItem => ({ desc: '', note: '', qty: 1, unit: '', price: 0, amount: 0 })

const VAT_RATE = 0.07

export default function QuotationFormPage() {
  const router = useRouter()
  const params = useParams<{ id?: string }>()
  // id = 'new' for create, or uuid for edit
  const isEdit = params.id && params.id !== 'new'
  const { user } = useAuthStore()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    customerId: '', customerName: '', attn: '', project: '',
    address: '', tel: '', conditionTerm: '', validityDays: 30,
    leadTime: '', paymentTerm: '', remark: '', items: [emptyItem()],
  })

  useEffect(() => {
    Promise.all([
      CustomersAPI.list({ active: 'true' }),
      UnitsAPI.list(),
    ]).then(([c, u]) => { setCustomers(c); setUnits(u) })

    if (isEdit) {
      setLoading(true)
      QuotationsAPI.get(params.id!)
        .then(doc => {
          setForm({
            customerId: doc.customerId ?? '',
            customerName: doc.customerName,
            attn: doc.attn ?? '',
            project: doc.project,
            address: doc.address ?? '',
            tel: doc.tel ?? '',
            conditionTerm: doc.conditionTerm ?? '',
            validityDays: doc.validityDays,
            leadTime: doc.leadTime ?? '',
            paymentTerm: doc.paymentTerm ?? '',
            remark: doc.remark ?? '',
            items: doc.items.length > 0 ? doc.items : [emptyItem()],
          })
        })
        .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
        .finally(() => setLoading(false))
    }
  }, [isEdit, params.id])

  const subTotal = form.items.reduce((s, i) => s + (i.qty * i.price), 0)
  const vat = Math.round(subTotal * VAT_RATE)
  const grandTotal = subTotal + vat

  const setItem = (idx: number, key: keyof QuotationItem, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [key]: val }
      items[idx].amount = items[idx].qty * items[idx].price
      return { ...f, items }
    })
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeItem = (idx: number) =>
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const handleCustomer = (id: string) => {
    const c = customers.find(x => x.id === id)
    setForm(f => ({
      ...f,
      customerId: id,
      customerName: c?.name ?? f.customerName,
      address: c?.address ?? f.address,
      tel: c?.tel ?? f.tel,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName || !form.project) {
      toast.error('กรุณากรอกลูกค้าและโครงการ')
      return
    }
    if (form.items.some(i => !i.desc)) {
      toast.error('กรุณากรอกรายการสินค้า')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        subTotal,
        vat,
        grandTotal,
        items: form.items.map((item, i) => ({ ...item, seq: i + 1 })),
      }
      if (isEdit) {
        await QuotationsAPI.update(params.id!, payload)
      } else {
        const created = await QuotationsAPI.create(payload)
        router.replace(`/quotations/${created.id}`)
        toast.success('สร้างใบเสนอราคาสำเร็จ')
        return
      }
      toast.success('บันทึกสำเร็จ')
      router.back()
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">{isEdit ? 'แก้ไขใบเสนอราคา' : 'สร้างใบเสนอราคาใหม่'}</h2>
      </div>

      {/* Header info */}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="form-label">ลูกค้า (เลือกจากรายการ)</label>
          <select
            className="form-input"
            value={form.customerId}
            onChange={e => handleCustomer(e.target.value)}
          >
            <option value="">— เลือกลูกค้า —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">ชื่อลูกค้า (หรือพิมพ์เอง) *</label>
          <input className="form-input" value={form.customerName}
            onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
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
          <input className="form-input" value={form.project}
            onChange={e => setForm(f => ({ ...f, project: e.target.value }))} required />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ที่อยู่</label>
          <input className="form-input" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">เงื่อนไขการชำระ</label>
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
          <input type="number" className="form-input" min={1} value={form.validityDays}
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

      {/* Items */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">รายการสินค้า/บริการ</h3>
          <button type="button" className="btn-outline btn-sm" onClick={addItem}>
            <Plus size={14} /> เพิ่มรายการ
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e5e7eb]">
                <tr>
                  <th className="text-left py-2 px-2 text-xs text-gray-500 w-8">#</th>
                  <th className="text-left py-2 px-2 text-xs text-gray-500">รายการ / รายละเอียดเพิ่มเติม</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 w-20">จำนวน</th>
                  <th className="text-left py-2 px-2 text-xs text-gray-500 w-24">หน่วย</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 w-28">ราคา/หน่วย</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 w-28">จำนวนเงิน</th>
                  <th className="w-8"></th>
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
                        onChange={e => setItem(i, 'desc', e.target.value)}
                        placeholder="ชื่อสินค้า/บริการ *"
                        required
                      />
                      <textarea
                        className="form-input py-1 mt-1.5 text-xs resize-none w-full text-gray-600"
                        rows={2}
                        value={item.note ?? ''}
                        onChange={e => setItem(i, 'note', e.target.value)}
                        placeholder="รายละเอียด/สเปค/หมายเหตุเพิ่มเติม (ไม่บังคับ)"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number" min={0} step="any"
                        className="form-input py-1 text-right"
                        value={item.qty}
                        onChange={e => setItem(i, 'qty', +e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className="form-input py-1"
                        value={item.unit}
                        onChange={e => setItem(i, 'unit', e.target.value)}
                      >
                        <option value="">-</option>
                        {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number" min={0} step="any"
                        className="form-input py-1 text-right"
                        value={item.price}
                        onChange={e => setItem(i, 'price', +e.target.value)}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium pr-2 pt-3.5">
                      {new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(item.qty * item.price)}
                    </td>
                    <td className="py-2.5 px-2 pt-3">
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-white shadow-[0_-1px_0_0_#e5e7eb]">
                <tr className="bg-gray-50">
                  <td colSpan={5} className="text-right font-semibold px-2 py-2">ยอดก่อน VAT</td>
                  <td className="text-right font-semibold pr-2">
                    {new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(subTotal)}
                  </td>
                  <td></td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="text-right text-gray-500 px-2 py-1">VAT 7%</td>
                  <td className="text-right text-gray-500 pr-2">
                    {new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(vat)}
                  </td>
                  <td></td>
                </tr>
                <tr className="bg-green-pale">
                  <td colSpan={5} className="text-right font-bold text-green-dark px-2 py-2">ยอดรวม</td>
                  <td className="text-right font-bold text-green-dark pr-2 text-base">
                    ฿{new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(grandTotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : isEdit ? 'บันทึกการแก้ไข' : 'สร้างใบเสนอราคา'}
        </button>
      </div>
    </form>
  )
}
