'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PRAPI, SettingsAPI } from '@/lib/api'
import type { PurchaseRequest, Settings } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, CheckCircle, XCircle, SendHorizonal, Pencil, Printer, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PRPrint from '@/components/PRPrint'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function PRDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const { stepRoleConfig, getRoleLabel } = useSettingsStore()
  const [doc, setDoc] = useState<PurchaseRequest | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)

  const load = () => {
    setLoading(true)
    PRAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { SettingsAPI.get().then(setSettings).catch(() => {}) }, [])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const isAdmin = ['admin', 'director', 'admin_mgr'].includes(user?.role ?? '')
  const canEdit = (isMine || isAdmin) && doc.status === 'draft'
  const canSubmit = isMine && doc.status === 'draft'
  const canResubmit = isMine && doc.status === 'rejected'
  const canDelete = (isMine || isAdmin) && ['draft', 'rejected'].includes(doc.status)
  const nextStep = doc.approvalStep + 1
  const nextStepRole = stepRoleConfig[String(nextStep)]
  const canApprove = doc.status === 'pending' && nextStepRole === user?.role

  const act = async (action: 'submit' | 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm('ยืนยันการลบ/ยกเลิกเอกสารนี้?')) return
    setActing(true)
    try {
      if (action === 'submit') await PRAPI.submit(id)
      else if (action === 'approve') await PRAPI.approve(id, comment)
      else if (action === 'reject') await PRAPI.reject(id, comment)
      else if (action === 'delete') { await PRAPI.cancel(id); router.push('/pr'); return }
      toast.success('ดำเนินการสำเร็จ')
      load(); setComment('')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PRPrint doc={doc} settings={settings} />
      <div className="flex items-center gap-3 no-print">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="page-title">{doc.prNo}</h2>
            <span className={`badge badge-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
          </div>
          <p className="page-sub">{doc.customer}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button className="btn-outline btn-sm" onClick={() => router.push(`/pr/${id}/edit`)}>
              <Pencil size={14} /> แก้ไข
            </button>
          )}
          {canDelete && (
            <button className="btn-danger btn-sm" onClick={() => act('delete')} disabled={acting}>
              <Trash2 size={14} /> ลบ
            </button>
          )}
          <button className="btn-outline btn-sm no-print" onClick={() => window.print()}>
            <Printer size={14} /> พิมพ์
          </button>
        </div>
      </div>

      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm no-print">
        <div><span className="form-label">ลูกค้า</span><p>{doc.customer}</p></div>
        <div><span className="form-label">โครงการอ้างอิง</span><p>{doc.projectRef || '-'}</p></div>
        <div><span className="form-label">อ้างอิง WO</span><p>{doc.workOrder?.woNo || '-'}</p></div>
        <div><span className="form-label">วันที่ออก</span><p>{doc.dateIssue ? new Date(doc.dateIssue).toLocaleDateString('th-TH') : '-'}</p></div>
        <div><span className="form-label">ต้องการภายใน</span><p>{doc.dateRequired ? new Date(doc.dateRequired).toLocaleDateString('th-TH') : '-'}</p></div>
        {doc.remarks && <div className="col-span-full"><span className="form-label">หมายเหตุ</span><p>{doc.remarks}</p></div>}
      </div>

      <div className="card overflow-x-auto no-print">
        <table className="data-table">
          <thead>
            <tr><th>#</th><th>P/N</th><th>รายการ</th><th className="text-right">จำนวน</th><th>หน่วย</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">จำนวนเงิน</th></tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td className="text-gray-400">{item.seq ?? i + 1}</td>
                <td className="text-gray-500 text-xs">{item.partNo || '-'}</td>
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
            <tr className="bg-gray-50"><td colSpan={5} className="text-right font-semibold px-4 py-3">ยอดรวม</td><td className="text-right font-semibold px-4 py-3">฿{fmtMoney(doc.subTotal)}</td></tr>
            {Number(doc.specialDiscount) > 0 && (
              <tr className="bg-gray-50"><td colSpan={5} className="text-right text-gray-500 px-4 py-2">ส่วนลดพิเศษ</td><td className="text-right text-gray-500 px-4 py-2">-฿{fmtMoney(doc.specialDiscount)}</td></tr>
            )}
            <tr className="bg-gray-50"><td colSpan={5} className="text-right text-gray-500 px-4 py-2">VAT 7%</td><td className="text-right text-gray-500 px-4 py-2">฿{fmtMoney(doc.vat)}</td></tr>
            <tr className="bg-green-pale"><td colSpan={5} className="text-right font-bold text-green-dark px-4 py-3">ยอดสุทธิ</td><td className="text-right font-bold text-green-dark px-4 py-3 text-base">฿{fmtMoney(doc.netTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="card p-5 no-print">
        <h3 className="font-semibold text-gray-800 mb-3">สายการอนุมัติ</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stepRoleConfig)
            .map(([step, role]) => ({ step: Number(step), role, label: getRoleLabel(role) }))
            .sort((a, b) => a.step - b.step)
            .map(s => {
            const log = doc.approvalLogs?.find(l => l.step === s.step)
            const isNext = s.step === nextStep && doc.status === 'pending'
            return (
              <div key={s.step} className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs text-center min-w-[80px] ${
                log?.action === 'approve' ? 'bg-green-pale border-green-main text-green-dark' :
                log?.action === 'reject' ? 'bg-red-50 border-red-300 text-red-700' :
                isNext ? 'bg-orange-50 border-orange-300 text-orange-700' :
                'bg-gray-50 border-gray-200 text-gray-500'
              }`}>
                <span className="font-semibold">{s.label}</span>
                {log ? <span>{log.action === 'approve' ? '✓' : '✕'}</span> : isNext ? <span>รออนุมัติ</span> : null}
              </div>
            )
          })}
        </div>
      </div>

      {(canSubmit || canResubmit || canApprove) && (
        <div className="card p-5 space-y-3 no-print">
          <h3 className="font-semibold text-gray-800">ดำเนินการ</h3>
          <textarea className="form-input" rows={2} placeholder="ความคิดเห็น"
            value={comment} onChange={e => setComment(e.target.value)} />
          <div className="flex gap-2">
            {(canSubmit || canResubmit) && (
              <button className="btn-primary" onClick={() => act('submit')} disabled={acting}>
                <SendHorizonal size={15} /> {canResubmit ? 'ส่งอนุมัติอีกครั้ง' : 'ส่งอนุมัติ'}
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
