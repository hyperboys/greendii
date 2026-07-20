'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export interface SearchableSelectOption {
  value: string
  label: string
  description?: string
}

interface Props {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  clearable?: boolean
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'เลือกข้อมูล',
  searchPlaceholder = 'ค้นหา...',
  emptyText = 'ไม่พบรายการ',
  className = '',
  clearable = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => options.find(o => o.value === value) || null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    searchRef.current?.focus()
  }, [open])

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="form-input h-10 flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
          <div className="border-b border-gray-100 bg-gray-50/70 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-green-500"
              />
            </div>
          </div>

          {clearable && value && (
            <div className="flex justify-end border-b border-gray-100 px-3 py-1.5">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" /> ล้างการเลือก
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-3 text-sm text-gray-400">{emptyText}</div>}

            {filtered.map((opt) => {
              const active = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-green-50/60"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        active ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-800">{opt.label}</span>
                      {opt.description && <span className="block truncate text-xs text-gray-500">{opt.description}</span>}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
