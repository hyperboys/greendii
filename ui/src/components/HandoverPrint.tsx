'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveFileUrl } from '@/lib/api'
import { parseHandOverColoredNoteBlocks, parseHandOverDetailBeforeNote, parseHandOverDetailRows } from '@/lib/handOverItems'
import type { HandOverItem, HandOverJob, Settings } from '@/types'

const PACK_CAP_NON_LAST = 26
const PACK_CAP_LAST = 25
const FIRST_FRAGMENT_CAP = 8
const CONTINUATION_FRAGMENT_CAP = 9
const MAX_DETAIL_ROWS_FIRST_FRAGMENT = 1
const MAX_DETAIL_ROWS_CONTINUATION = 1

const MIN_SCALE = 0.82
const SCALE_STEP = 0.04

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
  detailRows: Array<{ desc: string; qty: number | null; unit: string }>
  images: string[]
  continuation: boolean
  qty?: number
  unit?: string
  displaySeq?: number
}

interface PageChunk {
  items: HandoverItemFragment[]
  isLast: boolean
  tail: boolean
}

function splitDescriptionLines(note?: string): string[] {
  if (note == null) return []
  const lines = note.split('\n').map(v => v.trim())
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

    const minWordBoundary = start + Math.floor((end - start) * 0.65)
    for (let index = end - 1; index >= minWordBoundary; index -= 1) {
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

function detailRowsWeight(rows: HandoverItemFragment['detailRows']): number {
  const nonEmptyRows = rows.filter(row => row.desc || row.qty != null || row.unit).length
  const blankRows = rows.length - nonEmptyRows
  return nonEmptyRows + blankRows * 0.35
}

function itemWeight(fragment: HandoverItemFragment): number {
  return 1 + detailRowsWeight(fragment.detailRows) + fragment.images.length * 3
}

type ItemSource = Pick<HandOverItem, 'seq' | 'desc' | 'note' | 'detailRows' | 'remark' | 'qty' | 'unit' | 'images'>

function splitItemIntoFragments(item: ItemSource, itemIndex: number): HandoverItemFragment[] {
  const detailRows = parseHandOverDetailRows(item)
    .filter(row => row.desc)
    .map(row => ({
      desc: row.desc,
      qty: row.qty == null || !Number.isFinite(Number(row.qty)) ? null : Number(row.qty),
      unit: String(row.unit ?? ''),
    }))
  const metaNoteBlocks = parseHandOverColoredNoteBlocks(item.note)
  const legacyRemark = String(item.remark ?? '').trim()
  const noteBlockTexts = metaNoteBlocks.length > 0
    ? metaNoteBlocks.map(block => block.text)
    : (legacyRemark ? [legacyRemark] : [])
  const noteRows = noteBlockTexts
    .flatMap(text => splitDescriptionLines(text))
    .map(desc => ({ desc, qty: null, unit: '' }))
  // Legacy items (no note-block meta) always rendered detail lines before the single remark.
  const detailBeforeNote = metaNoteBlocks.length > 0 ? parseHandOverDetailBeforeNote(item.note) : true
  const orderedRows = detailBeforeNote ? [...detailRows, ...noteRows] : [...noteRows, ...detailRows]
  const remainingRows = [...orderedRows]
  const remainingImages = Array.isArray(item.images) ? [...item.images] : []
  const fragments: HandoverItemFragment[] = []
  const displaySeq = item.seq !== undefined ? item.seq + 1 : itemIndex + 1
  let fragmentIndex = 0

  while (fragmentIndex === 0 || remainingRows.length > 0 || remainingImages.length > 0) {
    const detailRowChunk: HandoverItemFragment['detailRows'] = []
    const imageChunk: string[] = []
    let weight = 1
    const fragmentCap = fragmentIndex === 0 ? FIRST_FRAGMENT_CAP : CONTINUATION_FRAGMENT_CAP
    const maxDetailRows = fragmentIndex === 0 ? MAX_DETAIL_ROWS_FIRST_FRAGMENT : MAX_DETAIL_ROWS_CONTINUATION

    while (remainingRows.length > 0) {
      const nextRow = remainingRows[0]
      const nextWeight = nextRow.desc || nextRow.qty != null || nextRow.unit ? 1 : 0.35
      if (detailRowChunk.length >= maxDetailRows) break
      if (weight + nextWeight > fragmentCap && detailRowChunk.length > 0) break
      detailRowChunk.push(remainingRows.shift() as HandoverItemFragment['detailRows'][number])
      weight += nextWeight
    }

    while (remainingImages.length > 0) {
      const nextWeight = 3
      if (weight + nextWeight > fragmentCap && (detailRowChunk.length > 0 || imageChunk.length > 0)) break
      imageChunk.push(remainingImages.shift() as string)
      weight += nextWeight
    }

    fragments.push({
      key: `${item.seq ?? itemIndex}-${fragmentIndex}`,
      desc: fragmentIndex === 0 ? (item.desc ?? '') : '',
      detailRows: detailRowChunk,
      images: imageChunk,
      continuation: fragmentIndex > 0,
      qty: fragmentIndex === 0 ? item.qty : undefined,
      unit: fragmentIndex === 0 ? item.unit : undefined,
      displaySeq: fragmentIndex === 0 ? displaySeq : undefined,
    })

    fragmentIndex += 1
  }

  return fragments
}

function buildRenderableItems(items: ItemSource[]): HandoverItemFragment[] {
  return items.flatMap((item, itemIndex) => splitItemIntoFragments(item, itemIndex))
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

function reflowOversizedItems(
  items: HandoverItemFragment[],
  rowElements: Array<HTMLTableRowElement | null>,
  maxHeight: number,
): HandoverItemFragment[] | null {
  let changed = false
  const reflowed: HandoverItemFragment[] = []

  items.forEach((item, index) => {
    const row = rowElements[index]
    if (!row || row.getBoundingClientRect().height <= maxHeight) {
      reflowed.push(item)
      return
    }

    const fixedColumnHeight = Math.max(...[0, 2, 3].map(cellIndex => {
      const cell = row.cells[cellIndex]
      if (!cell) return 0
      const childrenHeight = Array.from(cell.children).reduce(
        (sum, child) => sum + child.getBoundingClientRect().height,
        0,
      )
      const lineHeight = Number.parseFloat(window.getComputedStyle(cell).lineHeight)
      return Math.max(childrenHeight, Number.isFinite(lineHeight) ? lineHeight : 0)
    }))
    const maxTextHeight = Math.max(1, maxHeight - fixedColumnHeight)
    const pieces: Array<{
      desc?: string
      detailRows?: HandoverItemFragment['detailRows']
      images?: string[]
    }> = []

    if (item.desc) {
      const source = row.querySelector<HTMLElement>('[data-handover-text="item-description"]')
      pieces.push(...measureTextChunks(item.desc, source, maxTextHeight).map(desc => ({ desc })))
    }

    item.detailRows.forEach((detail, detailIndex) => {
      const source = row.querySelector<HTMLElement>(`[data-handover-detail-index="${detailIndex}"]`)
      const chunks = measureTextChunks(detail.desc, source, maxTextHeight)
      pieces.push(...chunks.map((desc, chunkIndex) => ({
        detailRows: [{
          desc,
          qty: chunkIndex === 0 ? detail.qty : null,
          unit: chunkIndex === 0 ? detail.unit : '',
        }],
      })))
    })

    item.images.forEach(image => pieces.push({ images: [image] }))

    if (pieces.length <= 1) {
      reflowed.push(item)
      return
    }

    changed = true
    pieces.forEach((piece, pieceIndex) => {
      const firstPiece = pieceIndex === 0
      reflowed.push({
        key: `${item.key}-overflow-${pieceIndex}`,
        desc: piece.desc ?? '',
        detailRows: piece.detailRows ?? [],
        images: piece.images ?? [],
        continuation: item.continuation || !firstPiece,
        qty: firstPiece ? item.qty : undefined,
        unit: firstPiece ? item.unit : undefined,
        displaySeq: firstPiece ? item.displaySeq : undefined,
      })
    })
  })

  return changed ? reflowed : null
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
    if (currentWeight + weight > PACK_CAP_NON_LAST && current.length > 0) {
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
    if (current.length > 0 && used + entry.height > availNonLast) {
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
  const [scale, setScale] = useState(1)
  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const headerMeasRef = useRef<HTMLDivElement>(null)
  const theadMeasRef = useRef<HTMLTableSectionElement>(null)
  const tailMeasRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const readyRef = useRef(false)
  const bestLayoutRef = useRef<{ scale: number; pages: PageChunk[] } | null>(null)

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
    setScale(1)
    rowRefs.current = []
    bestLayoutRef.current = null
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

        const oversizedItems = reflowOversizedItems(measuredItems, rowRefs.current, availNonLast)
        if (oversizedItems) {
          setLayoutItems(oversizedItems)
          return
        }

        const chunks = packByHeight(measuredItems, heights, availNonLast, Math.max(availLast, 20))
        if (chunks.length === 1) {
          setPages(chunks)
          return
        }

        const bestLayout = bestLayoutRef.current
        if (!bestLayout || chunks.length < bestLayout.pages.length) {
          bestLayoutRef.current = { scale, pages: chunks }
        }

        if (scale > MIN_SCALE + 1e-9) {
          setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(3)))
        } else {
          const best = bestLayoutRef.current ?? { scale, pages: chunks }
          setScale(best.scale)
          setPages(best.pages)
        }
      } catch {
        if (!cancelled) setPages(paginateItems(measuredItems))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [pages, measuredItems, scale])

  useEffect(() => {
    if (pages === null || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [pages, onReady])

  const fpt = (n: number) => `${+(n * scale).toFixed(3)}pt`
  const fpx = (n: number) => `${+(n * scale).toFixed(3)}px`
  const fmm = (n: number) => `${+(n * scale).toFixed(3)}mm`

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
    fontSize: fpt(11),
    lineHeight: 1.0,
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
    showContinuation = false,
  ) {
    return (
      <tr key={item.key} ref={rowRef} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <td style={itemCellS}>{item.displaySeq ?? (showContinuation ? '(ต่อ)' : '')}</td>
        <td style={{ ...itemCellS, textAlign: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {item.desc && (
            <span data-handover-text="item-description" style={{ display: 'block' }}>
              {item.desc}
            </span>
          )}
          {item.detailRows.map((row, index) => (
            <span
              key={index}
              data-handover-detail-index={index}
              style={{ color: '#555', fontSize: fpt(12), lineHeight: 1.0, display: 'block' }}
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
          <div>{item.qty != null && item.qty !== 0 ? item.qty : '\u00A0'}</div>
          {item.detailRows.map((row, index) => (
            <span key={index} style={{ color: '#555', fontSize: fpt(12), lineHeight: 1.0, display: 'block' }}>
              {row.qty != null && row.qty !== 0 ? row.qty : '\u00A0'}
            </span>
          ))}
        </td>
        <td style={itemCellS}>
          <div>{Number(item.qty ?? 0) === 0 ? '\u00A0' : (item.unit ?? '\u00A0')}</div>
          {item.detailRows.map((row, index) => (
            <span key={index} style={{ color: '#555', fontSize: fpt(12), lineHeight: 1.0, display: 'block' }}>
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
            ...(chunk.tail ? {} : { flex: '1 1 0', minHeight: 0 }),
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            marginBottom: 0,
            border,
          }}
        >
          {itemsColGroup()}
          <thead>{itemsHeadRow()}</thead>
          <tbody>
            {chunk.items.map((item, index) => renderItemRow(item, undefined, index === 0 && item.continuation))}
            {!chunk.tail && (
              <tr className="handover-flex-filler" style={{ height: '100%' }}>
                <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
                <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
                <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
                <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
              </tr>
            )}
          </tbody>
        </table>
      </>
    )
  }

  function renderTail() {
    return (
      <div
        className="handover-tail"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid', flex: '0 0 auto' }}
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
          <div style={{ borderBottom: '1px dotted #555', minHeight: fpx(16), fontSize: fpt(14) }}>&nbsp;</div>
          <div style={{ borderBottom: '1px dotted #555', marginTop: fpx(16), height: fpx(14) }} />
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
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
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
    <div className="print-sheet handover-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '10pt', position: 'relative' }}>
      {pages === null && renderMeasureLayer()}
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
  )
}
