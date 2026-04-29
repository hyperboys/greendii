'use client'

import { useEffect, useState } from 'react'
import { UnitsAPI } from '@/lib/api'
import type { Unit } from '@/types'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function UnitsPage() {
  const [rows, setRows] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    UnitsAPI.list().then(setRows).catch(() => toast.error('โหลดไม่สำเร็จ')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await UnitsAPI.create({ name: newName.trim() })
      setNewName('')
      load()
      toast.success('เพิ่มหน่วยสำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const update = async () => {
    if (!editing?.name.trim()) return
    setSaving(true)
    try {
      await UnitsAPI.update(editing.id, { name: editing.name })
      setEditing(null)
      load()
      toast.success('อัปเดตสำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('ต้องการลบหน่วยนี้?')) return
    try { await UnitsAPI.delete(id); load(); toast.success('ลบสำเร็จ') }
    catch (err) { toast.error(typeof err === 'string' ? err : 'ลบไม่สำเร็จ') }
  }

  return (
    <div className="max-w-lg">
      <div className="page-header">
        <div><h2 className="page-title">หน่วยนับ</h2><p className="page-sub">จัดการหน่วยนับสินค้า</p></div>
      </div>

      <div className="card p-5 mb-4">
        <div className="flex gap-2">
          <input className="form-input flex-1" placeholder="ชื่อหน่วยใหม่ เช่น ชิ้น, ชุด, ม."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add} disabled={saving || !newName.trim()}>
            <Plus size={16} /> เพิ่ม
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>ชื่อหน่วย</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.map(u => (
              <tr key={u.id}>
                <td>
                  {editing?.id === u.id ? (
                    <input className="form-input py-1 w-full" value={editing.name}
                      onChange={e => setEditing(ev => ev ? { ...ev, name: e.target.value } : ev)}
                      onKeyDown={e => e.key === 'Enter' && update()} autoFocus />
                  ) : (
                    <span className="font-medium">{u.name}</span>
                  )}
                </td>
                <td><span className={`badge ${u.active ? 'badge-approved' : 'badge-draft'}`}>{u.active ? 'ใช้งาน' : 'ปิดใช้'}</span></td>
                <td>
                  <div className="flex gap-1 justify-end">
                    {editing?.id === u.id ? (
                      <>
                        <button className="btn-primary btn-sm" onClick={update} disabled={saving}>บันทึก</button>
                        <button className="btn-outline btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-outline btn-sm" onClick={() => setEditing({ id: u.id, name: u.name })}>
                          <Pencil size={12} />
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => del(u.id)}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
