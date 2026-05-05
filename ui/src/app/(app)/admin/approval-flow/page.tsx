'use client'

import { useEffect, useRef, useState } from 'react'
import { SettingsAPI, AdminAPI } from '@/lib/api'
import { APPROVAL_STEPS, DOC_TYPES, DEFAULT_APPROVAL_FLOW } from '@/types'
import { GripVertical, Plus, Save, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ApprovalFlowPage() {
  const [config, setConfig] = useState<Record<string, number[]>>(DEFAULT_APPROVAL_FLOW)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    SettingsAPI.get().then(s => {
      if (s.approvalFlowConfig) setConfig(s.approvalFlowConfig as Record<string, number[]>)
    }).finally(() => setLoading(false))
  }, [])

  const addStep = (docKey: string, step: number) => {
    setConfig(prev => ({ ...prev, [docKey]: [...(prev[docKey] ?? []), step] }))
  }

  const removeStep = (docKey: string, step: number) => {
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

  const save = async () => {
    setSaving(true)
    try {
      await AdminAPI.updateApprovalFlow(config)
      toast.success('บันทึกการตั้งค่าสายอนุมัติสำเร็จ')
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setConfig(DEFAULT_APPROVAL_FLOW)
    toast('รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)', { icon: '↩️' })
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">สายการอนุมัติ</h2>
          <p className="page-sub">กำหนดและเรียงลำดับขั้นตอนการอนุมัติสำหรับเอกสารแต่ละประเภท</p>
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

      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700 flex items-start gap-2">
        <GripVertical size={16} className="mt-0.5 shrink-0" />
        <span>
          ลากไอคอน <strong>grip</strong> เพื่อเรียงลำดับขั้นตอน &nbsp;·&nbsp;
          คลิก <strong>+</strong> เพื่อเพิ่มขั้นตอน &nbsp;·&nbsp;
          คลิก <strong>×</strong> เพื่อลบออก &nbsp;·&nbsp;
          การเปลี่ยนแปลงมีผลกับเอกสารที่สร้างใหม่
        </span>
      </div>

      <div className="space-y-6">
        {DOC_TYPES.map(doc => (
          <DocFlowCard
            key={doc.key}
            label={doc.label}
            activeSteps={config[doc.key] ?? []}
            onAdd={step => addStep(doc.key, step)}
            onRemove={step => removeStep(doc.key, step)}
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
  onAdd,
  onRemove,
  onReorder,
}: {
  label: string
  activeSteps: number[]
  onAdd: (step: number) => void
  onRemove: (step: number) => void
  onReorder: (from: number, to: number) => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const available = APPROVAL_STEPS.filter(s => !activeSteps.includes(s.step))

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

          {activeSteps.map((stepNum, idx) => {
            const stepDef = APPROVAL_STEPS.find(s => s.step === stepNum)
            if (!stepDef) return null
            return (
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
                  {stepDef.label}
                  <button
                    onClick={() => onRemove(stepNum)}
                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })}

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
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
