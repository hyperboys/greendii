'use client'

import { useEffect, useRef, useState } from 'react'
import { PrTypesAPI, SettingsAPI } from '@/lib/api'
import type { PrType } from '@/types'
import { DEFAULT_STEP_ROLE } from '@/types'
import { useSettingsStore } from '@/store/settings'
import { Plus, Pencil, Trash2, Save, X, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'

interface Draft {
  name: string
  approvalSteps: number[]
}

const emptyDraft = (): Draft => ({ name: '', approvalSteps: [] })

export default function PrTypesPage() {
  const { rolePermissionsConfig, fetchSettings } = useSettingsStore()
  const allRoles = rolePermissionsConfig.roles

  const [rows, setRows] = useState<PrType[]>([])
  const [stepRoleConfig, setStepRoleConfig] = useState<Record<string, string>>(DEFAULT_STEP_ROLE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())

  const load = () => {
    setLoading(true)
    PrTypesAPI.list()
      .then(setRows)
      .catch(() => toast.error('โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSettings()
    SettingsAPI.get().then(s => {
      if (s.stepRoleConfig) setStepRoleConfig(s.stepRoleConfig as Record<string, string>)
    })
    load()
  }, [])

  // ── step helpers ────────────────────────────────────────────────────────────
  const stepEntries = Object.entries(stepRoleConfig)
    .map(([s, r]) => ({ step: Number(s), role: r }))
    .sort((a, b) => a.step - b.step)

  const getRoleLabel = (roleKey: string) => allRoles.find(r => r.key === roleKey)?.label ?? roleKey
  const getStepLabel = (stepNum: number) => {
    const roleKey = stepRoleConfig[String(stepNum)]
    return roleKey ? getRoleLabel(roleKey) : `Step ${stepNum}`
  }

  // ── create ──────────────────────────────────────────────────────────────────
  const saveCreate = async () => {
    if (!creating?.name.trim()) { toast.error('กรุณาระบุชื่อประเภท'); return }
    setSaving(true)
    try {
      await PrTypesAPI.create({ name: creating.name.trim(), approvalSteps: creating.approvalSteps })
      setCreating(null)
      load()
      toast.success('เพิ่มประเภท PR สำเร็จ')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  // ── edit ──────────────────────────────────────────────────────────────────
  const startEdit = (t: PrType) => {
    setEditingId(t.id)
    setEditDraft({ name: t.name, approvalSteps: [...(t.approvalSteps ?? [])] })
  }
  const saveEdit = async () => {
    if (!editDraft.name.trim()) { toast.error('กรุณาระบุชื่อประเภท'); return }
    setSaving(true)
    try {
      await PrTypesAPI.update(editingId!, { name: editDraft.name.trim(), approvalSteps: editDraft.approvalSteps })
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">ประเภทใบขอซื้อ (PR)</h2>
          <p className="page-sub">กำหนดประเภท PR และสายการอนุมัติเฉพาะของแต่ละประเภท</p>
        </div>
        {!creating && (
          <button className="btn-primary btn-sm" onClick={() => setCreating(emptyDraft())}>
            <Plus size={14} /> เพิ่มประเภท
          </button>
        )}
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
        ผู้สร้างเอกสารจะไม่อนุมัติเอกสารของตัวเอง — หากผู้สร้างมีบทบาทตรงกับขั้นใดในสายอนุมัติ ระบบจะข้ามขั้นนั้นโดยอัตโนมัติ
        {' · '}หากไม่ตั้งค่าขั้นตอน จะใช้สายอนุมัติ PR เริ่มต้นจากหน้า “สายการอนุมัติ”
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
            steps={creating.approvalSteps}
            stepEntries={stepEntries}
            getStepLabel={getStepLabel}
            onChange={steps => setCreating(d => d ? { ...d, approvalSteps: steps } : d)}
          />
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
                  steps={editDraft.approvalSteps}
                  stepEntries={stepEntries}
                  getStepLabel={getStepLabel}
                  onChange={steps => setEditDraft(d => ({ ...d, approvalSteps: steps }))}
                />
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
                  {(t.approvalSteps ?? []).length === 0 ? (
                    <span className="text-xs text-gray-400">— ใช้สายอนุมัติ PR เริ่มต้น —</span>
                  ) : (
                    (t.approvalSteps ?? []).map(s => (
                      <div key={s} className="flex items-center gap-1.5">
                        <span className="text-gray-300 text-sm">→</span>
                        <span className="px-2.5 py-1.5 rounded-lg border-2 border-green-200 bg-white text-xs font-semibold text-gray-700">
                          {getStepLabel(s)}
                        </span>
                      </div>
                    ))
                  )}
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

// ── Reusable flow editor (chips + drag reorder) ───────────────────────────────
function FlowEditor({
  steps, stepEntries, getStepLabel, onChange,
}: {
  steps: number[]
  stepEntries: { step: number; role: string }[]
  getStepLabel: (step: number) => string
  onChange: (steps: number[]) => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const available = stepEntries.filter(s => !steps.includes(s.step))

  const reorder = (from: number, to: number) => {
    const arr = [...steps]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    onChange(arr)
  }

  return (
    <div>
      <p className="text-xs text-gray-500 font-medium mb-2">สายอนุมัติ (เรียงตามลำดับ)</p>
      <div className="flex flex-wrap items-center gap-2 min-h-[52px] p-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
        <div className="px-3 py-2 rounded-lg bg-green-main text-white text-xs font-semibold select-none">ผู้สร้าง</div>
        {steps.map((stepNum, idx) => (
          <div key={stepNum} className="flex items-center gap-1.5">
            <span className="text-gray-300 text-sm">→</span>
            <div
              draggable
              onDragStart={() => { dragIdx.current = idx }}
              onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => {
                if (dragIdx.current !== null && dragIdx.current !== idx) reorder(dragIdx.current, idx)
                dragIdx.current = null
                setDragOver(null)
              }}
              onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border-2 text-xs font-semibold cursor-grab active:cursor-grabbing transition-all select-none ${
                dragOver === idx
                  ? 'border-green-main bg-green-50 shadow-md scale-105'
                  : 'border-green-200 bg-white text-gray-700 hover:border-green-400'
              }`}
            >
              <GripVertical size={13} className="text-gray-400" />
              <span className="text-[10px] text-gray-400 font-normal mr-0.5">#{stepNum}</span>
              {getStepLabel(stepNum)}
              <button onClick={() => onChange(steps.filter(s => s !== stepNum))}
                className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
        {steps.length === 0 && (
          <span className="text-xs text-gray-400">ไม่มีขั้นตอน (ใช้สายอนุมัติ PR เริ่มต้น)</span>
        )}
      </div>

      {available.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 font-medium mb-2">เพิ่มขั้นตอน</p>
          <div className="flex flex-wrap gap-2">
            {available.map(s => (
              <button key={s.step} onClick={() => onChange([...steps, s.step])}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-green-400 hover:text-green-700 transition-colors">
                <Plus size={12} />
                <span className="text-[10px] text-gray-400">#{s.step}</span>
                {getStepLabel(s.step)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
