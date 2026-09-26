'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, X, ListChecks } from 'lucide-react'

export interface QuotationCheckboxOption {
  value: string
  label: string
  shortLabel?: string
  description?: string
}

interface Props {
  options: QuotationCheckboxOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  title?: string
}

export default function QuotationCheckboxSelect({
  options,
  selected,
  onChange,
  placeholder = 'ยังไม่เลือกใบเสนอราคา',
  searchPlaceholder = 'พิมพ์ค้นหาเลขที่ใบเสนอราคา / ลูกค้า / โครงการ',
  emptyText = 'ไม่พบใบเสนอราคาที่ตรงคำค้น',
  title = 'เลือกใบเสนอราคา',
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  const optionMap = useMemo(() => new Map(options.map(o => [o.value, o])), [options])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return options
    return options.filter(o =>
      o.label.toLowerCase().includes(kw) || (o.description ?? '').toLowerCase().includes(kw))
  }, [options, q])

  const selectedText = selected
    .map(id => optionMap.get(id)?.shortLabel ?? optionMap.get(id)?.label ?? id)
    .join(', ')

  // Selection order matters: the first selected quotation is the main one.
  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value))
    else onChange([...selected, value])
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={selectedText}
          placeholder={placeholder}
          onClick={() => setOpen(true)}
          className="form-input flex-1 cursor-pointer"
        />
        <button type="button" onClick={() => setOpen(true)} className="btn-outline shrink-0">
          <ListChecks size={16} /> เลือก
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="btn-outline shrink-0" title="ล้างรายการที่เลือก">
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">{title}</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-2 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {filtered.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">{emptyText}</div>}
              {filtered.map(o => {
                const checked = selected.includes(o.value)
                const isPrimary = selected[0] === o.value
                return (
                  <label
                    key={o.value}
                    className={`flex items-start gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-gray-50 ${checked ? 'bg-emerald-50/60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 accent-green-600"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{o.label}</span>
                        {isPrimary && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                            QO หลัก
                          </span>
                        )}
                      </span>
                      {o.description && <span className="block text-xs text-gray-500 truncate">{o.description}</span>}
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 truncate">
                {selected.length > 0 ? `เลือกแล้ว ${selected.length} รายการ: ${selectedText}` : 'ยังไม่เลือกรายการ'}
              </p>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => onChange([])} className="btn-outline btn-sm">ล้างทั้งหมด</button>
                <button type="button" onClick={() => setOpen(false)} className="btn-primary btn-sm">เสร็จสิ้น</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
