'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// รวมเข้ากับหน้า "บทบาท สิทธิ์ และเมนู" (/admin/roles) แท็บ "การเข้าถึงเมนู" แล้ว
export default function MenuAccessPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/roles') }, [router])
  return <div className="text-center py-16 text-gray-400">กำลังเปลี่ยนเส้นทาง…</div>
}
