'use client'

import { useMemo, useState } from 'react'
import { ImagePlus, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { parseColoredLine, stringifyColoredLine } from '@/lib/coloredText'
import { blockText, parsePRDescription, stringifyPRDescription, type PRDescriptionBlock, type PRDescriptionBlockType } from '@/lib/prDescription'
import { resolveFileUrl } from '@/lib/api'

const COLORS = [
  { value: '#000000', label: 'ดำ (Default)' },
  { value: '#dc2626', label: 'แดง' },
  { value: '#2563eb', label: 'น้ำเงิน' },
  { value: '#16a34a', label: 'เขียว' },
] as const

type Props = {
  description: string
  note: string
  images: string[]
  onDescriptionChange: (value: string) => void
  onNoteChange: (value: string) => void
  onImagesChange: (images: string[]) => void
  onUploadImages: (files: FileList) => Promise<string[]>
  onAddItem: () => void
  onFocus?: () => void
}

function blockLabel(type: PRDescriptionBlockType): string {
  if (type === 'item') return 'รายการเพิ่มเติม'
  if (type === 'remark') return 'หมายเหตุเพิ่มเติม'
  return 'รายละเอียดบรรทัดเพิ่มเติม'
}

export default function PRDescriptionEditor({ description, note, images, onDescriptionChange, onNoteChange, onImagesChange, onUploadImages, onAddItem, onFocus }: Props) {
  const [activeColorKey, setActiveColorKey] = useState<string | null>(null)
  const blocks = useMemo(() => parsePRDescription(note, images.length), [note, images.length])

  const updateBlocks = (nextBlocks: PRDescriptionBlock[]) => onNoteChange(stringifyPRDescription(nextBlocks))
  const updateBlock = (index: number, patch: Partial<PRDescriptionBlock>) => {
    const next = [...blocks]
    next[index] = { ...next[index], ...patch }
    updateBlocks(next)
  }
  const addBlock = (type: Exclude<PRDescriptionBlockType, 'image'>) => {
    updateBlocks([...blocks, { type, text: '' }])
  }
  const removeBlock = (index: number) => {
    const target = blocks[index]
    const next = blocks.filter((_, blockIndex) => blockIndex !== index)
    if (target.type === 'image' && target.imageIndex != null) {
      const imageIndex = target.imageIndex
      const nextImages = images.filter((_, indexValue) => indexValue !== imageIndex)
      onImagesChange(nextImages)
      updateBlocks(next.map(block => block.type === 'image' && (block.imageIndex ?? -1) > imageIndex
        ? { ...block, imageIndex: (block.imageIndex ?? 0) - 1 }
        : block))
      return
    }
    updateBlocks(next)
  }
  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateBlocks(next)
  }
  const addImages = async (files: FileList) => {
    const urls = await onUploadImages(files)
    if (urls.length === 0) return
    const firstImageIndex = images.length
    onImagesChange([...images, ...urls])
    updateBlocks([...blocks, ...urls.map((_, index) => ({ type: 'image' as const, imageIndex: firstImageIndex + index }))])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <input
          className="form-input py-1 w-full"
          value={parseColoredLine(description).text}
          onFocus={onFocus}
          onChange={event => onDescriptionChange(stringifyColoredLine({ text: event.target.value, color: parseColoredLine(description).color }))}
          placeholder="ชื่อรายการ *"
          required
        />
        <ColorPicker
          color={parseColoredLine(description).color}
          active={activeColorKey === 'main'}
          onToggle={() => setActiveColorKey(activeColorKey === 'main' ? null : 'main')}
          onSelect={color => {
            onDescriptionChange(stringifyColoredLine({ text: parseColoredLine(description).text, color }))
            setActiveColorKey(null)
          }}
        />
      </div>

      {blocks.map((block, index) => {
        if (block.type === 'image') {
          const imageUrl = images[block.imageIndex ?? -1]
          return (
            <div key={`image-${block.imageIndex}-${index}`} className="flex items-center gap-2">
              {imageUrl && <img src={resolveFileUrl(imageUrl)} alt="" className="h-14 w-14 rounded border border-gray-200 object-cover" />}
              <button type="button" className="p-1 text-red-400 hover:text-red-600" onClick={() => removeBlock(index)} title="ลบรูปภาพ"><X size={14} /></button>
              <BlockOrderControls index={index} total={blocks.length} onMove={moveBlock} />
            </div>
          )
        }
        const color = block.color || parseColoredLine(blockText(block)).color
        const key = `${block.type}-${index}`
        return (
          <div key={key} className="flex items-start gap-1.5">
            <textarea
              className="form-input py-1 text-xs w-full resize-none text-gray-600"
              rows={block.type === 'remark' ? 3 : 1}
              value={blockText(block)}
              style={{ color: color || '#000000' }}
              onFocus={onFocus}
              onChange={event => updateBlock(index, { text: event.target.value })}
              placeholder={`${blockLabel(block.type)} (ไม่บังคับ)`}
            />
            <ColorPicker
              color={color}
              active={activeColorKey === key}
              onToggle={() => setActiveColorKey(activeColorKey === key ? null : key)}
              onSelect={nextColor => {
                updateBlock(index, { color: nextColor })
                setActiveColorKey(null)
              }}
            />
            <button type="button" className="mt-1 p-1 text-red-400 hover:text-red-600" onClick={() => removeBlock(index)} title={`ลบ${blockLabel(block.type)}`}><X size={14} /></button>
            <BlockOrderControls index={index} total={blocks.length} onMove={moveBlock} />
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline btn-sm" onClick={onAddItem}><Plus size={14} /> เพิ่มรายการ</button>
        <button type="button" className="btn-outline btn-sm" onClick={() => addBlock('remark')}><Plus size={14} /> เพิ่มหมายเหตุ</button>
        <button type="button" className="btn-outline btn-sm" onClick={() => addBlock('line')}><Plus size={14} /> เพิ่มบรรทัด</button>
        <label className="btn-outline btn-sm cursor-pointer"><ImagePlus size={14} /> เพิ่มรูปภาพ<input type="file" accept="image/*" multiple className="hidden" onChange={event => { if (event.target.files) void addImages(event.target.files); event.currentTarget.value = '' }} /></label>
      </div>
    </div>
  )
}

function ColorPicker({ color, active, onToggle, onSelect }: { color?: string; active: boolean; onToggle: () => void; onSelect: (color: string) => void }) {
  return (
    <div className="relative shrink-0">
      <button type="button" className="form-input flex h-9 w-11 items-center justify-center gap-1 rounded-md px-0" onClick={onToggle} title="เลือกสีข้อความ" aria-label="เลือกสีข้อความ">
        <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color || '#000000' }} />
        <span aria-hidden="true" className="text-[10px] leading-none text-gray-500">▾</span>
      </button>
      {active && <div className="absolute left-0 top-full z-20 mt-1 min-w-36 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
        {COLORS.map(option => <button key={option.value} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-green-50" onClick={() => onSelect(option.value)}><span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: option.value }} />{option.label}</button>)}
      </div>}
    </div>
  )
}

function BlockOrderControls({ index, total, onMove }: { index: number; total: number; onMove: (index: number, direction: -1 | 1) => void }) {
  return <div className="flex shrink-0 items-center gap-0.5"><button type="button" className="p-1 text-gray-400 hover:text-green-700 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(index, -1)} title="ย้ายขึ้น"><ChevronUp size={13} /></button><button type="button" className="p-1 text-gray-400 hover:text-green-700 disabled:opacity-30" disabled={index === total - 1} onClick={() => onMove(index, 1)} title="ย้ายลง"><ChevronDown size={13} /></button></div>
}
