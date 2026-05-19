'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApprovalsAPI } from '@/lib/api'
import type { PendingApprovals } from '@/types'
import { CheckSquare } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ApprovalsPage() {
  const router = useRouter()
  const [data, setData] = useState<PendingApprovals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ApprovalsAPI.pending()
      .then(setData)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  const total = (data?.quotations.length ?? 0) + (data?.workOrders.length ?? 0) + (data?.prs.length ?? 0) + (data?.handovers.length ?? 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">รออนุมัติ</h2>
          <p className="page-sub">เอกสารที่รอการอนุมัติจากคุณ {total > 0 && `(${total} รายการ)`}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
      ) : total === 0 ? (
        <div className="card p-12 text-center">
          <CheckSquare size={48} className="text-green-main mx-auto mb-3 opacity-50" />
          <p className="text-gray-500">ไม่มีเอกสารรออนุมัติ</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(data?.quotations.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">ใบเสนอราคา (QO) · {data!.quotations.length} รายการ</h3>
              <table className="data-table">
                <thead>
                  <tr><th>เลขที่</th><th>ลูกค้า</th><th>โครงการ</th><th className="text-right">ยอดรวม</th><th>วันที่</th></tr>
                </thead>
                <tbody>
                  {data!.quotations.map(q => (
                    <tr key={q.id} className="cursor-pointer" onClick={() => router.push(`/quotations/${q.id}`)}>
                      <td className="font-mono text-xs font-semibold text-green-dark">{q.quoNo}</td>
                      <td>{q.customerName}</td>
                      <td>{q.project}</td>
                      <td className="text-right">฿{new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(q.grandTotal)}</td>
                      <td className="text-xs text-gray-500">{new Date(q.createdAt).toLocaleDateString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(data?.workOrders.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">ใบสั่งงาน (WO) · {data!.workOrders.length} รายการ</h3>
              <table className="data-table">
                <thead>
                  <tr><th>เลขที่</th><th>ลูกค้า</th><th>โครงการ</th><th>วันติดตั้ง</th><th>วันที่</th></tr>
                </thead>
                <tbody>
                  {data!.workOrders.map(w => (
                    <tr key={w.id} className="cursor-pointer" onClick={() => router.push(`/workorders/${w.id}`)}>
                      <td className="font-mono text-xs font-semibold text-blue-700">{w.woNo}</td>
                      <td>{w.customerName}</td>
                      <td>{w.project}</td>
                      <td className="text-xs text-gray-500">{w.installDate ? new Date(w.installDate).toLocaleDateString('th-TH') : '-'}</td>
                      <td className="text-xs text-gray-500">{new Date(w.createdAt).toLocaleDateString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(data?.prs.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">ใบขอซื้อ (PR) · {data!.prs.length} รายการ</h3>
              <table className="data-table">
                <thead>
                  <tr><th>เลขที่</th><th>ลูกค้า</th><th className="text-right">ยอดสุทธิ</th><th>วันที่</th></tr>
                </thead>
                <tbody>
                  {data!.prs.map(p => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/pr/${p.id}`)}>
                      <td className="font-mono text-xs font-semibold text-purple-700">{p.prNo}</td>
                      <td>{p.customer}</td>
                      <td className="text-right">฿{new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(p.netTotal)}</td>
                      <td className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(data?.handovers.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">ส่งมอบงาน (HO) · {data!.handovers.length} รายการ</h3>
              <table className="data-table">
                <thead>
                  <tr><th>เลขที่</th><th>โครงการ</th><th>วันที่</th></tr>
                </thead>
                <tbody>
                  {data!.handovers.map(h => (
                    <tr key={h.id} className="cursor-pointer" onClick={() => router.push(`/handovers/${h.id}`)}>
                      <td className="font-mono text-xs font-semibold text-orange-700">{h.hoNo}</td>
                      <td>{h.project}</td>
                      <td className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleDateString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
