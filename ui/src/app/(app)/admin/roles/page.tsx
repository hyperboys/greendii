'use client'

import { useEffect, useState } from 'react'
import { SettingsAPI } from '@/lib/api'
import { Save, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface RoleDef {
  key: string
  label: string
  description: string
}

interface PermissionDef {
  key: string
  label: string
  roles: string[]
}

const DEFAULT_ROLES: RoleDef[] = [
  { key: 'admin',       label: 'System Admin',          description: 'ผู้ดูแลระบบสูงสุด เข้าถึงได้ทุกส่วน' },
  { key: 'sales',       label: 'พนักงานขาย',            description: 'ฝ่ายขาย สร้างและจัดการเอกสารขาย' },
  { key: 'sales2',      label: 'พนักงานขาย 2',          description: 'ฝ่ายขาย 2 รับผิดชอบขั้นตอนแรกของการอนุมัติ' },
  { key: 'sale_mgr',    label: 'ผู้จัดการฝ่ายขาย',       description: 'ผู้จัดการฝ่ายขาย อนุมัติใบเสนอราคา' },
  { key: 'admin_mgr',   label: 'ผู้จัดการฝ่ายบริหาร',    description: 'ผู้จัดการฝ่ายบริหาร อนุมัติเอกสารหลายประเภท' },
  { key: 'project_mgr', label: 'ผู้จัดการโครงการ',        description: 'ผู้จัดการโครงการ ดูแลการดำเนินงาน' },
  { key: 'director',    label: 'กรรมการผู้จัดการ',         description: 'กรรมการผู้จัดการ อนุมัติขั้นสุดท้าย' },
  { key: 'procurement', label: 'ฝ่ายจัดซื้อ',             description: 'ฝ่ายจัดซื้อ รับใบขอซื้อที่อนุมัติแล้ว' },
  { key: 'factory',     label: 'ฝ่ายโรงงาน/ผลิต',         description: 'ฝ่ายโรงงาน/ผลิต รับงานที่ผ่านการอนุมัติ' },
]

const DEFAULT_PERMISSIONS: PermissionDef[] = [
  { key: 'quo_create',    label: 'สร้างใบเสนอราคา',   roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'quo_edit',      label: 'แก้ไขใบเสนอราคา',   roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'quo_approve',   label: 'อนุมัติใบเสนอราคา', roles: ['admin','sales2','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'wo_create',     label: 'สร้างใบสั่งงาน',    roles: ['admin','sales','sales2','sale_mgr','admin_mgr'] },
  { key: 'wo_approve',    label: 'อนุมัติใบสั่งงาน',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'pr_create',     label: 'สร้างใบขอซื้อ',     roles: ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr'] },
  { key: 'pr_approve',    label: 'อนุมัติใบขอซื้อ',   roles: ['admin','admin_mgr','project_mgr','director','procurement'] },
  { key: 'ho_create',     label: 'สร้างส่งมอบงาน',    roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'ho_approve',    label: 'อนุมัติส่งมอบงาน',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'view_reports',  label: 'ดูรายงาน',          roles: ['admin','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'manage_users',  label: 'จัดการผู้ใช้',       roles: ['admin','admin_mgr','director'] },
  { key: 'manage_master', label: 'จัดการข้อมูลหลัก',   roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'admin_settings',label: 'ตั้งค่าระบบ/Admin', roles: ['admin','director'] },
]

const EMPTY_ROLE: RoleDef = { key: '', label: '', description: '' }
const EMPTY_PERM: PermissionDef = { key: '', label: '', roles: [] }

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleDef[]>(DEFAULT_ROLES)
  const [permissions, setPermissions] = useState<PermissionDef[]>(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [editRoleIdx, setEditRoleIdx] = useState<number | null>(null)
  const [editRoleVal, setEditRoleVal] = useState<RoleDef>(EMPTY_ROLE)
  const [addingRole, setAddingRole] = useState(false)
  const [newRole, setNewRole] = useState<RoleDef>(EMPTY_ROLE)

  const [editPermIdx, setEditPermIdx] = useState<number | null>(null)
  const [editPermVal, setEditPermVal] = useState<PermissionDef>(EMPTY_PERM)
  const [addingPerm, setAddingPerm] = useState(false)
  const [newPerm, setNewPerm] = useState<PermissionDef>(EMPTY_PERM)

  useEffect(() => {
    SettingsAPI.get().then(s => {
      if (s.rolePermissionsConfig) {
        if (s.rolePermissionsConfig.roles?.length)       setRoles(s.rolePermissionsConfig.roles)
        if (s.rolePermissionsConfig.permissions?.length) setPermissions(s.rolePermissionsConfig.permissions)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await SettingsAPI.update({ rolePermissionsConfig: { roles, permissions } } as never)
      toast.success('บันทึกสำเร็จ')
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const startEditRole = (i: number) => { setEditRoleIdx(i); setEditRoleVal({ ...roles[i] }) }
  const saveEditRole = () => {
    if (!editRoleVal.key || !editRoleVal.label) { toast.error('กรุณากรอก key และ label'); return }
    setRoles(r => r.map((v, i) => i === editRoleIdx ? editRoleVal : v))
    setEditRoleIdx(null)
  }
  const deleteRole = (i: number) => {
    if (!confirm(`ลบ role "${roles[i].key}"?`)) return
    const key = roles[i].key
    setRoles(r => r.filter((_, idx) => idx !== i))
    setPermissions(p => p.map(perm => ({ ...perm, roles: perm.roles.filter(r => r !== key) })))
  }
  const confirmAddRole = () => {
    if (!newRole.key || !newRole.label) { toast.error('กรุณากรอก key และ label'); return }
    if (roles.find(r => r.key === newRole.key)) { toast.error('key นี้มีอยู่แล้ว'); return }
    setRoles(r => [...r, newRole])
    setNewRole(EMPTY_ROLE)
    setAddingRole(false)
  }

  const startEditPerm = (i: number) => { setEditPermIdx(i); setEditPermVal({ ...permissions[i], roles: [...permissions[i].roles] }) }
  const saveEditPerm = () => {
    if (!editPermVal.key || !editPermVal.label) { toast.error('กรุณากรอก key และ label'); return }
    setPermissions(p => p.map((v, i) => i === editPermIdx ? editPermVal : v))
    setEditPermIdx(null)
  }
  const deletePerm = (i: number) => {
    if (!confirm(`ลบสิทธิ์ "${permissions[i].label}"?`)) return
    setPermissions(p => p.filter((_, idx) => idx !== i))
  }
  const togglePermRole = (permIdx: number, roleKey: string) => {
    setPermissions(p => p.map((perm, i) => {
      if (i !== permIdx) return perm
      const has = perm.roles.includes(roleKey)
      return { ...perm, roles: has ? perm.roles.filter(r => r !== roleKey) : [...perm.roles, roleKey] }
    }))
  }
  const confirmAddPerm = () => {
    if (!newPerm.key || !newPerm.label) { toast.error('กรุณากรอก key และ label'); return }
    if (permissions.find(p => p.key === newPerm.key)) { toast.error('key นี้มีอยู่แล้ว'); return }
    setPermissions(p => [...p, newPerm])
    setNewPerm(EMPTY_PERM)
    setAddingPerm(false)
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <div className="max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">บทบาท &amp; สิทธิ์</h2>
          <p className="page-sub">จัดการ Role และสิทธิ์การใช้งานในระบบ</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving}>
          <Save size={16} />{saving ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-700">บทบาท (Roles)</h3>
          <button className="btn-outline btn-sm" onClick={() => { setAddingRole(true); setNewRole(EMPTY_ROLE) }}>
            <Plus size={14} /> เพิ่ม Role
          </button>
        </div>
        <div className="divide-y">
          {roles.map((role, i) => (
            <div key={role.key} className="flex items-start gap-3 px-5 py-3">
              {editRoleIdx === i ? (
                <>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="form-label text-xs">key (ห้ามเว้นวรรค)</label>
                      <input className="form-input py-1 text-sm font-mono" value={editRoleVal.key}
                        onChange={e => setEditRoleVal(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">ชื่อแสดง</label>
                      <input className="form-input py-1 text-sm" value={editRoleVal.label}
                        onChange={e => setEditRoleVal(v => ({ ...v, label: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">คำอธิบาย</label>
                      <input className="form-input py-1 text-sm" value={editRoleVal.description}
                        onChange={e => setEditRoleVal(v => ({ ...v, description: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-1 mt-5">
                    <button className="btn-primary btn-sm" onClick={saveEditRole}><Check size={12} /></button>
                    <button className="btn-outline btn-sm" onClick={() => setEditRoleIdx(null)}><X size={12} /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-1">
                    <span className="font-mono text-sm font-bold text-green-dark bg-green-pale px-2 py-0.5 rounded self-start w-fit">{role.key}</span>
                    <span className="font-semibold text-gray-800 text-sm">{role.label}</span>
                    <span className="text-gray-500 text-xs">{role.description}</span>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-outline btn-sm" title="แก้ไข" onClick={() => startEditRole(i)}><Pencil size={12} /></button>
                    <button className="btn-outline btn-sm text-red-500 hover:border-red-400" title="ลบ" onClick={() => deleteRole(i)}><Trash2 size={12} /></button>
                  </div>
                </>
              )}
            </div>
          ))}

          {addingRole && (
            <div className="flex items-start gap-3 px-5 py-3 bg-blue-50">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="form-label text-xs">key *</label>
                  <input className="form-input py-1 text-sm font-mono" placeholder="เช่น hr_mgr" value={newRole.key}
                    onChange={e => setNewRole(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                </div>
                <div>
                  <label className="form-label text-xs">ชื่อแสดง *</label>
                  <input className="form-input py-1 text-sm" placeholder="เช่น ผู้จัดการ HR" value={newRole.label}
                    onChange={e => setNewRole(v => ({ ...v, label: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label text-xs">คำอธิบาย</label>
                  <input className="form-input py-1 text-sm" placeholder="คำอธิบายสั้นๆ" value={newRole.description}
                    onChange={e => setNewRole(v => ({ ...v, description: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-1 mt-5">
                <button className="btn-primary btn-sm" onClick={confirmAddRole}><Check size={12} /></button>
                <button className="btn-outline btn-sm" onClick={() => setAddingRole(false)}><X size={12} /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-700">Matrix สิทธิ์การใช้งาน</h3>
            <p className="text-xs text-gray-500 mt-0.5">คลิกที่ช่องเพื่อเปิด/ปิดสิทธิ์ &nbsp;|&nbsp; ✓ = มีสิทธิ์ &nbsp;–&nbsp; = ไม่มีสิทธิ์</p>
          </div>
          <button className="btn-outline btn-sm" onClick={() => { setAddingPerm(true); setNewPerm(EMPTY_PERM) }}>
            <Plus size={14} /> เพิ่มสิทธิ์
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-green-dark text-white">
                <th className="text-left px-3 py-2.5 font-semibold min-w-44 sticky left-0 bg-green-dark z-10">สิทธิ์</th>
                {roles.map(r => (
                  <th key={r.key} className="px-2 py-2.5 font-semibold text-center whitespace-nowrap min-w-[72px]">
                    <div>{r.label}</div>
                    <div className="font-mono font-normal opacity-70 text-[10px]">{r.key}</div>
                  </th>
                ))}
                <th className="px-2 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm, pi) => (
                <tr key={perm.key} className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {editPermIdx === pi ? (
                    <>
                      <td className="px-3 py-1.5 sticky left-0 bg-yellow-50 z-10">
                        <div className="flex gap-1">
                          <input className="form-input py-0.5 text-xs font-mono w-24" placeholder="key" value={editPermVal.key}
                            onChange={e => setEditPermVal(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                          <input className="form-input py-0.5 text-xs flex-1" placeholder="label" value={editPermVal.label}
                            onChange={e => setEditPermVal(v => ({ ...v, label: e.target.value }))} />
                        </div>
                      </td>
                      {roles.map(r => (
                        <td key={r.key} className="px-2 py-1.5 text-center bg-yellow-50">
                          <button
                            onClick={() => setEditPermVal(v => {
                              const has = v.roles.includes(r.key)
                              return { ...v, roles: has ? v.roles.filter(x => x !== r.key) : [...v.roles, r.key] }
                            })}
                            className={`w-7 h-7 rounded text-sm font-bold border transition-colors ${
                              editPermVal.roles.includes(r.key)
                                ? 'bg-green-100 border-green-500 text-green-700'
                                : 'bg-gray-100 border-gray-300 text-gray-300 hover:border-gray-400'
                            }`}
                          >
                            {editPermVal.roles.includes(r.key) ? '✓' : '–'}
                          </button>
                        </td>
                      ))}
                      <td className="px-2 py-1.5 bg-yellow-50">
                        <div className="flex gap-1">
                          <button className="btn-primary btn-sm" onClick={saveEditPerm}><Check size={10} /></button>
                          <button className="btn-outline btn-sm" onClick={() => setEditPermIdx(null)}><X size={10} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 z-10" style={{background: pi % 2 === 0 ? '#fff' : '#f9fafb'}}>
                        <div>{perm.label}</div>
                        <div className="font-mono text-[10px] text-gray-400">{perm.key}</div>
                      </td>
                      {roles.map(r => (
                        <td key={r.key} className="px-2 py-2 text-center">
                          <button
                            onClick={() => togglePermRole(pi, r.key)}
                            title={`${perm.roles.includes(r.key) ? 'ปิด' : 'เปิด'}สิทธิ์ ${r.label}`}
                            className={`w-7 h-7 rounded text-sm font-bold border transition-colors ${
                              perm.roles.includes(r.key)
                                ? 'bg-green-100 border-green-400 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                                : 'bg-gray-50 border-gray-200 text-gray-300 hover:bg-green-50 hover:border-green-300 hover:text-green-600'
                            }`}
                          >
                            {perm.roles.includes(r.key) ? '✓' : '–'}
                          </button>
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button className="btn-outline btn-sm" onClick={() => startEditPerm(pi)}><Pencil size={10} /></button>
                          <button className="btn-outline btn-sm text-red-500 hover:border-red-400" onClick={() => deletePerm(pi)}><Trash2 size={10} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {addingPerm && (
                <tr className="bg-blue-50">
                  <td className="px-3 py-2 sticky left-0 bg-blue-50 z-10">
                    <div className="flex gap-1">
                      <input className="form-input py-0.5 text-xs font-mono w-24" placeholder="key *" value={newPerm.key}
                        onChange={e => setNewPerm(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                      <input className="form-input py-0.5 text-xs flex-1" placeholder="ชื่อสิทธิ์ *" value={newPerm.label}
                        onChange={e => setNewPerm(v => ({ ...v, label: e.target.value }))} />
                    </div>
                  </td>
                  {roles.map(r => (
                    <td key={r.key} className="px-2 py-2 text-center">
                      <button
                        onClick={() => setNewPerm(v => {
                          const has = v.roles.includes(r.key)
                          return { ...v, roles: has ? v.roles.filter(x => x !== r.key) : [...v.roles, r.key] }
                        })}
                        className={`w-7 h-7 rounded text-sm font-bold border transition-colors ${
                          newPerm.roles.includes(r.key)
                            ? 'bg-green-100 border-green-500 text-green-700'
                            : 'bg-gray-100 border-gray-300 text-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {newPerm.roles.includes(r.key) ? '✓' : '–'}
                      </button>
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button className="btn-primary btn-sm" onClick={confirmAddPerm}><Check size={10} /></button>
                      <button className="btn-outline btn-sm" onClick={() => setAddingPerm(false)}><X size={10} /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}