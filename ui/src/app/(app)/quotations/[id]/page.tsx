'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QuotationsAPI } from '@/lib/api'
import type { Quotation } from '@/types'
import { STATUS_LABELS, APPROVAL_STEPS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Trash2, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import AttachmentsSection from '@/components/AttachmentsSection'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n)
}

export default function QuotationDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [doc, setDoc] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)

  const load = () => {
    setLoading(true)
    QuotationsAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const canEdit = isMine && doc.status === 'draft'
  const canSubmit = isMine && doc.status === 'draft'
  const canCancel = isMine && (doc.status === 'draft' || doc.status === 'rejected')

  // Approval: user's role must match next approval step
  const nextStep = doc.approvalStep + 1
  const stepDef = APPROVAL_STEPS.find(s => s.step === nextStep)
  const canApprove = doc.status === 'pending' && stepDef?.role === user?.role

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
    <div className="max-w-4xl mx-auto space-y-5">
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
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>รายการ</th>
              <th className="text-right">จำนวน</th>
              <th>หน่วย</th>
              <th className="text-right">ราคา/หน่วย</th>
              <th className="text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td className="text-gray-400">{item.seq ?? i + 1}</td>
                <td>
                  {item.desc}
                  {item.note && <p className="text-xs text-gray-400 mt-0.5">{item.note}</p>}
                </td>
                <td className="text-right">{fmtMoney(item.qty)}</td>
                <td>{item.unit}</td>
                <td className="text-right">{fmtMoney(item.price)}</td>
                <td className="text-right font-medium">{fmtMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={5} className="text-right font-semibold px-4 py-3">ยอดก่อน VAT</td>
              <td className="text-right font-semibold px-4 py-3">฿{fmtMoney(doc.subTotal)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td colSpan={5} className="text-right text-gray-500 px-4 py-2">VAT 7%</td>
              <td className="text-right text-gray-500 px-4 py-2">฿{fmtMoney(doc.vat)}</td>
            </tr>
            <tr className="bg-green-pale">
              <td colSpan={5} className="text-right font-bold text-green-dark px-4 py-3">ยอดรวมทั้งสิ้น</td>
              <td className="text-right font-bold text-green-dark px-4 py-3 text-base">฿{fmtMoney(doc.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Approval chain */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-3">สายการอนุมัติ</h3>
        <div className="flex flex-wrap gap-2">
          {APPROVAL_STEPS.slice(0, 6).map(s => {
            const log = doc.approvalLogs?.find(l => l.step === s.step)
            const isNext = s.step === nextStep && doc.status === 'pending'
            return (
              <div
                key={s.step}
                className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs text-center min-w-[80px] ${
                  log?.action === 'approve' ? 'bg-green-pale border-green-main text-green-dark' :
                  log?.action === 'reject' ? 'bg-red-50 border-red-300 text-red-700' :
                  isNext ? 'bg-orange-50 border-orange-300 text-orange-700' :
                  'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <span className="font-semibold">{s.label}</span>
                {log ? (
                  <span>{log.action === 'approve' ? '✓' : '✕'}</span>
                ) : isNext ? (
                  <span>รออนุมัติ</span>
                ) : null}
              </div>
            )
          })}
        </div>
        {doc.approvalLogs && doc.approvalLogs.length > 0 && (
          <div className="mt-3 space-y-1">
            {doc.approvalLogs.map(log => (
              <div key={log.id} className="text-xs text-gray-500 flex gap-2">
                <span className={log.action === 'approve' ? 'text-green-dark' : 'text-red-500'}>
                  {log.action === 'approve' ? '✓' : '✕'}
                </span>
                <span>{log.approver?.fullName ?? log.approverId}</span>
                {log.comment && <span className="text-gray-400">— {log.comment}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachments */}
      <AttachmentsSection
        attachments={doc.attachments ?? []}
        docField="quotationId"
        docId={id}
        onRefresh={load}
      />

      {/* Actions */}}
      {(canSubmit || canApprove) && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          <textarea
            className="form-input"
            rows={2}
            placeholder="ความคิดเห็น (ไม่บังคับ)"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap">
            {canSubmit && (
              <button className="btn-primary" onClick={() => act('submit')} disabled={acting}>
                <SendHorizonal size={15} /> ส่งอนุมัติ
              </button>
            )}
            {canApprove && (
              <>
                <button className="btn-primary" onClick={() => act('approve')} disabled={acting}>
                  <CheckCircle size={15} /> อนุมัติ
                </button>
                <button className="btn-danger" onClick={() => act('reject')} disabled={acting}>
                  <XCircle size={15} /> ปฏิเสธ
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
