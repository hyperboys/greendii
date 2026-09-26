'use client'

import { useEffect, useRef, useState } from 'react'
import type { PurchaseRequest, Settings } from '@/types'
import { resolveFileUrl } from '@/lib/api'
import { formatBangkokDate, formatBangkokDateTime } from '@/lib/timezone'
import { parsePRDescription, type PRDescriptionBlock } from '@/lib/prDescription'
import { parseColoredLine } from '@/lib/coloredText'
import PRRevisionSummary from '@/components/PRRevisionSummary'

// Weight-based pagination is now only a fallback for when real measurement
// isn't available; keep its last-page cap conservative so it never risks
// pushing the summary/signature block past the printable area on its own.
const PACK_CAP_NON_LAST = 20
const PACK_CAP_LAST = 11
const PR_FRAGMENT_CAP = 16

const PAGE_HEIGHT_MM = '281mm'
const HEADER_GAP = 12
const SAFETY = 12
const TAIL_GAP = 12
const MEASURE_BUFFER_NON_LAST = 20
const MEASURE_BUFFER_LAST = 40
const MAX_REFIT_PASSES = 12
const OVERFLOW_TOLERANCE_PX = 2

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

function currencyCode(code?: string): string {
  const c = String(code || 'THB').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : 'THB'
}

function fmtDateTH(dateStr?: string): string {
  return formatBangkokDate(dateStr)
}

function formatSignatureText(signatureText?: string | null, fullName?: string | null): string {
  if (signatureText?.trim()) return signatureText.trim()
  const name = fullName?.trim()
  if (!name) return ''
  const parts = name.split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

function getPenultimateApprovalLog(doc: PurchaseRequest) {
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
    .sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

  if (approvedLogs.length === 0) return null
  return approvedLogs[approvedLogs.length - 2] ?? approvedLogs[approvedLogs.length - 1]
}

function getLatestSubmitDate(doc: PurchaseRequest): string {
  const historyLogs = [...(doc.approvalLogs ?? [])]
    .sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

  const latestSubmitAt = [...historyLogs]
    .reverse()
    .find(log => log.action === 'submit')?.actedAt

  if (!latestSubmitAt) return ''

  return formatBangkokDateTime(latestSubmitAt)
}

const prColumnWidths = ['6%', '38%', '8%', '10%', '16%', '22%'] as const

type PRDescriptionGroup =
  | { type: 'images'; blocks: PRDescriptionBlock[] }
  | { type: 'text'; block: PRDescriptionBlock }

// Consecutive image blocks share one grid so landscape/portrait images can tile like WO/QT.
function groupPRDescriptionBlocks(blocks: PRDescriptionBlock[]): PRDescriptionGroup[] {
  const groups: PRDescriptionGroup[] = []
  for (const block of blocks) {
    if (block.type !== 'image') {
      groups.push({ type: 'text', block })
      continue
    }
    const last = groups[groups.length - 1]
    if (last?.type === 'images') last.blocks.push(block)
    else groups.push({ type: 'images', blocks: [block] })
  }
  return groups
}

type PRItem = PurchaseRequest['items'][number]

interface PRItemFragment {
  key: string
  item: PRItem
  blocks: PRDescriptionBlock[]
  itemIndex: number
  isFirst: boolean
}

interface PageChunk {
  items: PRItemFragment[]
  isLast: boolean
  tail: boolean
}

function splitItemIntoFragments(item: PRItem, itemIndex: number): PRItemFragment[] {
  const blocks = parsePRDescription(item.note, item.images?.length ?? 0)
    .flatMap(block => block.type === 'image'
      ? [block]
      : String(block.text ?? '').split('\n').map(text => ({ ...block, text })))
  const fragments: PRItemFragment[] = []
  let remaining = [...blocks]
  let fragmentIndex = 0

  while (fragmentIndex === 0 || remaining.length > 0) {
    const fragmentBlocks: PRDescriptionBlock[] = []
    let weight = 1
    while (remaining.length > 0) {
      const next = remaining[0]
      const nextWeight = next.type === 'image' ? 4 : (next.text?.trim() ? 0.7 : 0.35)
      if (fragmentBlocks.length > 0 && weight + nextWeight > PR_FRAGMENT_CAP) break
      fragmentBlocks.push(remaining.shift() as PRDescriptionBlock)
      weight += nextWeight
    }
    fragments.push({
      key: `${item.id ?? itemIndex}-${fragmentIndex}`,
      item,
      blocks: fragmentBlocks,
      itemIndex,
      isFirst: fragmentIndex === 0,
    })
    fragmentIndex += 1
  }

  return fragments
}

function itemWeight(fragment: PRItemFragment): number {
  return 1 + fragment.blocks.reduce((sum, block) => (
    sum + (block.type === 'image' ? 3 : (block.text?.trim() ? 0.6 : 0.3))
  ), 0)
}

function paginateItems(items: PRItemFragment[]): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true }]

  const rawPages: PRItemFragment[][] = []
  let current: PRItemFragment[] = []
  let currentWeight = 0

  for (const item of items) {
    const weight = itemWeight(item)
    if (current.length > 0 && currentWeight + weight > PACK_CAP_NON_LAST) {
      rawPages.push(current)
      current = [item]
      currentWeight = weight
    } else {
      current.push(item)
      currentWeight += weight
    }
  }
  if (current.length > 0) rawPages.push(current)

  const last = rawPages[rawPages.length - 1]
  let lastWeight = last.reduce((sum, item) => sum + itemWeight(item), 0)
  if (lastWeight > PACK_CAP_LAST && last.length > 1) {
    const overflow: PRItemFragment[] = []
    while (lastWeight > PACK_CAP_LAST && last.length > 1) {
      const moved = last.pop() as PRItemFragment
      overflow.unshift(moved)
      lastWeight -= itemWeight(moved)
    }
    if (overflow.length > 0) rawPages.push(overflow)
  }

  return rawPages.map((pageItems, pageIndex) => ({
    items: pageItems,
    isLast: pageIndex === rawPages.length - 1,
    tail: pageIndex === rawPages.length - 1,
  }))
}

// Measurement-based pagination: pack fragments by their real rendered heights
// (px) so the summary/signature block never overflows the printable page.
function packByHeight(items: PRItemFragment[], heights: number[], availNonLast: number, availLast: number): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true }]

  type Entry = { item: PRItemFragment; height: number }
  const entries: Entry[] = items.map((item, index) => ({ item, height: heights[index] ?? 0 }))

  const packEntries = (sourceEntries: Entry[], cap: number): Entry[][] => {
    const packed: Entry[][] = []
    let current: Entry[] = []
    let used = 0
    for (const entry of sourceEntries) {
      if (current.length > 0 && used + entry.height > cap) {
        packed.push(current)
        current = [entry]
        used = entry.height
      } else {
        current.push(entry)
        used += entry.height
      }
    }
    if (current.length > 0) packed.push(current)
    return packed
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

  // The preceding page already fits the full item area; move only its final
  // fragment to the footer page, which uses otherwise unused space above the tail.
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
  doc: PurchaseRequest
  settings: Settings | null
  embedPdfAttachments?: boolean
  onReady?: () => void
}

export default function PRPrint({ doc, settings, embedPdfAttachments = true, onReady }: Props) {
  const [imageOrientation, setImageOrientation] = useState<Record<string, 'landscape' | 'portrait'>>({})
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

  // PDF attachments are excluded from the print HTML in PDF-generation mode
  // (embedPdfAttachments=false) because the backend merges the real PDF pages
  // via pdf-lib instead; images are always rendered as attachment pages.
  const attachmentSheets = (doc.attachments ?? []).filter(att => {
    if (att.mimeType?.startsWith('image/')) return true
    if (att.mimeType === 'application/pdf') return embedPdfAttachments
    return false
  })

  const getImageKey = (itemIndex: number, imageIndex: number, url: string) =>
    `${itemIndex}-${imageIndex}-${url}`

  const onImageLoad = (imageKey: string, width: number, height: number) => {
    const orientation = width > height ? 'landscape' : 'portrait'
    setImageOrientation(current => current[imageKey] === orientation
      ? current
      : { ...current, [imageKey]: orientation })
  }

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const printTitle = `${doc.prNo}_${stamp}`
    const original = document.title
    const onBefore = () => { document.title = printTitle }
    const onAfter  = () => { document.title = original }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint',  onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint',  onAfter)
    }
  }, [doc.prNo])

  const companyName   = settings?.companyName   || 'บริษัท กรีนส์ดี จำกัด'
  const address       = settings?.address       || '98 Moo 6 T.Klongsii, A.KlongLuang, Pathumthani 12120'
  const addressTh     = '98 หมู่ 6 ต. คลองสี่ อ. คลองหลวง จ. ปทุมธานี  12120'
  const tel           = settings?.tel           || '+662 150 7694-5'
  // Per updated PR template the Fax segment is dropped from the Tel line.
  const telDisplay    = tel.replace(/\s*(?:Fax|แฟกซ์|แฟ็กซ์)\s*[:：]?.*$/i, '').trim()

  const border = '1px solid #000'
  const remarksText = String(doc.remarks || '').trim()
  const hasSpecialDiscount = Number(doc.specialDiscount) > 0
  const vatIncluded = Number(doc.vat) > 0
  const moneyCode = currencyCode(doc.currency)
  const showMoneyCode = moneyCode !== 'THB'
  const fmtMoneyWithCode = (amount: number | null | undefined) => {
    const value = fmtAmt(amount)
    if (!value) return ''
    return showMoneyCode ? `${moneyCode} ${value}` : value
  }
  const fmtItemMoney = (amount: number | null | undefined) => (Number(amount) === 0 ? '' : fmtMoneyWithCode(amount))
  const requesterSignature = formatSignatureText(doc.sales?.signatureText, doc.sales?.fullName)
  const requesterDate = getLatestSubmitDate(doc) || fmtDateTH(doc.dateIssue || doc.createdAt)
  const approvalSignatureLog = getPenultimateApprovalLog(doc)
  const approvalSignature = formatSignatureText(
    approvalSignatureLog?.approver?.signatureText,
    approvalSignatureLog?.approver?.fullName,
  )
  const approvalDate = approvalSignatureLog?.actedAt
    ? formatBangkokDateTime(approvalSignatureLog.actedAt)
    : ''
  const printableItems = (Array.isArray(doc.items) ? doc.items : [])
    .flatMap((item, itemIndex) => splitItemIntoFragments(item, itemIndex))
  const totalPages = pages?.length ?? 1

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
        const heights = printableItems.map((_, index) => rowRefs.current[index]?.getBoundingClientRect().height ?? 0)
        const availNonLast = pagePx - headerHeight - HEADER_GAP - theadHeight - SAFETY - MEASURE_BUFFER_NON_LAST
        const availLast = availNonLast - tailHeight - TAIL_GAP - MEASURE_BUFFER_LAST

        if (!pagePx || availNonLast < 20 || (printableItems.length > 0 && heights.every(height => height <= 0))) {
          setPages(paginateItems(printableItems))
          return
        }

        setPages(packByHeight(printableItems, heights, availNonLast, Math.max(availLast, 20)))
      } catch {
        if (!cancelled) setPages(paginateItems(printableItems))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [pages, printableItems])

  // Measured heights can be slightly off once the real page renders (fonts,
  // borders); verify the actual overflow and push any crossing row onto the next page.
  useEffect(() => {
    if (pages === null || layoutSettled) return

    const frame = requestAnimationFrame(() => {
      if (refitPassRef.current >= MAX_REFIT_PASSES) { setLayoutSettled(true); return }

      const overflowIndex = pages.findIndex((_, index) => {
        const pageEl = pageRefs.current[index]
        const rowEl = lastRowRefs.current[index]
        if (!pageEl || !rowEl || !rowEl.isConnected) return false
        const tailEl = tailRefs.current[index]
        const limit = tailEl
          ? tailEl.getBoundingClientRect().top
          : pageEl.getBoundingClientRect().bottom
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
  }, [pages, layoutSettled])

  useEffect(() => {
    if (!layoutSettled || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [layoutSettled, onReady])

  const thS: React.CSSProperties = {
    border,
    padding: '6px 5px',
    backgroundColor: '#c6e0b4',
    textAlign: 'center',
    fontSize: '12pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
    lineHeight: '1.3',
  }

  const tdS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '4px 6px',
    fontSize: '12pt',
    verticalAlign: 'top',
    height: '24px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  const tdTotalS: React.CSSProperties = {
    border,
    padding: '4px 8px',
    fontSize: '12pt',
    verticalAlign: 'top',
    height: '24px',
  }

  const tdTotalFirstS: React.CSSProperties = {
    ...tdTotalS,
    borderTop: '0',
  }

  const summaryLabelS: React.CSSProperties = {
    border,
    padding: '5px 10px',
    fontSize: '12pt',
    textAlign: 'right',
    verticalAlign: 'middle',
    backgroundColor: '#fff',
  }

  const summaryAmountS: React.CSSProperties = {
    ...summaryLabelS,
    width: '22%',
    textAlign: 'right',
    whiteSpace: 'nowrap',
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
      <tr key={key} style={{ height: '100%' }}>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
      </tr>
    )
  }

  function itemsHeadRow() {
    return (
      <tr>
        <th style={{ ...thS }}>รหัส<br />P/N</th>
        <th style={{ ...thS }}>รายละเอียด<br />DETAIL</th>
        <th style={{ ...thS }}>หน่วยนับ<br />UNIT</th>
        <th style={{ ...thS }}>จำนวน<br />QTY</th>
        <th style={{ ...thS }}>ราคาต่อหน่วย<br />UNIT PRICE</th>
        <th style={{ ...thS }}>จำนวนเงิน<br />AMOUNT</th>
      </tr>
    )
  }

  function renderItemRow(item: PRItemFragment, rowRef?: (element: HTMLTableRowElement | null) => void) {
    return (
      <tr key={item.key} ref={rowRef}>
        <td style={{ ...tdS, textAlign: 'center' }}>{item.isFirst ? item.item.partNo ?? '' : ''}</td>
        <td style={{ ...tdS }}>
          {item.isFirst && (() => {
            const descLine = parseColoredLine(item.item.desc)
            return <span style={{ color: descLine.color || undefined }}>{descLine.text}</span>
          })()}
          {groupPRDescriptionBlocks(item.blocks).map((group, groupIdx) => group.type === 'images' ? (
            <div
              key={`description-images-${groupIdx}`}
              style={{
                marginTop: '1.8mm',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gridAutoFlow: 'dense',
                gap: '1.6mm',
                alignItems: 'start',
                width: '100%',
              }}
            >
              {group.blocks.map((block, idx) => {
                const url = item.item.images?.[block.imageIndex ?? -1] || ''
                const imageKey = getImageKey(item.itemIndex, block.imageIndex ?? idx, url)
                const isLandscape = imageOrientation[imageKey] === 'landscape'
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={imageKey}
                    src={resolveFileUrl(url)}
                    alt=""
                    onLoad={(e) => onImageLoad(imageKey, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '34mm',
                      objectFit: 'contain',
                      display: 'block',
                      gridColumn: isLandscape ? 'span 2' : 'span 1',
                    }}
                  />
                )
              })}
            </div>
          ) : (
            <div key={`description-${groupIdx}`} style={{ marginTop: '2px', whiteSpace: 'pre-wrap', color: group.block.color || undefined }}>
              {group.block.text || '\u00a0'}
            </div>
          ))}
        </td>
        <td style={{ ...tdS, textAlign: 'center' }}>{item.isFirst ? item.item.unit ?? '' : ''}</td>
        <td style={{ ...tdS, textAlign: 'right' }}>{item.isFirst ? fmtQty(item.item.qty) : ''}</td>
        <td style={{ ...tdS, textAlign: 'right' }}>{item.isFirst ? fmtItemMoney(item.item.price) : ''}</td>
        <td style={{ ...tdS, textAlign: 'right' }}>{item.isFirst ? fmtItemMoney(item.item.amount) : ''}</td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk, pageIndex: number, onLastRowRef?: (element: HTMLTableRowElement | null) => void) {
    return (
      <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border }}>
        <colgroup>
          {prColumnWidths.map((width, i) => <col key={i} style={{ width }} />)}
        </colgroup>
        <thead>{itemsHeadRow()}</thead>
        <tbody style={{ height: '100%' }}>
          {chunk.items.map((item, i) => renderItemRow(item, i === chunk.items.length - 1 ? onLastRowRef : undefined))}
          {renderFlexibleFillerRow(chunk.items.length)}
        </tbody>
      </table>
    )
  }

  function renderSummaryAndSignatures() {
    return (
      <div>
        <div style={{ pageBreakInside: 'avoid' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '0px', border }}>
            <colgroup>
              <col style={{ width: '78%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td
                  colSpan={2}
                  style={{
                    ...tdTotalFirstS,
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>หมายเหตุ / Remarks : </span>
                  {remarksText || '\u00A0'}
                </td>
              </tr>
              <tr>
                <td style={{ ...summaryLabelS, fontWeight: 'bold' }}>รวมเป็นเงิน (Sub Total)</td>
                <td style={summaryAmountS}>{fmtMoneyWithCode(doc.subTotal)}</td>
              </tr>
              {hasSpecialDiscount && (
                <tr>
                  <td style={summaryLabelS}>ส่วนลดพิเศษ</td>
                  <td style={summaryAmountS}>{fmtMoneyWithCode(doc.specialDiscount)}</td>
                </tr>
              )}
              <tr>
                <td style={summaryLabelS}>ภาษีมูลค่าเพิ่ม 7% (VAT)</td>
                <td style={summaryAmountS}>{fmtMoneyWithCode(vatIncluded ? doc.vat : 0)}</td>
              </tr>
              <tr>
                <td style={{ ...summaryLabelS, fontWeight: 'bold', backgroundColor: '#eef6e7', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>ยอดรวมสุทธิ (Net Total)</td>
                <td style={{ ...summaryAmountS, fontWeight: 'bold', backgroundColor: '#eef6e7', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>{fmtMoneyWithCode(doc.netTotal)}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px', fontSize: '11pt' }}>
            <tbody>
              <tr>
                <td style={{
                  width: '44%',
                  border,
                  padding: '10px 12px 28px',
                  verticalAlign: 'top',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>ผู้ขออนุมัติสั่งซื้อ / Request by</span>
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '1.15em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-signature)',
                        fontStyle: 'italic',
                        fontSize: '14pt',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {requesterSignature || '\u00A0'}
                    </span>
                  </div>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>วันที่ / Date</span>
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '0.9em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {requesterDate || '\u00A0'}
                    </span>
                  </div>
                </td>
                <td style={{ width: '12%' }}></td>
                <td style={{
                  width: '44%',
                  border,
                  padding: '10px 12px 28px',
                  verticalAlign: 'top',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>ผู้อนุมัติ / Approval</span>
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '1.15em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-signature)',
                        fontStyle: 'italic',
                        fontSize: '14pt',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {approvalSignature || '\u00A0'}
                    </span>
                  </div>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>วันที่ / Date</span>
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '0.9em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {approvalDate || '\u00A0'}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderHeader() {
    return (
      <>
        {/* ═══ Company Header ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <tbody>
            <tr>
              {/* Logo — enlarged */}
              <td rowSpan={4} style={{ width: '150px', verticalAlign: 'middle', paddingRight: '14px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '150px', display: 'block' }} />
              </td>
              {/* Company name (Thai) — left aligned next to logo */}
              <td style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '17pt', lineHeight: '1.3', verticalAlign: 'bottom' }}>
                {companyName}
              </td>
              {/* Document type label — no border, PURCHASE REQUEST stacked below */}
              <td rowSpan={4} style={{ width: '190px', verticalAlign: 'top', paddingLeft: '10px', paddingTop: '2px' }}>
                <div style={{
                  textAlign: 'center',
                  fontWeight: 'bold',
                  lineHeight: '1.2',
                }}>
                  <div style={{ fontSize: '17pt' }}>ใบขอซื้อ </div>
                  <div style={{ fontSize: '17pt' }}>PURCHASE REQUEST</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontSize: '13.5pt', lineHeight: '1.25' }}>
                {address}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontSize: '13.5pt', lineHeight: '1.25' }}>
                {addressTh}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontSize: '13.5pt', lineHeight: '1.25' }}>
                Tel : {telDisplay}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ═══ PR Info ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <tbody>
            <tr>
              <td style={{ border, padding: '5px 8px', fontSize: '12pt', fontWeight: 'bold', width: '50%' }}>
                Purchase Request No. {doc.prNo}
              </td>
              <td style={{ border, padding: '5px 8px', fontSize: '12pt', width: '50%' }}>
                <span style={{ fontWeight: 'bold' }}>Supplier : </span>{doc.customer}
              </td>
            </tr>
            <tr>
              <td style={{ border, padding: '5px 8px', fontSize: '12pt' }}>
                <span style={{ fontWeight: 'bold' }}>Date of Issue : </span>{fmtDateTH(doc.dateIssue)}
              </td>
              <td style={{ border, padding: '5px 8px', fontSize: '12pt' }}>
                <span style={{ fontWeight: 'bold' }}>Project Ref : </span>{doc.projectRef || ''}
              </td>
            </tr>
            <tr>
              <td style={{ border, padding: '5px 8px', fontSize: '12pt', width: '50%' }}>
                <span style={{ fontWeight: 'bold' }}>Date of Required : </span>{fmtDateTH(doc.dateRequired)}
              </td>
              <td style={{ border, padding: '5px 8px', fontSize: '12pt', width: '50%' }}>
                <span style={{ fontWeight: 'bold' }}>WO No. : </span>{doc.workOrder?.woNo || ''}
              </td>
            </tr>
          </tbody>
        </table>
      </>
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
        <div ref={probeRef} style={{ height: PAGE_HEIGHT_MM, width: '1px' }} />
        <div ref={headerMeasRef}>{renderHeader()}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border }}>
          <colgroup>
            {prColumnWidths.map((width, i) => <col key={i} style={{ width }} />)}
          </colgroup>
          <thead ref={theadMeasRef}>{itemsHeadRow()}</thead>
          <tbody>
            {printableItems.map((item, index) => renderItemRow(item, (element) => { rowRefs.current[index] = element }))}
          </tbody>
        </table>
        <div ref={tailMeasRef}>{renderSummaryAndSignatures()}</div>
      </div>
    )
  }

  return (
    <div
      className="print-sheet pr-print"
      style={{
        fontFamily: 'var(--font-body)',
        color: '#000',
        fontSize: '11pt',
        position: 'relative',
      }}
    >
      {pages === null && renderMeasureLayer()}
      {doc.revisionNo && doc.revisionNo > 0 && doc.previousPurchaseRequest && (
        <div
          className="pr-revision-summary-page"
          style={{
            boxSizing: 'border-box',
            minHeight: PAGE_HEIGHT_MM,
            padding: '4mm',
            pageBreakAfter: 'always',
            breakAfter: 'page',
          }}
        >
          <PRRevisionSummary doc={doc} previous={doc.previousPurchaseRequest} print />
        </div>
      )}
      {(pages ?? []).map((page, pageIndex) => (
      <div
        key={`pr-page-${pageIndex}`}
        className="pr-page"
        ref={(element) => { pageRefs.current[pageIndex] = element }}
        style={{
          height: PAGE_HEIGHT_MM,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          pageBreakAfter: pageIndex < totalPages - 1 || attachmentSheets.length > 0 ? 'always' : 'auto',
          breakAfter: pageIndex < totalPages - 1 || attachmentSheets.length > 0 ? 'page' : 'auto',
          position: 'relative',
        }}
      >

      {renderHeader()}

      {/* ═══ Items Table ( fills remaining space down to Summary ) ═══ */}
      {renderItemsTable(page, pageIndex, (element) => { lastRowRefs.current[pageIndex] = element })}

      {page.tail && (
        <div ref={(element) => { tailRefs.current[pageIndex] = element }}>
          {renderSummaryAndSignatures()}
        </div>
      )}
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

      {attachmentSheets.map((att, ai) => {
        const isLastSheet = ai === attachmentSheets.length - 1
        const url = resolveFileUrl(att.fileUrl)
        const isImage = att.mimeType?.startsWith('image/')
        return (
          <div
            key={`pr-att-${att.id ?? ai}`}
            className="pr-page pr-attachment-page"
            style={{
              minHeight: '277mm',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              pageBreakAfter: isLastSheet ? 'auto' : 'always',
              breakAfter: isLastSheet ? 'auto' : 'page',
              position: 'relative',
            }}
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={att.originalName ?? ''}
                style={{ maxWidth: '100%', maxHeight: '277mm', objectFit: 'contain', margin: 'auto', display: 'block' }}
              />
            ) : (
              <iframe
                src={url}
                title={att.originalName ?? `attachment-${ai + 1}`}
                style={{ flex: '1 1 auto', width: '100%', height: '277mm', border: 'none', background: '#fff' }}
              />
            )}
          </div>
        )
      })}

    </div>
  )
}
