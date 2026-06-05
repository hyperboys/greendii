'use client'

import { useEffect, useRef, useState } from 'react'
import type { WorkOrder, Settings, QuotationItem } from '@/types'
import { resolveFileUrl } from '@/lib/api'

// Row-weight pack capacities (≈7mm per row of the items table).
// Non-last pages have more item room; the last page must also hold the
// remark / team / QC / checklist / signature blocks, so it holds fewer rows.
const PACK_CAP_NON_LAST = 26
const PACK_CAP_LAST = 11
const FRAGMENT_CAP = PACK_CAP_LAST

const HEADER_GAP = 12
const SAFETY = 10
const TAIL_GAP = 10

function splitDescriptionLines(note?: string): string[] {
  if (note == null) return []
  const lines = note.split('\n').map(v => v.trim())
  if (lines.length === 1 && lines[0] === '') return []
  return lines
}

interface WorkOrderItemFragment {
  key: string
  desc: string
  noteLines: string[]
  images: string[]
  qty?: number
  unit?: string
  displaySeq?: number
}

function noteLinesWeight(lines: string[]): number {
  const nonEmptyNoteLines = lines.filter(Boolean).length
  const blankNoteLines = lines.length - nonEmptyNoteLines
  return nonEmptyNoteLines + blankNoteLines * 0.35
}

function itemWeight(fragment: WorkOrderItemFragment): number {
  return (
    1 +
    noteLinesWeight(fragment.noteLines) +
    fragment.images.length * 3
  )
}

function splitItemIntoFragments(item: QuotationItem, itemIndex: number): WorkOrderItemFragment[] {
  const noteLines = splitDescriptionLines(item.note)
  const remainingLines = [...noteLines]
  const remainingImages = Array.isArray(item.images) ? [...item.images] : []
  const fragments: WorkOrderItemFragment[] = []
  const displaySeq = item.seq !== undefined ? item.seq + 1 : itemIndex + 1
  let fragmentIndex = 0

  while (fragmentIndex === 0 || remainingLines.length > 0 || remainingImages.length > 0) {
    const noteChunk: string[] = []
    const imageChunk: string[] = []
    let weight = 1

    while (remainingLines.length > 0) {
      const nextLine = remainingLines[0]
      const nextWeight = nextLine ? 1 : 0.35
      if (weight + nextWeight > FRAGMENT_CAP && noteChunk.length > 0) break
      noteChunk.push(remainingLines.shift() as string)
      weight += nextWeight
    }

    while (remainingImages.length > 0) {
      const nextWeight = 3
      if (weight + nextWeight > FRAGMENT_CAP && (noteChunk.length > 0 || imageChunk.length > 0)) break
      imageChunk.push(remainingImages.shift() as string)
      weight += nextWeight
    }

    fragments.push({
      key: `${item.id ?? item.seq ?? itemIndex}-${fragmentIndex}`,
      desc: fragmentIndex === 0 ? (item.desc ?? '') : '',
      noteLines: noteChunk,
      images: imageChunk,
      qty: fragmentIndex === 0 ? item.qty : undefined,
      unit: fragmentIndex === 0 ? item.unit : undefined,
      displaySeq: fragmentIndex === 0 ? displaySeq : undefined,
    })

    fragmentIndex += 1
  }

  return fragments
}

function buildRenderableItems(items: QuotationItem[]): WorkOrderItemFragment[] {
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

  const pages = rawPages.map((pageItems) => ({
    items: pageItems,
    isLast: false,
    tail: false,
  }))
  const lastWeight = rawPages[rawPages.length - 1].reduce((sum, fragment) => sum + itemWeight(fragment), 0)

  if (lastWeight <= PACK_CAP_LAST) {
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
  } else {
    pages.push({ items: [], isLast: true, tail: true })
  }

  return pages
}

function packByHeight(items: WorkOrderItemFragment[], heights: number[], availNonLast: number, availLast: number): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true }]

  type Entry = { item: WorkOrderItemFragment; height: number }
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

  const pages = rawPages.map((pageItems) => ({
    items: pageItems.map(entry => entry.item),
    isLast: false,
    tail: false,
  }))

  const lastPageHeight = rawPages[rawPages.length - 1].reduce((sum, entry) => sum + entry.height, 0)
  if (lastPageHeight <= availLast) {
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
  } else {
    pages.push({ items: [], isLast: true, tail: true })
  }

  return pages
}

interface Props {
  doc: WorkOrder
  settings: Settings | null
  onReady?: () => void
}

export default function WorkOrderPrint({ doc, settings, onReady }: Props) {
  const [pages, setPages] = useState<PageChunk[] | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const headerMeasRef = useRef<HTMLDivElement>(null)
  const theadMeasRef = useRef<HTMLTableSectionElement>(null)
  const tailMeasRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const readyRef = useRef(false)

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const printTitle = `${doc.woNo}_${stamp}`
    const original = document.title
    const onBefore = () => { document.title = printTitle }
    const onAfter  = () => { document.title = original }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint',  onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint',  onAfter)
    }
  }, [doc.woNo])

  const companyName   = settings?.companyName   || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address       = settings?.address       || '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120'
  const tel           = settings?.tel           || '+662 150 7694-6'

  const border   = '1px solid #555'
  const borderTh = '1px solid #888'

  const checklist: Record<string, boolean> = (doc.docChecklist as Record<string, boolean>) ?? {}
  const chk = (key: string) => !!checklist[key]

  // Quotation items (if linked)
  const qItems = doc.quotation?.items ?? []
  const renderItems = buildRenderableItems(qItems)
  const totalPages = pages?.length ?? 1

  useEffect(() => {
    setPages(null)
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
        const availNonLast = pagePx - headerHeight - HEADER_GAP - theadHeight - SAFETY
        const availLast = availNonLast - tailHeight - TAIL_GAP

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
  }, [pages, doc, renderItems])

  useEffect(() => {
    if (pages === null || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [pages, onReady])

  const dateStr = doc.createdAt
    ? new Date(doc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''
  const installDateStr = doc.installDate
    ? new Date(doc.installDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'
  const qcDateStr = doc.qcDate
    ? new Date(doc.qcDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

  /* ─── style helpers ─── */
  const tdS: React.CSSProperties = {
    border,
    padding: '3px 5px',
    fontSize: '9pt',
    verticalAlign: 'top',
  }
  const itemCellS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '3px 5px',
    fontSize: '9pt',
    verticalAlign: 'top',
    textAlign: 'center',
  }
  const thS: React.CSSProperties = {
    border: borderTh,
    padding: '4px 6px',
    backgroundColor: '#dde',
    textAlign: 'center',
    fontSize: '9pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }
  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '9pt',
    color: '#333',
  }
  const valueS: React.CSSProperties = {
    fontSize: '9pt',
    borderBottom: '1px dotted #555',
    minWidth: '100px',
    paddingBottom: '1px',
  }

  const Checkbox = ({ label, checked }: { label: string; checked: boolean }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9pt', marginRight: '14px' }}>
      <span style={{
        display: 'inline-block', width: '11px', height: '11px',
        border: '1.5px solid #555', flexShrink: 0,
        background: checked ? '#333' : '#fff',
      }} />
      {label}
    </label>
  )

  function renderHeader(currentPage: number) {
    const pageText = `${currentPage}/${totalPages}`
    return (
      <>
        {/* ═══ Header ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr>
              {/* Logo */}
              <td style={{ width: '100px', verticalAlign: 'middle', paddingRight: '10px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="logo" style={{ width: '90px', height: 'auto' }} />
              </td>
              {/* Company info */}
              <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>{companyName}</div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt', color: '#444' }}>{companyNameEn}</div>
                <div style={{ fontSize: '8pt', color: '#555' }}>{address}</div>
                <div style={{ fontSize: '8pt', color: '#555' }}>โทร. {tel}</div>
              </td>
              {/* Title */}
              <td style={{ width: '200px', textAlign: 'center', borderLeft: '2px solid #555', paddingLeft: '12px', verticalAlign: 'middle' }}>
                <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#cc0000', letterSpacing: '1px' }}>
                  PROJECT
                </div>
                <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#cc0000', letterSpacing: '1px' }}>
                  WORK FORM
                </div>
                {totalPages > 1 && (
                  <div style={{ fontSize: '9pt', color: '#333', marginTop: '2px' }}>Page {pageText}</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ═══ Info Table ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
          <tbody>
            <tr>
              {/* Left column */}
              <td style={{ width: '50%', padding: '5px 8px', borderRight: border, verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      { th: 'PROJECT / โครงการ', val: doc.project },
                      { th: 'LOCATION / สถานที่', val: doc.location },
                      { th: 'PRODUCTS / สินค้า', val: doc.products },
                      { th: 'ผู้รับผิดชอบ', val: doc.responsibility },
                      { th: 'W/O No.', val: doc.woNo },
                    ].map(({ th, val }) => (
                      <tr key={th} style={{ marginBottom: '5px' }}>
                        <td style={{ ...labelS, paddingBottom: '5px', width: '130px', verticalAlign: 'top' }}>
                          {th} :
                        </td>
                        <td style={{ ...valueS, paddingBottom: '5px', width: '100%' }}>
                          {val || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              {/* Right column */}
              <td style={{ width: '50%', padding: '5px 8px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      { th: 'DATE / วันที่', val: dateStr },
                      { th: 'CUSTOMER / ลูกค้า', val: doc.customerName },
                      { th: 'CONTACT / ติดต่อ', val: doc.contactName },
                      { th: 'TEL / เบอร์ติดต่อ', val: doc.contactTel },
                      { th: 'SALES / พนักงานขาย', val: doc.sales?.fullName ?? doc.salesId },
                    ].map(({ th, val }) => (
                      <tr key={th} style={{ marginBottom: '5px' }}>
                        <td style={{ ...labelS, paddingBottom: '5px', width: '140px', verticalAlign: 'top' }}>
                          {th} :
                        </td>
                        <td style={{ ...valueS, paddingBottom: '5px', width: '100%' }}>
                          {val || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ═══ Details of Work ═══ */}
        <div style={{ fontWeight: 'bold', fontSize: '10pt', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Details of Work
        </div>
      </>
    )
  }

  function itemsHeadRow() {
    return (
      <tr>
        <th style={{ ...thS, width: '32px' }}>No.</th>
        <th style={{ ...thS, textAlign: 'left' }}>Description / รายละเอียด</th>
        <th style={{ ...thS, width: '50px' }}>Qty</th>
        <th style={{ ...thS, width: '50px' }}>Unit</th>
      </tr>
    )
  }

  function renderItemRow(item: WorkOrderItemFragment, rowRef?: (element: HTMLTableRowElement | null) => void) {
    return (
      <tr key={item.key} ref={rowRef} style={{ height: '20px' }}>
        <td style={itemCellS}>{item.displaySeq ?? ''}</td>
        <td style={{ ...itemCellS, textAlign: 'left' }}>
          {item.desc ?? ''}
          {item.noteLines.map((line, idx) => (
            <span key={idx} style={{ color: '#555', fontSize: '7.5pt', display: 'block' }}>
              {line || '\u00A0'}
            </span>
          ))}
          {item.images.length > 0 && (
            <div style={{ marginTop: '2mm', display: 'flex', flexDirection: 'column', gap: '2mm' }}>
              {item.images.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={idx} src={resolveFileUrl(url)} alt="" style={{ width: '30mm', height: 'auto', objectFit: 'contain', display: 'block' }} />
              ))}
            </div>
          )}
        </td>
        <td style={{ ...itemCellS, textAlign: 'center' }}>{item.qty != null ? item.qty : ''}</td>
        <td style={{ ...itemCellS, textAlign: 'center' }}>{item.unit ?? ''}</td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk) {
    return (
      <table className="workorder-items-table" style={{ width: '100%', flex: '1 1 0', minHeight: 0, borderCollapse: 'collapse', marginBottom: '8px', border }}>
        <thead>
          {itemsHeadRow()}
        </thead>
        <tbody>
          {chunk.items.map(item => renderItemRow(item))}
          {/* Flexible filler row fills remaining vertical space on the page */}
          <tr className="workorder-flex-filler" style={{ height: '100%' }}>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
            <td style={{ ...itemCellS, lineHeight: 0, fontSize: 0, padding: 0 }}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    )
  }

  function renderBottomSections() {
    const sigCols = [
      { role: 'Sales',             name: doc.sales?.fullName ?? '' },
      { role: 'Sales Manager',     name: doc.approvalLogs?.find(l => l.step === 2)?.approver?.fullName ?? '' },
      { role: 'Project Manager',   name: doc.approvalLogs?.find(l => l.step === 4)?.approver?.fullName ?? '' },
      { role: 'Managing Director', name: doc.approvalLogs?.find(l => l.step === 5)?.approver?.fullName ?? '' },
    ]
    return (
      <div style={{ flex: '0 0 auto' }}>
        {/* ═══ Remark ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ ...tdS, width: '70px', fontWeight: 'bold', verticalAlign: 'top' }}>Remark :</td>
              <td style={tdS}>{doc.remark ?? ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ═══ Team Assignment Checkboxes ═══ */}
        <div style={{ border, padding: '6px 8px', marginBottom: '8px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '9pt', marginBottom: '5px' }}>Team / ทีมงาน</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <Checkbox label="ส่งของอย่างเดียว" checked={chk('team_delivery_only')} />
            <Checkbox label="ทีมพื้น" checked={chk('team_floor')} />
            <Checkbox label="ทีมโรงงาน 2" checked={chk('team_factory2')} />
            <Checkbox label="ทีมติดตั้ง" checked={chk('team_install')} />
            <Checkbox label="ทีมประตู" checked={chk('team_door')} />
            <Checkbox label="ผู้รับเหมา" checked={chk('team_contractor')} />
          </div>
          {doc.teamAssignment && (
            <div style={{ fontSize: '8.5pt', color: '#444', marginTop: '4px' }}>
              หมายเหตุทีม: {doc.teamAssignment}
            </div>
          )}
        </div>

        {/* ═══ QC / Installation Date / Remark bottom table ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ ...tdS, fontWeight: 'bold', width: '200px', whiteSpace: 'nowrap' }}>
                QC Date<br /><span style={{ fontWeight: 'normal', fontSize: '8pt' }}>(วันที่ผ่านการ QC)</span>
              </td>
              <td style={tdS}>{qcDateStr}</td>
            </tr>
            <tr>
              <td style={{ ...tdS, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                Installation Date<br /><span style={{ fontWeight: 'normal', fontSize: '8pt' }}>(วันที่ติดตั้งแล้ว)</span>
              </td>
              <td style={tdS}>{installDateStr}</td>
            </tr>
            <tr>
              <td style={{ ...tdS, fontWeight: 'bold' }}>
                Remark<br /><span style={{ fontWeight: 'normal', fontSize: '8pt' }}>(หมายเหตุ)</span>
              </td>
              <td style={{ ...tdS, height: '30px' }}></td>
            </tr>
          </tbody>
        </table>

        {/* ═══ Document Checklist ═══ */}
        <div style={{ border, padding: '6px 8px', marginBottom: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                { left: { label: 'PO', key: 'doc_po' }, right: { label: 'PR', key: 'doc_pr' } },
                { left: { label: 'Quotation', key: 'doc_quotation' }, right: { label: 'Min', key: 'doc_min' } },
                { left: { label: 'Drawing Confirm', key: 'doc_drawing_confirm' }, right: { label: 'Waiting Confirm', key: 'doc_waiting_confirm' } },
                { left: { label: 'Hand Over Job', key: 'doc_handover' }, right: { label: 'Check List', key: 'doc_checklist' } },
              ].map(({ left, right }) => (
                <tr key={left.key}>
                  <td style={{ padding: '2px 8px 2px 0', width: '50%' }}>
                    <Checkbox label={left.label} checked={chk(left.key)} />
                  </td>
                  <td style={{ padding: '2px 0', width: '50%' }}>
                    <Checkbox label={right.label} checked={chk(right.key)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ═══ Signature Row ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              {sigCols.map(({ role, name }) => (
                <td key={role} style={{ border, padding: '4px 6px', textAlign: 'center', width: '25%' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', marginBottom: '28px' }}>{role}</div>
                  <div style={{ borderTop: '1px dotted #555', marginBottom: '3px' }} />
                  <div style={{ fontSize: '8pt' }}>{name || '(…………………………)'}</div>
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
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <div ref={probeRef} style={{ height: '281mm', width: '1px' }} />
        <div ref={headerMeasRef}>{renderHeader(1)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
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
    <div className="print-sheet workorder-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '10pt', position: 'relative' }}>
      {pages === null && renderMeasureLayer()}
      {(pages ?? []).map((page, pi) => (
        <div
          key={pi}
          className="workorder-page"
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
          {renderItemsTable(page)}
          {page.tail && renderBottomSections()}
        </div>
      ))}
    </div>
  )
}
