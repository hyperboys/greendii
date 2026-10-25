'use client'

import { useEffect, useState } from 'react'
import { PrTypesAPI, SettingsAPI, UsersAPI } from '@/lib/api'
import type { PrType, User } from '@/types'
import { DEFAULT_STEP_ROLE } from '@/types'
import { useSettingsStore } from '@/store/settings'
import { Plus, Pencil, Trash2, Save, X, ArrowUp, ArrowDown } from 'lucide-react'
import toast from 'react-hot-toast'

interface Draft {
  name: string
  approvalStages: string[][]
  viewerIds: string[]
}

type StageStep = number | number[]

const emptyDraft = (): Draft => ({ name: '', approvalStages: [], viewerIds: [] })

function normalizeApprovalStages(steps: unknown): number[][] {
  if (!Array.isArray(steps)) return []
  return steps
    .map((entry) => {
      if (Array.isArray(entry)) {
        const stage = entry
          .map(n => Number(n))
          .filter(n => Number.isInteger(n) && n > 0)
        return Array.from(new Set(stage))
      }
      const step = Number(entry)
      if (!Number.isInteger(step) || step <= 0) return []
      return [step]
    })
    .filter(stage => stage.length > 0)
}

export default function PrTypesPage() {
  const { rolePermissionsConfig, fetchSettings } = useSettingsStore()
  const allRoles = rolePermissionsConfig.roles

  const [rows, setRows] = useState<PrType[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadError, setLoadError] = useState(false)
  const [stepRoleConfig, setStepRoleConfig] = useState<Record<string, string>>(DEFAULT_STEP_ROLE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())

  const load = () => {
    setLoading(true)
    setLoadError(false)
    Promise.all([PrTypesAPI.list(), UsersAPI.list()])
      .then(([types, userList]) => { setRows(types); setUsers(userList) })
      .catch(() => { setLoadError(true); toast.error('โหลดประเภท PR หรือรายชื่อผู้ใช้ไม่สำเร็จ') })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSettings()
    SettingsAPI.get().then(s => {
      if (s.stepRoleConfig) setStepRoleConfig(s.stepRoleConfig as Record<string, string>)
    })
    load()
  }, [])

  const isStepToken = (value: string) => value.startsWith('step:')
  const parseStepToken = (value: string) => Number(value.slice(5))

  const getRoleLabel = (roleKey: string) => allRoles.find(r => r.key === roleKey)?.label ?? roleKey

  const getRoleChipLabel = (roleKeyOrToken: string) => {
    if (isStepToken(roleKeyOrToken)) {
      const step = parseStepToken(roleKeyOrToken)
      return Number.isFinite(step) ? `Step ${step}` : roleKeyOrToken
    }
    return getRoleLabel(roleKeyOrToken)
  }

  const stepsToStages = (steps: StageStep[]) => {
    const normalized = normalizeApprovalStages(steps)
    return normalized.map(stage => stage.map(step => stepRoleConfig[String(step)] || `step:${step}`))
  }

  const stagesToSteps = async (stages: string[][]): Promise<StageStep[]> => {
    const currentMap = { ...stepRoleConfig }
    const roleToStep = new Map<string, number>()

    for (const [stepStr, roleKey] of Object.entries(currentMap)) {
      const stepNum = Number(stepStr)
      if (!Number.isInteger(stepNum) || stepNum < 1) continue
      if (!roleToStep.has(roleKey)) roleToStep.set(roleKey, stepNum)
    }

    let maxStep = Object.keys(currentMap)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
      .reduce((m, n) => Math.max(m, n), 0)

    let changed = false
    const result: StageStep[] = []

    for (const stageRoles of stages) {
      const stageSteps = stageRoles
        .map(roleKeyOrToken => {
          if (isStepToken(roleKeyOrToken)) {
            const step = parseStepToken(roleKeyOrToken)
            return Number.isFinite(step) ? step : 0
          }

          const existingStep = roleToStep.get(roleKeyOrToken)
          if (existingStep) return existingStep

          maxStep += 1
          currentMap[String(maxStep)] = roleKeyOrToken
          roleToStep.set(roleKeyOrToken, maxStep)
          changed = true
          return maxStep
        })
        .filter(step => step > 0)

      const deduped = Array.from(new Set(stageSteps))
      if (deduped.length === 0) continue
      result.push(deduped.length === 1 ? deduped[0] : deduped)
    }

    if (changed) {
      await SettingsAPI.update({ stepRoleConfig: currentMap })
      setStepRoleConfig(currentMap)
    }

    return result
  }

  // ── create ──────────────────────────────────────────────────────────────────
  const saveCreate = async () => {
    if (!creating?.name.trim()) { toast.error('กรุณาระบุชื่อประเภท'); return }
    setSaving(true)
    try {
      const approvalSteps = await stagesToSteps(creating.approvalStages)
      await PrTypesAPI.create({ name: creating.name.trim(), approvalSteps, viewerIds: creating.viewerIds })
      setCreating(null)
      load()
      toast.success('เพิ่มประเภท PR สำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  // ── edit ──────────────────────────────────────────────────────────────────
  const startEdit = (t: PrType) => {
    setEditingId(t.id)
    setEditDraft({ name: t.name, approvalStages: stepsToStages(t.approvalSteps ?? []), viewerIds: t.viewerIds ?? [] })
  }
  const saveEdit = async () => {
    if (!editDraft.name.trim()) { toast.error('กรุณาระบุชื่อประเภท'); return }
    setSaving(true)
    try {
      const approvalSteps = await stagesToSteps(editDraft.approvalStages)
      await PrTypesAPI.update(editingId!, { name: editDraft.name.trim(), approvalSteps, viewerIds: editDraft.viewerIds })
      setEditingId(null)
      load()
      toast.success('บันทึกสำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  const toggleActive = async (t: PrType) => {
    try {
      if (t.active) {
        await PrTypesAPI.delete(t.id)
      } else {
        await PrTypesAPI.update(t.id, { active: true })
      }
      load()
    } catch { toast.error('เปลี่ยนสถานะไม่สำเร็จ') }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  if (loadError) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-red-600">โหลดประเภท PR หรือรายชื่อผู้ใช้ไม่สำเร็จ</p>
      <button className="btn-outline btn-sm" onClick={load}>ลองใหม่</button>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">ประเภทใบขอซื้อ (PR)</h2>
          <p className="page-sub">กำหนดประเภท PR สายการอนุมัติ และผู้มีสิทธิ์ดูรายบุคคล</p>
        </div>
        {!creating && (
          <button className="btn-primary btn-sm" onClick={() => setCreating(emptyDraft())}>
            <Plus size={14} /> เพิ่มประเภท
          </button>
        )}
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
        ผู้สร้างเอกสารจะไม่อนุมัติเอกสารของตัวเอง — หากผู้สร้างมีบทบาทตรงกับขั้นใดในสายอนุมัติ ระบบจะข้ามขั้นนั้นโดยอัตโนมัติ
        {' · '}หากไม่ตั้งค่าขั้นตอน เอกสารประเภทนี้จะไม่มีผู้อนุมัติ และอนุมัติอัตโนมัติเมื่อส่งเอกสาร
      </div>

      {/* ── create form ── */}
      {creating && (
        <div className="card p-5 space-y-4 border-green-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">เพิ่มประเภทใหม่</h3>
            <button className="text-gray-400 hover:text-gray-600" onClick={() => setCreating(null)}><X size={16} /></button>
          </div>
          <div>
            <label className="form-label">ชื่อประเภท *</label>
            <input className="form-input" value={creating.name} autoFocus
              onChange={e => setCreating(d => d ? { ...d, name: e.target.value } : d)}
              placeholder="เช่น ซื้อทั่วไป, ซื้อโครงการ, ซื้อด่วน" />
          </div>
          <FlowEditor
            stages={creating.approvalStages}
            availableRoles={allRoles.map(r => r.key)}
            getRoleLabel={getRoleChipLabel}
            onChange={stages => setCreating(d => d ? { ...d, approvalStages: stages } : d)}
          />
          <ViewerEditor users={users} viewerIds={creating.viewerIds}
            onChange={viewerIds => setCreating(d => d ? { ...d, viewerIds } : d)} />
          <div className="flex justify-end gap-2">
            <button className="btn-outline btn-sm" onClick={() => setCreating(null)}>ยกเลิก</button>
            <button className="btn-primary btn-sm" onClick={saveCreate} disabled={saving}>
              <Save size={14} /> บันทึก
            </button>
          </div>
        </div>
      )}

      {/* ── list ── */}
      <div className="space-y-4">
        {rows.map(t => (
          <div key={t.id} className="card p-5">
            {editingId === t.id ? (
              <div className="space-y-4">
                <div>
                  <label className="form-label">ชื่อประเภท *</label>
                  <input className="form-input" value={editDraft.name}
                    onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} />
                </div>
                <FlowEditor
                  stages={editDraft.approvalStages}
                  availableRoles={allRoles.map(r => r.key)}
                  getRoleLabel={getRoleChipLabel}
                  onChange={stages => setEditDraft(d => ({ ...d, approvalStages: stages }))}
                />
                <ViewerEditor users={users} viewerIds={editDraft.viewerIds}
                  onChange={viewerIds => setEditDraft(d => ({ ...d, viewerIds }))} />
                <div className="flex justify-end gap-2">
                  <button className="btn-outline btn-sm" onClick={() => setEditingId(null)}>ยกเลิก</button>
                  <button className="btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                    <Save size={14} /> บันทึก
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800">{t.name}</h3>
                    <span className={`badge ${t.active ? 'badge-approved' : 'badge-draft'}`}>
                      {t.active ? 'ใช้งาน' : 'ปิดใช้'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-outline btn-sm" onClick={() => startEdit(t)}><Pencil size={12} /></button>
                    <button className={t.active ? 'btn-danger btn-sm' : 'btn-outline btn-sm'} onClick={() => toggleActive(t)}>
                      {t.active ? <Trash2 size={12} /> : 'เปิดใช้'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1.5 rounded-lg bg-green-main text-white text-xs font-semibold">ผู้สร้าง</div>
                  {normalizeApprovalStages(t.approvalSteps ?? []).length === 0 ? (
                    <span className="text-xs text-gray-400">— ไม่มีผู้อนุมัติ (อนุมัติอัตโนมัติ) —</span>
                  ) : (
                    stepsToStages(t.approvalSteps ?? []).map((stage, idx) => (
                      <div key={`${t.id}-${idx}`} className="flex items-center gap-1.5">
                        <span className="text-gray-300 text-sm">→</span>
                        <div className="px-2.5 py-1.5 rounded-lg border-2 border-green-200 bg-white text-xs font-semibold text-gray-700">
                          {stage.map((roleKey, roleIdx) => (
                            <span key={`${t.id}-${idx}-${roleKey}-${roleIdx}`}>
                              {roleIdx > 0 ? ' / ' : ''}
                              {getRoleChipLabel(roleKey)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  <span className="font-semibold">ผู้มีสิทธิ์ดู PR ทุกขั้น: </span>
                  {(t.viewerIds ?? []).length === 0 ? 'ไม่ได้กำหนดเพิ่มเติม' : (t.viewerIds ?? [])
                    .map(id => {
                      const viewer = users.find(u => u.id === id)
                      return viewer ? `${viewer.fullName} (${viewer.username})${viewer.active ? '' : ' [ปิดใช้งาน]'}` : id
                    }).join(', ')}
                </div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && !creating && (
          <div className="text-center py-12 text-gray-400">ยังไม่มีประเภท PR</div>
        )}
      </div>
    </div>
  )
}

function ViewerEditor({ users, viewerIds, onChange }: {
  users: User[]
  viewerIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleUsers = users.filter(user =>
    `${user.fullName} ${user.username}`.toLowerCase().includes(query),
  )
  return (
    <fieldset className="space-y-2">
      <legend className="form-label">ผู้มีสิทธิ์ดู PR (รายบุคคล)</legend>
      <p className="text-xs text-gray-500">
        ดู PR ประเภทนี้ได้ทุกขั้นและทุกสถานะ รวมถึงพิมพ์เอกสาร โดยไม่เพิ่มสิทธิ์อนุมัติหรือแก้ไข
      </p>
      <input className="form-input" aria-label="ค้นหาผู้มีสิทธิ์ดู PR" placeholder="ค้นหาชื่อหรือชื่อผู้ใช้"
        value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-2">
        {visibleUsers.map(user => (
          <label key={user.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={viewerIds.includes(user.id)}
              onChange={e => onChange(e.target.checked
                ? [...viewerIds, user.id]
                : viewerIds.filter(id => id !== user.id))} />
            <span>{user.fullName} ({user.username}){!user.active && ' [ปิดใช้งาน]'}</span>
          </label>
        ))}
        {visibleUsers.length === 0 && <p className="text-xs text-gray-400">ไม่พบผู้ใช้</p>}
      </div>
      <p className="text-xs text-gray-500">เลือกแล้ว {viewerIds.length} คน</p>
    </fieldset>
  )
}

// ── Reusable flow editor (chips + drag reorder) ───────────────────────────────
function FlowEditor({
  stages, availableRoles, getRoleLabel, onChange,
}: {
  stages: string[][]
  availableRoles: string[]
  getRoleLabel: (roleKey: string) => string
  onChange: (stages: string[][]) => void
}) {
  const usedRoles = new Set(stages.flat())
  const pickable = availableRoles.filter(roleKey => !usedRoles.has(roleKey))
  const [newStageRole, setNewStageRole] = useState('')
  const [stageRoleSelections, setStageRoleSelections] = useState<Record<number, string>>({})

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= stages.length) return
    const arr = [...stages]
    const [item] = arr.splice(idx, 1)
    arr.splice(next, 0, item)
    onChange(arr)
  }

  const addRoleToStage = (stageIdx: number, roleKey: string) => {
    if (!roleKey) return
    const arr = stages.map((stage, idx) => {
      if (idx !== stageIdx) return stage
      if (stage.includes(roleKey) || stage.length >= 2) return stage
      return [...stage, roleKey]
    })
    onChange(arr)
    setStageRoleSelections(prev => ({ ...prev, [stageIdx]: '' }))
  }

  const removeRoleFromStage = (stageIdx: number, roleKey: string) => {
    const arr = stages
      .map((stage, idx) => {
        if (idx !== stageIdx) return stage
        return stage.filter(role => role !== roleKey)
      })
      .filter(stage => stage.length > 0)
    onChange(arr)
  }

  const addStage = (roleKey: string) => {
    if (!roleKey || !pickable.includes(roleKey)) return
    onChange([...stages, [roleKey]])
    setNewStageRole('')
  }

  const removeStage = (idx: number) => {
    onChange(stages.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <p className="text-xs text-gray-500 font-medium mb-2">สายอนุมัติ (รองรับ OR สูงสุด 2 Role ต่อขั้น)</p>
      <div className="space-y-2 p-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
        <div className="inline-flex px-3 py-2 rounded-lg bg-green-main text-white text-xs font-semibold select-none">ผู้สร้าง</div>

        {stages.length === 0 && (
          <div className="text-xs text-gray-400">ไม่มีขั้นตอน (ไม่มีผู้อนุมัติ และอนุมัติอัตโนมัติ)</div>
        )}

        {stages.map((stage, idx) => {
          const stageUsedElsewhere = new Set(stages.flatMap((s, i) => i === idx ? [] : s))
          const stagePickable = availableRoles.filter(roleKey => !stageUsedElsewhere.has(roleKey) && !stage.includes(roleKey))

          return (
            <div key={`stage-${idx}`} className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-green-200 bg-white px-3 py-2">
              <span className="text-gray-300 text-sm">→</span>
              <span className="text-xs font-semibold text-gray-500">ขั้น {idx + 1}</span>

              <div className="flex flex-wrap items-center gap-2">
                {stage.map(roleKey => (
                  <span key={`stage-${idx}-${roleKey}`} className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-2 py-1 text-xs font-semibold text-green-800">
                    {getRoleLabel(roleKey)}
                    <button
                      type="button"
                      className="text-green-700 hover:text-red-500"
                      onClick={() => removeRoleFromStage(idx, roleKey)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              {stage.length < 2 && stagePickable.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="form-select min-w-[180px]"
                    value={stageRoleSelections[idx] ?? ''}
                    onChange={e => setStageRoleSelections(prev => ({ ...prev, [idx]: e.target.value }))}
                  >
                    <option value="">เลือก Role ร่วม</option>
                    {stagePickable.map(roleKey => (
                      <option key={`stage-${idx}-option-${roleKey}`} value={roleKey}>
                        {getRoleLabel(roleKey)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => addRoleToStage(idx, stageRoleSelections[idx] ?? '')}
                    disabled={!(stageRoleSelections[idx] ?? '')}
                  >
                    <Plus size={12} /> เพิ่ม Role ร่วม (OR)
                  </button>
                </div>
              )}

              <div className="ml-auto flex items-center gap-1">
                <button type="button" className="btn-outline btn-sm" onClick={() => moveStage(idx, -1)} disabled={idx === 0}>
                  <ArrowUp size={12} />
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => moveStage(idx, 1)} disabled={idx === stages.length - 1}>
                  <ArrowDown size={12} />
                </button>
                <button type="button" className="btn-danger btn-sm" onClick={() => removeStage(idx)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {pickable.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 font-medium mb-2">เพิ่มขั้นตอนใหม่</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="form-select min-w-[220px]"
              value={newStageRole}
              onChange={e => setNewStageRole(e.target.value)}
            >
              <option value="">เลือก Role สำหรับขั้นใหม่</option>
              {pickable.map(roleKey => (
                <option key={`new-stage-${roleKey}`} value={roleKey}>
                  {getRoleLabel(roleKey)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => addStage(newStageRole)}
              disabled={!newStageRole}
            >
              <Plus size={12} /> เพิ่มขั้นตอน
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
