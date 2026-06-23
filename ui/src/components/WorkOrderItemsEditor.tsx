'use client'

import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { UploadAPI, resolveFileUrl } from '@/lib/api'
import type { Unit, WorkOrderItem } from '@/types'
import {
  createEmptyWorkOrderItem,
  parseWorkOrderDescLines,
  stringifyWorkOrderDescLines,
} from '@/lib/workOrderItems'

interface Props {
  items: WorkOrderItem[]
  units: Unit[]
  onChange: (items: WorkOrderItem[]) => void
  title?: string
}

export default function WorkOrderItemsEditor({
  items,
  units,
  onChange,
  title = 'รายการงาน WorkOrder',
}: Props) {
  const setItemField = (index: number, key: keyof WorkOrderItem, value: string | number | string[]) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
  }

  const setDescriptionLine = (itemIdx: number, lineIdx: number, value: string) => {
    const nextItems = [...items]
    const lines = parseWorkOrderDescLines(nextItems[itemIdx]?.note)
    while (lines.length <= lineIdx) lines.push('')
    lines[lineIdx] = value
    nextItems[itemIdx] = { ...nextItems[itemIdx], note: stringifyWorkOrderDescLines(lines) }
    onChange(nextItems)
  }

  const addDescriptionLine = (itemIdx: number) => {
    const nextItems = [...items]
    const lines = parseWorkOrderDescLines(nextItems[itemIdx]?.note)
    lines.push('')
    nextItems[itemIdx] = { ...nextItems[itemIdx], note: stringifyWorkOrderDescLines(lines) }
    onChange(nextItems)
  }

  const removeDescriptionLine = (itemIdx: number, lineIdx: number) => {
    const nextItems = [...items]
    const lines = parseWorkOrderDescLines(nextItems[itemIdx]?.note)
    if (lines.length <= 1) {
      nextItems[itemIdx] = { ...nextItems[itemIdx], note: '' }
    } else {
      lines.splice(lineIdx, 1)
      nextItems[itemIdx] = { ...nextItems[itemIdx], note: stringifyWorkOrderDescLines(lines) }
    }
    onChange(nextItems)
  }

  const uploadItemImages = async (itemIdx: number, files: FileList | null) => {
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast.error('รองรับเฉพาะไฟล์รูปภาพ')
      return
    }
    const toastId = toast.loading('กำลังอัปโหลดรูป...')
    try {
      const saved = await UploadAPI.upload(imageFiles, { category: 'workorder-item' })
      const urls = saved.map((attachment: { fileUrl?: string }) => attachment.fileUrl).filter(Boolean) as string[]
      const nextItems = [...items]
      nextItems[itemIdx] = {
        ...nextItems[itemIdx],
        images: [...(nextItems[itemIdx]?.images || []), ...urls],
      }
      onChange(nextItems)
      toast.success('อัปโหลดรูปสำเร็จ', { id: toastId })
    } catch {
      toast.error('อัปโหลดไม่สำเร็จ', { id: toastId })
    }
  }

  const removeItemImage = (itemIdx: number, imageIdx: number) => {
    const nextItems = [...items]
    const images = [...(nextItems[itemIdx]?.images || [])]
    images.splice(imageIdx, 1)
    nextItems[itemIdx] = { ...nextItems[itemIdx], images }
    onChange(nextItems)
  }

  const addItem = () => {
    onChange([...items, createEmptyWorkOrderItem(items.length)])
  }

  const removeItem = (index: number) => {
    const nextItems = items.filter((_, itemIndex) => itemIndex !== index)
    onChange(nextItems.length > 0 ? nextItems : [createEmptyWorkOrderItem(0)])
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button type="button" className="btn-outline btn-sm" onClick={addItem}>
          <Plus size={14} /> เพิ่มรายการ
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="rounded-lg border border-gray-100">
          <table className="min-w-[700px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-green-dark to-[#2f6a34] text-white shadow-sm [text-shadow:0_1px_0_rgba(0,0,0,0.28)]">
              <tr>
                <th className="w-10 border-b border-white/20 px-3 py-3.5 text-left align-middle text-[13px] font-bold tracking-[0.02em] text-white md:text-[14px]">#</th>
                <th className="border-b border-white/20 px-3 py-3.5 text-left align-middle text-[13px] font-bold tracking-[0.02em] text-white md:text-[14px]">Description</th>
                <th className="w-20 border-b border-white/20 px-3 py-3.5 text-right align-middle text-[13px] font-bold tracking-[0.02em] text-white md:text-[14px]">Q&apos;ty</th>
                <th className="w-24 border-b border-white/20 px-3 py-3.5 text-left align-middle text-[13px] font-bold tracking-[0.02em] text-white md:text-[14px]">Unit</th>
                <th className="w-9 border-b border-white/20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.seq ?? index}-${index}`} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-2.5 pt-3.5 text-xs text-gray-400">{index + 1}</td>
                  <td className="px-2 py-2">
                    <input
                      className="form-input w-full py-1"
                      value={item.desc}
                      required
                      onChange={event => setItemField(index, 'desc', event.target.value)}
                      placeholder="ชื่อสินค้า/บริการ *"
                    />
                    <div className="mt-1.5 space-y-1.5">
                      {parseWorkOrderDescLines(item.note).map((line, lineIdx) => (
                        <div key={lineIdx} className="flex items-center gap-1.5">
                          <input
                            className="form-input w-full py-1 text-xs text-gray-700"
                            value={line}
                            onChange={event => setDescriptionLine(index, lineIdx, event.target.value)}
                            placeholder={`รายละเอียดบรรทัดที่ ${lineIdx + 1} (ไม่บังคับ)`}
                          />
                          <button
                            type="button"
                            className="p-1 text-red-400 transition-colors hover:text-red-600"
                            onClick={() => removeDescriptionLine(index, lineIdx)}
                            title="ลบบรรทัด"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
                        onClick={() => addDescriptionLine(index)}
                      >
                        <Plus size={12} /> เพิ่มบรรทัด Description
                      </button>
                    </div>
                    <div className="mt-2">
                      {item.images && item.images.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {item.images.map((url, imageIdx) => (
                            <div key={imageIdx} className="group relative">
                              <img src={resolveFileUrl(url)} alt="" className="h-14 w-14 rounded border border-gray-200 object-cover" />
                              <button
                                type="button"
                                onClick={() => removeItemImage(index, imageIdx)}
                                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                                title="ลบรูป"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800">
                        <ImagePlus size={12} /> เพิ่มรูปภาพ
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={event => {
                            uploadItemImages(index, event.target.files)
                            event.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      step="any"
                      className="form-input py-1 text-right"
                      value={item.qty}
                      onChange={event => setItemField(index, 'qty', Number(event.target.value || 0))}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      list="workorder-units-datalist"
                      className="form-input py-1"
                      value={item.unit}
                      onChange={event => setItemField(index, 'unit', event.target.value)}
                      placeholder="-"
                    />
                  </td>
                  <td className="px-2 py-2.5 pt-3">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1 text-red-400 transition-colors hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="workorder-units-datalist">
        {units.map(unit => <option key={unit.id} value={unit.name} />)}
      </datalist>
    </div>
  )
}
