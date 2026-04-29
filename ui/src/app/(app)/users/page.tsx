'use client'

import { useEffect, useState } from 'react'
import { UsersAPI } from '@/lib/api'
import type { User, UserRole } from '@/types'
import { ROLE_LABELS } from '@/types'
import { Plus, Pencil, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY_USER = { username: '', fullName: '', initials: '', role: 'sales' as UserRole, password: '', lineUserId: '' }

export default function UsersPage() {
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<typeof EMPTY_USER & { id?: string } | null>(null)
  const [pwdModal, setPwdModal] = useState<{ id: string; pw: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    UsersAPI.list().then(setRows).catch(() => toast.error('โหลดไม่สำเร็จ')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.username || !editing.fullName) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return }
    setSaving(true)
    try {
      if (editing.id) {
        await UsersAPI.update(editing.id, { fullName: editing.fullName, initials: editing.initials, role: editing.role, lineUserId: editing.lineUserId })
      } else {
        if (!editing.password) { toast.error('กรุณาตั้งรหัสผ่าน'); setSaving(false); return }
        await UsersAPI.create({ username: editing.username, fullName: editing.fullName, initials: editing.initials, role: editing.role, password: editing.password, lineUserId: editing.lineUserId })
      }
      toast.success('บันทึกสำเร็จ')
      setEditing(null)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const savePassword = async () => {
    if (!pwdModal?.pw) { toast.error('กรุณากรอกรหัสผ่าน'); return }
    setSaving(true)
    try {
      await UsersAPI.setPassword(pwdModal.id, pwdModal.pw)
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      setPwdModal(null)
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">ผู้ใช้งาน</h2><p className="page-sub">จัดการบัญชีผู้ใช้</p></div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_USER })}>
          <Plus size={16} /> เพิ่มผู้ใช้
        </button>
      </div>

      {editing && (
        <div className="card p-5 mb-4">
          <h3 className="font-semibold text-gray-800 mb-4">{editing.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">ชื่อผู้ใช้ *</label>
              <input className="form-input" value={editing.username} disabled={!!editing.id}
                onChange={e => setEditing(v => v ? { ...v, username: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ชื่อ-นามสกุล *</label>
              <input className="form-input" value={editing.fullName}
                onChange={e => setEditing(v => v ? { ...v, fullName: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ชื่อย่อ</label>
              <input className="form-input" value={editing.initials} maxLength={3}
                onChange={e => setEditing(v => v ? { ...v, initials: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ตำแหน่ง</label>
              <select className="form-input" value={editing.role}
                onChange={e => setEditing(v => v ? { ...v, role: e.target.value as UserRole } : v)}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {!editing.id && (
              <div>
                <label className="form-label">รหัสผ่าน *</label>
                <input type="password" className="form-input" value={editing.password}
                  onChange={e => setEditing(v => v ? { ...v, password: e.target.value } : v)} />
              </div>
            )}
            <div>
              <label className="form-label">LINE User ID</label>
              <input className="form-input" value={editing.lineUserId}
                onChange={e => setEditing(v => v ? { ...v, lineUserId: e.target.value } : v)} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            <button className="btn-outline" onClick={() => setEditing(null)}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Password modal */}
      {pwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-2xl">
            <h3 className="font-semibold text-gray-800 mb-4">เปลี่ยนรหัสผ่าน</h3>
            <input type="password" className="form-input mb-4" placeholder="รหัสผ่านใหม่"
              value={pwdModal.pw} onChange={e => setPwdModal(v => v ? { ...v, pw: e.target.value } : v)} autoFocus />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={savePassword} disabled={saving}>บันทึก</button>
              <button className="btn-outline flex-1" onClick={() => setPwdModal(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.map(u => (
              <tr key={u.id}>
                <td className="font-mono text-sm">{u.username}</td>
                <td className="font-medium">{u.fullName}</td>
                <td className="text-xs text-gray-500">{ROLE_LABELS[u.role]}</td>
                <td><span className={`badge ${u.active ? 'badge-approved' : 'badge-draft'}`}>{u.active ? 'ใช้งาน' : 'ปิดใช้'}</span></td>
                <td>
                  <div className="flex gap-1 justify-end">
                    <button className="btn-outline btn-sm" title="แก้ไข"
                      onClick={() => setEditing({ id: u.id, username: u.username, fullName: u.fullName, initials: u.initials, role: u.role, password: '', lineUserId: u.lineUserId ?? '' })}>
                      <Pencil size={12} />
                    </button>
                    <button className="btn-outline btn-sm" title="เปลี่ยนรหัสผ่าน"
                      onClick={() => setPwdModal({ id: u.id, pw: '' })}>
                      <KeyRound size={12} />
                    </button>
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
