'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { HandoversAPI } from '@/lib/api'
import type { HandOverJob } from '@/types'
import { STATUS_LABELS } from '@/types'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

export default function HandoverDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [doc, setDoc] = useState<HandOverJob | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    HandoversAPI.get(id)
      .then(setDoc)
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (!doc) return <div className="text-center py-16 text-gray-400">ไม่พบเอกสาร</div>

  const isMine = doc.salesId === user?.id
  const canEdit = isMine && doc.status === 'draft'

  const ratingBar = (val: number) => (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`w-5 h-2 rounded-sm ${i <= val ? 'bg-green-main' : 'bg-gray-200'}`} />
        ))}
      </div>
      <span className="text-sm font-medium">{val}/5</span>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="page-title">{doc.hoNo}</h2>
            <span className={`badge badge-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
          </div>
          <p className="page-sub">{doc.project}</p>
        </div>
        {canEdit && (
          <button className="btn-outline btn-sm" onClick={() => router.push(`/handovers/${id}/edit`)}>
            <Pencil size={14} /> แก้ไข
          </button>
        )}
      </div>

      <div className="card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="form-label">โครงการ</span><p>{doc.project}</p></div>
        <div><span className="form-label">ผู้รับเหมา</span><p>{doc.contractor || '-'}</p></div>
        <div><span className="form-label">สถานที่</span><p>{doc.location || '-'}</p></div>
        <div><span className="form-label">ผู้ติดต่อ</span><p>{doc.contactName || '-'}</p></div>
        <div><span className="form-label">โทร</span><p>{doc.contactTel || '-'}</p></div>
        <div><span className="form-label">เซลล์</span><p>{doc.sales?.fullName ?? doc.salesId}</p></div>
        <div><span className="form-label">สินค้า/บริการ</span><p>{doc.product || '-'}</p></div>
        <div><span className="form-label">ผู้รับผิดชอบ</span><p>{doc.responsibility || '-'}</p></div>
        <div><span className="form-label">วันให้บริการ</span><p>{doc.serviceDate ? new Date(doc.serviceDate).toLocaleDateString('th-TH') : '-'}</p></div>
        {doc.comment && <div className="col-span-full"><span className="form-label">ความคิดเห็น</span><p>{doc.comment}</p></div>}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-4">การประเมินคุณภาพ</h3>
        <div className="space-y-3">
          <div>
            <span className="form-label">คุณภาพสินค้า</span>
            {ratingBar(doc.qualityProduct)}
          </div>
          <div>
            <span className="form-label">คุณภาพงานขาย</span>
            {ratingBar(doc.qualitySales)}
          </div>
          <div>
            <span className="form-label">คุณภาพการติดตั้ง</span>
            {ratingBar(doc.qualityInstall)}
          </div>
        </div>
      </div>
    </div>
  )
}
