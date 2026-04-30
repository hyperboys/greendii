'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      await login(username, password)
      router.replace('/dashboard')
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-dark to-green-main flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <Image src="/logo.jpg" alt="GreenDii" width={64} height={64} className="rounded-2xl" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">GreenDii</h1>
            <p className="text-sm text-gray-500 mt-1">Sales Workflow System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">ชื่อผู้ใช้</label>
              <input
                type="text"
                className="form-input"
                placeholder="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label className="form-label">รหัสผ่าน</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-block mt-2"
              disabled={loading}
            >
              {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            GreenDii Co., Ltd. © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
