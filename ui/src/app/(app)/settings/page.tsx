'use client'

import { useEffect, useState } from 'react'
import { SettingsAPI } from '@/lib/api'
import type { Settings } from '@/types'
import { useAuthStore } from '@/store/auth'
import { Save, Building2, Phone, Mail, Globe, Hash } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY: Partial<Settings> = {
  companyName: '', companyNameEn: '', address: '',
  taxId: '', tel: '', email: '', website: '',
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const canEdit = user?.role === 'admin' || user?.role === 'director'
  const [form, setForm] = useState<Partial<Settings>>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    SettingsAPI.get()
      .then(s => setForm(s))
      .catch(() => toast.error('โหลดการตั้งค่าไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  const f = (key: keyof Settings) => ({
    value: (form as Record<string, unknown>)?.[key] as string ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
    disabled: !canEdit,
  })

  const save = async () => {
    setSaving(true)
    try {
      const updated = await SettingsAPI.update(form)
      setForm(updated)
      toast.success('บันทึกการตั้งค่าสำเร็จ')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <div className="max-w-2xl">
      <div className="page-header">
        <div>
          <h2 className="page-title">ตั้งค่าระบบ</h2>
          <p className="page-sub">ข้อมูลบริษัทและการตั้งค่าทั่วไป</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} />
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        )}
      </div>

      {/* Company Info */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-green-main" />
          <h3 className="font-semibold text-gray-800">ข้อมูลบริษัท</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="form-label">ชื่อบริษัท (ภาษาไทย)</label>
            <input className="form-input" {...f('companyName')} placeholder="กรีนดี จำกัด" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">ชื่อบริษัท (ภาษาอังกฤษ)</label>
            <input className="form-input" {...f('companyNameEn')} placeholder="Green Dii Co., Ltd." />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">ที่อยู่</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.address ?? ''}
              onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
              disabled={!canEdit}
              placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
            />
          </div>
          <div>
            <label className="form-label flex items-center gap-1"><Hash size={12} /> เลขผู้เสียภาษี</label>
            <input className="form-input" {...f('taxId')} placeholder="0000000000000" />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Phone size={18} className="text-green-main" />
          <h3 className="font-semibold text-gray-800">ข้อมูลติดต่อ</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label flex items-center gap-1"><Phone size={12} /> โทรศัพท์</label>
            <input className="form-input" {...f('tel')} placeholder="02-xxx-xxxx" />
          </div>
          <div>
            <label className="form-label flex items-center gap-1"><Mail size={12} /> อีเมล</label>
            <input type="email" className="form-input" {...f('email')} placeholder="info@greendii.com" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label flex items-center gap-1"><Globe size={12} /> เว็บไซต์</label>
            <input className="form-input" {...f('website')} placeholder="https://greendii.app" />
          </div>
        </div>
      </div>

      {/* Access info */}
      {!canEdit && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
          คุณมีสิทธิ์ดูข้อมูลเท่านั้น เฉพาะ System Admin และ Managing Director เท่านั้นที่สามารถแก้ไขได้
        </div>
      )}
    </div>
  )
}
