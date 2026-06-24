'use client'

import { useEffect, useRef, useState } from 'react'
import { SettingsAPI, AdminAPI, UsersAPI } from '@/lib/api'
import { DOC_TYPES, DEFAULT_APPROVAL_FLOW, DEFAULT_STEP_ROLE } from '@/types'
import { useSettingsStore } from '@/store/settings'
import type { User } from '@/types'
import { GripVertical, Plus, Save, RefreshCw, X, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const WO_APPROVED_NOTIFY_KEY = 'workOrderApprovedNotify'
const DEFAULT_WO_APPROVED_NOTIFY = {
  enabled: false,
  roles: [] as string[],
  userIds: [] as string[],
  messageTemplate: 'ใบสั่งงาน {woNo} อนุมัติครบแล้ว',
}

export default function ApprovalFlowPage() {
  const { rolePermissionsConfig, fetchSettings } = useSettingsStore()
  const allRoles = rolePermissionsConfig.roles

  // approvalFlowConfig: { quotation: [1,2,3], workOrder: [3,4], ... }
  const [config, setConfig] = useState<Record<string, number[]>>(DEFAULT_APPROVAL_FLOW)
  // stepRoleConfig: { "1": "sales", "2": "sale_mgr", ... }
  const [stepRoleConfig, setStepRoleConfig] = useState<Record<string, string>>(DEFAULT_STEP_ROLE)
  const [woApprovedNotify, setWoApprovedNotify] = useState(DEFAULT_WO_APPROVED_NOTIFY)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [rawApprovalFlowConfig, setRawApprovalFlowConfig] = useState<Record<string, unknown>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // for adding a new step→role mapping
  const [newStepNum, setNewStepNum] = useState('')
  const [newStepRole, setNewStepRole] = useState('')

  // PR flow is configured from "ประเภทใบขอซื้อ (PR)" page per PR type.
  const docTypesForGenericFlow = DOC_TYPES.filter(doc => doc.key !== 'pr')

  const parseWoApprovedNotify = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_WO_APPROVED_NOTIFY }
    const cfg = raw as {
      enabled?: unknown
      roles?: unknown
      userIds?: unknown
      messageTemplate?: unknown
    }
    return {
      enabled: Boolean(cfg.enabled),
      roles: Array.isArray(cfg.roles) ? cfg.roles.map(String).filter(Boolean) : [],
      userIds: Array.isArray(cfg.userIds) ? cfg.userIds.map(String).filter(Boolean) : [],
      messageTemplate: typeof cfg.messageTemplate === 'string' && cfg.messageTemplate.trim()
        ? cfg.messageTemplate
        : DEFAULT_WO_APPROVED_NOTIFY.messageTemplate,
    }
  }

  useEffect(() => {
    fetchSettings()
    Promise.all([
      SettingsAPI.get(),
      UsersAPI.list({ active: 'true' }),
    ]).then(([s, users]) => {
      const approvalFlowConfig = (s.approvalFlowConfig ?? {}) as Record<string, unknown>
      setRawApprovalFlowConfig(approvalFlowConfig)
      setConfig(prev => ({
        ...prev,
        ...Object.fromEntries(
          docTypesForGenericFlow.map(doc => {
            const value = approvalFlowConfig[doc.key]
            return [doc.key, Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : (prev[doc.key] ?? [])]
          })
        ),
      }))
      if (s.stepRoleConfig) setStepRoleConfig(s.stepRoleConfig as Record<string, string>)
      setWoApprovedNotify(parseWoApprovedNotify(approvalFlowConfig[WO_APPROVED_NOTIFY_KEY]))
      setAllUsers(users)
    }).finally(() => setLoading(false))
  }, [])

  // ── step→role helpers ──────────────────────────────────────────────────────
  // sorted step entries for display
  const stepEntries = Object.entries(stepRoleConfig)
    .map(([s, r]) => ({ step: Number(s), role: r }))
    .sort((a, b) => a.step - b.step)

  const getRoleLabel = (roleKey: string) =>
    allRoles.find(r => r.key === roleKey)?.label ?? roleKey

  const getStepLabel = (stepNum: number) => {
    const roleKey = stepRoleConfig[String(stepNum)]
    return roleKey ? `${getRoleLabel(roleKey)}` : `Step ${stepNum}`
  }

  const addStepMapping = () => {
    const n = parseInt(newStepNum)
    if (!n || n < 1 || !newStepRole) { toast.error('กรุณาระบุหมายเลขขั้นตอนและบทบาท'); return }
    if (stepRoleConfig[String(n)]) { toast.error(`ขั้นที่ ${n} มีบทบาทอยู่แล้ว`); return }
    setStepRoleConfig(prev => ({ ...prev, [String(n)]: newStepRole }))
    setNewStepNum('')
    setNewStepRole('')
  }

  const removeStepMapping = (step: number) => {
    // Also remove this step from all flow configs
    setConfig(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter(s => s !== step)
      }
      return next
    })
    setStepRoleConfig(prev => {
      const next = { ...prev }
      delete next[String(step)]
      return next
    })
  }

  // ── flow config helpers ───────────────────────────────────────────────────
  const addStep = (docKey: string, step: number) => {
    setConfig(prev => ({ ...prev, [docKey]: [...(prev[docKey] ?? []), step] }))
  }
  const removeDocStep = (docKey: string, step: number) => {
    setConfig(prev => ({ ...prev, [docKey]: (prev[docKey] ?? []).filter(s => s !== step) }))
  }
  const reorder = (docKey: string, fromIdx: number, toIdx: number) => {
    setConfig(prev => {
      const arr = [...(prev[docKey] ?? [])]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return { ...prev, [docKey]: arr }
    })
  }

  // ── save & reset ──────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const genericFlowConfig = Object.fromEntries(
        docTypesForGenericFlow.map(doc => [doc.key, config[doc.key] ?? []])
      )
      const nextApprovalFlowConfig = {
        ...rawApprovalFlowConfig,
        ...genericFlowConfig,
        [WO_APPROVED_NOTIFY_KEY]: {
          enabled: woApprovedNotify.enabled,
          roles: Array.from(new Set(woApprovedNotify.roles)),
          userIds: Array.from(new Set(woApprovedNotify.userIds)),
          messageTemplate: woApprovedNotify.messageTemplate?.trim() || DEFAULT_WO_APPROVED_NOTIFY.messageTemplate,
        },
      }
      await Promise.all([
        AdminAPI.updateApprovalFlow(nextApprovalFlowConfig),
        SettingsAPI.update({ stepRoleConfig }),
      ])
      setRawApprovalFlowConfig(nextApprovalFlowConfig)
      toast.success('บันทึกการตั้งค่าสายอนุมัติสำเร็จ')
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setConfig(prev => {
      const next = { ...prev }
      for (const doc of docTypesForGenericFlow) {
        next[doc.key] = DEFAULT_APPROVAL_FLOW[doc.key] ?? []
      }
      return next
    })
    setStepRoleConfig(DEFAULT_STEP_ROLE)
    toast('รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)', { icon: '↩️' })
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">สายการอนุมัติ</h2>
          <p className="page-sub">กำหนดขั้นตอน บทบาท และลำดับการอนุมัติสำหรับเอกสารแต่ละประเภท</p>
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

      {/* ── Section 1: Step → Role mapping ─────────────────────────────────── */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-1">ตารางขั้นตอน → บทบาทผู้อนุมัติ</h3>
        <p className="text-xs text-gray-500 mb-4">
          กำหนดว่าขั้นตอนหมายเลขใดให้ใครเป็นผู้อนุมัติ
          ขั้นที่ 1 เป็นขั้นตรวจสอบเพื่อน (peer review) จะไม่อนุมัติเอกสารของตัวเอง
        </p>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="text-left px-3 py-2 font-semibold w-24">ขั้นที่</th>
              <th className="text-left px-3 py-2 font-semibold">บทบาทผู้อนุมัติ</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {stepEntries.map(({ step, role }) => (
              <tr key={step} className="border-t border-gray-100">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-800 text-xs font-bold">
                    {step}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="form-input py-1 text-sm w-64"
                    value={role}
                    onChange={e => setStepRoleConfig(prev => ({ ...prev, [String(step)]: e.target.value }))}
                  >
                    {allRoles.map(r => (
                      <option key={r.key} value={r.key}>{r.label} ({r.key})</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => removeStepMapping(step)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    title="ลบขั้นตอนนี้"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add new step mapping */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500 shrink-0">เพิ่มขั้นตอนใหม่:</span>
          <input
            type="number"
            min={1}
            className="form-input py-1 text-sm w-24"
            placeholder="ขั้นที่"
            value={newStepNum}
            onChange={e => setNewStepNum(e.target.value)}
          />
          <select
            className="form-input py-1 text-sm w-52"
            value={newStepRole}
            onChange={e => setNewStepRole(e.target.value)}
          >
            <option value="">เลือกบทบาท…</option>
            {allRoles
              .filter(r => !Object.values(stepRoleConfig).includes(r.key))
              .map(r => <option key={r.key} value={r.key}>{r.label} ({r.key})</option>)
            }
          </select>
          <button className="btn-outline btn-sm" onClick={addStepMapping}>
            <Plus size={14} /> เพิ่ม
          </button>
        </div>
      </div>

      {/* ── Section 2: Flow per doc type ────────────────────────────────────── */}
      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700 flex items-start gap-2">
        <GripVertical size={16} className="mt-0.5 shrink-0" />
        <span>
          ลากไอคอน <strong>grip</strong> เพื่อเรียงลำดับขั้นตอน &nbsp;·&nbsp;
          คลิก <strong>+</strong> เพื่อเพิ่มขั้นตอน &nbsp;·&nbsp;
          คลิก <strong>×</strong> เพื่อลบออก &nbsp;·&nbsp;
          การเปลี่ยนแปลงมีผลกับเอกสารที่สร้างใหม่ (ใบขอซื้อให้ตั้งค่าในหน้า ประเภทใบขอซื้อ (PR))
        </span>
      </div>

      <div className="space-y-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-1">แจ้งเตือนหลังอนุมัติ Work Order ครบ</h3>
          <p className="text-xs text-gray-500 mb-4">เมื่อ Work Order อนุมัติครบ ให้แจ้งเตือนทีม (ตามบทบาท) หรือผู้ใช้รายบุคคลที่กำหนด</p>

          <label className="inline-flex items-center gap-2 text-sm mb-4">
            <input
              type="checkbox"
              checked={woApprovedNotify.enabled}
              onChange={e => setWoApprovedNotify(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>เปิดใช้งานการแจ้งเตือนหลังอนุมัติครบ</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">เลือกทีม (Role)</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {allRoles.map(role => {
                  const checked = woApprovedNotify.roles.includes(role.key)
                  return (
                    <label key={role.key} className="flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setWoApprovedNotify(prev => ({
                          ...prev,
                          roles: e.target.checked
                            ? Array.from(new Set([...prev.roles, role.key]))
                            : prev.roles.filter(r => r !== role.key),
                        }))}
                      />
                      <span>{role.label} ({role.key})</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">เลือกผู้รับเฉพาะคน</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {allUsers.map(user => {
                  const checked = woApprovedNotify.userIds.includes(user.id)
                  return (
                    <label key={user.id} className="flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setWoApprovedNotify(prev => ({
                          ...prev,
                          userIds: e.target.checked
                            ? Array.from(new Set([...prev.userIds, user.id]))
                            : prev.userIds.filter(id => id !== user.id),
                        }))}
                      />
                      <span>{user.fullName} ({user.role})</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="form-label">ข้อความแจ้งเตือน (รองรับตัวแปร {`{woNo}`}, {`{project}`}, {`{customerName}`})</label>
            <input
              className="form-input"
              value={woApprovedNotify.messageTemplate}
              onChange={e => setWoApprovedNotify(prev => ({ ...prev, messageTemplate: e.target.value }))}
              placeholder="ใบสั่งงาน {woNo} อนุมัติครบแล้ว"
            />
          </div>
        </div>

        {docTypesForGenericFlow.map(doc => (
          <DocFlowCard
            key={doc.key}
            label={doc.label}
            activeSteps={config[doc.key] ?? []}
            stepEntries={stepEntries}
            getStepLabel={getStepLabel}
            onAdd={step => addStep(doc.key, step)}
            onRemove={step => removeDocStep(doc.key, step)}
            onReorder={(from, to) => reorder(doc.key, from, to)}
          />
        ))}
      </div>
    </div>
  )
}

function DocFlowCard({
  label,
  activeSteps,
  stepEntries,
  getStepLabel,
  onAdd,
  onRemove,
  onReorder,
}: {
  label: string
  activeSteps: number[]
  stepEntries: { step: number; role: string }[]
  getStepLabel: (step: number) => string
  onAdd: (step: number) => void
  onRemove: (step: number) => void
  onReorder: (from: number, to: number) => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const available = stepEntries.filter(s => !activeSteps.includes(s.step))

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-800 mb-4">{label}</h3>

      {/* ── สายอนุมัติที่ใช้งาน ── */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 font-medium mb-2">สายอนุมัติ (เรียงตามลำดับ)</p>
        <div className="flex flex-wrap items-center gap-2 min-h-[52px] p-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
          {/* ผู้สร้าง — fixed */}
          <div className="px-3 py-2 rounded-lg bg-green-main text-white text-xs font-semibold select-none">
            เซลล์ (ผู้สร้าง)
          </div>

          {activeSteps.map((stepNum, idx) => (
            <div key={stepNum} className="flex items-center gap-1.5">
              <span className="text-gray-300 text-sm">→</span>
              <div
                draggable
                onDragStart={() => { dragIdx.current = idx }}
                onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => {
                  if (dragIdx.current !== null && dragIdx.current !== idx) {
                    onReorder(dragIdx.current, idx)
                  }
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
                <button
                  onClick={() => onRemove(stepNum)}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}

          {activeSteps.length === 0 && (
            <span className="text-xs text-gray-400">ไม่มีขั้นตอนอนุมัติ (อนุมัติอัตโนมัติ)</span>
          )}
        </div>
      </div>

      {/* ── ขั้นตอนที่ยังไม่ได้ใช้ ── */}
      {available.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 font-medium mb-2">เพิ่มขั้นตอน</p>
          <div className="flex flex-wrap gap-2">
            {available.map(s => (
              <button
                key={s.step}
                onClick={() => onAdd(s.step)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-green-main hover:text-green-700 hover:bg-green-50 transition-all"
              >
                <Plus size={12} />
                #{s.step} {getStepLabel(s.step)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

