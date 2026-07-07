'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { UploadAPI, resolveFileUrl } from '@/lib/api'
import type { Unit, WorkOrderItem } from '@/types'
import {
  createEmptyWorkOrderItem,
  parseWorkOrderNoteBlocks,
  parseWorkOrderDetailRows,
  stringifyWorkOrderDetailRows,
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
  const [activeItemIdx, setActiveItemIdx] = useState(0)
  const [detailBeforeNoteByItem, setDetailBeforeNoteByItem] = useState<boolean[]>([])

  useEffect(() => {
    if (items.length === 0) {
      setActiveItemIdx(0)
      return
    }
    setActiveItemIdx(prev => Math.max(0, Math.min(prev, items.length - 1)))
  }, [items.length])

  useEffect(() => {
    setDetailBeforeNoteByItem((prev) => {
      const next = [...prev]
      if (next.length < items.length) {
        for (let i = next.length; i < items.length; i += 1) next.push(false)
      }
      if (next.length > items.length) {
        next.length = items.length
      }
      return next
    })
  }, [items.length])

  const setItemField = (index: number, key: keyof WorkOrderItem, value: string | number | string[]) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
  }

  const setDescriptionLine = (itemIdx: number, lineIdx: number, key: 'desc' | 'qty' | 'unit', value: string | number | null) => {
    const nextItems = [...items]
    const rows = parseWorkOrderDetailRows(nextItems[itemIdx])
    const noteBlocks = parseWorkOrderNoteBlocks(nextItems[itemIdx]?.note)
    while (rows.length <= lineIdx) rows.push({ desc: '', qty: null, unit: '' })
    rows[lineIdx] = { ...rows[lineIdx], [key]: value }
    nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows(rows, { noteBlocks }) }
    onChange(nextItems)
  }

  const addDescriptionLine = (itemIdx: number) => {
    const nextItems = [...items]
    const rows = parseWorkOrderDetailRows(nextItems[itemIdx])
    const noteBlocks = parseWorkOrderNoteBlocks(nextItems[itemIdx]?.note)
    rows.push({ desc: '', qty: null, unit: '' })
    nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows(rows, { noteBlocks }) }
    onChange(nextItems)
  }

  const removeDescriptionLine = (itemIdx: number, lineIdx: number) => {
    const nextItems = [...items]
    const rows = parseWorkOrderDetailRows(nextItems[itemIdx])
    const noteBlocks = parseWorkOrderNoteBlocks(nextItems[itemIdx]?.note)
    if (rows.length <= 1) {
      nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows([], { noteBlocks }) }
    } else {
      rows.splice(lineIdx, 1)
      nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows(rows, { noteBlocks }) }
    }
    onChange(nextItems)
  }

  const setNoteBlock = (itemIdx: number, blockIdx: number, value: string) => {
    const nextItems = [...items]
    const rows = parseWorkOrderDetailRows(nextItems[itemIdx])
    const blocks = parseWorkOrderNoteBlocks(nextItems[itemIdx]?.note)
    const nextBlocks = blocks.length > 0 ? [...blocks] : ['']
    nextBlocks[blockIdx] = value
    nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows(rows, { noteBlocks: nextBlocks }) }
    onChange(nextItems)
  }

  const addNoteBlock = (itemIdx: number) => {
    const nextItems = [...items]
    const rows = parseWorkOrderDetailRows(nextItems[itemIdx])
    const blocks = parseWorkOrderNoteBlocks(nextItems[itemIdx]?.note)
    const nextBlocks = [...blocks, '']
    nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows(rows, { noteBlocks: nextBlocks }) }
    onChange(nextItems)
  }

  const removeNoteBlock = (itemIdx: number, blockIdx: number) => {
    const nextItems = [...items]
    const rows = parseWorkOrderDetailRows(nextItems[itemIdx])
    const blocks = parseWorkOrderNoteBlocks(nextItems[itemIdx]?.note)
    const nextBlocks = [...blocks]
    nextBlocks.splice(blockIdx, 1)
    nextItems[itemIdx] = { ...nextItems[itemIdx], ...stringifyWorkOrderDetailRows(rows, { noteBlocks: nextBlocks }) }
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
    setDetailBeforeNoteByItem((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const moveSection = (itemIdx: number, section: 'note' | 'detail', direction: 'up' | 'down') => {
    setDetailBeforeNoteByItem((prev) => {
      const next = [...prev]
      const detailBeforeNote = Boolean(next[itemIdx])
      if (section === 'note') {
        if (direction === 'up') next[itemIdx] = false
        if (direction === 'down') next[itemIdx] = true
      }
      if (section === 'detail') {
        if (direction === 'up') next[itemIdx] = true
        if (direction === 'down') next[itemIdx] = false
      }
      if (detailBeforeNote === next[itemIdx]) return prev
      return next
    })
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
                <Fragment key={`${item.seq ?? index}-${index}`}>
                  {(() => {
                    const detailRows = parseWorkOrderDetailRows(item)
                    const detailBeforeNote = Boolean(detailBeforeNoteByItem[index])
                    const noteBlocks = parseWorkOrderNoteBlocks(item.note)
                    const canMoveNoteUp = detailBeforeNote
                    const canMoveNoteDown = !detailBeforeNote
                    const canMoveDetailUp = !detailBeforeNote
                    const canMoveDetailDown = detailBeforeNote

                    const detailRowsView = detailRows.map((row, lineIdx) => (
                      <tr key={`detail-${lineIdx}`} className="border-t border-gray-100 bg-white/60 align-top">
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-0.5">
                          <input
                            className="form-input w-full py-1 text-xs text-gray-700"
                            value={row.desc}
                            onFocus={() => setActiveItemIdx(index)}
                            onChange={event => setDescriptionLine(index, lineIdx, 'desc', event.target.value)}
                            placeholder={`รายละเอียดบรรทัดที่ ${lineIdx + 1} (ไม่บังคับ)`}
                          />
                        </td>
                        <td className="px-2 py-0.5">
                          <input
                            type="number"
                            min={0}
                            max={99999}
                            step="any"
                            className="form-input w-full py-1 text-right text-xs"
                            value={row.qty ?? ''}
                            onFocus={() => setActiveItemIdx(index)}
                            onChange={event => {
                              const raw = event.target.value.trim()
                              setDescriptionLine(index, lineIdx, 'qty', raw === '' ? null : Number(raw))
                            }}
                            placeholder="Q'ty"
                          />
                        </td>
                        <td className="px-2 py-0.5">
                          <input
                            list="workorder-units-datalist"
                            className="form-input w-full py-1 text-xs"
                            value={row.unit ?? ''}
                            onFocus={() => setActiveItemIdx(index)}
                            onChange={event => setDescriptionLine(index, lineIdx, 'unit', event.target.value)}
                            placeholder="Unit"
                          />
                        </td>
                        <td className="px-2 py-0.5 text-right">
                          <button
                            type="button"
                            className="p-1 text-red-400 transition-colors hover:text-red-600"
                            onClick={() => removeDescriptionLine(index, lineIdx)}
                            title="ลบบรรทัด"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))

                    const noteRowView = (
                      <tr className="border-t border-gray-100 bg-white/60">
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-2">
                          <div className="space-y-2">
                            {noteBlocks.map((block, blockIdx) => (
                              <div key={`note-${blockIdx}`} className="flex items-start gap-2">
                                <textarea
                                  className="form-input w-full py-1 text-xs"
                                  rows={2}
                                  value={block}
                                  onFocus={() => setActiveItemIdx(index)}
                                  onChange={event => setNoteBlock(index, blockIdx, event.target.value)}
                                  placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
                                />
                                <button
                                  type="button"
                                  className="mt-1 p-1 text-red-400 transition-colors hover:text-red-600"
                                  onClick={() => removeNoteBlock(index, blockIdx)}
                                  title="ลบหมายเหตุ"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="btn-outline btn-sm"
                                onClick={() => addNoteBlock(index)}
                              >
                                <Plus size={14} /> เพิ่มหมายเหตุ
                              </button>
                              <button
                                type="button"
                                className="btn-outline btn-sm"
                                disabled={!canMoveNoteUp}
                                onClick={() => moveSection(index, 'note', 'up')}
                                title="ย้ายขึ้น"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn-outline btn-sm"
                                disabled={!canMoveNoteDown}
                                onClick={() => moveSection(index, 'note', 'down')}
                                title="ย้ายลง"
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>
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
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-0.5"></td>
                      </tr>
                    )

                    const detailActionRow = (
                      <tr className="border-t border-gray-100 bg-white/60">
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() => addDescriptionLine(index)}
                            >
                              <Plus size={14} /> เพิ่มบรรทัด Description
                            </button>
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              disabled={!canMoveDetailUp}
                              onClick={() => moveSection(index, 'detail', 'up')}
                              title="ย้ายขึ้น"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              disabled={!canMoveDetailDown}
                              onClick={() => moveSection(index, 'detail', 'down')}
                              title="ย้ายลง"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-0.5"></td>
                        <td className="px-2 py-0.5"></td>
                      </tr>
                    )

                    return (
                      <>
                  <tr className={`border-t align-top ${activeItemIdx === index ? 'border-green-400 bg-green-50/40' : 'border-gray-100'}`}>
                    <td className="px-2 py-2.5 pt-3.5 text-xs text-gray-400">{index + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        className="form-input w-full py-1"
                        value={item.desc}
                        required
                        onFocus={() => setActiveItemIdx(index)}
                        onChange={event => setItemField(index, 'desc', event.target.value)}
                        placeholder="ชื่อสินค้า/บริการ *"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={99999}
                        step="any"
                        className="form-input py-1 text-right"
                        value={item.qty}
                        onFocus={() => setActiveItemIdx(index)}
                        onChange={event => setItemField(index, 'qty', Number(event.target.value || 0))}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        list="workorder-units-datalist"
                        className="form-input py-1"
                        value={item.unit}
                        onFocus={() => setActiveItemIdx(index)}
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
                        {detailBeforeNote ? detailRowsView : noteRowView}
                        {detailActionRow}
                        {detailBeforeNote ? noteRowView : detailRowsView}
                      </>
                    )
                  })()}
                </Fragment>
              ))}
              <tr className="border-t border-gray-100 bg-white/70">
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn-outline btn-sm" onClick={addItem}>
                      <Plus size={14} /> เพิ่มรายการ
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => addNoteBlock(activeItemIdx)}
                      disabled={!items[activeItemIdx]}
                    >
                      <Plus size={14} /> เพิ่มหมายเหตุ
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => addDescriptionLine(activeItemIdx)}
                      disabled={!items[activeItemIdx]}
                    >
                      <Plus size={14} /> เพิ่มบรรทัด
                    </button>
                  </div>
                </td>
                <td colSpan={3} className="px-2 py-2 text-right text-xs text-gray-500">
                  {items[activeItemIdx] ? `กำลังแก้ไขรายการที่ ${activeItemIdx + 1}` : ''}
                </td>
              </tr>
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
