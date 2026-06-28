'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  customerId?: string | null
  fetchSuggestions: (query: string, customerId?: string | null) => Promise<string[]>
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase()
}

function isValidEmail(v: string) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)
}

function splitTokens(text: string) {
  return text
    .split(/[;,\n\t ]+/)
    .map(v => normalizeEmail(v))
    .filter(Boolean)
}

export default function EmailChipInput({
  label,
  value,
  onChange,
  placeholder,
  customerId,
  fetchSuggestions,
}: Props) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const suggestionItems = useMemo(
    () => suggestions.filter(s => !value.includes(s)).slice(0, 8),
    [suggestions, value],
  )

  useEffect(() => {
    const q = input.trim()
    if (!q) {
      setSuggestions([])
      return
    }

    let active = true
    const id = setTimeout(async () => {
      try {
        const rows = await fetchSuggestions(q, customerId)
        if (active) setSuggestions(rows)
      } catch {
        if (active) setSuggestions([])
      }
    }, 180)

    return () => {
      active = false
      clearTimeout(id)
    }
  }, [input, customerId, fetchSuggestions])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const addTokens = (tokens: string[]) => {
    if (!tokens.length) return
    const invalid = tokens.find(v => !isValidEmail(v))
    if (invalid) {
      setError(`อีเมลไม่ถูกต้อง: ${invalid}`)
      return
    }
    const merged = Array.from(new Set([...value, ...tokens]))
    onChange(merged)
    setError('')
  }

  const commitInput = () => {
    const tokens = splitTokens(input)
    if (tokens.length) {
      addTokens(tokens)
      setInput('')
      setShowSuggestions(false)
    }
  }

  return (
    <div className="space-y-1" ref={wrapRef}>
      <label className="form-label">{label}</label>
      <div className="relative">
        <div className="form-input min-h-[42px] h-auto flex flex-wrap items-center gap-1.5 py-2">
          {value.map(email => (
            <span key={email} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs">
              {email}
              <button
                type="button"
                className="text-blue-500 hover:text-red-500"
                onClick={() => onChange(value.filter(v => v !== email))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            className="flex-1 min-w-[120px] border-0 outline-none text-sm"
            value={input}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => commitInput()}
            placeholder={placeholder || 'พิมพ์อีเมลแล้วกด Enter'}
            onChange={(e) => {
              setInput(e.target.value)
              setError('')
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              const tokens = splitTokens(pasted)
              if (tokens.length > 1) {
                e.preventDefault()
                addTokens(tokens)
                setInput('')
              }
            }}
            onKeyDown={(e) => {
              if (['Enter', 'Tab', ','].includes(e.key)) {
                e.preventDefault()
                commitInput()
              }
              if (e.key === 'Backspace' && !input && value.length) {
                onChange(value.slice(0, -1))
              }
            }}
          />
        </div>

        {showSuggestions && suggestionItems.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-auto">
            {suggestionItems.map(email => (
              <button
                key={email}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  addTokens([email])
                  setInput('')
                  setShowSuggestions(false)
                }}
              >
                {email}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
