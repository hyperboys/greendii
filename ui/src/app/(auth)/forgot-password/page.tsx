'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AuthAPI } from '@/lib/api'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = identifier.trim()
    if (!value) {
      toast.error('กรุณากรอกชื่อผู้ใช้หรืออีเมล')
      return
    }

    setLoading(true)
    try {
      await AuthAPI.forgotPassword(value)
      setSent(true)
      toast.success('ส่งรหัสผ่านชั่วคราวไปที่อีเมลแล้ว')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'ไม่สามารถส่งรหัสผ่านชั่วคราวได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1b5e20] via-[#2d6a2e] to-[#1e6b3a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-green-main via-green-light to-green-main" />
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Image src="/logo.jpg" alt="GreenDii" width={180} height={90} className="object-contain" priority />
              </div>
              <h1 className="text-xl font-bold text-gray-800">ลืมรหัสผ่าน</h1>
              <p className="text-sm text-gray-500 mt-1">ระบบจะส่งรหัสผ่านชั่วคราวไปยังอีเมลของบัญชีนั้น</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">ชื่อผู้ใช้หรืออีเมล</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="username หรือ email"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  disabled={loading || sent}
                />
              </div>

              <button
                type="submit"
                className="btn-primary btn-block mt-2"
                disabled={loading || sent}
              >
                {loading ? 'กำลังส่ง…' : sent ? 'ส่งแล้ว' : 'ส่งรหัสผ่านชั่วคราว'}
              </button>
            </form>

            <div className="mt-5 rounded-xl bg-green-50 border border-green-100 p-4 text-sm text-green-900 leading-6">
              <p>• เมลจะมาพร้อมรหัสผ่านชั่วคราว</p>
              <p>• เมื่อเข้าสู่ระบบได้แล้ว ระบบจะบังคับให้เปลี่ยนรหัสผ่านทันที</p>
            </div>

            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm font-medium text-green-700 hover:text-green-900">
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}