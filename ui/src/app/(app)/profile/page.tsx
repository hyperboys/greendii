'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { UsersAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { Save, User } from 'lucide-react'

export default function ProfilePage() {
  const { user: me, refreshMe } = useAuthStore()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    firstName: '', lastName: '', firstNameEn: '', lastNameEn: '',
    email: '', phone: '',
  })

  useEffect(() => {
    if (!me) return
    setForm({
      firstName:   me.firstName   ?? '',
      lastName:    me.lastName    ?? '',
      firstNameEn: me.firstNameEn ?? '',
      lastNameEn:  me.lastNameEn  ?? '',
      email:       me.email       ?? '',
      phone:       me.phone       ?? '',
    })
  }, [me])

  const handleSave = async () => {
    if (!me) return
    setSaving(true)
    try {
      await UsersAPI.update(me.id, {
        firstName:   form.firstName   || undefined,
        lastName:    form.lastName    || undefined,
        firstNameEn: form.firstNameEn || undefined,
        lastNameEn:  form.lastNameEn  || undefined,
        email:       form.email       || undefined,
        phone:       form.phone       || undefined,
      })
      await refreshMe()
      toast.success('บันทึกข้อมูลสำเร็จ')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  if (!me) return null

  return (
    <div className="max-w-xl mx-auto">
      <div className="page-header">
        <div>
          <h2 className="page-title">โปรไฟล์ของฉัน</h2>
          <p className="page-sub">แก้ไขข้อมูลส่วนตัว</p>
        </div>
      </div>

      <div className="card p-6 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div className="w-14 h-14 rounded-full bg-green-main text-white flex items-center justify-center text-xl font-bold">
            {me.initials || me.fullName?.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{me.fullName}</p>
            <p className="text-sm text-gray-500">{me.username}</p>
          </div>
        </div>

        {/* ชื่อภาษาไทย */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">ชื่อภาษาไทย</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">ชื่อ</label>
              <input className="form-input" value={form.firstName}
                onChange={e => setForm(v => ({ ...v, firstName: e.target.value }))}
                placeholder="ชื่อ" />
            </div>
            <div>
              <label className="form-label">นามสกุล</label>
              <input className="form-input" value={form.lastName}
                onChange={e => setForm(v => ({ ...v, lastName: e.target.value }))}
                placeholder="นามสกุล" />
            </div>
          </div>
        </div>

        {/* English Name */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">English Name</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">First Name</label>
              <input className="form-input" value={form.firstNameEn}
                onChange={e => setForm(v => ({ ...v, firstNameEn: e.target.value }))}
                placeholder="First name" />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input className="form-input" value={form.lastNameEn}
                onChange={e => setForm(v => ({ ...v, lastNameEn: e.target.value }))}
                placeholder="Last name" />
            </div>
          </div>
        </div>

        {/* ติดต่อ */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">ข้อมูลติดต่อ</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">อีเมล</label>
              <input type="email" className="form-input" value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))}
                placeholder="email@example.com" />
            </div>
            <div>
              <label className="form-label">เบอร์โทรศัพท์</label>
              <input className="form-input" value={form.phone}
                onChange={e => setForm(v => ({ ...v, phone: e.target.value }))}
                placeholder="0xx-xxx-xxxx" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn-outline" onClick={() => router.push('/change-password')}>
            เปลี่ยนรหัสผ่าน
          </button>
        </div>
      </div>
    </div>
  )
}
