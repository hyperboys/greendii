'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, X, Search } from 'lucide-react'

export interface MultiSelectOption {
  value: string
  label: string
}

interface Props {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchable?: boolean
  className?: string
}

export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'ทั้งหมด',
  searchable = true,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return options
    return options.filter(o => o.label.toLowerCase().includes(kw))
  }, [options, q])

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value))
    else onChange([...selected, value])
  }

  const selectAll = () => onChange(filtered.map(o => o.value))
  const clearAll = () => onChange([])

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find(o => o.value === selected[0])?.label ?? `${selected.length} รายการ`
        : `เลือกแล้ว ${selected.length} รายการ`

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="form-input flex items-center justify-between gap-2 text-left"
      >
        <span className={selected.length === 0 ? 'text-gray-400 truncate' : 'truncate'}>{label}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="ค้นหา…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-gray-100">
            <button type="button" onClick={selectAll} className="text-green-600 hover:underline">
              เลือกทั้งหมด
            </button>
            <button type="button" onClick={clearAll} className="text-gray-500 hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> ล้าง
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">ไม่พบรายการ</div>}
            {filtered.map(o => {
              const active = selected.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
                >
                  <span
                    className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                      active ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
