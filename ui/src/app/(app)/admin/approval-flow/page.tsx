'use client'

import { useEffect, useState } from 'react'
import { SettingsAPI, AdminAPI } from '@/lib/api'
import { APPROVAL_STEPS, DOC_TYPES, DEFAULT_APPROVAL_FLOW } from '@/types'
import { ArrowRight, Save, RefreshCw } from 'lucide-react'
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

  const toggle = (docKey: string, step: number) => {
    setConfig(prev => {
      const cur = prev[docKey] ?? []
      return {
        ...prev,
        [docKey]: cur.includes(step) ? cur.filter(s => s !== step) : [...cur, step].sort((a, b) => a - b),
      }
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
          <p className="page-sub">กำหนดขั้นตอนการอนุมัติสำหรับเอกสารแต่ละประเภท</p>
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

      <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
        <strong>หมายเหตุ:</strong> การตั้งค่านี้แสดงสายอนุมัติที่กำหนดไว้สำหรับแต่ละประเภทเอกสาร
        การเปลี่ยนแปลงจะมีผลกับเอกสารที่สร้างใหม่ในอนาคต
      </div>

      <div className="space-y-6">
        {DOC_TYPES.map(doc => {
          const steps = config[doc.key] ?? []
          return (
            <div key={doc.key} className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-4 text-base">{doc.label}</h3>
              <div className="flex flex-wrap items-center gap-2">
                {/* Step 0: ผู้สร้าง (always on) */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="px-3 py-2 rounded-lg text-xs font-semibold bg-green-main text-white text-center w-28">
                      เซลล์<br />(ผู้สร้าง)
                    </div>
                    <span className="text-xs text-gray-400">เริ่มต้น</span>
                  </div>
                </div>

                {APPROVAL_STEPS.map((s, idx) => {
                  const active = steps.includes(s.step)
                  return (
                    <div key={s.step} className="flex items-center gap-2">
                      <ArrowRight size={16} className={active ? 'text-green-main' : 'text-gray-200'} />
                      <div className="flex flex-col items-center gap-1">
                        <button
                          onClick={() => toggle(doc.key, s.step)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all w-28 text-center ${
                            active
                              ? 'bg-green-main border-green-main text-white shadow-sm'
                              : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                          }`}
                        >
                          {s.label}
                        </button>
                        <span className={`text-xs ${active ? 'text-green-700 font-medium' : 'text-gray-300'}`}>
                          {active ? 'เปิดใช้' : 'ปิด'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                ขั้นตอนที่เปิดใช้: {steps.length > 0
                  ? APPROVAL_STEPS.filter(s => steps.includes(s.step)).map(s => s.label).join(' → ')
                  : 'ไม่มีการอนุมัติ (อนุมัติอัตโนมัติ)'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
