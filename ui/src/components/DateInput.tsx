'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  /** ISO date string (yyyy-mm-dd) or '' */
  value: string
  /** Called with ISO date string (yyyy-mm-dd) or '' */
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  id?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO (yyyy-mm-dd) -> display (dd/mm/yyyy) */
function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** display (dd/mm/yyyy) -> ISO (yyyy-mm-dd) or '' if invalid/incomplete */
function displayToIso(display: string): string | null {
  const m = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

export default function DateInput({
  value,
  onChange,
  className = '',
  placeholder = 'dd/mm/yyyy',
  disabled = false,
  id,
}: Props) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = value ? new Date(value) : new Date()
    return isNaN(d.getTime()) ? new Date() : d
  })
  const wrapRef = useRef<HTMLDivElement>(null)

  // Sync external value -> internal text when not focused/editing
  useEffect(() => {
    setText(isoToDisplay(value))
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) setViewDate(d)
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleTextChange = (raw: string) => {
    // Allow only digits and slashes, auto-insert slashes
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(formatted)
    const iso = displayToIso(formatted)
    if (iso !== null) {
      onChange(iso)
      const d = new Date(iso)
      if (!isNaN(d.getTime())) setViewDate(d)
    } else if (formatted === '') {
      onChange('')
    }
  }

  const handleBlur = () => {
    // Normalize: if invalid, revert to last valid value
    const iso = displayToIso(text)
    if (iso === null && text !== '') {
      setText(isoToDisplay(value))
    }
  }

  const selectedIso = value
  const cells = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const first = new Date(year, month, 1)
    const startOffset = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d))
    return result
  }, [viewDate])

  const pickDay = (d: Date) => {
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    onChange(iso)
    setText(isoToDisplay(iso))
    setOpen(false)
  }

  const today = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className="form-input pr-9 w-full"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={e => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        onClick={() => setOpen(o => !o)}
        aria-label="เปิดปฏิทิน"
      >
        <CalendarIcon size={16} />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold text-gray-800">
              {MONTHS_TH[viewDate.getMonth()]} {viewDate.getFullYear() + 543}
            </div>
            <button
              type="button"
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              aria-label="เดือนถัดไป"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-gray-400">
            {WEEKDAYS.map(w => (
              <div key={w} className="py-1 font-medium">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
              const isSelected = iso === selectedIso
              const isToday = isSameDay(d, today)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`h-8 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-green-main text-white font-semibold'
                      : isToday
                      ? 'bg-green-pale text-green-dark font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => { onChange(''); setText(''); setOpen(false) }}
            >
              ล้าง
            </button>
            <button
              type="button"
              className="font-medium text-green-dark hover:underline"
              onClick={() => pickDay(new Date())}
            >
              วันนี้
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
