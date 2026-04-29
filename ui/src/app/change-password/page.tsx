'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AuthAPI } from '@/lib/api'
import toast from 'react-hot-toast'

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { token, user, logout, refreshMe } = useAuthStore()
  const router = useRouter()

  // ถ้าไม่ได้ login ให้กลับไปหน้า login
  if (!token) {
    router.replace('/login')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (newPassword.length < 6) {
      toast.error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('รหัสผ่านใหม่ไม่ตรงกัน')
      return
    }
    if (oldPassword === newPassword) {
      toast.error('รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม')
      return
    }
    setLoading(true)
    try {
      await AuthAPI.changePassword(oldPassword, newPassword)
      await refreshMe()
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      router.replace('/dashboard')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-dark to-green-main flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-dark text-white text-2xl font-black mb-3">
              GD
            </div>
            <h1 className="text-xl font-bold text-gray-800">เปลี่ยนรหัสผ่าน</h1>
            <p className="text-sm text-gray-500 mt-1">
              สวัสดี <span className="font-semibold text-green-700">{user?.fullName}</span>
            </p>
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">
                🔐 กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งานระบบ
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">รหัสผ่านเดิม</label>
              <input
                type="password"
                className="form-input"
                placeholder="รหัสผ่านเดิม"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
            <div>
              <label className="form-label">รหัสผ่านใหม่</label>
              <input
                type="password"
                className="form-input"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                className="form-input"
                placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
            </button>

            <button
              type="button"
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-1"
              onClick={logout}
              disabled={loading}
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
