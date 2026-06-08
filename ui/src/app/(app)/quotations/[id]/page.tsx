'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QuotationsAPI, downloadBlob } from '@/lib/api'
import { isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import type { Quotation } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, CheckCircle, Trash2, Pencil, Loader2, Eye, X, Download } from 'lucide-react'
import toast from 'react-hot-toast'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function splitDescriptionLines(note?: string): string[] {
  return (note ?? '')
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean)
}

function fmtLeadTime(v?: string): string {
  const value = (v ?? '').trim()
  if (!value) return '-'

  const matched = value.match(/^(\d+)(?:\s*(?:วัน|days?))?$/i)
  if (matched) return `${matched[1]} Days`

  return value.replace(/\bวัน\b/g, 'Days')
}

export default function QuotationDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [doc, setDoc] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = () => {
    setLoading(true)
    QuotationsAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    if (!previewOpen) return

    const originalOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [previewOpen])

  const previewToken = typeof window !== 'undefined' ? (localStorage.getItem('gd_token') || '') : ''
  const previewUrl = previewToken
    ? `/print/quotation/${id}?token=${encodeURIComponent(previewToken)}`
    : ''

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const canEdit = isMine && isEditableApprovalDocStatus(doc.status)
  const canSubmit = isMine && doc.status === 'draft'
  const canCancel = isMine && isEditableApprovalDocStatus(doc.status)

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

  const downloadPdf = async () => {
    if (pdfLoading) return
    setPdfLoading(true)
    toast.loading('กำลังสร้าง PDF…', { id: 'pdf' })
    try {
      const blob = await QuotationsAPI.pdf(id)
      downloadBlob(blob, `${doc.quoNo || 'quotation'}.pdf`)
      toast.success('สำเร็จ', { id: 'pdf' })
    } catch {
      toast.error('สร้าง PDF ไม่สำเร็จ', { id: 'pdf' })
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
    <div className="screen-only w-full max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 space-y-5">
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
        <div className="flex flex-wrap justify-end gap-2">
          {canEdit && (
            <button className="btn-outline btn-sm" onClick={() => router.push(`/quotations/${id}/edit`)}>
              <Pencil size={14} /> แก้ไข
            </button>
          )}
          <button className="btn-outline btn-sm no-print" onClick={() => setPreviewOpen(true)}>
            <Eye size={14} /> พรีวิว
          </button>
          <button className="btn-outline btn-sm no-print" onClick={downloadPdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {pdfLoading ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF'}
          </button>
          {canCancel && (
            <button className="btn-danger btn-sm" onClick={() => act('cancel')} disabled={acting}>
              <Trash2 size={14} /> ยกเลิก
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div><span className="form-label">ลูกค้า</span><p>{doc.customerName}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.attn || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.tel || '-'}</p></div>
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">ที่อยู่</span><p>{doc.address || '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">ระยะเวลา (วัน)</span><p>{doc.validityDays}</p></div>
        <div><span className="form-label">การชำระ</span><p>{doc.paymentTerm || '-'}</p></div>
        <div><span className="form-label">Lead Time</span><p>{fmtLeadTime(doc.leadTime)}</p></div>
        {doc.remark && (
          <div className="col-span-full"><span className="form-label">หมายเหตุ</span><p>{doc.remark}</p></div>
        )}
      </div>

      {/* Items */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-green-dark to-[#2f6a34] text-white shadow-sm [text-shadow:0_1px_0_rgba(0,0,0,0.28)]">
                <tr>
                  <th rowSpan={2} className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-10 align-middle border-b border-white/20">#</th>
                  <th rowSpan={2} className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white align-middle border-b border-white/20">Description</th>
                  <th rowSpan={2} className="text-right py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-20 align-middle border-b border-white/20">Q&apos;ty</th>
                  <th rowSpan={2} className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-24 align-middle border-b border-white/20">Unit</th>
                  <th colSpan={2} className="text-center py-3 px-3 text-[12px] md:text-[13px] font-semibold tracking-[0.06em] text-white/90 border-b border-white/20">Pricing / Unit</th>
                  <th rowSpan={2} className="text-right py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-32 align-middle border-b border-white/20">Total Amount</th>
                </tr>
                <tr>
                  <th className="text-right py-2.5 px-3 text-[13px] md:text-[14px] font-bold text-white w-32">Material Price</th>
                  <th className="text-right py-2.5 px-3 text-[13px] md:text-[14px] font-bold text-white w-32">Labour Price</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item, i) => (
                  <tr key={item.id ?? i} className="border-t border-gray-100 align-top">
                    <td className="py-2.5 px-3 text-gray-400 text-xs pt-3.5">{(item.seq ?? i) + 1}</td>
                    <td className="py-2 px-3 break-words">
                      <div className="font-medium text-gray-800">{item.desc}</div>
                      {splitDescriptionLines(item.note).map((line, idx) => (
                        <p key={idx} className="text-xs text-gray-400 mt-0.5">{line}</p>
                      ))}
                    </td>
                    <td className="py-2.5 px-3 text-right pt-3.5">{fmtMoney(item.qty)}</td>
                    <td className="py-2.5 px-3 pt-3.5">{item.unit}</td>
                    <td className="py-2.5 px-3 text-right pt-3.5">{fmtMoney(item.materialPrice ?? item.price)}</td>
                    <td className="py-2.5 px-3 text-right pt-3.5">{fmtMoney(item.labourPrice ?? 0)}</td>
                    <td className="py-2.5 px-3 text-right font-medium pt-3.5">{fmtMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white shadow-[0_-1px_0_0_#e5e7eb]">
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
        </div>
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
    {previewOpen && (
      <div className="quotation-preview-modal fixed inset-0 z-50 flex flex-col bg-gray-950/75 p-2 sm:p-4 lg:p-6">
        <div className="quotation-preview-toolbar flex flex-wrap items-center gap-2 rounded-t-lg border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800">พรีวิวใบเสนอราคา</div>
            <div className="truncate text-xs text-gray-500">{doc.quoNo} · {doc.project}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
            onClick={() => setPreviewOpen(false)}
            aria-label="ปิดพรีวิว"
          >
            <X size={16} />
          </button>
        </div>
        <div className="quotation-preview-frame flex-1 overflow-auto bg-gray-200 p-3 sm:p-5">
          <div className="mx-auto w-fit">
            {previewUrl ? (
              <iframe
                title={`Quotation preview ${doc.quoNo}`}
                src={previewUrl}
                className="block h-[calc(100vh-10rem)] min-h-[297mm] w-[210mm] max-w-full border-0 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.22)]"
              />
            ) : (
              <div className="flex min-h-[297mm] w-[210mm] max-w-full items-center justify-center bg-white px-6 text-center text-sm text-gray-500 shadow-[0_12px_30px_rgba(15,23,42,0.22)]">
                ไม่สามารถโหลดพรีวิวได้ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
