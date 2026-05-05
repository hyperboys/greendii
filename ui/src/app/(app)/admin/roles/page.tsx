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
  { key: 'admin',       label: 'System Admin',          description: 'à¸œà¸¹à¹‰à¸”à¸¹à¹à¸¥à¸£à¸°à¸šà¸šà¸ªà¸¹à¸‡à¸ªà¸¸à¸” à¹€à¸‚à¹‰à¸²à¸–à¸¶à¸‡à¹„à¸”à¹‰à¸—à¸¸à¸à¸ªà¹ˆà¸§à¸™' },
  { key: 'sales',       label: 'à¸žà¸™à¸±à¸à¸‡à¸²à¸™à¸‚à¸²à¸¢',            description: 'à¸à¹ˆà¸²à¸¢à¸‚à¸²à¸¢ à¸ªà¸£à¹‰à¸²à¸‡à¹à¸¥à¸°à¸ˆà¸±à¸”à¸à¸²à¸£à¹€à¸­à¸à¸ªà¸²à¸£à¸‚à¸²à¸¢' },
  { key: 'sales2',      label: 'à¸žà¸™à¸±à¸à¸‡à¸²à¸™à¸‚à¸²à¸¢ 2',          description: 'à¸à¹ˆà¸²à¸¢à¸‚à¸²à¸¢ 2 à¸£à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸šà¸‚à¸±à¹‰à¸™à¸•à¸­à¸™à¹à¸£à¸à¸‚à¸­à¸‡à¸à¸²à¸£à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´' },
  { key: 'sale_mgr',    label: 'à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¸à¹ˆà¸²à¸¢à¸‚à¸²à¸¢',       description: 'à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¸à¹ˆà¸²à¸¢à¸‚à¸²à¸¢ à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹ƒà¸šà¹€à¸ªà¸™à¸­à¸£à¸²à¸„à¸²' },
  { key: 'admin_mgr',   label: 'à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¸à¹ˆà¸²à¸¢à¸šà¸£à¸´à¸«à¸²à¸£',    description: 'à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¸à¹ˆà¸²à¸¢à¸šà¸£à¸´à¸«à¸²à¸£ à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹€à¸­à¸à¸ªà¸²à¸£à¸«à¸¥à¸²à¸¢à¸›à¸£à¸°à¹€à¸ à¸—' },
  { key: 'project_mgr', label: 'à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¹‚à¸„à¸£à¸‡à¸à¸²à¸£',        description: 'à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£à¹‚à¸„à¸£à¸‡à¸à¸²à¸£ à¸”à¸¹à¹à¸¥à¸à¸²à¸£à¸”à¸³à¹€à¸™à¸´à¸™à¸‡à¸²à¸™' },
  { key: 'director',    label: 'à¸à¸£à¸£à¸¡à¸à¸²à¸£à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£',         description: 'à¸à¸£à¸£à¸¡à¸à¸²à¸£à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£ à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸‚à¸±à¹‰à¸™à¸ªà¸¸à¸”à¸—à¹‰à¸²à¸¢' },
  { key: 'procurement', label: 'à¸à¹ˆà¸²à¸¢à¸ˆà¸±à¸”à¸‹à¸·à¹‰à¸­',             description: 'à¸à¹ˆà¸²à¸¢à¸ˆà¸±à¸”à¸‹à¸·à¹‰à¸­ à¸£à¸±à¸šà¹ƒà¸šà¸‚à¸­à¸‹à¸·à¹‰à¸­à¸—à¸µà¹ˆà¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹à¸¥à¹‰à¸§' },
  { key: 'factory',     label: 'à¸à¹ˆà¸²à¸¢à¹‚à¸£à¸‡à¸‡à¸²à¸™/à¸œà¸¥à¸´à¸•',         description: 'à¸à¹ˆà¸²à¸¢à¹‚à¸£à¸‡à¸‡à¸²à¸™/à¸œà¸¥à¸´à¸• à¸£à¸±à¸šà¸‡à¸²à¸™à¸—à¸µà¹ˆà¸œà¹ˆà¸²à¸™à¸à¸²à¸£à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´' },
]

const DEFAULT_PERMISSIONS: PermissionDef[] = [
  { key: 'quo_create',    label: 'à¸ªà¸£à¹‰à¸²à¸‡à¹ƒà¸šà¹€à¸ªà¸™à¸­à¸£à¸²à¸„à¸²',   roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'quo_edit',      label: 'à¹à¸à¹‰à¹„à¸‚à¹ƒà¸šà¹€à¸ªà¸™à¸­à¸£à¸²à¸„à¸²',   roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'quo_approve',   label: 'à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹ƒà¸šà¹€à¸ªà¸™à¸­à¸£à¸²à¸„à¸²', roles: ['admin','sales2','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'wo_create',     label: 'à¸ªà¸£à¹‰à¸²à¸‡à¹ƒà¸šà¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™',    roles: ['admin','sales','sales2','sale_mgr','admin_mgr'] },
  { key: 'wo_approve',    label: 'à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹ƒà¸šà¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'pr_create',     label: 'à¸ªà¸£à¹‰à¸²à¸‡à¹ƒà¸šà¸‚à¸­à¸‹à¸·à¹‰à¸­',     roles: ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr'] },
  { key: 'pr_approve',    label: 'à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹ƒà¸šà¸‚à¸­à¸‹à¸·à¹‰à¸­',   roles: ['admin','admin_mgr','project_mgr','director','procurement'] },
  { key: 'ho_create',     label: 'à¸ªà¸£à¹‰à¸²à¸‡à¸ªà¹ˆà¸‡à¸¡à¸­à¸šà¸‡à¸²à¸™',    roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'ho_approve',    label: 'à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸ªà¹ˆà¸‡à¸¡à¸­à¸šà¸‡à¸²à¸™',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'view_reports',  label: 'à¸”à¸¹à¸£à¸²à¸¢à¸‡à¸²à¸™',          roles: ['admin','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'manage_users',  label: 'à¸ˆà¸±à¸”à¸à¸²à¸£à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰',       roles: ['admin','admin_mgr','director'] },
  { key: 'manage_master', label: 'à¸ˆà¸±à¸”à¸à¸²à¸£à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸«à¸¥à¸±à¸',   roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'admin_settings',label: 'à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²à¸£à¸°à¸šà¸š/Admin', roles: ['admin','director'] },
]

const EMPTY_ROLE: RoleDef = { key: '', label: '', description: '' }
const EMPTY_PERM: PermissionDef = { key: '', label: '', roles: [] }

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleDef[]>(DEFAULT_ROLES)
  const [permissions, setPermissions] = useState<PermissionDef[]>(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // inline edit state
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
      toast.success('à¸šà¸±à¸™à¸—à¸¶à¸à¸ªà¸³à¹€à¸£à¹‡à¸ˆ')
    } catch {
      toast.error('à¸šà¸±à¸™à¸—à¸¶à¸à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ')
    } finally {
      setSaving(false)
    }
  }

  // â”€â”€ Role CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startEditRole = (i: number) => { setEditRoleIdx(i); setEditRoleVal({ ...roles[i] }) }
  const saveEditRole = () => {
    if (!editRoleVal.key || !editRoleVal.label) { toast.error('à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸ key à¹à¸¥à¸° label'); return }
    setRoles(r => r.map((v, i) => i === editRoleIdx ? editRoleVal : v))
    setEditRoleIdx(null)
  }
  const deleteRole = (i: number) => {
    if (!confirm(`à¸¥à¸š role "${roles[i].key}"?`)) return
    const key = roles[i].key
    setRoles(r => r.filter((_, idx) => idx !== i))
    // remove from all permissions
    setPermissions(p => p.map(perm => ({ ...perm, roles: perm.roles.filter(r => r !== key) })))
  }
  const confirmAddRole = () => {
    if (!newRole.key || !newRole.label) { toast.error('à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸ key à¹à¸¥à¸° label'); return }
    if (roles.find(r => r.key === newRole.key)) { toast.error('key à¸™à¸µà¹‰à¸¡à¸µà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§'); return }
    setRoles(r => [...r, newRole])
    setNewRole(EMPTY_ROLE)
    setAddingRole(false)
  }

  // â”€â”€ Permission CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startEditPerm = (i: number) => { setEditPermIdx(i); setEditPermVal({ ...permissions[i], roles: [...permissions[i].roles] }) }
  const saveEditPerm = () => {
    if (!editPermVal.key || !editPermVal.label) { toast.error('à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸ key à¹à¸¥à¸° label'); return }
    setPermissions(p => p.map((v, i) => i === editPermIdx ? editPermVal : v))
    setEditPermIdx(null)
  }
  const deletePerm = (i: number) => {
    if (!confirm(`à¸¥à¸šà¸ªà¸´à¸—à¸˜à¸´à¹Œ "${permissions[i].label}"?`)) return
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
    if (!newPerm.key || !newPerm.label) { toast.error('à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸ key à¹à¸¥à¸° label'); return }
    if (permissions.find(p => p.key === newPerm.key)) { toast.error('key à¸™à¸µà¹‰à¸¡à¸µà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§'); return }
    setPermissions(p => [...p, newPerm])
    setNewPerm(EMPTY_PERM)
    setAddingPerm(false)
  }

  if (loading) return <div className="text-center py-16 text-gray-400">à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”â€¦</div>

  return (
    <div className="max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">à¸šà¸—à¸šà¸²à¸— & à¸ªà¸´à¸—à¸˜à¸´à¹Œ</h2>
          <p className="page-sub">à¸ˆà¸±à¸”à¸à¸²à¸£ Role à¹à¸¥à¸°à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸à¸²à¸£à¹ƒà¸Šà¹‰à¸‡à¸²à¸™à¹ƒà¸™à¸£à¸°à¸šà¸š</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving}>
          <Save size={16} />{saving ? 'à¸à¸³à¸¥à¸±à¸‡à¸šà¸±à¸™à¸—à¸¶à¸â€¦' : 'à¸šà¸±à¸™à¸—à¸¶à¸à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”'}
        </button>
      </div>

      {/* â”€â”€ Roles Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-700">à¸šà¸—à¸šà¸²à¸— (Roles)</h3>
          <button className="btn-outline btn-sm" onClick={() => { setAddingRole(true); setNewRole(EMPTY_ROLE) }}>
            <Plus size={14} /> à¹€à¸žà¸´à¹ˆà¸¡ Role
          </button>
        </div>
        <div className="divide-y">
          {roles.map((role, i) => (
            <div key={role.key} className="flex items-start gap-3 px-5 py-3">
              {editRoleIdx === i ? (
                <>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="form-label text-xs">key (à¸«à¹‰à¸²à¸¡à¹€à¸§à¹‰à¸™à¸§à¸£à¸£à¸„)</label>
                      <input className="form-input py-1 text-sm font-mono" value={editRoleVal.key}
                        onChange={e => setEditRoleVal(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">à¸Šà¸·à¹ˆà¸­à¹à¸ªà¸”à¸‡</label>
                      <input className="form-input py-1 text-sm" value={editRoleVal.label}
                        onChange={e => setEditRoleVal(v => ({ ...v, label: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">à¸„à¸³à¸­à¸˜à¸´à¸šà¸²à¸¢</label>
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
                    <button className="btn-outline btn-sm" title="à¹à¸à¹‰à¹„à¸‚" onClick={() => startEditRole(i)}><Pencil size={12} /></button>
                    <button className="btn-outline btn-sm text-red-500 hover:border-red-400" title="à¸¥à¸š" onClick={() => deleteRole(i)}><Trash2 size={12} /></button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add new role row */}
          {addingRole && (
            <div className="flex items-start gap-3 px-5 py-3 bg-blue-50">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="form-label text-xs">key *</label>
                  <input className="form-input py-1 text-sm font-mono" placeholder="à¹€à¸Šà¹ˆà¸™ hr_mgr" value={newRole.key}
                    onChange={e => setNewRole(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                </div>
                <div>
                  <label className="form-label text-xs">à¸Šà¸·à¹ˆà¸­à¹à¸ªà¸”à¸‡ *</label>
                  <input className="form-input py-1 text-sm" placeholder="à¹€à¸Šà¹ˆà¸™ à¸œà¸¹à¹‰à¸ˆà¸±à¸”à¸à¸²à¸£ HR" value={newRole.label}
                    onChange={e => setNewRole(v => ({ ...v, label: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label text-xs">à¸„à¸³à¸­à¸˜à¸´à¸šà¸²à¸¢</label>
                  <input className="form-input py-1 text-sm" placeholder="à¸„à¸³à¸­à¸˜à¸´à¸šà¸²à¸¢à¸ªà¸±à¹‰à¸™à¹†" value={newRole.description}
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

      {/* â”€â”€ Permissions Matrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-700">Matrix à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸à¸²à¸£à¹ƒà¸Šà¹‰à¸‡à¸²à¸™</h3>
            <p className="text-xs text-gray-500 mt-0.5">à¸„à¸¥à¸´à¸à¸—à¸µà¹ˆà¸Šà¹ˆà¸­à¸‡à¹€à¸žà¸·à¹ˆà¸­à¹€à¸›à¸´à¸”/à¸›à¸´à¸”à¸ªà¸´à¸—à¸˜à¸´à¹Œ &nbsp;|&nbsp; âœ“ = à¸¡à¸µà¸ªà¸´à¸—à¸˜à¸´à¹Œ &nbsp;â€“&nbsp; = à¹„à¸¡à¹ˆà¸¡à¸µà¸ªà¸´à¸—à¸˜à¸´à¹Œ</p>
          </div>
          <button className="btn-outline btn-sm" onClick={() => { setAddingPerm(true); setNewPerm(EMPTY_PERM) }}>
            <Plus size={14} /> à¹€à¸žà¸´à¹ˆà¸¡à¸ªà¸´à¸—à¸˜à¸´à¹Œ
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-green-dark text-white">
                <th className="text-left px-3 py-2.5 font-semibold min-w-44 sticky left-0 bg-green-dark z-10">à¸ªà¸´à¸—à¸˜à¸´à¹Œ</th>
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
                            {editPermVal.roles.includes(r.key) ? 'âœ“' : 'â€“'}
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
                            title={`${perm.roles.includes(r.key) ? 'à¸›à¸´à¸”' : 'à¹€à¸›à¸´à¸”'}à¸ªà¸´à¸—à¸˜à¸´à¹Œ ${r.label}`}
                            className={`w-7 h-7 rounded text-sm font-bold border transition-colors ${
                              perm.roles.includes(r.key)
                                ? 'bg-green-100 border-green-400 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                                : 'bg-gray-50 border-gray-200 text-gray-300 hover:bg-green-50 hover:border-green-300 hover:text-green-600'
                            }`}
                          >
                            {perm.roles.includes(r.key) ? 'âœ“' : 'â€“'}
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

              {/* Add new permission row */}
              {addingPerm && (
                <tr className="bg-blue-50">
                  <td className="px-3 py-2 sticky left-0 bg-blue-50 z-10">
                    <div className="flex gap-1">
                      <input className="form-input py-0.5 text-xs font-mono w-24" placeholder="key *" value={newPerm.key}
                        onChange={e => setNewPerm(v => ({ ...v, key: e.target.value.replace(/\s/g,'') }))} />
                      <input className="form-input py-0.5 text-xs flex-1" placeholder="à¸Šà¸·à¹ˆà¸­à¸ªà¸´à¸—à¸˜à¸´à¹Œ *" value={newPerm.label}
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
                        {newPerm.roles.includes(r.key) ? 'âœ“' : 'â€“'}
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

