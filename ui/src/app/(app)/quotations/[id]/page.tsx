'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QuotationsAPI, SettingsAPI } from '@/lib/api'
import type { Quotation, Settings } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, CheckCircle, Trash2, Pencil, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import QuotationPrint from '@/components/QuotationPrint'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function QuotationDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [doc, setDoc] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)

  const load = () => {
    setLoading(true)
    QuotationsAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { SettingsAPI.get().then(setSettings).catch(() => {}) }, [])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const canEdit = isMine && doc.status !== 'cancelled'
  const canSubmit = isMine && doc.status === 'draft'
  const canCancel = isMine && (doc.status === 'draft' || doc.status === 'rejected')

  const act = async (action: 'submit' | 'approve' | 'reject' | 'cancel') => {
    setActing(true)
    try {
      if (action === 'submit') await QuotationsAPI.submit(id, comment)
      else if (action === 'approve') await QuotationsAPI.approve(id, comment)
      else if (action === 'reject') await QuotationsAPI.reject(id, comment)
      else if (action === 'cancel') await QuotationsAPI.cancel(id)
      toast.success('ดำเนินการสำเร็จ')
      load()
      setComment('')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setActing(false)
    }
  }

  return (
    <>
    <QuotationPrint doc={doc} settings={settings} />
    <div className="screen-only max-w-4xl mx-auto space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="page-title">{doc.quoNo}</h2>
            <span className={`badge badge-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
          </div>
          <p className="page-sub">{doc.project}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button className="btn-outline btn-sm" onClick={() => router.push(`/quotations/${id}/edit`)}>
              <Pencil size={14} /> แก้ไข
            </button>
          )}
          <button className="btn-outline btn-sm no-print" onClick={() => window.print()}>
            <Printer size={14} /> พิมพ์
          </button>
          {canCancel && (
            <button className="btn-danger btn-sm" onClick={() => act('cancel')} disabled={acting}>
              <Trash2 size={14} /> ยกเลิก
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="form-label">ลูกค้า</span><p>{doc.customerName}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.attn || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.tel || '-'}</p></div>
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">ที่อยู่</span><p>{doc.address || '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">ระยะเวลา (วัน)</span><p>{doc.validityDays}</p></div>
        <div><span className="form-label">การชำระ</span><p>{doc.paymentTerm || '-'}</p></div>
        <div><span className="form-label">Lead Time</span><p>{doc.leadTime || '-'}</p></div>
        {doc.remark && (
          <div className="col-span-full"><span className="form-label">หมายเหตุ</span><p>{doc.remark}</p></div>
        )}
      </div>

      {/* Items */}
      <div className="card">
        <table className="data-table table-fixed w-full">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>Description</th>
              <th className="text-right w-20">Q'ty</th>
              <th className="w-20">Unit</th>
              <th className="text-right w-36">Material Price / Unit</th>
              <th className="text-right w-32">Labour Price / Unit</th>
              <th className="text-right w-32">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td className="text-gray-400">{(item.seq ?? i) + 1}</td>
                <td className="break-words">
                  {item.desc}
                  {item.note && <p className="text-xs text-gray-400 mt-0.5">{item.note}</p>}
                </td>
                <td className="text-right">{fmtMoney(item.qty)}</td>
                <td>{item.unit}</td>
                <td className="text-right">{fmtMoney(item.materialPrice ?? item.price)}</td>
                <td className="text-right">{fmtMoney(item.labourPrice ?? 0)}</td>
                <td className="text-right font-medium">{fmtMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={6} className="text-right font-semibold px-4 py-3">ยอดรวม</td>
              <td className="text-right font-semibold px-4 py-3">฿{fmtMoney(doc.subTotal)}</td>
            </tr>
            {doc.specialDiscount > 0 && (
              <tr className="bg-gray-50">
                <td colSpan={6} className="text-right text-gray-500 px-4 py-2">ส่วนลดพิเศษ</td>
                <td className="text-right text-red-500 px-4 py-2">-฿{fmtMoney(doc.specialDiscount)}</td>
              </tr>
            )}
            <tr className="bg-gray-50">
              <td colSpan={6} className="text-right text-gray-500 px-4 py-2">VAT 7%</td>
              <td className="text-right text-gray-500 px-4 py-2">฿{fmtMoney(doc.vat)}</td>
            </tr>
            <tr className="bg-green-pale">
              <td colSpan={6} className="text-right font-bold text-green-dark px-4 py-3">ยอดรวมทั้งสิ้น</td>
              <td className="text-right font-bold text-green-dark px-4 py-3 text-base">฿{fmtMoney(doc.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>



      {/* Actions */}
      {canSubmit && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-primary" onClick={() => act('submit')} disabled={acting}>
              <CheckCircle size={15} /> ยืนยันใบเสนอราคา
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
