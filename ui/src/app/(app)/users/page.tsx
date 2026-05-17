'use client'

import { useEffect, useState } from 'react'
import { UsersAPI } from '@/lib/api'
import type { User, UserRole } from '@/types'
import { ROLE_LABELS } from '@/types'
import { Plus, Pencil, KeyRound, Search, UserCheck, UserX, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'

const EMPTY_USER = {
  username: '', fullName: '', initials: '', role: 'sales' as UserRole,
  password: '', lineUserId: '', email: '', phone: '', department: '', position: '', signatureText: '',
}

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const isAdmin = me?.role === 'admin' || me?.role === 'director' || me?.role === 'admin_mgr'
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [editing, setEditing] = useState<typeof EMPTY_USER & { id?: string } | null>(null)
  const [pwdModal, setPwdModal] = useState<{ id: string; pw: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (filterRole) params.role = filterRole
    if (filterActive !== '') params.active = filterActive
    UsersAPI.list(params).then(setRows).catch(() => toast.error('โหลดไม่สำเร็จ')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.username || !editing.fullName) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return }
    setSaving(true)
    try {
      if (editing.id) {
        await UsersAPI.update(editing.id, {
          fullName: editing.fullName, initials: editing.initials, role: editing.role,
          lineUserId: editing.lineUserId, email: editing.email, phone: editing.phone,
          department: editing.department, position: editing.position, signatureText: editing.signatureText,
        })
      } else {
        if (!editing.password) { toast.error('กรุณาตั้งรหัสผ่าน'); setSaving(false); return }
        await UsersAPI.create({
          username: editing.username, fullName: editing.fullName, initials: editing.initials,
          role: editing.role, password: editing.password, lineUserId: editing.lineUserId,
          email: editing.email, phone: editing.phone, department: editing.department,
          position: editing.position, signatureText: editing.signatureText,
        })
      }
      toast.success('บันทึกสำเร็จ')
      setEditing(null)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const savePassword = async () => {
    if (!pwdModal?.pw || pwdModal.pw.length < 6) { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    setSaving(true)
    try {
      await UsersAPI.setPassword(pwdModal.id, pwdModal.pw)
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      setPwdModal(null)
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: User) => {
    const action = u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'
    if (!confirm(`${action} ผู้ใช้ "${u.fullName}"?`)) return
    try {
      await UsersAPI.toggleActive(u.id, !u.active)
      toast.success(`${action}สำเร็จ`)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
  }

  const forceChangePwd = async (u: User) => {
    if (!confirm(`บังคับให้ "${u.fullName}" เปลี่ยนรหัสผ่านเมื่อ login ครั้งถัดไป?`)) return
    try {
      await UsersAPI.forceChangePassword(u.id)
      toast.success('ตั้งค่าสำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
  }

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">ผู้ใช้งาน</h2><p className="page-sub">จัดการบัญชีผู้ใช้และสิทธิ์การใช้งาน</p></div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_USER })}>
            <Plus size={16} /> เพิ่มผู้ใช้
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="toolbar flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหาชื่อ / username"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <select className="form-input py-1.5 w-44" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">ทุกตำแหน่ง</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-input py-1.5 w-36" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="true">ใช้งาน</option>
          <option value="false">ปิดใช้</option>
        </select>
        <button className="btn-outline py-1.5" onClick={load}>ค้นหา</button>
      </div>

      {/* Edit / Create form */}
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
              <label className="form-label">สิทธิ์ / Role</label>
              <select className="form-input" value={editing.role}
                onChange={e => setEditing(v => v ? { ...v, role: e.target.value as UserRole } : v)}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">แผนก / ฝ่าย</label>
              <input className="form-input" value={editing.department}
                onChange={e => setEditing(v => v ? { ...v, department: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ตำแหน่ง</label>
              <input className="form-input" value={editing.position}
                onChange={e => setEditing(v => v ? { ...v, position: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">อีเมล</label>
              <input type="email" className="form-input" value={editing.email}
                onChange={e => setEditing(v => v ? { ...v, email: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">เบอร์โทรศัพท์</label>
              <input className="form-input" value={editing.phone}
                onChange={e => setEditing(v => v ? { ...v, phone: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ลายเซ็น (ข้อความ)</label>
              <input className="form-input font-mono" placeholder="เช่น Sarayut Y." value={editing.signatureText}
                onChange={e => setEditing(v => v ? { ...v, signatureText: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">LINE User ID</label>
              <input className="form-input" value={editing.lineUserId}
                onChange={e => setEditing(v => v ? { ...v, lineUserId: e.target.value } : v)} />
            </div>
            {!editing.id && (
              <div>
                <label className="form-label">รหัสผ่าน *</label>
                <input type="password" className="form-input" value={editing.password}
                  onChange={e => setEditing(v => v ? { ...v, password: e.target.value } : v)} />
              </div>
            )}
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
            <input type="password" className="form-input mb-4" placeholder="รหัสผ่านใหม่ (6+ ตัวอักษร)"
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
          <thead>
            <tr>
              <th>ชื่อผู้ใช้</th>
              <th>ชื่อ-นามสกุล</th>
              <th className="hidden sm:table-cell">ย่อ</th>
              <th>สิทธิ์</th>
              <th className="hidden lg:table-cell">แผนก</th>
              <th className="hidden lg:table-cell">ตำแหน่ง</th>
              <th className="hidden md:table-cell">ลายเซ็น</th>
              <th>สถานะ</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(u => (
              <tr key={u.id} className={!u.active ? 'opacity-50' : ''}>
                <td className="font-mono text-sm">{u.username}</td>
                <td>
                  <div className="font-medium">{u.fullName}</div>
                  {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                </td>
                <td className="hidden sm:table-cell">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-main/10 text-green-dark text-xs font-bold">
                    {u.initials || u.fullName?.charAt(0)}
                  </span>
                </td>
                <td>
                  <span className="badge badge-draft text-xs">{ROLE_LABELS[u.role]}</span>
                </td>
                <td className="hidden lg:table-cell text-sm text-gray-600">{u.department || '-'}</td>
                <td className="hidden lg:table-cell text-sm text-gray-600">{u.position || '-'}</td>
                <td className="hidden md:table-cell">
                  {u.signatureText
                    ? <span className="font-mono text-sm text-gray-700">{u.signatureText}</span>
                    : <span className="text-xs text-gray-300">-</span>}
                </td>
                <td>
                  <span className={`badge ${u.active ? 'badge-approved' : 'badge-cancelled'}`}>
                    {u.active ? 'ใช้งาน' : 'ปิดใช้'}
                  </span>
                </td>
                {isAdmin && (
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="btn-outline btn-sm" title="แก้ไข"
                        onClick={() => setEditing({
                          id: u.id, username: u.username, fullName: u.fullName, initials: u.initials,
                          role: u.role, password: '', lineUserId: u.lineUserId ?? '',
                          email: u.email ?? '', phone: u.phone ?? '', department: u.department ?? '',
                          position: u.position ?? '', signatureText: u.signatureText ?? '',
                        })}>
                        <Pencil size={12} />
                      </button>
                      <button className="btn-outline btn-sm" title="เปลี่ยนรหัสผ่าน"
                        onClick={() => setPwdModal({ id: u.id, pw: '' })}>
                        <KeyRound size={12} />
                      </button>
                      <button
                        className={`btn-outline btn-sm ${u.active ? 'hover:text-red-600 hover:border-red-400' : 'hover:text-green-700 hover:border-green-500'}`}
                        title={u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        onClick={() => toggleActive(u)}>
                        {u.active ? <UserX size={12} /> : <UserCheck size={12} />}
                      </button>
                      <button className="btn-outline btn-sm" title="บังคับเปลี่ยนรหัสผ่าน"
                        onClick={() => forceChangePwd(u)}>
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role legend */}
      <div className="card p-4 mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">สิทธิ์ตามตำแหน่ง</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-3 text-gray-500 font-medium">ตำแหน่ง</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบเสนอ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบสั่งงาน</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ส่งมอบ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบขอซื้อ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">อนุมัติ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">รายงาน</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">Master</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">จัดการ User</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">Settings</th>
              </tr>
            </thead>
            <tbody>
              {[
                { role: 'admin',       label: 'System Admin',        q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '✓' },
                { role: 'sales',       label: 'พนักงานขาย',          q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'sales2',      label: 'พนักงานขาย 2',       q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'sale_mgr',    label: 'ผู้จัดการฝ่ายขาย',    q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '-',  s: '-' },
                { role: 'admin_mgr',   label: 'ผู้จัดการธุรการ',      q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '-' },
                { role: 'project_mgr', label: 'ผู้จัดการโปรเจกต์',   q: '-', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '-',  u: '-',  s: '-' },
                { role: 'director',    label: 'ผู้อำนวยการ',          q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '✓' },
                { role: 'procurement', label: 'จัดซื้อ',              q: '-', wo: '-', ho: '-', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'factory',     label: 'โรงงาน',               q: '-', wo: '✓', ho: '✓', pr: '-',  ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
              ].map(r => (
                <tr key={r.role} className={`border-t border-gray-100 ${r.role === 'admin' ? 'bg-blue-50' : ''}`}>
                  <td className={`py-1.5 pr-3 font-medium ${r.role === 'admin' ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</td>
                  {[r.q, r.wo, r.ho, r.pr, r.ap, r.rp, r.m, r.u, r.s].map((v, i) => (
                    <td key={i} className={`py-1.5 px-2 text-center font-bold ${v === '✓' ? 'text-green-600' : 'text-gray-300'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const isAdmin = me?.role === 'admin' || me?.role === 'director' || me?.role === 'admin_mgr'
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [editing, setEditing] = useState<typeof EMPTY_USER & { id?: string } | null>(null)
  const [pwdModal, setPwdModal] = useState<{ id: string; pw: string } | null>(null)
  const [sigModal, setSigModal] = useState<{ user: User } | null>(null)
  const [saving, setSaving] = useState(false)
  const sigInputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (filterRole) params.role = filterRole
    if (filterActive !== '') params.active = filterActive
    UsersAPI.list(params).then(setRows).catch(() => toast.error('โหลดไม่สำเร็จ')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.username || !editing.fullName) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return }
    setSaving(true)
    try {
      if (editing.id) {
        await UsersAPI.update(editing.id, {
          fullName: editing.fullName, initials: editing.initials, role: editing.role,
          lineUserId: editing.lineUserId, email: editing.email, phone: editing.phone,
          department: editing.department, position: editing.position,
        })
      } else {
        if (!editing.password) { toast.error('กรุณาตั้งรหัสผ่าน'); setSaving(false); return }
        await UsersAPI.create({
          username: editing.username, fullName: editing.fullName, initials: editing.initials,
          role: editing.role, password: editing.password, lineUserId: editing.lineUserId,
          email: editing.email, phone: editing.phone, department: editing.department, position: editing.position,
        })
      }
      toast.success('บันทึกสำเร็จ')
      setEditing(null)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const savePassword = async () => {
    if (!pwdModal?.pw || pwdModal.pw.length < 6) { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    setSaving(true)
    try {
      await UsersAPI.setPassword(pwdModal.id, pwdModal.pw)
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      setPwdModal(null)
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: User) => {
    const action = u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'
    if (!confirm(`${action} ผู้ใช้ "${u.fullName}"?`)) return
    try {
      await UsersAPI.toggleActive(u.id, !u.active)
      toast.success(`${action}สำเร็จ`)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
  }

  const forceChangePwd = async (u: User) => {
    if (!confirm(`บังคับให้ "${u.fullName}" เปลี่ยนรหัสผ่านเมื่อ login ครั้งถัดไป?`)) return
    try {
      await UsersAPI.forceChangePassword(u.id)
      toast.success('ตั้งค่าสำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
  }

  const uploadSignature = async (file: File) => {
    if (!sigModal) return
    setSaving(true)
    try {
      const updated = await UsersAPI.uploadSignature(sigModal.user.id, file)
      toast.success('อัพโหลดลายเซ็นสำเร็จ')
      setSigModal({ user: updated })
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const deleteSignature = async () => {
    if (!sigModal) return
    if (!confirm('ลบลายเซ็นของผู้ใช้นี้?')) return
    setSaving(true)
    try {
      const updated = await UsersAPI.deleteSignature(sigModal.user.id)
      toast.success('ลบลายเซ็นสำเร็จ')
      setSigModal({ user: updated })
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">ผู้ใช้งาน</h2><p className="page-sub">จัดการบัญชีผู้ใช้และสิทธิ์การใช้งาน</p></div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_USER })}>
            <Plus size={16} /> เพิ่มผู้ใช้
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="toolbar flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหาชื่อ / username"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <select className="form-input py-1.5 w-44" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">ทุกตำแหน่ง</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-input py-1.5 w-36" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="true">ใช้งาน</option>
          <option value="false">ปิดใช้</option>
        </select>
        <button className="btn-outline py-1.5" onClick={load}>ค้นหา</button>
      </div>

      {/* Edit / Create form */}
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
              <label className="form-label">สิทธิ์ / Role</label>
              <select className="form-input" value={editing.role}
                onChange={e => setEditing(v => v ? { ...v, role: e.target.value as UserRole } : v)}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">แผนก / ฝ่าย</label>
              <input className="form-input" value={editing.department}
                onChange={e => setEditing(v => v ? { ...v, department: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ตำแหน่ง</label>
              <input className="form-input" value={editing.position}
                onChange={e => setEditing(v => v ? { ...v, position: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">อีเมล</label>
              <input type="email" className="form-input" value={editing.email}
                onChange={e => setEditing(v => v ? { ...v, email: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">เบอร์โทรศัพท์</label>
              <input className="form-input" value={editing.phone}
                onChange={e => setEditing(v => v ? { ...v, phone: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">LINE User ID</label>
              <input className="form-input" value={editing.lineUserId}
                onChange={e => setEditing(v => v ? { ...v, lineUserId: e.target.value } : v)} />
            </div>
            {!editing.id && (
              <div>
                <label className="form-label">รหัสผ่าน *</label>
                <input type="password" className="form-input" value={editing.password}
                  onChange={e => setEditing(v => v ? { ...v, password: e.target.value } : v)} />
              </div>
            )}
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
            <input type="password" className="form-input mb-4" placeholder="รหัสผ่านใหม่ (6+ ตัวอักษร)"
              value={pwdModal.pw} onChange={e => setPwdModal(v => v ? { ...v, pw: e.target.value } : v)} autoFocus />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={savePassword} disabled={saving}>บันทึก</button>
              <button className="btn-outline flex-1" onClick={() => setPwdModal(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Signature modal */}
      {sigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="font-semibold text-gray-800 mb-1">ลายเซ็น</h3>
            <p className="text-sm text-gray-500 mb-4">{sigModal.user.fullName}</p>
            {sigModal.user.signatureUrl ? (
              <div className="border rounded-lg p-3 bg-gray-50 flex flex-col items-center gap-3 mb-4">
                <img src={sigModal.user.signatureUrl} alt="ลายเซ็น" className="max-h-32 object-contain" />
                <button className="btn-outline text-red-600 border-red-300 hover:bg-red-50 flex items-center gap-1 text-xs"
                  onClick={deleteSignature} disabled={saving}>
                  <Trash2 size={12} /> ลบลายเซ็น
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm mb-4">
                ยังไม่มีลายเซ็น
              </div>
            )}
            <input ref={sigInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadSignature(e.target.files[0]) }} />
            <div className="flex gap-2">
              <button className="btn-primary flex-1 flex items-center justify-center gap-1" disabled={saving}
                onClick={() => sigInputRef.current?.click()}>
                <ImagePlus size={14} /> {sigModal.user.signatureUrl ? 'เปลี่ยนรูป' : 'อัพโหลดลายเซ็น'}
              </button>
              <button className="btn-outline flex-1" onClick={() => setSigModal(null)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อผู้ใช้</th>
              <th>ชื่อ-นามสกุล</th>
              <th className="hidden sm:table-cell">ย่อ</th>
              <th>สิทธิ์</th>
              <th className="hidden lg:table-cell">แผนก</th>
              <th className="hidden lg:table-cell">ตำแหน่ง</th>
              <th className="hidden md:table-cell">ลายเซ็น</th>
              <th>สถานะ</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(u => (
              <tr key={u.id} className={!u.active ? 'opacity-50' : ''}>
                <td className="font-mono text-sm">{u.username}</td>
                <td>
                  <div className="font-medium">{u.fullName}</div>
                  {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                </td>
                <td className="hidden sm:table-cell">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-main/10 text-green-dark text-xs font-bold">
                    {u.initials || u.fullName?.charAt(0)}
                  </span>
                </td>
                <td>
                  <span className="badge badge-draft text-xs">{ROLE_LABELS[u.role]}</span>
                </td>
                <td className="hidden lg:table-cell text-sm text-gray-600">{u.department || '-'}</td>
                <td className="hidden lg:table-cell text-sm text-gray-600">{u.position || '-'}</td>
                <td className="hidden md:table-cell">
                  {u.signatureUrl ? (
                    <img src={u.signatureUrl} alt="sig" className="h-8 object-contain cursor-pointer"
                      onClick={() => setSigModal({ user: u })} title="คลิกเพื่อจัดการลายเซ็น" />
                  ) : (
                    <span className="text-xs text-gray-300">-</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${u.active ? 'badge-approved' : 'badge-cancelled'}`}>
                    {u.active ? 'ใช้งาน' : 'ปิดใช้'}
                  </span>
                </td>
                {isAdmin && (
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="btn-outline btn-sm" title="แก้ไข"
                        onClick={() => setEditing({
                          id: u.id, username: u.username, fullName: u.fullName, initials: u.initials,
                          role: u.role, password: '', lineUserId: u.lineUserId ?? '',
                          email: u.email ?? '', phone: u.phone ?? '', department: u.department ?? '', position: u.position ?? '',
                        })}>
                        <Pencil size={12} />
                      </button>
                      <button className="btn-outline btn-sm" title="จัดการลายเซ็น"
                        onClick={() => setSigModal({ user: u })}>
                        <ImagePlus size={12} />
                      </button>
                      <button className="btn-outline btn-sm" title="เปลี่ยนรหัสผ่าน"
                        onClick={() => setPwdModal({ id: u.id, pw: '' })}>
                        <KeyRound size={12} />
                      </button>
                      <button
                        className={`btn-outline btn-sm ${u.active ? 'hover:text-red-600 hover:border-red-400' : 'hover:text-green-700 hover:border-green-500'}`}
                        title={u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        onClick={() => toggleActive(u)}>
                        {u.active ? <UserX size={12} /> : <UserCheck size={12} />}
                      </button>
                      <button className="btn-outline btn-sm" title="บังคับเปลี่ยนรหัสผ่าน"
                        onClick={() => forceChangePwd(u)}>
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role legend */}
      <div className="card p-4 mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">สิทธิ์ตามตำแหน่ง</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-3 text-gray-500 font-medium">ตำแหน่ง</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบเสนอ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบสั่งงาน</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ส่งมอบ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบขอซื้อ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">อนุมัติ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">รายงาน</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">Master</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">จัดการ User</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">Settings</th>
              </tr>
            </thead>
            <tbody>
              {[
                { role: 'admin',       label: 'System Admin',        q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '✓' },
                { role: 'sales',       label: 'พนักงานขาย',          q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'sales2',      label: 'พนักงานขาย 2',       q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'sale_mgr',    label: 'ผู้จัดการฝ่ายขาย',    q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '-',  s: '-' },
                { role: 'admin_mgr',   label: 'ผู้จัดการธุรการ',      q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '-' },
                { role: 'project_mgr', label: 'ผู้จัดการโปรเจกต์',   q: '-', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '-',  u: '-',  s: '-' },
                { role: 'director',    label: 'ผู้อำนวยการ',          q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '✓' },
                { role: 'procurement', label: 'จัดซื้อ',              q: '-', wo: '-', ho: '-', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'factory',     label: 'โรงงาน',               q: '-', wo: '✓', ho: '✓', pr: '-',  ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
              ].map(r => (
                <tr key={r.role} className={`border-t border-gray-100 ${r.role === 'admin' ? 'bg-blue-50' : ''}`}>
                  <td className={`py-1.5 pr-3 font-medium ${r.role === 'admin' ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</td>
                  {[r.q, r.wo, r.ho, r.pr, r.ap, r.rp, r.m, r.u, r.s].map((v, i) => (
                    <td key={i} className={`py-1.5 px-2 text-center font-bold ${v === '✓' ? 'text-green-600' : 'text-gray-300'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const isAdmin = me?.role === 'admin' || me?.role === 'director' || me?.role === 'admin_mgr'
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [editing, setEditing] = useState<typeof EMPTY_USER & { id?: string } | null>(null)
  const [pwdModal, setPwdModal] = useState<{ id: string; pw: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (filterRole) params.role = filterRole
    if (filterActive !== '') params.active = filterActive
    UsersAPI.list(params).then(setRows).catch(() => toast.error('โหลดไม่สำเร็จ')).finally(() => setLoading(false))
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
    if (!pwdModal?.pw || pwdModal.pw.length < 6) { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    setSaving(true)
    try {
      await UsersAPI.setPassword(pwdModal.id, pwdModal.pw)
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      setPwdModal(null)
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: User) => {
    const action = u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'
    if (!confirm(`${action} ผู้ใช้ "${u.fullName}"?`)) return
    try {
      await UsersAPI.toggleActive(u.id, !u.active)
      toast.success(`${action}สำเร็จ`)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
  }

  const forceChangePwd = async (u: User) => {
    if (!confirm(`บังคับให้ "${u.fullName}" เปลี่ยนรหัสผ่านเมื่อ login ครั้งถัดไป?`)) return
    try {
      await UsersAPI.forceChangePassword(u.id)
      toast.success('ตั้งค่าสำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'เกิดข้อผิดพลาด') }
  }

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">ผู้ใช้งาน</h2><p className="page-sub">จัดการบัญชีผู้ใช้และสิทธิ์การใช้งาน</p></div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_USER })}>
            <Plus size={16} /> เพิ่มผู้ใช้
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="toolbar flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหาชื่อ / username"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <select className="form-input py-1.5 w-44" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">ทุกตำแหน่ง</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-input py-1.5 w-36" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="true">ใช้งาน</option>
          <option value="false">ปิดใช้</option>
        </select>
        <button className="btn-outline py-1.5" onClick={load}>ค้นหา</button>
      </div>

      {/* Edit / Create form */}
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
            <input type="password" className="form-input mb-4" placeholder="รหัสผ่านใหม่ (6+ ตัวอักษร)"
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
          <thead>
            <tr>
              <th>ชื่อผู้ใช้</th>
              <th>ชื่อ-นามสกุล</th>
              <th className="hidden sm:table-cell">ย่อ</th>
              <th>ตำแหน่ง</th>
              <th>สถานะ</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(u => (
              <tr key={u.id} className={!u.active ? 'opacity-50' : ''}>
                <td className="font-mono text-sm">{u.username}</td>
                <td className="font-medium">{u.fullName}</td>
                <td className="hidden sm:table-cell">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-main/10 text-green-dark text-xs font-bold">
                    {u.initials || u.fullName?.charAt(0)}
                  </span>
                </td>
                <td>
                  <span className="badge badge-draft text-xs">{ROLE_LABELS[u.role]}</span>
                </td>
                <td>
                  <span className={`badge ${u.active ? 'badge-approved' : 'badge-cancelled'}`}>
                    {u.active ? 'ใช้งาน' : 'ปิดใช้'}
                  </span>
                </td>
                {isAdmin && (
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
                      <button
                        className={`btn-outline btn-sm ${u.active ? 'hover:text-red-600 hover:border-red-400' : 'hover:text-green-700 hover:border-green-500'}`}
                        title={u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        onClick={() => toggleActive(u)}>
                        {u.active ? <UserX size={12} /> : <UserCheck size={12} />}
                      </button>
                      <button className="btn-outline btn-sm" title="บังคับเปลี่ยนรหัสผ่าน"
                        onClick={() => forceChangePwd(u)}>
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role legend */}
      <div className="card p-4 mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">สิทธิ์ตามตำแหน่ง</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-3 text-gray-500 font-medium">ตำแหน่ง</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบเสนอ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบสั่งงาน</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ส่งมอบ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">ใบขอซื้อ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">อนุมัติ</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">รายงาน</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">Master</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">จัดการ User</th>
                <th className="py-1 px-2 text-center text-gray-500 font-medium">Settings</th>
              </tr>
            </thead>
            <tbody>
              {[
                { role: 'admin',       label: 'System Admin',        q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '✓' },
                { role: 'sales',       label: 'พนักงานขาย',          q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'sales2',      label: 'พนักงานขาย 2',       q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'sale_mgr',    label: 'ผู้จัดการฝ่ายขาย',    q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '-',  s: '-' },
                { role: 'admin_mgr',   label: 'ผู้จัดการธุรการ',      q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '-' },
                { role: 'project_mgr', label: 'ผู้จัดการโปรเจกต์',   q: '-', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '-',  u: '-',  s: '-' },
                { role: 'director',    label: 'ผู้อำนวยการ',          q: '✓', wo: '✓', ho: '✓', pr: '✓', ap: '✓', rp: '✓', m: '✓', u: '✓', s: '✓' },
                { role: 'procurement', label: 'จัดซื้อ',              q: '-', wo: '-', ho: '-', pr: '✓', ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
                { role: 'factory',     label: 'โรงงาน',               q: '-', wo: '✓', ho: '✓', pr: '-',  ap: '-',  rp: '-',  m: '-',  u: '-',  s: '-' },
              ].map(r => (
                <tr key={r.role} className={`border-t border-gray-100 ${r.role === 'admin' ? 'bg-blue-50' : ''}`}>
                  <td className={`py-1.5 pr-3 font-medium ${r.role === 'admin' ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</td>
                  {[r.q, r.wo, r.ho, r.pr, r.ap, r.rp, r.m, r.u, r.s].map((v, i) => (
                    <td key={i} className={`py-1.5 px-2 text-center font-bold ${v === '✓' ? 'text-green-600' : 'text-gray-300'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}