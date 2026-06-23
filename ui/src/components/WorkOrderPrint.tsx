'use client'

import { useEffect, useRef, useState } from 'react'
import type { WorkOrder, Settings, QuotationItem, WorkOrderItem } from '@/types'
import { resolveFileUrl } from '@/lib/api'
import { getWorkOrderItemsSource } from '@/lib/workOrderItems'

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
  return 1 + noteLinesWeight(fragment.noteLines) + fragment.images.length * 3
}

type ItemSource = Pick<QuotationItem, 'id' | 'seq' | 'desc' | 'note' | 'qty' | 'unit' | 'images'> | WorkOrderItem

function splitItemIntoFragments(item: ItemSource, itemIndex: number): WorkOrderItemFragment[] {
  const noteLines = splitDescriptionLines(item.note)
  const remainingLines = [...noteLines]
  const remainingImages = Array.isArray(item.images) ? [...item.images] : []
  const fragments: WorkOrderItemFragment[] = []
  const displaySeq = item.seq !== undefined ? item.seq + 1 : itemIndex + 1
  const itemId = 'id' in item ? item.id : undefined
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
      key: `${itemId ?? item.seq ?? itemIndex}-${fragmentIndex}`,
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
  embedPdfAttachments?: boolean
}

export default function WorkOrderPrint({ doc, settings, onReady, embedPdfAttachments = true }: Props) {
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
    if (!att.fileUrl) return false
    if (att.mimeType?.startsWith('image/')) return true
    if (att.mimeType === 'application/pdf') return embedPdfAttachments
    return false
  })

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
    fontSize: '9.5pt',
    lineHeight: 1.35,
    verticalAlign: 'top',
    textAlign: 'center',
  }
  const thS: React.CSSProperties = {
    border: borderTh,
    padding: '5px 6px',
    backgroundColor: '#dfdde8',
    textAlign: 'center',
    fontSize: '12pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }
  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '9.8pt',
    color: '#222',
    lineHeight: 1.25,
  }
  const valueS: React.CSSProperties = {
    fontSize: '9.8pt',
    borderBottom: '1px dotted #555',
    minWidth: '100px',
    paddingBottom: '3px',
    lineHeight: 1.25,
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

  function renderHeader(currentPage: number) {
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
    return (
      <tr key={item.key} ref={rowRef} style={{ height: '24px' }}>
        <td style={itemCellS}>{item.displaySeq ?? ''}</td>
        <td style={{ ...itemCellS, textAlign: 'left' }}>
          {item.desc && <div style={{ whiteSpace: 'pre-wrap' }}>{item.desc}</div>}
          {item.noteLines.map((line, idx) => (
            <span key={idx} style={{ color: '#444', fontSize: '8.5pt', lineHeight: 1.35, whiteSpace: 'pre-wrap', display: 'block' }}>
              {line || '\u00A0'}
            </span>
          ))}
          {!item.desc && item.noteLines.length === 0 && <span>\u00A0</span>}
          {item.images.length > 0 && (
            <div style={{ marginTop: '2mm', display: 'flex', flexDirection: 'column', gap: '2mm' }}>
              {item.images.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={idx} src={resolveFileUrl(url)} alt="" style={{ width: '34mm', height: 'auto', objectFit: 'contain', display: 'block' }} />
              ))}
            </div>
          )}
        </td>
        <td style={{ ...itemCellS, textAlign: 'center' }}>{item.qty != null ? item.qty : ''}</td>
        <td style={{ ...itemCellS, textAlign: 'center', borderRight: borderRightStrong }}>{item.unit ?? ''}</td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk) {
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
          {chunk.items.map(item => renderItemRow(item))}
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

  function renderBottomSections() {
    const sigCols = [
      { role: 'Sales', name: doc.sales?.fullName ?? '' },
      { role: 'Review by', name: '' },
      { role: 'Sales Manager', name: doc.approvalLogs?.find(l => l.step === 2)?.approver?.fullName ?? '' },
      { role: 'Project Manager', name: doc.approvalLogs?.find(l => l.step === 4)?.approver?.fullName ?? '' },
      { role: 'Managing Director', name: doc.approvalLogs?.find(l => l.step === 5)?.approver?.fullName ?? '' },
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
      <div style={{ flex: '0 0 auto' }}>
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
                Installation Date<br /><span style={{ fontWeight: 'normal', fontSize: '10pt' }}>(วันที่ติดตั้งแล้ว)</span>
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
              {sigCols.map(({ role, name }) => (
                <td key={role} style={{ border: borderHeavy, borderTop: 'none', padding: '8px 6px 6px', textAlign: 'center', width: `${100 / sigCols.length}%`, verticalAlign: 'top' }}>
                  <div style={{ fontSize: '8.9pt', fontWeight: 'bold', minHeight: '16px', marginBottom: '30px' }}>{role}</div>
                  <div style={{ borderTop: '1px dotted #555', width: '80%', margin: '0 auto 4px' }} />
                  <div style={{ fontSize: '8.4pt', minHeight: '14px' }}>{name || '(…………………………)'}</div>
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
          style={{
            pageBreakAfter: pi < totalPages - 1 || attachmentSheets.length > 0 ? 'always' : 'auto',
            breakAfter: pi < totalPages - 1 || attachmentSheets.length > 0 ? 'page' : 'auto',
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
              minHeight: '281mm',
            }}
          >
            {isImage ? (
              <img
                src={url}
                alt={att.originalName ?? ''}
                style={{ maxWidth: '100%', maxHeight: '281mm', objectFit: 'contain', margin: 'auto', display: 'block' }}
              />
            ) : (
              <iframe
                src={url}
                title={att.originalName ?? `attachment-${ai + 1}`}
                style={{ flex: '1 1 auto', width: '100%', height: '281mm', border: 'none', background: '#fff' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}