'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PRAPI, WorkOrdersAPI } from '@/lib/api'
import type { WorkOrder, PRItem } from '@/types'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface FormData {
  workOrderId: string
  customer: string
  projectRef: string
  dateIssue: string
  dateRequired: string
  remarks: string
  items: PRItem[]
}

const emptyItem = (): PRItem => ({ desc: '', qty: 1, unit: '', price: 0, amount: 0 })
const VAT_RATE = 0.07

export default function EditPRPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    workOrderId: '', customer: '', projectRef: '',
    dateIssue: '', dateRequired: '', remarks: '', items: [emptyItem()],
  })

  useEffect(() => {
    Promise.all([
      WorkOrdersAPI.list({ status: 'approved' }),
      PRAPI.get(id),
    ])
      .then(([woList, doc]) => {
        setWorkOrders(woList)
        if (doc.status !== 'draft') {
          toast.error('แก้ไขได้เฉพาะเอกสารสถานะ Draft เท่านั้น')
          router.replace(`/pr/${id}`)
          return
        }
        setForm({
          workOrderId: doc.workOrderId ?? '',
          customer: doc.customer ?? '',
          projectRef: doc.projectRef ?? '',
          dateIssue: doc.dateIssue ? doc.dateIssue.slice(0, 10) : '',
          dateRequired: doc.dateRequired ? doc.dateRequired.slice(0, 10) : '',
          remarks: doc.remarks ?? '',
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
  const vat = Math.round(subTotal * VAT_RATE)
  const netTotal = subTotal + vat

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
      await PRAPI.update(id, {
        ...form, subTotal, vat, netTotal,
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

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n)

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">แก้ไขใบขอซื้อ</h2>
      </div>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="form-label">อ้างอิงใบสั่งงาน</label>
          <select className="form-input" value={form.workOrderId} onChange={e => handleWO(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.woNo} — {w.customerName}</option>)}
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
          <input type="date" className="form-input" value={form.dateIssue}
            onChange={e => setForm(f => ({ ...f, dateIssue: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">ต้องการภายใน</label>
          <input type="date" className="form-input" value={form.dateRequired}
            onChange={e => setForm(f => ({ ...f, dateRequired: e.target.value }))} />
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-1 text-xs text-gray-500 w-8">#</th>
                <th className="text-left py-2 px-1 text-xs text-gray-500">รายการ *</th>
                <th className="text-right py-2 px-1 text-xs text-gray-500 w-20">จำนวน</th>
                <th className="text-left py-2 px-1 text-xs text-gray-500 w-20">หน่วย</th>
                <th className="text-right py-2 px-1 text-xs text-gray-500 w-28">ราคา/หน่วย</th>
                <th className="text-right py-2 px-1 text-xs text-gray-500 w-28">จำนวนเงิน</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 px-1 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-1.5 px-1">
                    <input className="form-input py-1" value={item.desc} required
                      onChange={e => setItem(i, 'desc', e.target.value)} placeholder="รายละเอียด" />
                  </td>
                  <td className="py-1.5 px-1">
                    <input type="number" min={0} step="any" className="form-input py-1 text-right"
                      value={item.qty} onChange={e => setItem(i, 'qty', +e.target.value)} />
                  </td>
                  <td className="py-1.5 px-1">
                    <input className="form-input py-1" value={item.unit}
                      onChange={e => setItem(i, 'unit', e.target.value)} />
                  </td>
                  <td className="py-1.5 px-1">
                    <input type="number" min={0} step="any" className="form-input py-1 text-right"
                      value={item.price} onChange={e => setItem(i, 'price', +e.target.value)} />
                  </td>
                  <td className="py-1.5 px-1 text-right font-medium pr-2">{fmt(item.qty * item.price)}</td>
                  <td className="py-1.5 px-1">
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
            <tfoot>
              <tr className="bg-gray-50"><td colSpan={5} className="text-right font-semibold px-2 py-2">ยอดก่อน VAT</td><td className="text-right font-semibold pr-2">{fmt(subTotal)}</td><td /></tr>
              <tr className="bg-gray-50"><td colSpan={5} className="text-right text-gray-500 px-2 py-1">VAT 7%</td><td className="text-right text-gray-500 pr-2">{fmt(vat)}</td><td /></tr>
              <tr className="bg-green-pale"><td colSpan={5} className="text-right font-bold text-green-dark px-2 py-2">ยอดสุทธิ</td><td className="text-right font-bold text-green-dark pr-2 text-base">฿{fmt(netTotal)}</td><td /></tr>
            </tfoot>
          </table>
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
