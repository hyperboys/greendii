'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PRAPI, WorkOrdersAPI, UnitsAPI, PrTypesAPI } from '@/lib/api'
import type { WorkOrder, PRItem, Unit, PrType } from '@/types'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import DateInput from '@/components/DateInput'

interface FormData {
  workOrderId: string
  prTypeId: string
  customer: string
  projectRef: string
  dateIssue: string
  dateRequired: string
  remarks: string
  items: PRItem[]
}

const emptyItem = (): PRItem => ({ partNo: '', desc: '', note: '', qty: 1, unit: '', price: 0, amount: 0 })
const VAT_RATE = 0.07

export default function EditPRPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [prTypes, setPrTypes] = useState<PrType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData & { specialDiscount: number }>({
    workOrderId: '', prTypeId: '', customer: '', projectRef: '',
    dateIssue: '', dateRequired: '', remarks: '', items: [emptyItem()], specialDiscount: 0,
  })

  useEffect(() => {
    Promise.all([
      WorkOrdersAPI.list({ status: 'approved' }),
      UnitsAPI.list(),
      PrTypesAPI.list({ active: 'true' }),
      PRAPI.get(id),
    ])
      .then(([woList, unitList, typeList, doc]) => {
        setWorkOrders(woList)
        setUnits(unitList)
        setPrTypes(typeList)
        if (!['draft', 'rejected'].includes(doc.status)) {
          toast.error('แก้ไขได้เฉพาะเอกสารสถานะ Draft หรือ Rejected เท่านั้น')
          router.replace(`/pr/${id}`)
          return
        }
        setForm({
          workOrderId: doc.workOrderId ?? '',
          prTypeId: doc.prTypeId ?? '',
          customer: doc.customer ?? '',
          projectRef: doc.projectRef ?? '',
          dateIssue: doc.dateIssue ? doc.dateIssue.slice(0, 10) : '',
          dateRequired: doc.dateRequired ? doc.dateRequired.slice(0, 10) : '',
          remarks: doc.remarks ?? '',
          specialDiscount: Number(doc.specialDiscount ?? 0),
          items: doc.items && doc.items.length > 0 ? doc.items : [emptyItem()],
        })
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [id])

  const handleWO = (woId: string) => {
    const w = workOrders.find(x => x.id === woId)
    setForm(f => ({
      ...f,
      workOrderId: woId,
      customer: w?.customerName ?? f.customer,
      projectRef: w?.project ?? f.projectRef,
    }))
  }

  const subTotal = form.items.reduce((s, i) => s + i.qty * i.price, 0)
  const afterDiscount = subTotal - Number(form.specialDiscount)
  const vat = Math.round(afterDiscount * VAT_RATE)
  const netTotal = afterDiscount + vat

  const setItem = (idx: number, key: keyof PRItem, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [key]: val }
      items[idx].amount = items[idx].qty * items[idx].price
      return { ...f, items }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer) { toast.error('กรุณากรอกชื่อลูกค้า'); return }
    if (form.items.some(i => !i.desc)) { toast.error('กรุณากรอกรายการ'); return }
    setSaving(true)
    try {
      // Save any new units typed by the user
      const existingUnitNames = new Set(units.map(u => u.name.trim().toLowerCase()))
      const newUnitNames = Array.from(new Set(
        form.items
          .map(i => (i.unit || '').trim())
          .filter(n => n && !existingUnitNames.has(n.toLowerCase()))
      ))
      for (const name of newUnitNames) {
        try { await UnitsAPI.create({ name }) } catch { /* ignore */ }
      }

      await PRAPI.update(id, {
        ...form, subTotal, specialDiscount: form.specialDiscount, vat, netTotal,
        items: form.items.map((item, i) => ({ ...item, seq: i + 1 })),
      })
      toast.success('บันทึกสำเร็จ')
      router.push(`/pr/${id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">แก้ไขใบขอซื้อ (PR)</h2>
      </div>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="form-label">อ้างอิงใบสั่งงาน</label>
          <select className="form-input" value={form.workOrderId} onChange={e => handleWO(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.woNo} — {w.customerName}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ประเภทใบขอซื้อ</label>
          <select className="form-input" value={form.prTypeId}
            onChange={e => setForm(f => ({ ...f, prTypeId: e.target.value }))}>
            <option value="">— ใช้สายอนุมัติเริ่มต้น —</option>
            {prTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">ลูกค้า *</label>
          <input className="form-input" required value={form.customer}
            onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">โครงการอ้างอิง</label>
          <input className="form-input" value={form.projectRef}
            onChange={e => setForm(f => ({ ...f, projectRef: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">วันที่ออก</label>
          <DateInput value={form.dateIssue}
            onChange={iso => setForm(f => ({ ...f, dateIssue: iso }))} />
        </div>
        <div>
          <label className="form-label">ต้องการภายใน</label>
          <DateInput value={form.dateRequired}
            onChange={iso => setForm(f => ({ ...f, dateRequired: iso }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">หมายเหตุ</label>
          <textarea className="form-input" rows={2} value={form.remarks}
            onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">รายการสินค้า/วัสดุ</h3>
          <button type="button" className="btn-outline btn-sm"
            onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}>
            <Plus size={14} /> เพิ่มรายการ
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e5e7eb]">
                <tr>
                  <th className="text-left py-2 px-2 text-xs text-gray-500 w-8">#</th>
                  <th className="text-left py-2 px-2 text-xs text-gray-500 w-24">P/N</th>
                  <th className="text-left py-2 px-2 text-xs text-gray-500">รายการ / รายละเอียดเพิ่มเติม</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 w-28">จำนวน</th>
                  <th className="text-left py-2 px-2 text-xs text-gray-500 w-28">หน่วย</th>
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
                      <input className="form-input py-1 w-full" value={item.partNo ?? ''}
                        onChange={e => setItem(i, 'partNo', e.target.value)} placeholder="รหัส P/N" />
                    </td>
                    <td className="py-2 px-2">
                      <input className="form-input py-1 w-full" value={item.desc} required autoComplete="off"
                        onChange={e => setItem(i, 'desc', e.target.value)} placeholder="ชื่อรายการ *" />
                      <textarea
                        className="form-input py-1 mt-1.5 text-xs resize-none w-full text-gray-600"
                        rows={2}
                        value={item.note ?? ''}
                        onChange={e => setItem(i, 'note', e.target.value)}
                        placeholder="รายละเอียด/สเปค/หมายเหตุเพิ่มเติม (ไม่บังคับ)" />
                    </td>
                    <td className="py-2 px-2">
                      <input type="number" min={0} max={99999} step="any" className="form-input py-1 text-right"
                        value={item.qty} onChange={e => setItem(i, 'qty', +e.target.value)} />
                    </td>
                    <td className="py-2 px-2">
                      <input list="pr-units-datalist" className="form-input py-1 w-full"
                        value={item.unit}
                        onChange={e => setItem(i, 'unit', e.target.value)}
                        placeholder="-" autoComplete="off" />
                    </td>
                    <td className="py-2 px-2">
                      <input type="number" min={0} step="any" className="form-input py-1 text-right"
                        value={item.price} onChange={e => setItem(i, 'price', +e.target.value)} />
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium pr-2 pt-3.5">{fmt(item.qty * item.price)}</td>
                    <td className="py-2.5 px-2 pt-3">
                      {form.items.length > 1 && (
                        <button type="button" className="p-1 text-red-400 hover:text-red-600 transition-colors"
                          onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-white shadow-[0_-1px_0_0_#e5e7eb]">
                <tr className="bg-gray-50"><td colSpan={6} className="text-right font-semibold px-2 py-2">ยอดรวม</td><td className="text-right font-semibold pr-2">{fmt(subTotal)}</td><td /></tr>
                <tr className="bg-gray-50"><td colSpan={6} className="text-right text-gray-500 px-2 py-1">ส่วนลดพิเศษ</td><td className="text-right pr-2"><input type="number" min={0} step="any" className="form-input py-0.5 text-right w-24 inline-block" value={form.specialDiscount} onChange={e => setForm(f => ({ ...f, specialDiscount: +e.target.value }))} /></td><td /></tr>
                <tr className="bg-gray-50"><td colSpan={6} className="text-right text-gray-500 px-2 py-1">VAT 7%</td><td className="text-right text-gray-500 pr-2">{fmt(vat)}</td><td /></tr>
                <tr className="bg-green-pale"><td colSpan={6} className="text-right font-bold text-green-dark px-2 py-2">ยอดสุทธิ</td><td className="text-right font-bold text-green-dark pr-2 text-base">฿{fmt(netTotal)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
        </button>
      </div>

      <datalist id="pr-units-datalist">
        {units.map(u => <option key={u.id} value={u.name} />)}
      </datalist>
    </form>
  )
}
