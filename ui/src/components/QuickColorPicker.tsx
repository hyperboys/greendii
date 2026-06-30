'use client'

const QUICK_COLORS = [
  '#000000',
  '#6b7280',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#ffffff',
] as const

interface QuickColorPickerProps {
  value?: string
  onChange: (color: string) => void
  title?: string
}

export default function QuickColorPicker({ value = '#000000', onChange, title = 'เลือกสี' }: QuickColorPickerProps) {
  const selected = value || '#000000'

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="color"
        className="h-8 w-10 rounded border border-gray-300 bg-white p-1"
        value={selected}
        onChange={e => onChange(e.target.value)}
        title={title}
      />
      <div className="grid grid-cols-5 gap-1">
        {QUICK_COLORS.map(color => {
          const isSelected = selected.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              className={`h-3.5 w-3.5 rounded-full border ${isSelected ? 'border-gray-900 ring-1 ring-gray-400' : 'border-gray-300'}`}
              style={{ backgroundColor: color }}
              onClick={() => onChange(color)}
              title={color}
              aria-label={`เลือกสี ${color}`}
            />
          )
        })}
      </div>
    </div>
  )
}
