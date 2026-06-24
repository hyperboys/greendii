'use client'

import { useEffect, useState } from 'react'
import { SettingsAPI } from '@/lib/api'
import {
  DEFAULT_ROLES, DEFAULT_PERMISSIONS, DEFAULT_MENU_ACCESS, MENU_ITEMS,
  type RoleDef, type PermissionDef, type UserRole,
} from '@/types'
import { useSettingsStore } from '@/store/settings'
import { Save, Plus, Pencil, Trash2, Check, X, Users, ShieldCheck, Menu as MenuIcon, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY_ROLE: RoleDef = { key: '', label: '', description: '' }
const EMPTY_PERM: PermissionDef = { key: '', label: '', roles: [] }

type Tab = 'roles' | 'permissions' | 'menus'

export default function RolesPage() {
  const { fetchSettings } = useSettingsStore()
  const [tab, setTab] = useState<Tab>('roles')
  const [roles, setRoles] = useState<RoleDef[]>(DEFAULT_ROLES)
  const [permissions, setPermissions] = useState<PermissionDef[]>(DEFAULT_PERMISSIONS)
  const [menuAccess, setMenuAccess] = useState<Record<string, UserRole[]>>(DEFAULT_MENU_ACCESS)
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
      const mergePermissions = (incoming: PermissionDef[] = []) => {
        const byKey = new Map<string, PermissionDef>()
        for (const perm of incoming) {
          byKey.set(perm.key, { ...perm, roles: [...perm.roles] })
        }
        for (const def of DEFAULT_PERMISSIONS) {
          if (!byKey.has(def.key)) {
            byKey.set(def.key, { ...def, roles: [...def.roles] })
          }
        }
        return Array.from(byKey.values())
      }

      const mergeMenuAccess = (incoming: Record<string, UserRole[]> = {}) => {
        const merged: Record<string, UserRole[]> = { ...DEFAULT_MENU_ACCESS }
        for (const [k, v] of Object.entries(incoming)) merged[k] = v
        return merged
      }

      if (s.rolePermissionsConfig) {
        if (s.rolePermissionsConfig.roles?.length)       setRoles(s.rolePermissionsConfig.roles)
        if (s.rolePermissionsConfig.permissions?.length) setPermissions(mergePermissions(s.rolePermissionsConfig.permissions))
        else setPermissions(mergePermissions([]))
      } else {
        setPermissions(mergePermissions([]))
      }
      if (s.menuAccessConfig) setMenuAccess(mergeMenuAccess(s.menuAccessConfig as Record<string, UserRole[]>))
      else setMenuAccess(mergeMenuAccess())
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await SettingsAPI.update({
        rolePermissionsConfig: { roles, permissions },
        menuAccessConfig: menuAccess,
      } as never)
      useSettingsStore.setState({ loaded: false })
      await fetchSettings()
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
    setMenuAccess(m => {
      const next: Record<string, UserRole[]> = {}
      for (const [k, v] of Object.entries(m)) next[k] = v.filter(r => r !== key)
      return next
    })
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

  // ── menus ──
  const toggleMenu = (menuKey: string, role: string) => {
    setMenuAccess(prev => {
      const cur = prev[menuKey] ?? []
      return { ...prev, [menuKey]: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] }
    })
  }
  const toggleMenuAll = (menuKey: string, checked: boolean) => {
    setMenuAccess(prev => ({ ...prev, [menuKey]: checked ? roles.map(r => r.key) : [] }))
  }
  const resetMenus = () => {
    setMenuAccess(DEFAULT_MENU_ACCESS)
    toast('รีเซ็ตการเข้าถึงเมนูแล้ว (ยังไม่ได้บันทึก)', { icon: '↩️' })
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'roles',       label: 'บทบาท',          icon: Users },
    { key: 'permissions', label: 'สิทธิ์การใช้งาน', icon: ShieldCheck },
    { key: 'menus',       label: 'การเข้าถึงเมนู',  icon: MenuIcon },
  ]

  return (
    <div className="max-w-6xl space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">บทบาท สิทธิ์ และเมนู</h2>
          <p className="page-sub">จัดการ Role, สิทธิ์การใช้งาน และการเข้าถึงเมนู ในที่เดียว</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving}>
          <Save size={16} />{saving ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-green-main text-green-dark'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'roles' && (
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
      )}

      {tab === 'permissions' && (
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-700">Matrix สิทธิ์การใช้งาน</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              คลิกที่ช่องเพื่อเปิด/ปิดสิทธิ์ &nbsp;·&nbsp;
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-green-500 align-middle"></span> มีสิทธิ์
              </span>
              &nbsp;·&nbsp;
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded border-2 border-gray-200 bg-white align-middle"></span> ไม่มีสิทธิ์
              </span>
              &nbsp;·&nbsp; คอลัมน์ <strong>ทั้งหมด</strong> = toggle ทุก Role พร้อมกัน
            </p>
          </div>
          <button className="btn-outline btn-sm" onClick={() => { setAddingPerm(true); setNewPerm(EMPTY_PERM) }}>
            <Plus size={14} /> เพิ่มสิทธิ์
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="bg-green-dark text-white">
                <th className="text-left px-4 py-3 font-semibold min-w-48 sticky left-0 bg-green-dark z-20 border-r border-white/10">
                  สิทธิ์
                </th>
                {roles.map(r => (
                  <th key={r.key} className="px-2 py-3 text-center min-w-[80px]">
                    <div className="font-semibold text-xs leading-tight">{r.label}</div>
                    <div className="font-mono font-normal opacity-60 text-[9px] mt-0.5">{r.key}</div>
                  </th>
                ))}
                <th className="px-2 py-3 text-center min-w-[64px] border-l border-white/10">
                  <div className="text-xs font-semibold">ทั้งหมด</div>
                </th>
                <th className="px-3 py-3 min-w-[72px]"></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm, pi) => {
                const allChecked = roles.every(r => perm.roles.includes(r.key))
                const someChecked = roles.some(r => perm.roles.includes(r.key))
                const rowBg = pi % 2 === 0 ? '#fff' : '#f9fafb'
                return (
                  <tr key={perm.key} className="group hover:bg-blue-50/50 transition-colors duration-100">
                    {editPermIdx === pi ? (
                      <>
                        <td className="px-3 py-2 sticky left-0 z-10 bg-yellow-50 border-r border-yellow-200">
                          <div className="flex flex-col gap-1.5">
                            <input className="form-input py-1 text-xs font-mono" placeholder="key" value={editPermVal.key}
                              onChange={e => setEditPermVal(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                            <input className="form-input py-1 text-xs" placeholder="ชื่อสิทธิ์" value={editPermVal.label}
                              onChange={e => setEditPermVal(v => ({ ...v, label: e.target.value }))} />
                          </div>
                        </td>
                        {roles.map(r => (
                          <td key={r.key} className="py-2 text-center bg-yellow-50">
                            <button
                              onClick={() => setEditPermVal(v => {
                                const has = v.roles.includes(r.key)
                                return { ...v, roles: has ? v.roles.filter(x => x !== r.key) : [...v.roles, r.key] }
                              })}
                              className={`w-8 h-8 rounded-lg font-bold border-2 transition-all ${
                                editPermVal.roles.includes(r.key)
                                  ? 'bg-green-500 border-green-600 text-white shadow-sm'
                                  : 'bg-white border-gray-200 text-gray-300 hover:border-green-400 hover:text-green-500'
                              }`}
                            >
                              {editPermVal.roles.includes(r.key) ? '✓' : '–'}
                            </button>
                          </td>
                        ))}
                        <td className="py-2 text-center bg-yellow-50 border-l border-yellow-200 text-gray-300 text-base">–</td>
                        <td className="px-2 py-2 bg-yellow-50">
                          <div className="flex gap-1">
                            <button className="btn-primary btn-sm" onClick={saveEditPerm}><Check size={11} /></button>
                            <button className="btn-outline btn-sm" onClick={() => setEditPermIdx(null)}><X size={11} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 sticky left-0 z-10 border-r border-gray-100" style={{ background: rowBg }}>
                          <div className="font-medium text-gray-800 text-xs leading-snug">{perm.label}</div>
                          <div className="font-mono text-[10px] text-gray-400 mt-0.5">{perm.key}</div>
                        </td>
                        {roles.map(r => (
                          <td key={r.key} className="py-2.5 text-center">
                            <button
                              onClick={() => togglePermRole(pi, r.key)}
                              title={perm.roles.includes(r.key) ? `ปิดสิทธิ์ ${r.label}` : `เปิดสิทธิ์ ${r.label}`}
                              className={`w-8 h-8 rounded-lg font-bold border-2 transition-all duration-150 ${
                                perm.roles.includes(r.key)
                                  ? 'bg-green-500 border-green-600 text-white shadow-sm hover:bg-red-400 hover:border-red-500'
                                  : 'bg-white border-gray-200 text-gray-300 hover:bg-green-50 hover:border-green-400 hover:text-green-600'
                              }`}
                            >
                              {perm.roles.includes(r.key) ? '✓' : '–'}
                            </button>
                          </td>
                        ))}
                        <td className="py-2.5 text-center border-l border-gray-100">
                          <button
                            onClick={() => {
                              const newRoles = allChecked ? [] : roles.map(r => r.key)
                              setPermissions(p => p.map((v, i) => i === pi ? { ...v, roles: newRoles } : v))
                            }}
                            title={allChecked ? 'ปิดสิทธิ์ทุก Role' : 'เปิดสิทธิ์ทุก Role'}
                            className={`w-8 h-8 rounded-lg font-bold border-2 transition-all duration-150 ${
                              allChecked
                                ? 'bg-blue-500 border-blue-600 text-white hover:bg-red-400 hover:border-red-500'
                                : someChecked
                                ? 'bg-blue-100 border-blue-300 text-blue-600 hover:bg-blue-500 hover:border-blue-600 hover:text-white'
                                : 'bg-white border-gray-200 text-gray-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-500'
                            }`}
                          >
                            {allChecked ? '✓' : someChecked ? '◑' : '–'}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <button className="btn-outline btn-sm" title="แก้ไข" onClick={() => startEditPerm(pi)}><Pencil size={11} /></button>
                            <button className="btn-outline btn-sm text-red-500 hover:border-red-400" title="ลบ" onClick={() => deletePerm(pi)}><Trash2 size={11} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}

              {addingPerm && (
                <tr className="bg-blue-50">
                  <td className="px-3 py-2.5 sticky left-0 bg-blue-50 z-10 border-r border-blue-200">
                    <div className="flex flex-col gap-1.5">
                      <input className="form-input py-1 text-xs font-mono" placeholder="key *" value={newPerm.key}
                        onChange={e => setNewPerm(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                      <input className="form-input py-1 text-xs" placeholder="ชื่อสิทธิ์ *" value={newPerm.label}
                        onChange={e => setNewPerm(v => ({ ...v, label: e.target.value }))} />
                    </div>
                  </td>
                  {roles.map(r => (
                    <td key={r.key} className="py-2.5 text-center">
                      <button
                        onClick={() => setNewPerm(v => {
                          const has = v.roles.includes(r.key)
                          return { ...v, roles: has ? v.roles.filter(x => x !== r.key) : [...v.roles, r.key] }
                        })}
                        className={`w-8 h-8 rounded-lg font-bold border-2 transition-all ${
                          newPerm.roles.includes(r.key)
                            ? 'bg-green-500 border-green-600 text-white shadow-sm'
                            : 'bg-white border-gray-200 text-gray-300 hover:border-green-400 hover:text-green-500'
                        }`}
                      >
                        {newPerm.roles.includes(r.key) ? '✓' : '–'}
                      </button>
                    </td>
                  ))}
                  <td className="py-2.5 text-center border-l border-blue-200 text-gray-300 text-base">–</td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      <button className="btn-primary btn-sm" onClick={confirmAddPerm}><Check size={11} /></button>
                      <button className="btn-outline btn-sm" onClick={() => setAddingPerm(false)}><X size={11} /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab === 'menus' && (
      <div className="space-y-4">
        <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-800 flex items-center justify-between gap-3">
          <span>
            <strong>หมายเหตุ:</strong> กำหนดว่า Role ใดมองเห็นเมนูใด — มีผลเมื่อผู้ใช้รีเฟรชหน้า ·
            เมนู Admin จะแสดงเฉพาะ admin/director เสมอ
          </span>
          <button className="btn-outline btn-sm shrink-0" onClick={resetMenus}>
            <RefreshCw size={14} /> รีเซ็ต
          </button>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-dark text-white">
                  <th className="text-left px-4 py-3 font-semibold min-w-36 sticky left-0 bg-green-dark z-10">เมนู</th>
                  {roles.map(r => (
                    <th key={r.key} className="px-2 py-3 text-center text-xs min-w-[80px]">
                      <div className="font-semibold">{r.label}</div>
                      <div className="font-normal opacity-70 text-[10px]">{r.key}</div>
                    </th>
                  ))}
                  <th className="px-2 py-3 text-center text-xs">ทั้งหมด</th>
                </tr>
              </thead>
              <tbody>
                {MENU_ITEMS.map((menu, i) => {
                  const cur = menuAccess[menu.key] ?? []
                  const allChecked = roles.every(r => cur.includes(r.key))
                  return (
                    <tr key={menu.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 z-10"
                        style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>{menu.label}</td>
                      {roles.map(role => (
                        <td key={role.key} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={cur.includes(role.key)}
                            onChange={() => toggleMenu(menu.key, role.key)}
                            className="w-4 h-4 accent-green-600 cursor-pointer"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={e => toggleMenuAll(menu.key, e.target.checked)}
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
      )}
    </div>
  )
}