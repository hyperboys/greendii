'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveFileUrl } from '@/lib/api'
import { parseColoredLine } from '@/lib/coloredText'
import { parseHandOverColoredNoteBlocks, parseHandOverDetailBeforeNote, parseHandOverDetailRows } from '@/lib/handOverItems'
import type { HandOverItem, HandOverJob, Settings } from '@/types'

const PACK_CAP_NON_LAST = 26
const PACK_CAP_LAST = 25

const HEADER_GAP = 1
const SAFETY = 10
const TAIL_GAP = 0

interface Props {
  doc: HandOverJob
  settings: Settings | null
  onReady?: () => void
}

interface HandoverItemFragment {
  key: string
  desc: string
  detailRows: Array<{ desc: string; qty: number | null; unit: string; color?: string }>
  images: string[]
  continuation: boolean
  forcePageBreakBefore?: boolean
  qty?: number
  unit?: string
  displaySeq?: number
  continuationNo?: number
}

interface PageChunk {
  items: HandoverItemFragment[]
  isLast: boolean
  tail: boolean
}

function splitDescriptionLines(note?: string): string[] {
  if (note == null) return []
  const lines = note.split('\n')
  if (lines.length === 1 && lines[0] === '') return []
  return lines
}

function splitTextByMeasuredHeight(
  text: string,
  maxHeight: number,
  measureHeight: (value: string) => number,
): string[] {
  const characters = Array.from(text)
  if (characters.length === 0 || measureHeight(text) <= maxHeight) return [text]

  const chunks: string[] = []
  let start = 0
  while (start < characters.length) {
    let low = start + 1
    let high = characters.length
    let end = low

    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const height = measureHeight(characters.slice(start, middle).join(''))
      if (height <= maxHeight) {
        end = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    for (let index = end - 1; index > start; index -= 1) {
      if (/\s/.test(characters[index])) {
        end = index + 1
        break
      }
    }

    chunks.push(characters.slice(start, end).join(''))
    start = end
  }

  return chunks
}

function measureTextChunks(text: string, source: HTMLElement | null, maxHeight: number): string[] {
  if (!source || typeof window === 'undefined' || typeof document === 'undefined') return [text]

  const rect = source.getBoundingClientRect()
  const computed = window.getComputedStyle(source)
  const probe = document.createElement('div')
  Object.assign(probe.style, {
    position: 'absolute',
    left: '-100000px',
    top: '0',
    width: `${rect.width}px`,
    boxSizing: 'border-box',
    padding: '0',
    margin: '0',
    border: '0',
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    lineHeight: computed.lineHeight,
    letterSpacing: computed.letterSpacing,
    wordSpacing: computed.wordSpacing,
    whiteSpace: computed.whiteSpace,
    overflowWrap: computed.overflowWrap,
    wordBreak: computed.wordBreak,
  })

  document.body.appendChild(probe)
  try {
    return splitTextByMeasuredHeight(text, maxHeight, value => {
      probe.textContent = value
      return probe.getBoundingClientRect().height
    })
  } finally {
    probe.remove()
  }
}

function itemWeight(fragment: HandoverItemFragment): number {
  return 1 + (fragment.detailRows?.length ?? 0) + Math.ceil(Array.from(fragment.desc).length / 100) + fragment.images.length * 3
}

type ItemSource = Pick<HandOverItem, 'seq' | 'desc' | 'note' | 'detailRows' | 'remark' | 'qty' | 'unit' | 'images'>

function buildItemDescription(item: ItemSource): string {
  const detailRows = parseHandOverDetailRows(item)
    .map(row => ({
      desc: row.desc,
      qty: row.qty == null || !Number.isFinite(Number(row.qty)) ? null : Number(row.qty),
      unit: String(row.unit ?? ''),
    }))
  const metaNoteBlocks = parseHandOverColoredNoteBlocks(item.note)
  const legacyRemark = String(item.remark ?? '')
  const noteBlockTexts = metaNoteBlocks.length > 0
    ? metaNoteBlocks.map(block => block.text)
    : (legacyRemark.trim() ? [legacyRemark] : [])
  const noteRows = noteBlockTexts
    .flatMap(text => splitDescriptionLines(text))
    .map(desc => ({ desc, qty: null, unit: '' }))
  const detailBeforeNote = metaNoteBlocks.length > 0 ? parseHandOverDetailBeforeNote(item.note) : true
  const orderedRows = detailBeforeNote ? [...detailRows, ...noteRows] : [...noteRows, ...detailRows]
  const detailLines = orderedRows.map(row => [
    row.desc,
    row.qty == null ? '' : String(row.qty),
    row.unit,
  ].filter(Boolean).join(' '))
  const compactDetailLines = detailLines.reduce<string[]>((lines, line) => {
    if (line || lines[lines.length - 1] !== '') lines.push(line)
    return lines
  }, [])
  while (compactDetailLines[0] === '') compactDetailLines.shift()
  while (compactDetailLines[compactDetailLines.length - 1] === '') compactDetailLines.pop()
  const detailText = compactDetailLines.join('\n')
  return [item.desc ?? '', detailText].filter(Boolean).join('\n')
}

function buildRenderableItems(items: ItemSource[]): HandoverItemFragment[] {
  return items.map((item, itemIndex) => {
    const detailRows = parseHandOverDetailRows(item).map(row => {
      const parsed = parseColoredLine(String(row.desc ?? '').trim())
      return {
        desc: parsed.text,
        qty: row.qty == null ? null : (Number.isFinite(Number(row.qty)) ? Number(row.qty) : null),
        unit: String(row.unit ?? '').trim(),
        color: parsed.color,
      }
    })
    const metaNoteBlocks = parseHandOverColoredNoteBlocks(item.note)
    const noteRows = metaNoteBlocks.length > 0
      ? metaNoteBlocks.flatMap(block => splitDescriptionLines(block.text).map(text => ({
          desc: text,
          qty: null,
          unit: '',
          color: block.color,
        })))
      : (String(item.remark ?? '').trim()
          ? splitDescriptionLines(String(item.remark)).map(text => ({ desc: text, qty: null, unit: '', color: undefined }))
          : [])
    const detailBeforeNote = metaNoteBlocks.length > 0 ? parseHandOverDetailBeforeNote(item.note) : true
    const orderedRows = detailBeforeNote ? [...detailRows, ...noteRows] : [...noteRows, ...detailRows]
    const parsedDesc = parseColoredLine(String(item.desc ?? '').trim())
    return {
      key: `${item.seq ?? itemIndex}`,
      desc: parsedDesc.text,
      detailRows: orderedRows,
      images: Array.isArray(item.images) ? [...item.images] : [],
      continuation: false,
      qty: item.qty,
      unit: item.unit,
      displaySeq: item.seq !== undefined ? item.seq + 1 : itemIndex + 1,
    }
  })
}

function buildFallbackItems(lines: string[]): HandoverItemFragment[] {
  return lines.map((line, index) => ({
    key: `fallback-${index}`,
    desc: line,
    detailRows: [],
    images: [],
    continuation: false,
    displaySeq: index + 1,
  }))
}

function splitItemForHeight(
  item: HandoverItemFragment,
  row: HTMLTableRowElement | null,
  maxHeight: number,
): HandoverItemFragment[] | null {
  if (!row) return null

  const source = row.querySelector<HTMLElement>('[data-handover-text="item-description"]')
  if (source) {
    const lineHeight = Number.parseFloat(window.getComputedStyle(source).lineHeight)
    if (Number.isFinite(lineHeight) && maxHeight < lineHeight * 2) return null
  }

  const maxTextHeight = maxHeight
  if (maxTextHeight <= 0) return null

  const pieces: Array<{
    desc?: string
    images?: string[]
  }> = []

  if (item.desc) {
    pieces.push(...measureTextChunks(item.desc, source, maxTextHeight).map(desc => ({ desc })))
  }

  item.images.forEach(image => pieces.push({ images: [image] }))

  if (pieces.length <= 1) return null

  return pieces.map((piece, pieceIndex) => {
    const firstPiece = pieceIndex === 0
    return {
      key: `${item.key}-split-${pieceIndex}`,
      desc: piece.desc ?? '',
      detailRows: firstPiece ? item.detailRows : [],
      images: piece.images ?? [],
      continuation: item.continuation || !firstPiece,
      forcePageBreakBefore: firstPiece ? item.forcePageBreakBefore : pieceIndex === 1,
      qty: firstPiece ? item.qty : undefined,
      unit: firstPiece ? item.unit : undefined,
      displaySeq: firstPiece ? item.displaySeq : undefined,
      continuationNo: item.continuationNo ?? item.displaySeq,
    }
  })
}

function reflowItemsToPageSpace(
  items: HandoverItemFragment[],
  rowElements: Array<HTMLTableRowElement | null>,
  heights: number[],
  maxPageHeight: number,
): HandoverItemFragment[] | null {
  let used = 0

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const height = heights[index] ?? 0
    if (item.forcePageBreakBefore) used = 0

    const remaining = maxPageHeight - used
    if (height <= remaining) {
      used += height
      continue
    }

    const remainingPageItems = used > 0
      ? splitItemForHeight(item, rowElements[index], remaining)
      : null
    if (remainingPageItems) {
      return [...items.slice(0, index), ...remainingPageItems, ...items.slice(index + 1)]
    }

    used = 0
    if (height > maxPageHeight) {
      const fullPageItems = splitItemForHeight(item, rowElements[index], maxPageHeight)
      if (fullPageItems) {
        return [...items.slice(0, index), ...fullPageItems, ...items.slice(index + 1)]
      }
    }
    used = height
  }

  return null
}

function takeTrailingItems<T>(
  pages: T[][],
  canFit: (tailItems: T[], candidate: T) => boolean,
): { pages: T[][]; tailItems: T[] } {
  const lastPage = pages[pages.length - 1]
  const tailItems: T[] = []
  if (!lastPage) return { pages, tailItems }

  while (lastPage.length > 0) {
    const candidate = lastPage[lastPage.length - 1]
    if (!canFit(tailItems, candidate)) break
    const moved = lastPage.pop()
    if (moved !== undefined) tailItems.unshift(moved)
  }

  return {
    pages: lastPage.length > 0 ? pages : pages.slice(0, -1),
    tailItems,
  }
}

function paginateItems(items: HandoverItemFragment[]): PageChunk[] {
  if (items.length === 0) {
    return [{ items: [], isLast: true, tail: true }]
  }

  const rawPages: HandoverItemFragment[][] = []
  let current: HandoverItemFragment[] = []
  let currentWeight = 0

  for (const item of items) {
    const weight = itemWeight(item)
    if (current.length > 0 && (item.forcePageBreakBefore || currentWeight + weight > PACK_CAP_NON_LAST)) {
      rawPages.push(current)
      current = [item]
      currentWeight = weight
    } else {
      current.push(item)
      currentWeight += weight
    }
  }
  if (current.length > 0) rawPages.push(current)

  const pages = rawPages.map(pageItems => ({
    items: pageItems,
    isLast: false,
    tail: false,
  }))
  const lastPageWeight = rawPages[rawPages.length - 1].reduce((sum, fragment) => sum + itemWeight(fragment), 0)

  if (lastPageWeight <= PACK_CAP_LAST) {
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
  } else {
    const { pages: contentPages, tailItems } = takeTrailingItems(
      rawPages,
      (movedItems, candidate) => movedItems.reduce((sum, item) => sum + itemWeight(item), itemWeight(candidate)) <= PACK_CAP_LAST,
    )
    const contentChunks = contentPages.map(pageItems => ({
      items: pageItems,
      isLast: false,
      tail: false,
    }))
    contentChunks.push({ items: tailItems, isLast: true, tail: true })
    return contentChunks
  }

  return pages
}

function packByHeight(items: HandoverItemFragment[], heights: number[], availNonLast: number, availLast: number): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true }]

  type Entry = { item: HandoverItemFragment; height: number }
  const entries: Entry[] = items.map((item, index) => ({ item, height: heights[index] ?? 0 }))

  const rawPages: Entry[][] = []
  let current: Entry[] = []
  let used = 0

  for (const entry of entries) {
    if (current.length > 0 && (entry.item.forcePageBreakBefore || used + entry.height > availNonLast)) {
      rawPages.push(current)
      current = [entry]
      used = entry.height
    } else {
      current.push(entry)
      used += entry.height
    }
  }
  if (current.length > 0) rawPages.push(current)

  const pages = rawPages.map(pageItems => ({
    items: pageItems.map(entry => entry.item),
    isLast: false,
    tail: false,
  }))

  const lastPageHeight = rawPages[rawPages.length - 1].reduce((sum, entry) => sum + entry.height, 0)
  // Allow a small measurement tolerance to avoid unnecessary tail-only pages.
  if (lastPageHeight <= availLast) {
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
  } else {
    const { pages: contentPages, tailItems } = takeTrailingItems(
      rawPages,
      (movedEntries, candidate) => movedEntries.reduce((sum, entry) => sum + entry.height, candidate.height) <= availLast,
    )
    const contentChunks = contentPages.map(pageItems => ({
      items: pageItems.map(entry => entry.item),
      isLast: false,
      tail: false,
    }))
    contentChunks.push({
      items: tailItems.map(entry => entry.item),
      isLast: true,
      tail: true,
    })
    return contentChunks
  }

  return pages
}

export default function HandoverPrint({ doc, settings, onReady }: Props) {
  const [pages, setPages] = useState<PageChunk[] | null>(null)
  const [layoutItems, setLayoutItems] = useState<HandoverItemFragment[] | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const headerMeasRef = useRef<HTMLDivElement>(null)
  const theadMeasRef = useRef<HTMLTableSectionElement>(null)
  const tailMeasRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const readyRef = useRef(false)

  const companyName = settings?.companyName || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address = settings?.address || '98 Moo 6 T.Klongsii A.Klongluang Pathumthani 12120'
  const taxId = settings?.taxId || '0135549009942'
  const tel = settings?.tel || '+662 150 7694-5'
  const website = settings?.website || 'www.greendiicompany.com'
  const quotationSalesContact = doc.quotation?.sales || doc.workOrder?.quotation?.sales
  const salesContact = doc.sales as ({ email?: string; phone?: string } | undefined)
  const email = salesContact?.email || quotationSalesContact?.email
  const salesHp = (quotationSalesContact?.phone || salesContact?.phone || '').trim()
  const addressTh = '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120 โทร. +662 150 7694-5'

  const border = '1px solid #555'
  const borderTh = '1px solid #888'
  const headerFrameBorder = border

  const serviceDateStr = doc.serviceDate
    ? new Date(doc.serviceDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'
  const quotationNumbers: string[] = []
  const quotationReferences = [
    doc.quotation?.quoNo,
    ...(doc.quotationLinks?.map(({ quotation }) => quotation.quoNo) ?? []),
    doc.workOrder?.quotation?.quoNo,
  ]
  quotationReferences.forEach(value => {
    const normalized = value?.trim()
    if (normalized && quotationNumbers.indexOf(normalized) === -1) quotationNumbers.push(normalized)
  })
  const quotationNo = quotationNumbers.join(', ') || '-'

  const productLines = useMemo(
    () => (doc.product || '').split('\n').map(v => v.trim()).filter(Boolean),
    [doc.product],
  )
  const quotationItems = useMemo(
    () => doc.items?.length
      ? doc.items
      : (doc.quotation?.items?.length
          ? doc.quotation.items
          : (doc.workOrder?.quotation?.items || [])),
    [doc.items, doc.quotation?.items, doc.workOrder?.quotation?.items],
  )
  const renderItems = useMemo(
    () => quotationItems.length > 0 ? buildRenderableItems(quotationItems) : buildFallbackItems(productLines),
    [quotationItems, productLines],
  )
  const measuredItems = layoutItems ?? renderItems
  const totalPages = pages?.length ?? 1

  useEffect(() => {
    setPages(null)
    setLayoutItems(null)
    rowRefs.current = []
    readyRef.current = false
  }, [doc])

  useEffect(() => {
    if (pages !== null) return
    let cancelled = false

    const run = async () => {
      try {
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready
        }

        const container = measureRef.current
        if (container) {
          const images = Array.from(container.querySelectorAll('img'))
          await Promise.all(images.map(img => img.complete
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
        const heights = measuredItems.map((_, index) => rowRefs.current[index]?.getBoundingClientRect().height ?? 0)
        const availNonLast = pagePx - headerHeight - HEADER_GAP - theadHeight - SAFETY
        const availLast = availNonLast - tailHeight - TAIL_GAP

        if (!pagePx || availNonLast < 20 || (measuredItems.length > 0 && heights.every(height => height <= 0))) {
          setPages(paginateItems(measuredItems))
          return
        }

        const pageSpacedItems = reflowItemsToPageSpace(
          measuredItems,
          rowRefs.current,
          heights,
          availNonLast,
        )
        if (pageSpacedItems) {
          setLayoutItems(pageSpacedItems)
          return
        }

        const chunks = packByHeight(measuredItems, heights, availNonLast, Math.max(availLast, 20))
        setPages(chunks)
      } catch {
        if (!cancelled) setPages(paginateItems(measuredItems))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [pages, measuredItems])

  useEffect(() => {
    if (pages === null || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [pages, onReady])

  const fpt = (n: number) => `${n}pt`
  const fpx = (n: number) => `${n}px`
  const fmm = (n: number) => `${n}mm`
  const printTextStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    color: '#000',
    fontSize: '10pt',
  }

  const thS: React.CSSProperties = {
    border: borderTh,
    padding: `0 ${fpx(6)}`,
    backgroundColor: '#dde',
    textAlign: 'center',
    fontSize: fpt(12),
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }

  const tdS: React.CSSProperties = {
    border,
    padding: `${fpx(4)} ${fpx(6)}`,
    fontSize: fpt(10),
    verticalAlign: 'top',
    height: fpx(23),
  }

  const itemCellS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: `0 ${fpx(6)}`,
    fontSize: fpt(12),
    lineHeight: 1.1,
    verticalAlign: 'top',
    textAlign: 'center',
  }

  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: fpt(10),
    lineHeight: 0.9,
    color: '#333',
  }

  const valueS: React.CSSProperties = {
    fontSize: fpt(10),
    lineHeight: 0.9,
    minWidth: '100px',
    paddingBottom: 0,
  }

  const RATING_OPTS = [
    { v: 5, label: 'ดีมาก' },
    { v: 4, label: 'ดี' },
    { v: 3, label: 'ปานกลาง' },
    { v: 2, label: 'พอใช้' },
    { v: 1, label: 'ปรับปรุง' },
  ]

  const RatingTextRow = () => (
    <div style={{ marginBottom: fpx(2), fontSize: fpt(10.6), lineHeight: 1.1, display: 'flex', flexWrap: 'wrap', gap: fpx(10) }}>
      {RATING_OPTS.map((opt) => (
        <span key={opt.v} style={{ display: 'inline-flex', alignItems: 'center', gap: fpx(4) }}>
          <span
            style={{
              width: fpx(12),
              height: fpx(12),
              border: '1.2px solid #555',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              flexShrink: 0,
            }}
          />
          <span>{opt.label} ({opt.v})</span>
        </span>
      ))}
    </div>
  )

  function renderHeader() {
    return (
      <>
        <div style={{ marginBottom: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '150px minmax(0, 1fr) 150px',
              columnGap: 0,
              alignItems: 'start',
              fontFamily: 'var(--font-thai)',
            }}
          >
            <div style={{ paddingTop: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '150px', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', fontFamily: 'var(--font-thai)', fontSize: '14pt', lineHeight: '1.02' }}>{companyName}</div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt', lineHeight: '1.0', fontFamily: 'var(--font-display)' }}>{companyNameEn}</div>
              </div>

              <div
                style={{
                  width: '100%',
                  maxWidth: '560px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-thai)',
                  marginTop: '2px',
                  marginBottom: 0,
                }}
              >
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0' }}>
                  {address}&nbsp;&nbsp;Tel {tel}
                </div>
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0' }}>
                  {addressTh}{salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
                </div>
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0' }}>TAX ID : {taxId}&nbsp;&nbsp;&nbsp;&nbsp;E-Mail : {email}</div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '0px' }}>
                <div style={{ fontSize: '14pt', fontWeight: 'bold', textDecoration: 'underline', fontFamily: 'var(--font-thai)', lineHeight: 1.05 }}>
                  HAND OVER JOB
                </div>
              </div>
            </div>
            <div />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0, border: headerFrameBorder }}>
          <tbody>
            <tr>
              <td style={{ width: '2%', padding: '2px 6px', verticalAlign: 'top' }}></td>
              <td style={{ width: '68%', padding: '2px 6px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Project', doc.project || ''],
                      ['Contractor', doc.contractor || ''],
                      ['Location', doc.location || ''],
                      ['Contract Name', doc.contactName || ''],
                      ['Customer HP.', doc.contactTel || ''],
                      ['Product', productLines[0] || ''],
                    ].map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ ...labelS, padding: '1px 6px 1px 0', width: '132px', verticalAlign: 'top', height: '14px' }}>{label} </td>
                        <td style={{ ...valueS, padding: '1px 0 1px 6px', width: '100%', height: '14px' }}> : {val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              <td style={{ width: '30%', padding: '2px 6px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Hand Over Job NO.', doc.hoNo],
                      ['Responsibility', doc.responsibility || ''],
                      ['Quotation No.', quotationNo],
                      ['Work order No.', doc.workOrder?.woNo || '-'],
                      ['Sales', doc.sales?.fullName || ''],
                      ['Date of service', serviceDateStr],
                    ].map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ ...labelS, padding: '1px 6px 1px 0', width: '180px', verticalAlign: 'top', height: '14px' }}>{label} </td>
                        <td style={{ ...valueS, padding: '1px 0 1px 6px', width: '100%', height: '14px' }}> : {val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }

  function itemsColGroup() {
    return (
      <colgroup>
        <col style={{ width: fpx(42) }} />
        <col />
        <col style={{ width: fpx(50) }} />
        <col style={{ width: fpx(50) }} />
      </colgroup>
    )
  }

  function itemsHeadRow() {
    return (
      <tr>
        <th style={{ ...thS, width: '42px' }}>No.</th>
        <th style={{ ...thS, textAlign: 'center' }}>Description / รายละเอียด</th>
        <th style={{ ...thS, width: '50px' }}>Qty</th>
        <th style={{ ...thS, width: '50px' }}>Unit</th>
      </tr>
    )
  }

  function renderItemRow(
    item: HandoverItemFragment,
    rowRef?: (element: HTMLTableRowElement | null) => void,
  ) {
    const formatQty = (value: number | null | undefined): string => {
      if (value == null) return ''
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric === 0) return ''
      return `${numeric}`
    }

    return (
      <tr key={item.key} ref={rowRef} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <td style={itemCellS}>
          {item.displaySeq ?? (item.continuation && item.continuationNo != null
            ? `${item.continuationNo} (ต่อ)`
            : '')}
        </td>
        <td style={{ ...itemCellS, textAlign: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {item.desc && (
            <span data-handover-text="item-description" style={{ display: 'block', lineHeight: 1.1 }}>
              {item.desc}
            </span>
          )}
          {item.detailRows.map((row, index) => (
            <span
              key={index}
              style={{
                color: row.color || '#444',
                fontSize: fpt(10),
                lineHeight: 1.1,
                whiteSpace: 'pre-wrap',
                display: 'block',
              }}
            >
              {row.desc || '\u00A0'}
            </span>
          ))}
          {item.images.length > 0 && (
            <div style={{ marginTop: fmm(1), display: 'flex', flexDirection: 'column', gap: fmm(2) }}>
              {item.images.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={resolveFileUrl(url)} alt="" style={{ width: fmm(30), height: 'auto', objectFit: 'contain', display: 'block' }} />
              ))}
            </div>
          )}
        </td>
        <td style={itemCellS}>
          <div>{formatQty(item.qty) || '\u00A0'}</div>
          {item.detailRows.map((row, index) => (
            <span key={index} style={{ color: '#444', fontSize: fpt(10), lineHeight: 1.1, display: 'block' }}>
              {formatQty(row.qty) || '\u00A0'}
            </span>
          ))}
        </td>
        <td style={itemCellS}>
          <div>{Number(item.qty ?? 0) === 0 ? '\u00A0' : (item.unit ?? '\u00A0')}</div>
          {item.detailRows.map((row, index) => (
            <span key={index} style={{ color: '#444', fontSize: fpt(10), lineHeight: 1.1, display: 'block' }}>
              {row.unit || '\u00A0'}
            </span>
          ))}
        </td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk) {
    return (
      <>
        
        <table
          style={{
            width: '100%',
            flex: '1 1 0',
            minHeight: 0,
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            marginBottom: 0,
            border,
          }}
        >
          {itemsColGroup()}
          <thead>{itemsHeadRow()}</thead>
          <tbody>
            {chunk.items.map(item => renderItemRow(item))}
            <tr className="handover-flex-filler" aria-hidden="true" style={{ height: '100%' }}>
              <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }

  function renderTail() {
    return (
      <div
        className="handover-tail"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid', flex: '0 0 auto', marginTop: 'auto' }}
      >
        <div style={{ borderLeft: border, borderRight: border, borderBottom: border, padding: `${fpx(1)} ${fpx(8)}`, marginTop: 0, marginBottom: 0 }}>
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: fpt(11.6), marginBottom: 0 }}>
            ประเมินคุณภาพและข้อเสนอแนะ
          </div>

          <div style={{ fontSize: fpt(10.7), fontWeight: 'bold', marginBottom: 0 }}>1. ประเมินความพึงพอใจต่อผลิตภัณฑ์ และงานบริการ</div>
          <div style={{ fontSize: fpt(10), marginBottom: fpx(1), marginLeft: fpx(10), lineHeight: 1.1 }}>ท่านมีความพึงพอใจต่อสินค้า และบริการ ในเรื่องความถูกต้อง สมบูรณ์ และสวยงามในระดับใด</div>
          <div style={{ marginLeft: fpx(10), marginBottom: fpx(2) }}><RatingTextRow /></div>

          <div style={{ fontSize: fpt(10.7), fontWeight: 'bold', marginBottom: 0 }}>2. ประเมินความพึงพอใจต่อฝ่ายขาย</div>
          <div style={{ fontSize: fpt(10), marginBottom: fpx(1), marginLeft: fpx(10), lineHeight: 1.1 }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การให้ข้อมูล ความรวดเร็วและการบริการของฝ่ายขายในระดับใด</div>
          <div style={{ marginLeft: fpx(10), marginBottom: fpx(2) }}><RatingTextRow /></div>

          <div style={{ fontSize: fpt(10.7), fontWeight: 'bold', marginBottom: 0 }}>3. ประเมินความพึงพอใจต่อฝ่ายช่าง และติดตั้ง</div>
          <div style={{ fontSize: fpt(10), marginBottom: fpx(1), marginLeft: fpx(10), lineHeight: 1.1 }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การทำงานให้สำเร็จลุล่วง ถูกต้องตามสมบูรณ์ ตรงต่อเวลา และการบริการของฝ่ายช่างในระดับใด</div>
          <div style={{ marginLeft: fpx(10), marginBottom: 0 }}><RatingTextRow /></div>
        </div>

        <div style={{ borderLeft: border, borderRight: border, padding: `${fpx(2)} ${fpx(8)} ${fpx(5)}`, marginBottom: 0 }}>
          <div style={{ fontWeight: 'bold', fontSize: fpt(8.8), marginBottom: 0 }}>COMMENT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: fpx(6), marginTop: fpx(4) }}>
            {[0, 1, 2].map(line => (
              <div key={line} style={{ borderBottom: '1px dotted #555', height: fpx(14) }} />
            ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0, marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ border, padding: `${fpx(8)} ${fpx(6)}`, textAlign: 'center', width: '50%' }}>
                <div style={{ fontSize: fpt(10), fontWeight: 'bold', marginBottom: fpx(24) }}>ผู้ตรวจรับงาน</div>
                <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 2px' }}></div>
                <div style={{ fontSize: fpt(8.6), marginTop: fpx(16) }}>วันที่............/............./.............</div>
              </td>
              <td style={{ border, padding: `${fpx(8)} ${fpx(6)}`, textAlign: 'center', width: '50%' }}>
                <div style={{ fontSize: fpt(10), fontWeight: 'bold', marginBottom: fpx(24) }}>ผู้ส่งมอบงาน</div>
                <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 2px' }}></div>
                <div style={{ fontSize: fpt(8.6), marginTop: fpx(16) }}>วันที่............/............./.............</div>
              </td>
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
          ...printTextStyle,
          position: 'absolute',
          top: 0,
          left: 0,
          width: '190mm',
          maxWidth: '190mm',
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <div ref={probeRef} style={{ height: '281mm', width: '1px' }} />
        <div ref={headerMeasRef}>{renderHeader()}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 0, border }}>
          {itemsColGroup()}
          <thead ref={theadMeasRef}>{itemsHeadRow()}</thead>
          <tbody>
            {measuredItems.map((item, index) => renderItemRow(item, (element) => { rowRefs.current[index] = element }))}
          </tbody>
        </table>
        <div ref={tailMeasRef}>{renderTail()}</div>
      </div>
    )
  }

  return (
    <>
      {pages === null && renderMeasureLayer()}
      <div className="print-sheet handover-print" style={{ ...printTextStyle, position: 'relative' }}>
        {(pages ?? []).map((page, index) => (
          <div
            key={index}
            className="handover-page"
            style={{
              pageBreakAfter: index < totalPages - 1 ? 'always' : 'auto',
              breakAfter: index < totalPages - 1 ? 'page' : 'auto',
              display: 'flex',
              flexDirection: 'column',
              height: '281mm',
              overflow: index < totalPages - 1 ? 'hidden' : 'visible',
              boxSizing: 'border-box',
              position: 'relative',
            }}
          >
            {renderHeader()}
            {renderItemsTable(page)}
            {page.tail && renderTail()}
            {!page.tail && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderTop: border,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </>
  )
}
