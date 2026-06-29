'use client'

import { useEffect, useRef, useState } from 'react'
import type { Quotation, Settings } from '@/types'
import { resolveFileUrl } from '@/lib/api'

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  const numeric = Number(n)
  if (!Number.isFinite(numeric)) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)
}

function fmtAmtBlankZero(n: number | null | undefined): string {
  if (n == null) return ''
  const numeric = Number(n)
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.0000001) return ''
  return fmtAmt(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

const MIN_ROWS = 3
// Row-weight pack capacities. 1 weight ≈ 1 main row at ~7mm.
// A4 portrait content area: 297mm − 6mm top − 10mm bottom = 281mm.
// Header + customer info box ~ 95mm; column header ~ 14mm; totals + terms ~ 85mm.
// Note lines render at 10pt (~4mm ≈ 0.6 of a main row), so they cost less than
// a full row — counting them as full rows pushed items onto a new page too early.
// Non-last items area = 277 − 95 − 14 = 168mm ≈ 24 rows.
// Last page items area = 277 − 95 − 14 − 85 = 83mm ≈ 12 rows.
// PACK_CAP_LAST must match the ~12-row last-page item area so the totals + terms +
// signature block always has room; otherwise trailing items overflow into that
// block and get visually cut off (forcing them onto a fresh page instead).
const PACK_CAP_NON_LAST = 24
const PACK_CAP_LAST = 12

interface Props {
  doc: Quotation
  settings: Settings | null
  onReady?: () => void
}

type Item = Quotation['items'][number]
type DetailRow = {
  desc?: string
  qty?: number
  unit?: string
  materialPrice?: number
  labourPrice?: number
  amount?: number
}

function splitDescriptionLines(note?: string): string[] {
  if (note == null) return []
  const lines = note.split('\n').map(v => v.trim())
  // Keep intentionally added blank rows, but avoid rendering the default single empty row.
  if (lines.length === 1 && lines[0] === '') return []
  return lines
}

function splitAddressLines(address?: string, maxLines: number = 3): string[] {
  const trimmed = (address ?? '').trim()
  if (!trimmed) return Array.from({ length: maxLines }, () => '')

  const fromNewline = trimmed
    .split(/\r?\n/)
    .map(v => v.trim())
    .filter(Boolean)

  let lines = fromNewline
  if (lines.length <= 1) {
    const chunks = trimmed
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)

    if (chunks.length > 1) {
      lines = []
      let current = ''
      for (const chunk of chunks) {
        const next = current ? `${current}, ${chunk}` : chunk
        if (next.length > 34 && current) {
          lines.push(current)
          current = chunk
        } else {
          current = next
        }
      }
      if (current) lines.push(current)
    }
  }

  const result = lines.slice(0, maxLines)
  while (result.length < maxLines) result.push('')
  return result
}

function normalizeDetailRows(raw: unknown): DetailRow[] {
  if (Array.isArray(raw)) return raw as DetailRow[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as DetailRow[]) : []
    } catch {
      return []
    }
  }
  return []
}

function itemWeight(it: Item): number {
  // 1 base row for the item line itself.
  // Non-empty note lines cost ~1 row; intentionally blank note lines cost less,
  // so users can add visual spacing without forcing an early page break.
  // +3 per image (30mm-wide image renders ~20–25mm tall ≈ 3 rows of ~7mm).
  const noteLines = splitDescriptionLines(it.note)
  const nonEmptyNoteLines = noteLines.filter(Boolean).length
  const blankNoteLines = noteLines.length - nonEmptyNoteLines
  const detailRows = normalizeDetailRows(it.detailRows)
  const detailRowsWeight = detailRows.reduce((sum, row) => {
    const hasDesc = Boolean(String(row?.desc ?? '').trim())
    const hasCalc =
      Number(row?.qty ?? 0) !== 0 ||
      Boolean(String(row?.unit ?? '').trim()) ||
      Number(row?.materialPrice ?? 0) !== 0 ||
      Number(row?.labourPrice ?? 0) !== 0
    return sum + (hasDesc ? 0.5 : 0) + (hasCalc ? 0.4 : 0)
  }, 0)

  return (
    1 +
    nonEmptyNoteLines * 0.6 +
    blankNoteLines * 0.3 +
    detailRowsWeight +
    (Array.isArray(it.images) ? it.images.length * 3 : 0)
  )
}

interface PageChunk {
  items: Item[]
  isLast: boolean
  // Whether the totals + terms + signature block renders on this page.
  tail: boolean
  capacity: number
}

function paginateItems(items: Item[]): PageChunk[] {
  if (items.length === 0) {
    return [{ items: [], isLast: true, tail: true, capacity: PACK_CAP_LAST }]
  }

  // Forward packing: fill each page top-to-bottom up to the per-page item
  // capacity, then start a new page. This keeps earlier pages full and pushes
  // only the remainder onto later pages (instead of leaving the first page
  // mostly empty).
  const rawPages: Item[][] = []
  let current: Item[] = []
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

  // The last page must also hold the totals + terms + signature block, so its
  // available item area is smaller. If the final page's items don't leave room
  // for the totals block, move trailing items onto a fresh last page.
  const last = rawPages[rawPages.length - 1]
  let lastWeight = last.reduce((s, it) => s + itemWeight(it), 0)
  if (lastWeight > PACK_CAP_LAST && last.length > 1) {
    const overflow: Item[] = []
    while (lastWeight > PACK_CAP_LAST && last.length > 1) {
      const moved = last.pop() as Item
      overflow.unshift(moved)
      lastWeight -= itemWeight(moved)
    }
    if (overflow.length > 0) rawPages.push(overflow)
  }

  return rawPages.map((pageItems, i) => ({
    items: pageItems,
    isLast: i === rawPages.length - 1,
    tail: i === rawPages.length - 1,
    capacity: i === rawPages.length - 1 ? PACK_CAP_LAST : PACK_CAP_NON_LAST,
  }))
}

const COL_WIDTHS = ['5%', '47%', '8%', '7%', '11%', '11%', '11%']

// Measurement-based pagination: assign items to pages using their real rendered
// heights (in px) instead of heuristic weights. `availNonLast` is the usable
// item-area height on a page that only holds items; `availLast` additionally
// reserves room for the totals + terms + signature block on the final page.
function packByHeight(items: Item[], heights: number[], availNonLast: number, availLast: number): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true, capacity: 0 }]
  type Entry = { item: Item; h: number }
  const entries: Entry[] = items.map((item, i) => ({ item, h: heights[i] ?? 0 }))

  // Forward fill each page using the FULL item area so earlier pages stay dense.
  const pages: Entry[][] = []
  let cur: Entry[] = []
  let used = 0
  for (const e of entries) {
    if (cur.length > 0 && used + e.h > availNonLast) {
      pages.push(cur)
      cur = [e]
      used = e.h
    } else {
      cur.push(e)
      used += e.h
    }
  }
  if (cur.length) pages.push(cur)

  const sumH = (arr: Entry[]) => arr.reduce((s, e) => s + e.h, 0)
  const result: PageChunk[] = pages.map(arr => ({
    items: arr.map(e => e.item),
    isLast: false,
    tail: false,
    capacity: 0,
  }))

  // The totals + terms + signature block stays on the last items page only when
  // it still fits there; otherwise it flows onto its own continuation page so the
  // item pages remain full instead of being thinned out to make room for it.
  if (sumH(pages[pages.length - 1]) <= availLast) {
    const lastPage = result[result.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
  } else {
    result.push({ items: [], isLast: true, tail: true, capacity: 0 })
  }
  return result
}

export default function QuotationPrint({ doc, settings, onReady }: Props) {
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const printTitle = `${doc.quoNo}_${stamp}`
    const original = document.title
    const onBefore = () => { document.title = printTitle }
    const onAfter = () => { document.title = original }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint', onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [doc.quoNo])

  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-GB')
  const companyName = settings?.companyName || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address = settings?.address || '98 Moo 6 T.Klong Sii A.Klongluang Pathumthani 12120'
  const taxId = settings?.taxId || '0135549009942'
  const tel = settings?.tel || '+662 150 7694-5'
  const website = settings?.website || 'www.greendiicompany.com'
  const email = doc.sales?.email || settings?.email || 'admin2gd@greendii.com'
  const salesHp = doc.sales?.phone?.trim()
  const addressTh = '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120 โทร. +662 150 7694-5'

  const totalAmount = doc.subTotal - doc.specialDiscount
  const vatIncluded = Number(doc.vat ?? 0) !== 0

  // Signature text: use signatureText if set, otherwise derive "FirstName L." from fullName
  const sigName = (() => {
    if (doc.sales?.signatureText?.trim()) return doc.sales.signatureText.trim()
    const name = doc.sales?.fullName?.trim()
    if (!name) return ''
    const parts = name.split(/\s+/)
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })()

  const [pages, setPages] = useState<PageChunk[] | null>(null)
  const [scale, setScale] = useState(1)
  const [imageOrientation, setImageOrientation] = useState<Record<string, 'landscape' | 'portrait'>>({})
  const totalPages = pages ? pages.length : 1

  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const headerMeasRef = useRef<HTMLDivElement>(null)
  const theadMeasRef = useRef<HTMLTableSectionElement>(null)
  const tailMeasRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)
  const fallbackRef = useRef<PageChunk[] | null>(null)

  // Smallest font scale we will apply to keep the summary block on the same page
  // as the items instead of spilling it onto an otherwise-empty trailing page.
  // 0.8 keeps text comfortably readable while compacting a little.
  const MIN_SCALE = 0.8
  const SCALE_STEP = 0.05

  // Re-measure from scratch whenever the document changes.
  useEffect(() => {
    setPages(null)
    setScale(1)
    setImageOrientation({})
    fallbackRef.current = null
    readyRef.current = false
  }, [doc])

  function getImageKey(item: Item, imageIndex: number, url: string): string {
    const seqPart = item.seq !== undefined ? String(item.seq) : item.desc || 'item'
    return `${seqPart}::${imageIndex}::${url}`
  }

  function onImageLoad(imageKey: string, naturalWidth: number, naturalHeight: number) {
    if (!naturalWidth || !naturalHeight) return
    const next: 'landscape' | 'portrait' = naturalWidth > naturalHeight ? 'landscape' : 'portrait'
    setImageOrientation(prev => (prev[imageKey] === next ? prev : { ...prev, [imageKey]: next }))
  }

  // Measure real rendered heights at the current font scale, then paginate.
  // If the summary block would land alone on a trailing page, shrink the font a
  // step and re-measure (down to MIN_SCALE) so it merges back onto the items page.
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
        const hHeader = headerMeasRef.current?.getBoundingClientRect().height ?? 0
        const hThead = theadMeasRef.current?.getBoundingClientRect().height ?? 0
        const hTail = tailMeasRef.current?.getBoundingClientRect().height ?? 0
        const heights = doc.items.map((_, i) => {
          if (!container) return 0
          const rows = Array.from(container.querySelectorAll(`tr[data-measure-item=\"${i}\"]`))
          return rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0)
        })
        // Conservative gaps account for inter-block margins so content never clips.
        const HEADER_GAP = 12
        const SAFETY = 10
        const TAIL_GAP = 10
        const availNonLast = pagePx - hHeader - HEADER_GAP - hThead - SAFETY
        const availLast = availNonLast - hTail - TAIL_GAP
        if (!pagePx || availNonLast < 20) {
          setPages(paginateItems(doc.items))
          return
        }
        const chunks = packByHeight(doc.items, heights, availNonLast, Math.max(availLast, 20))
        if (scale >= 1 - 1e-9) fallbackRef.current = chunks
        const last = chunks[chunks.length - 1]
        const tailOnly = chunks.length > 1 && last.items.length === 0
        if (!tailOnly) {
          // Everything (incl. summary) is placed without a lone trailing page.
          setPages(chunks)
        } else if (scale > MIN_SCALE + 1e-9) {
          // Shrink the font a step and re-measure so the summary fits back.
          setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(3)))
        } else {
          // Even at the smallest scale the summary won't share the items page, so
          // keep the original full-size layout instead of shrinking pointlessly.
          if (scale < 1 - 1e-9) setScale(1)
          setPages(fallbackRef.current ?? chunks)
        }
      } catch {
        if (!cancelled) setPages(paginateItems(doc.items))
      }
    }
    void run()
    return () => { cancelled = true }
  }, [pages, doc, scale])

  // Signal readiness only after the real (paginated) layout is committed.
  useEffect(() => {
    if (pages === null || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [pages, onReady])

  // Font-size helper that applies the auto-fit scale to the items + summary.
  const fpt = (n: number) => `${+(n * scale).toFixed(3)}pt`

  const border = '2px solid #000'
  const tableFrameBorder = '2px solid #000'

  const thS: React.CSSProperties = {
    border,
    padding: '2px 4px',
    backgroundColor: '#c6e0b4',
    textAlign: 'center',
    fontSize: fpt(8),
    fontWeight: 'bold',
    verticalAlign: 'middle',
    lineHeight: '0.9',
  }

  const tdS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '3px 5px',
    fontSize: fpt(12),
    verticalAlign: 'top',
    height: '20px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  const tfootTdS: React.CSSProperties = {
    ...tdS,
    padding: '0 5px',
    height: 'auto',
    lineHeight: 0.75,
    verticalAlign: 'middle',
  }

  function renderHeader(currentPage: number) {
    const pageText = `${currentPage}/${totalPages}`
    const addressLines = splitAddressLines(doc.address, 3)
    const infoRows = [
      { leftLabel: 'To', leftValue: doc.customerName || '', rightLabel: 'Date', rightValue: dateStr },
      { leftLabel: 'Attn', leftValue: doc.attn || '', rightLabel: 'Page', rightValue: pageText },
      { leftLabel: 'Address', leftValue: addressLines[0], rightLabel: 'Tel', rightValue: doc.tel || '' },
      { leftLabel: '', leftValue: addressLines[1], rightLabel: 'Quo.No', rightValue: doc.quoNo },
      { leftLabel: '', leftValue: addressLines[2], rightLabel: 'HP', rightValue: '' },
      { leftLabel: 'Project', leftValue: doc.project || '', rightLabel: '', rightValue: '' },
    ]

    return (
      <>
        {/* ═══ Company Header ═══ */}
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
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0' }}>TAX ID : {taxId}</div>
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0' }}>E-Mail : {email}</div>
              </div>
            </div>
            <div />
          </div>
        </div>

        {/* ═══ QUOTATION title ═══ */}
        <div style={{
          textAlign: 'center', fontWeight: 'bold', fontSize: '14pt',
          textDecoration: 'underline', marginBottom: '0px', fontFamily: 'var(--font-thai)', lineHeight: 1.05,
        }}>
          QUOTATION
        </div>

        {/* ═══ Customer Info — Single box with 2 columns ═══ */}
        <div style={{ borderTop: '2px solid #000', borderLeft: '2px solid #000', borderRight: '2px solid #000', borderBottom: 'none', marginBottom: '0px', fontFamily: 'var(--font-thai)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '2%' }} />
              <col style={{ width: '49%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '2%' }} />
              <col style={{ width: '25%' }} />
            </colgroup>
            <tbody>
              {infoRows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ padding: idx === 0 ? '3px 6px 1px' : '1px 6px', fontSize: '11pt', lineHeight: '0.8', height: idx === 0 ? '20px' : '16px', verticalAlign: 'middle' }}>{row.leftLabel}</td>
                  <td style={{ textAlign: 'center', padding: idx === 0 ? '3px 0 1px' : '1px 0', fontSize: '11pt', lineHeight: '0.8', height: idx === 0 ? '18px' : '16px', verticalAlign: 'middle' }}>{row.leftLabel ? ':' : ''}</td>
                  <td
                    style={{
                      padding: row.leftLabel === 'Address' ? '2px 6px' : idx === 0 ? '3px 6px 1px' : '1px 6px',
                      fontSize: '11pt',
                      lineHeight: row.leftLabel === 'Address' ? '1.2' : '0.8',
                      height: row.leftLabel === 'Address' ? 'auto' : idx === 0 ? '18px' : '16px',
                      verticalAlign: 'middle',
                      wordBreak: 'break-word',
                    }}
                  >
                    {row.leftValue}
                  </td>
                  <td style={{ padding: idx === 0 ? '3px 6px 1px' : '1px 6px', fontSize: '11pt', lineHeight: '0.8', height: idx === 0 ? '18px' : '16px', verticalAlign: 'middle' }}>{row.rightLabel}</td>
                  <td style={{ textAlign: 'center', padding: idx === 0 ? '3px 0 1px' : '1px 0', fontSize: '11pt', lineHeight: '0.8', height: idx === 0 ? '18px' : '16px', verticalAlign: 'middle' }}>{row.rightLabel ? ':' : ''}</td>
                  <td style={{ padding: idx === 0 ? '3px 6px 1px' : '1px 6px', fontSize: '11pt', lineHeight: '0.8', height: idx === 0 ? '18px' : '16px', verticalAlign: 'middle', wordBreak: 'break-word' }}>{row.rightValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  function renderItemRows(item: Item | null, displaySeq: number, key: number, measureIndex?: number) {
    const baseTd: React.CSSProperties = { ...tdS }
    const detailRows = normalizeDetailRows(item?.detailRows)
    return (
      <>
      <tr key={key} data-measure-item={measureIndex}>
        <td style={{ ...baseTd, textAlign: 'center', fontFamily: 'var(--font-thai)', fontSize: fpt(12) }}>
          {item ? displaySeq : ''}
        </td>
        <td style={{ ...baseTd, fontFamily: 'var(--font-thai)', fontSize: fpt(12), lineHeight: 1.1 }}>
          <span style={{ fontWeight: 'bold' }}>{item?.desc ?? ''}</span>
          {item && splitDescriptionLines(item.note).map((line, idx) => (
            <span key={idx} style={{ color: '#777', fontSize: fpt(10), lineHeight: 1.05, display: 'block', fontFamily: 'var(--font-thai)' }}>
              {line || '\u00A0'}
            </span>
          ))}
          {item && Array.isArray(item.images) && item.images.length > 0 && (
            <div
              style={{
                marginTop: '2mm',
                display: 'grid',
                // Mixed layout: portrait = 1 column, landscape = 2 columns.
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gridAutoFlow: 'dense',
                gap: '2mm',
                alignItems: 'start',
              }}
            >
              {item.images.map((url, idx) => {
                const imageKey = getImageKey(item, idx, url)
                const orientation = imageOrientation[imageKey]
                const isLandscape = orientation === 'landscape'
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={resolveFileUrl(url)}
                    alt=""
                    onLoad={(e) => onImageLoad(imageKey, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: `${(34 * scale).toFixed(3)}mm`,
                      objectFit: 'contain',
                      display: 'block',
                      gridColumn: isLandscape ? 'span 2' : 'span 1',
                    }}
                  />
                )
              })}
            </div>
          )}
        </td>
        <td style={{ ...baseTd, textAlign: 'center', fontFamily: 'var(--font-thai)', fontSize: fpt(12) }}>
          {item ? fmtQty(item.qty) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'center', fontFamily: 'var(--font-thai)', fontSize: fpt(12) }}>
          {item?.unit ?? ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: fpt(12) }}>
          {item ? fmtAmtBlankZero(item.materialPrice) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: fpt(12) }}>
          {item ? fmtAmtBlankZero(item.labourPrice) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: fpt(12) }}>
          {item ? fmtAmtBlankZero(item.amount) : ''}
        </td>
      </tr>
      {detailRows.map((row, idx) => {
        const detailQty = Number(row.qty || 0)
        const detailUnit = String(row.unit || '').trim()
        const material = Number(row.materialPrice || 0)
        const labour = Number(row.labourPrice || 0)
        const rowTotal = Number(row.amount ?? (detailQty * (material + labour)))
        const detailTd: React.CSSProperties = {
          ...tdS,
          fontFamily: 'var(--font-thai)',
          fontSize: fpt(10),
          color: '#666',
          paddingTop: '2px',
          paddingBottom: '2px',
          lineHeight: 1.08,
          backgroundColor: '#fafafa',
        }
        return (
          <tr key={`${key}-detail-${idx}`} data-measure-item={measureIndex}>
            <td style={{ ...detailTd, textAlign: 'center' }} />
            <td style={{ ...detailTd }}>{row.desc || `รายละเอียด ${idx + 1}`}</td>
            <td style={{ ...detailTd, textAlign: 'center' }}>{detailQty ? fmtQty(detailQty) : ''}</td>
            <td style={{ ...detailTd, textAlign: 'center' }}>{detailUnit || ''}</td>
            <td style={{ ...detailTd, textAlign: 'right' }}>{fmtAmtBlankZero(material)}</td>
            <td style={{ ...detailTd, textAlign: 'right' }}>{fmtAmtBlankZero(labour)}</td>
            <td style={{ ...detailTd, textAlign: 'right' }}>{fmtAmtBlankZero(rowTotal)}</td>
          </tr>
        )
      })}
      </>
    )
  }

  function renderFlexibleFillerRow(key: number) {
    const fillerTd: React.CSSProperties = {
      ...tdS,
      height: '100%',
      paddingTop: 0,
      paddingBottom: 0,
      lineHeight: 0,
      fontSize: 0,
    }

    return (
      <tr key={key} className="quotation-flex-filler" style={{ height: '100%' }}>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
      </tr>
    )
  }

  function itemsHeadRows() {
    return (
      <>
        <tr>
          <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Item</th>
          <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Description</th>
          <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Q&apos;ty</th>
          <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Unit</th>
          <th style={{ ...thS, fontWeight: 'bold', fontSize: fpt(11), lineHeight: '1.0', whiteSpace: 'nowrap', fontFamily: 'var(--font-thai)' }}>(Material Price)</th>
          <th style={{ ...thS, fontWeight: 'bold', fontSize: fpt(11), lineHeight: '1.0', whiteSpace: 'nowrap', fontFamily: 'var(--font-thai)' }}>(Labour Price)</th>
          <th style={{ ...thS, fontWeight: 'bold', fontSize: fpt(11), lineHeight: '1.0', whiteSpace: 'nowrap', fontFamily: 'var(--font-thai)' }}>(Total Amount)</th>
        </tr>
        <tr>
          <th style={{ ...thS, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Unit Price</th>
          <th style={{ ...thS, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Unit Price</th>
          <th style={{ ...thS, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Thai Baht</th>
        </tr>
      </>
    )
  }

  function renderItemsTable(chunk: PageChunk, itemOffset: number) {
    return (
      <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: tableFrameBorder, borderLeft: tableFrameBorder, borderRight: tableFrameBorder }}>
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '47%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>{itemsHeadRows()}</thead>
        <tbody style={{ height: '100%' }}>
          {chunk.items.map((item, i) => {
            const globalIndex = itemOffset + i
            const displaySeq = (item.seq !== undefined ? item.seq + 1 : globalIndex + 1)
            return renderItemRows(item, displaySeq, globalIndex)
          })}
          {renderFlexibleFillerRow(chunk.items.length)}
        </tbody>
      </table>
    )
  }

  function renderTotalsTable() {
    const blankTopTd: React.CSSProperties = {
      ...tfootTdS,
      borderLeft: 'none',
      borderRight: 'none',
      borderBottom: 'none',
      borderTop: border,
      padding: 0,
      lineHeight: 0,
      fontSize: 0,
    }
    const blankTd: React.CSSProperties = {
      ...tfootTdS,
      border: 'none',
      padding: 0,
      lineHeight: 0,
      fontSize: 0,
    }
    const totalsLabelTd: React.CSSProperties = {
      ...tfootTdS,
      border: 'none',
      textAlign: 'right',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '10px',
      paddingRight: '10px',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }
    const totalsValueTd: React.CSSProperties = {
      ...tfootTdS,
      borderTop: 'none',
      borderRight: 'none',
      borderBottom: 'none',
      borderLeft: border,
      textAlign: 'right',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '8px',
      paddingRight: '10px',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }
    return (
      <table style={{ width: '100%', flex: '0 0 auto', borderCollapse: 'collapse', tableLayout: 'fixed', borderLeft: tableFrameBorder, borderRight: tableFrameBorder, borderBottom: tableFrameBorder }}>
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '47%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={4} style={blankTopTd}>&nbsp;</td>
            <td colSpan={2} style={{ ...totalsLabelTd, borderTop: border, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Total</td>
            <td style={{ ...totalsValueTd, borderTop: border, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.subTotal)}</td>
          </tr>
          <tr>
            <td colSpan={4} style={blankTd}>&nbsp;</td>
            <td colSpan={2} style={{ ...totalsLabelTd, color: 'red', fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Special Discount</td>
            <td style={{ ...totalsValueTd, color: 'red', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.specialDiscount)}</td>
          </tr>
          <tr>
            <td colSpan={4} style={blankTd}>&nbsp;</td>
            <td colSpan={2} style={{ ...totalsLabelTd, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Total Amount</td>
            <td style={{ ...totalsValueTd, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>{fmtAmt(totalAmount)}</td>
          </tr>
          <tr>
            <td colSpan={4} style={blankTd}>&nbsp;</td>
            <td colSpan={2} style={{ ...totalsLabelTd, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Vat</td>
            <td style={{ ...totalsValueTd, fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>{vatIncluded ? fmtAmt(doc.vat) : 'Not included'}</td>
          </tr>
          <tr>
            <td colSpan={4} style={blankTd}>&nbsp;</td>
            <td colSpan={2} style={{ ...totalsLabelTd, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>Grand Total Amount</td>
            <td style={{ ...totalsValueTd, fontWeight: 'bold', fontSize: fpt(12), fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  function renderTermsAndSignatures() {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '8px', fontSize: fpt(11) }}>
        <div style={{ width: '65%', paddingRight: '8px', lineHeight: 1.15 }}>
          <div><strong>Condition Term</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;{doc.conditionTerm || 'Local Price'}</div>
          <div><strong>Validity Period</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;{doc.validityDays ? `${doc.validityDays} Days` : '30 Days'}</div>
          <div><strong>Lead Time</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;{doc.leadTime || ''}</div>
          <div>
            <strong style={{ color: 'red' }}>Term Of Payment</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;
            <span style={{ color: 'red' }}>{doc.paymentTerm || 'Credit 30 Days'}</span>
          </div>
          <div style={{ fontSize: fpt(11), marginTop: '4px' }}>Your Faithfully</div>
          <div style={{
            fontFamily: 'var(--font-signature)',
            fontStyle: 'italic',
            fontSize: fpt(14),
            marginTop: '2px',
            marginBottom: '0',
            lineHeight: 1,
          }}>{sigName}</div>
          <div style={{ fontSize: fpt(11) }}>{doc.sales?.fullName || ''}</div>
        </div>

        <div style={{ width: '45%', border: '1px solid #000', padding: '3px 6px', alignSelf: 'flex-start' }}>
          <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '16px', fontSize: fpt(11) }}>
            Customer&nbsp;&nbsp;Confirmation
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: fpt(11) }}>Signature&nbsp;:&nbsp;</td>
                <td style={{ padding: '0 2px', verticalAlign: 'bottom', fontSize: fpt(11), letterSpacing: '3px', overflow: 'hidden', whiteSpace: 'nowrap', color: '#555' }}>{'.'.repeat(37)}</td>
              </tr>
            </tbody>
          </table>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: fpt(11) }}>Approval Date&nbsp;:&nbsp;</td>
                <td style={{ padding: '0 2px', verticalAlign: 'bottom', fontSize: fpt(11), letterSpacing: '3px', overflow: 'hidden', whiteSpace: 'nowrap', color: '#555' }}>{'.'.repeat(34)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderBottomNote() {
    return (
      <div style={{
        marginTop: '2px',
        fontSize: fpt(11),
        fontStyle: 'italic',
        textAlign: 'center',
        fontWeight: 'bold',
        borderTop: '1px solid #555',
        paddingTop: '3px',
      }}>
        If you do not clear information or not get all price of papers, please notify us immediately
        {salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
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
        <div ref={headerMeasRef}>{renderHeader(1)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: tableFrameBorder, borderLeft: tableFrameBorder, borderRight: tableFrameBorder }}>
          <colgroup>
            {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead ref={theadMeasRef}>{itemsHeadRows()}</thead>
          <tbody>
            {doc.items.map((item, i) =>
              renderItemRows(
                item,
                item.seq !== undefined ? item.seq + 1 : i + 1,
                i,
                i,
              ),
            )}
          </tbody>
        </table>
        <div ref={tailMeasRef}>
          {renderTotalsTable()}
          {renderTermsAndSignatures()}
          {renderBottomNote()}
        </div>
      </div>
    )
  }

  // Compute item offsets per page
  const offsets: number[] = []
  let acc = 0
  for (const p of pages ?? []) {
    offsets.push(acc)
    acc += p.items.length
  }

  return (
    <div className="print-sheet quotation-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '18pt', position: 'relative' }}>
      {pages === null && renderMeasureLayer()}
      {(pages ?? []).map((page, pi) => (
        <div
          key={pi}
          className="quotation-page"
          style={{
            pageBreakAfter: pi < totalPages - 1 ? 'always' : 'auto',
            breakAfter: pi < totalPages - 1 ? 'page' : 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '281mm',
          }}
        >
          {renderHeader(pi + 1)}
          {renderItemsTable(page, offsets[pi])}
          {page.tail && (
            <div style={{ marginTop: 'auto' }}>
              {renderTotalsTable()}
              {renderTermsAndSignatures()}
              {renderBottomNote()}
            </div>
          )}
          {!page.tail && (
            <div
              className="quotation-page-bottom-line"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                borderTop: tableFrameBorder,
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
