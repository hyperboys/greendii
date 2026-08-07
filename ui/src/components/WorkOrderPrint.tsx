'use client'

import { useEffect, useRef, useState } from 'react'
import type { WorkOrder, Settings, QuotationItem, WorkOrderItem } from '@/types'
import { resolveFileUrl } from '@/lib/api'
import { formatBangkokDate } from '@/lib/timezone'
import { parseColoredLine } from '@/lib/coloredText'
import {
  getWorkOrderDetailNoteText,
  getWorkOrderItemsSource,
  parseWorkOrderColoredNoteBlocks,
  parseWorkOrderDetailBeforeNote,
} from '@/lib/workOrderItems'

const PACK_CAP_NON_LAST = 55
const PACK_CAP_LAST = 25
const FIRST_FRAGMENT_CAP = 10
const CONTINUATION_FRAGMENT_CAP = 12
const MAX_DETAIL_ROWS_FIRST_FRAGMENT = 5
const MAX_DETAIL_ROWS_CONTINUATION = 7
const MAX_IMAGES_PER_FRAGMENT = 3

const HEADER_GAP = 12
const SAFETY = 20
const TAIL_GAP = 18
const MEASURE_BUFFER_NON_LAST = 48
const MEASURE_BUFFER_LAST = 80
const PAGE_CONTENT_HEIGHT = '271mm'
const MAX_REFIT_PASSES = 12
const OVERFLOW_TOLERANCE_PX = 2
const SIGNATURE_FONT_FAMILY = "var(--font-signature, 'Brush Script MT', 'Dancing Script', cursive)"

function normalizePrintableText(value: unknown, options?: { trim?: boolean }): string {
  const trim = options?.trim !== false
  const raw = String(value ?? '')
  const decoded = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u00A0\u2007\u202F]/g, ' ')

  const collapsed = decoded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  const normalized = trim ? collapsed.trim() : collapsed

  if (/^\\+u00a0$/i.test(normalized) || /^\\+x[a0A0]$/i.test(normalized)) return ''
  return normalized
}

function splitDescriptionLines(note?: string): string[] {
  const detailNote = getWorkOrderDetailNoteText(note)
  const lines = detailNote.split('\n').map(v => normalizePrintableText(v))
  const nonEmpty = lines.filter(Boolean)
  return nonEmpty
}

interface WorkOrderItemFragment {
  key: string
  desc: string
  descColor?: string
  detailRows: Array<{ desc: string; qty: number | null; unit: string; color?: string }>
  images: string[]
  qty?: number
  unit?: string
  displaySeq?: number
}

function detailRowsWeight(rows: Array<{ desc: string; qty: number | null; unit: string }>): number {
  let nonEmptyRows = 0
  let blankRows = 0
  for (const row of rows) {
    if (row.desc || row.qty != null || row.unit) nonEmptyRows += 1
    else blankRows += 1
  }
  return nonEmptyRows + blankRows * 0.35
}

function itemWeight(fragment: WorkOrderItemFragment): number {
  return 1 + detailRowsWeight(fragment.detailRows) + fragment.images.length * 3
}

type ItemSource = Pick<QuotationItem, 'id' | 'seq' | 'desc' | 'note' | 'qty' | 'unit' | 'images'> | WorkOrderItem

function splitItemIntoFragments(item: ItemSource, itemIndex: number): WorkOrderItemFragment[] {
  const workOrderItem = item as WorkOrderItem
  const sourceDetailRows = Array.isArray(workOrderItem.detailRows) ? workOrderItem.detailRows : []
  const detailBeforeNote = parseWorkOrderDetailBeforeNote(item.note)
  const detailRowsFromItem = sourceDetailRows.length > 0
    ? sourceDetailRows.map((row) => {
      const parsed = parseColoredLine(String(row?.desc ?? '').trim())
      return {
      desc: parsed.text,
      qty: row?.qty == null ? null : (Number.isFinite(row.qty) ? row.qty : null),
      unit: String(row?.unit ?? '').trim(),
      color: parsed.color,
    }})
    : splitDescriptionLines(item.note).map((line) => ({ desc: line, qty: null, unit: '', color: undefined }))
  const noteBlockRows = parseWorkOrderColoredNoteBlocks(item.note)
    .flatMap((block) => String(block.text ?? '').split('\n').map((line) => ({
      desc: line.trim(),
      qty: null,
      unit: '',
      color: block.color,
    })))
    .filter((line) => Boolean(line.desc))
  const detailRows = detailBeforeNote
    ? [...detailRowsFromItem, ...noteBlockRows]
    : [...noteBlockRows, ...detailRowsFromItem]
  const remainingRows = [...detailRows]
  const remainingImages = Array.isArray(item.images) ? [...item.images] : []
  const fragments: WorkOrderItemFragment[] = []
  const displaySeq = item.seq !== undefined ? item.seq + 1 : itemIndex + 1
  const itemId = 'id' in item ? item.id : undefined
  const parsedDesc = parseColoredLine(item.desc ?? '')
  let fragmentIndex = 0

  while (fragmentIndex === 0 || remainingRows.length > 0 || remainingImages.length > 0) {
    const detailRowChunk: Array<{ desc: string; qty: number | null; unit: string; color?: string }> = []
    const imageChunk: string[] = []
    let weight = 1
    const fragmentCap = fragmentIndex === 0 ? FIRST_FRAGMENT_CAP : CONTINUATION_FRAGMENT_CAP
    const maxDetailRows = fragmentIndex === 0 ? MAX_DETAIL_ROWS_FIRST_FRAGMENT : MAX_DETAIL_ROWS_CONTINUATION

    while (remainingRows.length > 0) {
      const nextRow = remainingRows[0]
      const nextWeight = nextRow.desc || nextRow.qty != null || nextRow.unit ? 1 : 0.35
      if (detailRowChunk.length >= maxDetailRows) break
      if (weight + nextWeight > fragmentCap && detailRowChunk.length > 0) break
      detailRowChunk.push(remainingRows.shift() as { desc: string; qty: number | null; unit: string })
      weight += nextWeight
    }

    while (remainingImages.length > 0) {
      const nextWeight = 3
      if (imageChunk.length >= MAX_IMAGES_PER_FRAGMENT) break
      if (weight + nextWeight > fragmentCap && (detailRowChunk.length > 0 || imageChunk.length > 0)) break
      imageChunk.push(remainingImages.shift() as string)
      weight += nextWeight
    }

    fragments.push({
      key: `${itemId ?? item.seq ?? itemIndex}-${fragmentIndex}`,
      desc: fragmentIndex === 0 ? parsedDesc.text : '',
      descColor: fragmentIndex === 0 ? parsedDesc.color : undefined,
      detailRows: detailRowChunk,
      images: imageChunk,
      qty: fragmentIndex === 0 ? item.qty : undefined,
      unit: fragmentIndex === 0 ? item.unit : undefined,
      displaySeq: fragmentIndex === 0 ? displaySeq : undefined,
    })

    fragmentIndex += 1
  }

  return fragments
}

function buildRenderableItems(items: ItemSource[]): WorkOrderItemFragment[] {
  return items.flatMap((item, itemIndex) => splitItemIntoFragments(item, itemIndex))
}

interface PageChunk {
  items: WorkOrderItemFragment[]
  isLast: boolean
  tail: boolean
}

function paginateItems(items: WorkOrderItemFragment[]): PageChunk[] {
  if (items.length === 0) {
    return [{ items: [], isLast: true, tail: true }]
  }

  const rawPages: WorkOrderItemFragment[][] = []
  let current: WorkOrderItemFragment[] = []
  let currentWeight = 0

  for (const item of items) {
    const w = itemWeight(item)
    if (currentWeight + w > PACK_CAP_NON_LAST && current.length > 0) {
      rawPages.push(current)
      current = [item]
      currentWeight = w
    } else {
      current.push(item)
      currentWeight += w
    }
  }
  if (current.length > 0) rawPages.push(current)
  const lastWeight = rawPages[rawPages.length - 1].reduce((sum, fragment) => sum + itemWeight(fragment), 0)

  if (lastWeight <= PACK_CAP_LAST) {
    const pages = rawPages.map((pageItems) => ({
      items: pageItems,
      isLast: false,
      tail: false,
    }))
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
    return pages
  }

  const pages = rawPages.map((pageItems) => ({
    items: [...pageItems],
    isLast: false,
    tail: false,
  }))
  const lastPage = pages[pages.length - 1]
  const finalItem = lastPage.items[lastPage.items.length - 1]

  // Keep the current items page filled to its normal capacity. Only the final
  // trailing item moves with the footer when it fits there; otherwise the
  // footer receives its own final page.
  if (finalItem && itemWeight(finalItem) <= PACK_CAP_LAST) {
    lastPage.items.pop()
    pages.push({ items: [finalItem], isLast: true, tail: true })
  } else {
    pages.push({ items: [], isLast: true, tail: true })
  }

  return pages
}

function packByHeight(items: WorkOrderItemFragment[], heights: number[], availNonLast: number, availLast: number): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true }]

  type Entry = { item: WorkOrderItemFragment; height: number }
  const entries: Entry[] = items.map((item, index) => ({ item, height: heights[index] ?? 0 }))

  const packEntries = (sourceEntries: Entry[], cap: number): Entry[][] => {
    const pages: Entry[][] = []
    let current: Entry[] = []
    let used = 0

    for (const entry of sourceEntries) {
      if (current.length > 0 && used + entry.height > cap) {
        pages.push(current)
        current = [entry]
        used = entry.height
      } else {
        current.push(entry)
        used += entry.height
      }
    }

    if (current.length > 0) pages.push(current)
    return pages
  }

  const rawPages = packEntries(entries, availNonLast)

  const lastPageHeight = rawPages[rawPages.length - 1].reduce((sum, entry) => sum + entry.height, 0)
  if (lastPageHeight <= availLast) {
    const pages = rawPages.map((pageItems) => ({
      items: pageItems.map(entry => entry.item),
      isLast: false,
      tail: false,
    }))
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
    return pages
  }

  const pages = rawPages.map((pageItems) => ({
    items: pageItems.map(entry => entry.item),
    isLast: false,
    tail: false,
  }))
  const lastEntries = [...rawPages[rawPages.length - 1]]
  const finalEntry = lastEntries[lastEntries.length - 1]

  // The preceding page already fits the full item area. Move only its final
  // row to the footer page, which uses otherwise unused space above the tail.
  if (finalEntry && finalEntry.height <= availLast) {
    lastEntries.pop()
    pages[pages.length - 1].items = lastEntries.map(entry => entry.item)
    pages.push({ items: [finalEntry.item], isLast: true, tail: true })
  } else {
    pages.push({ items: [], isLast: true, tail: true })
  }

  return pages
}

interface Props {
  doc: WorkOrder
  settings: Settings | null
  onReady?: () => void
  embedPdfAttachments?: boolean
  fastPreview?: boolean
}

export default function WorkOrderPrint({ doc, settings, onReady, embedPdfAttachments = true, fastPreview = false }: Props) {
  const [pages, setPages] = useState<PageChunk[] | null>(null)
  const [layoutSettled, setLayoutSettled] = useState(false)
  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const headerMeasRef = useRef<HTMLDivElement>(null)
  const theadMeasRef = useRef<HTMLTableSectionElement>(null)
  const tailMeasRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastRowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const tailRefs = useRef<(HTMLDivElement | null)[]>([])
  const refitPassRef = useRef(0)
  const readyRef = useRef(false)

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const printTitle = `${doc.woNo}_${stamp}`
    const original = document.title
    const onBefore = () => { document.title = printTitle }
    const onAfter = () => { document.title = original }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [doc.woNo])

  void settings

  

  const border = '1px solid #555'
  const borderHeavy = '1.4px solid #555'
  const borderRightStrong = '1.3px solid #444'
  const borderTh = '1px solid #7a7a7a'
  const sectionGap = '6px'
  const itemColumnWidths = ['5%', '79%', '8%', '8%']

  const checklist: Record<string, boolean> = (doc.docChecklist as Record<string, boolean>) ?? {}
  const chk = (key: string) => !!checklist[key]

  const renderItems = buildRenderableItems(getWorkOrderItemsSource(doc))
  const totalPages = pages?.length ?? 1

  const attachmentSheets = (doc.attachments ?? []).filter(att => {
    if (fastPreview) return false
    if (!att.fileUrl) return false
    if (att.mimeType?.startsWith('image/')) return true
    if (att.mimeType === 'application/pdf') return embedPdfAttachments
    return false
  })

  useEffect(() => {
    setPages(null)
    setLayoutSettled(false)
    rowRefs.current = []
    pageRefs.current = []
    lastRowRefs.current = []
    tailRefs.current = []
    refitPassRef.current = 0
    readyRef.current = false
  }, [doc])

  useEffect(() => {
    if (pages !== null) return
    if (fastPreview) {
      setPages(paginateItems(renderItems))
      return
    }
    let cancelled = false

    const run = async () => {
      try {
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready
        }

        const container = measureRef.current
        if (container) {
          const imgs = Array.from(container.querySelectorAll('img'))
          await Promise.all(imgs.map(img => img.complete
            ? Promise.resolve()
            : new Promise<void>(resolve => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            })))
        }

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        if (cancelled) return

        const pagePx = probeRef.current?.getBoundingClientRect().height ?? 0
        const headerHeight = headerMeasRef.current?.getBoundingClientRect().height ?? 0
        const theadHeight = theadMeasRef.current?.getBoundingClientRect().height ?? 0
        const tailHeight = tailMeasRef.current?.getBoundingClientRect().height ?? 0
        const heights = renderItems.map((_, index) => rowRefs.current[index]?.getBoundingClientRect().height ?? 0)
        // Add extra buffers because print layout can be slightly taller than screen measurements.
        const availNonLast = pagePx - headerHeight - HEADER_GAP - theadHeight - SAFETY - MEASURE_BUFFER_NON_LAST
        const availLast = availNonLast - tailHeight - TAIL_GAP - MEASURE_BUFFER_LAST

        if (!pagePx || availNonLast < 20 || (renderItems.length > 0 && heights.every(height => height <= 0))) {
          setPages(paginateItems(renderItems))
          return
        }

        setPages(packByHeight(renderItems, heights, availNonLast, Math.max(availLast, 20)))
      } catch {
        if (!cancelled) setPages(paginateItems(renderItems))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [pages, doc, renderItems, fastPreview])

  // Measured row heights can still be slightly off after the real page renders
  // (fonts, borders, table shrinking), so verify the rendered result and push
  // any row that crosses the page bottom onto the next page.
  useEffect(() => {
    if (pages === null || layoutSettled) return
    if (fastPreview) { setLayoutSettled(true); return }

    const frame = requestAnimationFrame(() => {
      if (refitPassRef.current >= MAX_REFIT_PASSES) { setLayoutSettled(true); return }

      const overflowIndex = pages.findIndex((_, index) => {
        const pageEl = pageRefs.current[index]
        const rowEl = lastRowRefs.current[index]
        if (!pageEl || !rowEl || !rowEl.isConnected) return false
        const tailEl = tailRefs.current[index]
        const limit = tailEl
          ? tailEl.getBoundingClientRect().top
          : pageEl.getBoundingClientRect().bottom - parseFloat(getComputedStyle(pageEl).paddingBottom || '0')
        return rowEl.getBoundingClientRect().bottom > limit + OVERFLOW_TOLERANCE_PX
      })

      if (overflowIndex < 0) { setLayoutSettled(true); return }

      const next = pages.map(page => ({ ...page, items: [...page.items] }))
      const overflowing = next[overflowIndex]
      if (overflowing.items.length === 0) { setLayoutSettled(true); return }

      if (overflowing.tail) {
        // The footer must stay on the last page, so split the items instead.
        const kept = overflowing.items.slice(-1)
        const moved = overflowing.items.slice(0, -1)
        overflowing.items = moved.length > 0 ? kept : []
        next.splice(overflowIndex, 0, {
          items: moved.length > 0 ? moved : kept,
          isLast: false,
          tail: false,
        })
      } else {
        const moved = overflowing.items.pop()
        const following = next[overflowIndex + 1]
        if (!moved) { setLayoutSettled(true); return }
        if (following) following.items.unshift(moved)
        else next.push({ items: [moved], isLast: true, tail: true })
      }

      refitPassRef.current += 1
      pageRefs.current = []
      lastRowRefs.current = []
      tailRefs.current = []
      setPages(next)
    })

    return () => cancelAnimationFrame(frame)
  }, [pages, layoutSettled, fastPreview])

  useEffect(() => {
    if (!layoutSettled || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [layoutSettled, onReady])

  const dateStr = formatBangkokDate(doc.createdAt)
  const installDateStr = formatBangkokDate(doc.installDate) || '-'
  const qcDateStr = formatBangkokDate(doc.qcDate) || '-'
  const fpt = (n: number) => `${n}pt`

  function formatSignatureText(signatureText?: string | null, fullName?: string | null): string {
    if (signatureText?.trim()) return signatureText.trim()
    const name = fullName?.trim()
    if (!name) return ''
    const parts = name.split(/\s+/)
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  }

  const tdS: React.CSSProperties = {
    border,
    padding: '6px 8px',
    fontSize: '10.5pt',
    lineHeight: 1.3,
    verticalAlign: 'top',
  }
  const itemCellS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '4px 6px',
    fontSize: '12pt',
    lineHeight: 1.0,
    verticalAlign: 'top',
    textAlign: 'center',
  }
  const thS: React.CSSProperties = {
    border: borderTh,
    padding: '5px 6px',
    backgroundColor: '#dfdde8',
    textAlign: 'center',
    fontSize: '10pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }
  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '9.8pt',
    color: '#222',
    lineHeight: 1.0,
  }
  const valueS: React.CSSProperties = {
    fontSize: '9.8pt',
    borderBottom: '1px dotted #555',
    minWidth: '100px',
    paddingBottom: '2px',
    lineHeight: 1.0,
  }

  const Checkbox = ({ label, checked }: { label: string; checked: boolean }) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '10.5pt', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
      <span style={{
        display: 'inline-flex',
        width: '15px',
        height: '15px',
        border: '1.5px solid #555',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11pt',
        fontWeight: 'bold',
      }}>{checked ? '✓' : '\u00A0'}</span>
      <span>{label}</span>
    </label>
  )

  function renderItemsColGroup() {
    return (
      <colgroup>
        {itemColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}
      </colgroup>
    )
  }

  function renderHeader() {
    const leftInfo = [
      { label: 'PROJECT / โครงการ', value: doc.project },
      { label: 'LOCATION / สถานที่', value: doc.location },
      { label: 'PRODUCTS / สินค้า', value: doc.products },
      { label: 'ผู้รับผิดชอบ', value: doc.responsibility },
      { label: 'W/O No.', value: doc.woNo },
    ]
    const rightInfo = [
      { label: 'DATE / วันที่', value: dateStr },
      { label: 'CUSTOMER / ลูกค้า', value: doc.customerName },
      { label: 'CONTACT / ติดต่อ', value: doc.contactName },
      { label: 'TEL / เบอร์ติดต่อ', value: doc.contactTel },
      { label: 'SALES / พนักงานขาย', value: doc.sales?.fullName ?? doc.salesId },
    ]

    return (
      <>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: sectionGap, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '38mm' }} />
            <col />
            <col style={{ width: '58mm' }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'top', paddingRight: '4mm' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '35mm', height: 'auto', display: 'block' }} />
              </td>
              <td />
              <td style={{ verticalAlign: 'top' }}>
                <div style={{ border: borderHeavy, padding: '5px 8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '17.8pt', fontWeight: 'bold', color: '#000', lineHeight: 1.05, letterSpacing: '0.8px' }}>
                    PROJECT WORK FORM
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0, border: borderHeavy, tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', padding: '6px 9px', borderRight: border, verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <tbody>
                    {leftInfo.map(({ label, value }) => (
                      <tr key={label}>
                        <td style={{ ...labelS, width: '38%', padding: '5px 6px 5px 0', verticalAlign: 'middle' }}>
                          {label} :
                        </td>
                        <td style={{ ...valueS, width: '62%', paddingTop: '5px' }}>
                          {value || '\u00A0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              <td style={{ width: '50%', padding: '6px 9px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <tbody>
                    {rightInfo.map(({ label, value }) => (
                      <tr key={label}>
                        <td style={{ ...labelS, width: '40%', padding: '5px 6px 5px 0', verticalAlign: 'middle' }}>
                          {label} :
                        </td>
                        <td style={{ ...valueS, width: '60%', paddingTop: '5px' }}>
                          {value || '\u00A0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontWeight: 'bold', fontSize: '10.2pt', margin: '0 0 3px 1px', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
          Details of Work
        </div>
      </>
    )
  }

  function itemsHeadRow() {
    return (
      <tr>
        <th style={thS}>No.</th>
        <th style={{ ...thS, textAlign: 'center' }}>Description / รายละเอียด</th>
        <th style={thS}>Qty</th>
        <th style={{ ...thS, borderRight: borderRightStrong }}>Unit</th>
      </tr>
    )
  }

  function renderItemRow(item: WorkOrderItemFragment, rowRef?: (element: HTMLTableRowElement | null) => void) {
    const formatQty = (value: number | null | undefined): string => {
      if (value == null) return ''
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return ''
      return `${numeric}`
    }

    const safeDesc = normalizePrintableText(item.desc, { trim: false })

    return (
      <tr key={item.key} ref={rowRef} style={{ height: '24px' }}>
        <td style={itemCellS}>{item.displaySeq ?? ''}</td>
        <td style={{ ...itemCellS, textAlign: 'left' }}>
          {safeDesc && <div style={{ whiteSpace: 'pre-wrap', color: item.descColor || '#000' }}>{safeDesc}</div>}
          {item.detailRows.map((row, idx) => (
            <span key={idx} style={{ color: row.color || '#444', fontSize: '11pt', lineHeight: 1.0, whiteSpace: 'pre-wrap', display: 'block' }}>
              {normalizePrintableText(row.desc) || '\u00A0'}
            </span>
          ))}
          {!safeDesc && item.detailRows.length === 0 && item.images.length === 0 && <span>\u00A0</span>}
          {item.images.length > 0 && (
            <div style={{ marginTop: '1mm', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, 31mm)', gap: '1mm' }}>
              {item.images.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={idx}
                  src={resolveFileUrl(url)}
                  alt=""
                  loading={fastPreview ? 'lazy' : 'eager'}
                  style={{ width: '31mm', height: 'auto', objectFit: 'contain', display: 'block' }}
                />
              ))}
            </div>
          )}
        </td>
        <td style={{ ...itemCellS, textAlign: 'center' }}>
          <div>{formatQty(item.qty)}</div>
          {item.detailRows.map((row, idx) => (
            <span key={idx} style={{ color: '#444', fontSize: '11pt', lineHeight: 1.0, whiteSpace: 'pre-wrap', display: 'block' }}>
              {formatQty(row.qty) || '\u00A0'}
            </span>
          ))}
        </td>
        <td style={{ ...itemCellS, textAlign: 'center', borderRight: borderRightStrong }}>
          <div>{normalizePrintableText(item.unit, { trim: false }) || ''}</div>
          {item.detailRows.map((row, idx) => (
            <span key={idx} style={{ color: '#444', fontSize: '11pt', lineHeight: 1.0, whiteSpace: 'pre-wrap', display: 'block' }}>
              {normalizePrintableText(row.unit) || '\u00A0'}
            </span>
          ))}
        </td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk, pageIndex: number) {
    return (
      <table
        className="workorder-items-table"
        style={{
          width: '100%',
          flex: '1 1 0',
          minHeight: 0,
          borderCollapse: 'collapse',
          marginBottom: 0,
          tableLayout: 'fixed',
          border: borderHeavy,
          borderBottom: chunk.tail ? 'none' : borderHeavy,
        }}
      >
        {renderItemsColGroup()}
        <thead>{itemsHeadRow()}</thead>
        <tbody>
          {chunk.items.map((item, index) => renderItemRow(
            item,
            index === chunk.items.length - 1
              ? (element) => { lastRowRefs.current[pageIndex] = element }
              : undefined,
          ))}
          <tr className="workorder-flex-filler" style={{ height: '100%' }}>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0, borderRight: borderRightStrong }}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    )
  }

  function renderBottomSections(tailRef?: (element: HTMLDivElement | null) => void) {
    const historyLogs = [...(doc.approvalLogs ?? [])]
      .sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

    const latestSubmitAt = [...historyLogs]
      .reverse()
      .find(log => log.action === 'submit')?.actedAt

    const cycleLogs = latestSubmitAt
      ? historyLogs.filter(log => new Date(log.actedAt).getTime() >= new Date(latestSubmitAt).getTime())
      : historyLogs

    const approvedLogs = cycleLogs
      .filter(log => log.action === 'approve')
      .sort((a, b) => a.step - b.step || new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

    // Keep Sales as document owner, then map approvers by actual approval order.
    const reviewLog = approvedLogs[0]
    const salesManagerLog = approvedLogs[1]
    const managingDirectorLog = approvedLogs[2]
    const managerLog = approvedLogs[3]

    const sigCols = [
      {
        role: 'Sales',
        name: doc.sales?.fullName ?? '',
        signature: formatSignatureText(doc.sales?.signatureText, doc.sales?.fullName),
        date: latestSubmitAt ? new Date(latestSubmitAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date(latestSubmitAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      },
      {
        role: 'Review by',
        name: reviewLog?.approver?.fullName ?? '',
        signature: formatSignatureText(reviewLog?.approver?.signatureText, reviewLog?.approver?.fullName),
        date: reviewLog?.actedAt ? new Date(reviewLog.actedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date(reviewLog.actedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      },
      {
        role: 'Sales Manager',
        name: salesManagerLog?.approver?.fullName ?? '',
        signature: formatSignatureText(salesManagerLog?.approver?.signatureText, salesManagerLog?.approver?.fullName),
        date: salesManagerLog?.actedAt ? new Date(salesManagerLog.actedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date(salesManagerLog.actedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      },
      {
        role: 'Managing Director',
        name: managingDirectorLog?.approver?.fullName ?? '',
        signature: formatSignatureText(managingDirectorLog?.approver?.signatureText, managingDirectorLog?.approver?.fullName),
        date: managingDirectorLog?.actedAt ? new Date(managingDirectorLog.actedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date(managingDirectorLog.actedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      },
      {
        role: 'Project Manager',
        name: managerLog?.approver?.fullName ?? '',
        signature: formatSignatureText(managerLog?.approver?.signatureText, managerLog?.approver?.fullName),
        date: managerLog?.actedAt ? new Date(managerLog.actedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date(managerLog.actedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
      },
    ]
    const teamOptions = [
      { label: 'ส่งของอย่างเดียว', key: 'team_delivery_only' },
      { label: 'ทีมพื้น', key: 'team_floor' },
      { label: 'ทีมโรงงาน 2', key: 'team_factory2' },
      { label: 'ทีมติดตั้ง', key: 'team_install' },
      { label: 'ทีมประตู', key: 'team_door' },
      { label: 'ผู้รับเหมา', key: 'team_contractor' },
    ]
    const checklistRows = [
      [
        { label: 'PO', key: 'doc_po' },
        { label: 'Quotation', key: 'doc_quotation' },
        { label: 'Drawing Confirm', key: 'doc_drawing_confirm' },
        { label: 'Hand Over Job', key: 'doc_handover' },
      ],
      [
        { label: 'PR', key: 'doc_pr' },
        { label: 'Min', key: 'doc_min' },
        { label: 'Waiting Confirm', key: 'doc_waiting_confirm' },
        { label: 'Check List', key: 'doc_checklist' },
      ],
    ]

    return (
      <div className="workorder-bottom-sections" ref={tailRef} style={{ flex: '0 0 auto' }}>
        <div style={{ marginBottom: 0, padding: '7px 9px', border: borderHeavy, borderBottom: 'none' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '18px', rowGap: '7px' }}>
            {teamOptions.map(({ label, key }) => <Checkbox key={key} label={label} checked={chk(key)} />)}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0, border: borderHeavy, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ ...tdS, fontWeight: 'bold', whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: '10pt', padding: '4px 8px' }}>
                QC Date<br /><span style={{ fontWeight: 'normal', fontSize: '10pt' }}>(วันที่ผ่านการ QC)</span>
              </td>
              <td style={{ ...tdS, minHeight: '16px', verticalAlign: 'middle', fontSize: '12pt', padding: '4px 8px' }}>{qcDateStr || '\u00A0'}</td>
            </tr>
            <tr>
              <td style={{ ...tdS, fontWeight: 'bold', whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: '10pt', padding: '4px 8px' }}>
                Installation Date<br /><span style={{ fontWeight: 'normal', fontSize: '10pt' }}>(วันที่ติดตั้ง)</span>
              </td>
              <td style={{ ...tdS, minHeight: '16px', verticalAlign: 'middle', fontSize: '12pt', padding: '4px 8px' }}>{installDateStr || '\u00A0'}</td>
            </tr>
            <tr>
              <td style={{ ...tdS, fontWeight: 'bold', verticalAlign: 'middle', fontSize: '10pt', padding: '4px 8px' }}>
                Remark<br /><span style={{ fontWeight: 'normal', fontSize: '10pt' }}>(หมายเหตุ)</span>
              </td>
              <td style={{ ...tdS, minHeight: '16px', whiteSpace: 'pre-wrap', fontSize: '12pt', padding: '4px 8px' }}>{doc.remark || '\u00A0'}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ border: borderHeavy, borderTop: 'none', padding: '8px 12px', marginBottom: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '18px', rowGap: '8px', justifyItems: 'center' }}>
            {checklistRows.flat().map(item => (
              <div key={item.key} style={{ width: '150px' }}>
                <Checkbox label={item.label} checked={chk(item.key)} />
              </div>
            ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              {sigCols.map(({ role, name, signature, date }) => (
                <td key={role} style={{ border: borderHeavy, borderTop: 'none', padding: '8px 6px 6px', textAlign: 'center', width: `${100 / sigCols.length}%`, verticalAlign: 'top' }}>
                  <div style={{ fontSize: '9pt', fontWeight: 'bold', minHeight: '16px', marginBottom: '10px' }}>{role}</div>
                  <div style={{
                    fontFamily: SIGNATURE_FONT_FAMILY,
                    fontStyle: 'italic',
                    fontWeight: 400,
                    fontSize: fpt(14),
                    marginTop: '2px',
                    marginBottom: '0',
                    lineHeight: 1,
                    minHeight: '16px',
                  }}>{signature || '\u00A0'}</div>
                  <div style={{ borderTop: '1px dotted #555', width: '80%', margin: '0 auto 4px' }} />
                  <div style={{ fontSize: '8.4pt', minHeight: '14px' }}>{name || '(…………………………)'}</div>
                  {date && <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#555' }}>{date}</div>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  function renderMeasureLayer() {
    return (
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          maxWidth: '198mm', // pin to print width so modal's 210mm container doesn't skew measurements
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <div ref={probeRef} style={{ height: PAGE_CONTENT_HEIGHT, width: '1px' }} />
        <div ref={headerMeasRef}>{renderHeader()}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: sectionGap, tableLayout: 'fixed', border: borderHeavy }}>
          {renderItemsColGroup()}
          <thead ref={theadMeasRef}>{itemsHeadRow()}</thead>
          <tbody>
            {renderItems.map((item, index) => renderItemRow(item, (element) => { rowRefs.current[index] = element }))}
          </tbody>
        </table>
        <div ref={tailMeasRef}>{renderBottomSections()}</div>
      </div>
    )
  }

  return (
    <div className="print-sheet workorder-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '10.2pt', lineHeight: 1.3, position: 'relative' }}>
      {pages === null && renderMeasureLayer()}
      {(pages ?? []).map((page, pi) => (
        <div
          key={pi}
          className="workorder-page"
          ref={(element) => { pageRefs.current[pi] = element }}
          style={{
            pageBreakAfter: pi < totalPages - 1 || attachmentSheets.length > 0 ? 'always' : 'auto',
            breakAfter: pi < totalPages - 1 || attachmentSheets.length > 0 ? 'page' : 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: PAGE_CONTENT_HEIGHT,
            overflow: 'hidden',
          }}
        >
          {renderHeader()}
          {renderItemsTable(page, pi)}
          {page.tail && renderBottomSections((element) => { tailRefs.current[pi] = element })}
        </div>
      ))}
      {attachmentSheets.map((att, ai) => {
        const isLastSheet = ai === attachmentSheets.length - 1
        const url = resolveFileUrl(att.fileUrl as string)
        const isImage = att.mimeType?.startsWith('image/')
        return (
          <div
            key={`att-${att.id}`}
            className="workorder-page workorder-attachment-page"
            style={{
              pageBreakAfter: isLastSheet ? 'auto' : 'always',
              breakAfter: isLastSheet ? 'auto' : 'page',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              height: PAGE_CONTENT_HEIGHT,
              overflow: 'hidden',
            }}
          >
            {isImage ? (
              <img
                src={url}
                alt={att.originalName ?? ''}
                loading={fastPreview ? 'lazy' : 'eager'}
                style={{ maxWidth: '100%', maxHeight: PAGE_CONTENT_HEIGHT, objectFit: 'contain', margin: 'auto', display: 'block' }}
              />
            ) : (
              <iframe
                src={url}
                title={att.originalName ?? `attachment-${ai + 1}`}
                style={{ flex: '1 1 auto', width: '100%', height: PAGE_CONTENT_HEIGHT, border: 'none', background: '#fff' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}