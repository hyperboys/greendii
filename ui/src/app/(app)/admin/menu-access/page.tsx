'use client'

import { useEffect, useState } from 'react'
import { SettingsAPI, AdminAPI } from '@/lib/api'
import { MENU_ITEMS, DEFAULT_MENU_ACCESS, type UserRole } from '@/types'
import { useSettingsStore } from '@/store/settings'
import { Save, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MenuAccessPage() {
  const { rolePermissionsConfig, fetchSettings } = useSettingsStore()
  const allRoles = rolePermissionsConfig.roles
  const [config, setConfig] = useState<Record<string, UserRole[]>>(DEFAULT_MENU_ACCESS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
    SettingsAPI.get().then(s => {
      if (s.menuAccessConfig) setConfig(s.menuAccessConfig as Record<string, UserRole[]>)
    }).finally(() => setLoading(false))
  }, [])

  const toggle = (menuKey: string, role: UserRole) => {
    setConfig(prev => {
      const cur = prev[menuKey] ?? []
      return {
        ...prev,
        [menuKey]: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role],
      }
    })
  }

  const toggleAll = (menuKey: string, checked: boolean) => {
    setConfig(prev => ({ ...prev, [menuKey]: checked ? allRoles.map(r => r.key) : [] }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await AdminAPI.updateMenuAccess(config)
      toast.success('บันทึกการตั้งค่าเมนูสำเร็จ')
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setConfig(DEFAULT_MENU_ACCESS)
    toast('รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)', { icon: '↩️' })
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">ควบคุมการเข้าถึงเมนู</h2>
          <p className="page-sub">กำหนดว่า Role ใดสามารถมองเห็นเมนูใดในระบบ</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm" onClick={reset}>
            <RefreshCw size={14} /> รีเซ็ต
          </button>
          <button className="btn-primary btn-sm" onClick={save} disabled={saving}>
            <Save size={14} /> {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-800">
        <strong>หมายเหตุ:</strong> การเปลี่ยนแปลงจะมีผลทันทีเมื่อผู้ใช้รีเฟรชหน้า
        เมนู Admin (ผู้ดูแลระบบ) จะแสดงเฉพาะ admin/director เสมอโดยไม่ขึ้นกับการตั้งค่านี้
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-green-dark text-white">
                <th className="text-left px-4 py-3 font-semibold min-w-36">เมนู</th>
                {allRoles.map(r => (
                  <th key={r.key} className="px-2 py-3 text-center text-xs">
                    <div className="font-semibold">{r.label}</div>
                    <div className="font-normal opacity-70 text-[10px]">{r.key}</div>
                  </th>
                ))}
                <th className="px-2 py-3 text-center text-xs">ทั้งหมด</th>
              </tr>
            </thead>
            <tbody>
              {MENU_ITEMS.map((menu, i) => {
                const cur = config[menu.key] ?? []
                const allChecked = allRoles.every(r => cur.includes(r.key))
                return (
                  <tr key={menu.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-700">{menu.label}</td>
                    {allRoles.map(role => (
                      <td key={role.key} className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={cur.includes(role.key)}
                          onChange={() => toggle(menu.key, role.key)}
                          className="w-4 h-4 accent-green-600 cursor-pointer"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={e => toggleAll(menu.key, e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
