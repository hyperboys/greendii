'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveFileUrl } from '@/lib/api'
import type { HandOverItem, HandOverJob, Settings } from '@/types'

const PACK_CAP_NON_LAST = 26
const PACK_CAP_LAST = 10
const FRAGMENT_CAP = PACK_CAP_LAST

const HEADER_GAP = 12
const SAFETY = 10
const TAIL_GAP = 10

interface Props {
  doc: HandOverJob
  settings: Settings | null
  onReady?: () => void
}

interface HandoverItemFragment {
  key: string
  desc: string
  noteLines: string[]
  images: string[]
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

function noteLinesWeight(lines: string[]): number {
  const nonEmptyNoteLines = lines.filter(Boolean).length
  const blankNoteLines = lines.length - nonEmptyNoteLines
  return nonEmptyNoteLines + blankNoteLines * 0.35
}

function itemWeight(fragment: HandoverItemFragment): number {
  return 1 + noteLinesWeight(fragment.noteLines) + fragment.images.length * 3
}

type ItemSource = Pick<HandOverItem, 'seq' | 'desc' | 'note' | 'qty' | 'unit' | 'images'>

function splitItemIntoFragments(item: ItemSource, itemIndex: number): HandoverItemFragment[] {
  const noteLines = splitDescriptionLines(item.note)
  const remainingLines = [...noteLines]
  const remainingImages = Array.isArray(item.images) ? [...item.images] : []
  const fragments: HandoverItemFragment[] = []
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
      key: `${item.seq ?? itemIndex}-${fragmentIndex}`,
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

function buildRenderableItems(items: ItemSource[]): HandoverItemFragment[] {
  return items.flatMap((item, itemIndex) => splitItemIntoFragments(item, itemIndex))
}

function buildFallbackItems(lines: string[]): HandoverItemFragment[] {
  return lines.map((line, index) => ({
    key: `fallback-${index}`,
    desc: line,
    noteLines: [],
    images: [],
    displaySeq: index + 1,
  }))
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
    pages.push({ items: [], isLast: true, tail: true })
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
  if (lastPageHeight <= availLast) {
    const lastPage = pages[pages.length - 1]
    lastPage.isLast = true
    lastPage.tail = true
  } else {
    pages.push({ items: [], isLast: true, tail: true })
  }

  return pages
}

export default function HandoverPrint({ doc, settings, onReady }: Props) {
  const [pages, setPages] = useState<PageChunk[] | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const headerMeasRef = useRef<HTMLDivElement>(null)
  const theadMeasRef = useRef<HTMLTableSectionElement>(null)
  const tailMeasRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const readyRef = useRef(false)

  const companyName = settings?.companyName || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'Greendii Co., Ltd.'
  const address = settings?.address || '98 Moo 6 T.Klong Sii A.Klongluang Pathumthani 12120'
  const taxId = settings?.taxId || '0135549009942'
  const tel = settings?.tel || '+662 150 7694-5'
  const website = settings?.website || 'www.greendiicompany.com'
  const quotationSalesContact = doc.quotation?.sales || doc.workOrder?.quotation?.sales
  const salesContact = doc.sales as ({ email?: string; phone?: string } | undefined)
  const email = quotationSalesContact?.email || salesContact?.email || settings?.email || 'admin2gd@greendii.com'
  const salesHp = (quotationSalesContact?.phone || salesContact?.phone || '').trim()
  const addressTh = '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120 โทร. +662 150 7694-5'

  const border = '1px solid #555'
  const borderTh = '1px solid #888'

  const serviceDateStr = doc.serviceDate
    ? new Date(doc.serviceDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

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
  }, [pages, renderItems])

  useEffect(() => {
    if (pages === null || readyRef.current) return
    readyRef.current = true
    requestAnimationFrame(() => { onReady?.() })
  }, [pages, onReady])

  const thS: React.CSSProperties = {
    border: borderTh,
    padding: '5px 6px',
    backgroundColor: '#dde',
    textAlign: 'center',
    fontSize: '10pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }

  const tdS: React.CSSProperties = {
    border,
    padding: '4px 6px',
    fontSize: '10pt',
    verticalAlign: 'top',
    height: '23px',
  }

  const itemCellS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '4px 6px',
    fontSize: '10pt',
    verticalAlign: 'top',
    textAlign: 'center',
  }

  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '10pt',
    color: '#333',
  }

  const valueS: React.CSSProperties = {
    fontSize: '10pt',
    borderBottom: '1px dotted #555',
    minWidth: '100px',
    paddingBottom: '2px',
  }

  const RATING_OPTS = [
    { v: 5, label: 'ดีมาก' },
    { v: 4, label: 'ดี' },
    { v: 3, label: 'ปานกลาง' },
    { v: 2, label: 'พอใช้' },
    { v: 1, label: 'ปรับปรุง' },
  ]

  const RatingTextRow = () => (
    <div style={{ marginBottom: '5px', fontSize: '10.6pt', lineHeight: 1.24, display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
      {RATING_OPTS.map((opt) => (
        <span key={opt.v} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
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

  function renderHeader(currentPage: number) {
    return (
      <>
        <div style={{ marginBottom: '2px' }}>
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
                <div style={{ fontWeight: 'bold', fontFamily: 'var(--font-thai)', fontSize: '17pt', lineHeight: '1.02' }}>{companyName}</div>
                <div style={{ fontWeight: 'bold', fontSize: '15pt', lineHeight: '1.0', fontFamily: 'var(--font-display)' }}>{companyNameEn}</div>
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
                <div style={{ fontSize: '10.8pt', lineHeight: '1.02' }}>
                  {address}&nbsp;&nbsp;Tel {tel}
                </div>
                <div style={{ fontSize: '10.8pt', lineHeight: '1.02' }}>
                  {addressTh}{salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
                </div>
                <div style={{ fontSize: '11.8pt', lineHeight: '1.0' }}>{website}</div>
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0' }}>TAX ID : {taxId}</div>
                <div style={{ fontSize: '10.8pt', lineHeight: '1.0', color: '#cc0000' }}>E-Mail : {email}</div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '5px' }}>
                <div style={{ fontSize: '15pt', fontWeight: 'bold', textDecoration: 'underline', fontFamily: 'var(--font-thai)', lineHeight: 1.05 }}>
                  HAND OVER JOB
                </div>
              </div>
            </div>
            <div />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', padding: '6px 9px', borderRight: border, verticalAlign: 'top' }}>
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
                        <td style={{ ...labelS, paddingBottom: '6px', width: '132px', verticalAlign: 'top' }}>{label} :</td>
                        <td style={{ ...valueS, paddingBottom: '6px', width: '100%' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              <td style={{ width: '50%', padding: '6px 9px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Hand Over Job NO.', doc.hoNo],
                      ['Responsibility', doc.responsibility || ''],
                      ['Quotation No.', doc.quotation?.quoNo || doc.workOrder?.quotation?.quoNo || '-'],
                      ['Work order No.', doc.workOrder?.woNo || '-'],
                      ['Sales', doc.sales?.fullName || ''],
                      ['Date of service', serviceDateStr],
                    ].map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ ...labelS, paddingBottom: '6px', width: '180px', verticalAlign: 'top' }}>{label} :</td>
                        <td style={{ ...valueS, paddingBottom: '6px', width: '100%' }}>{val}</td>
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

  function itemsHeadRow() {
    return (
      <tr>
        <th style={{ ...thS, width: '32px' }}>No.</th>
        <th style={{ ...thS, textAlign: 'center' }}>Description / รายละเอียด</th>
        <th style={{ ...thS, width: '50px' }}>Qty</th>
        <th style={{ ...thS, width: '50px' }}>Unit</th>
      </tr>
    )
  }

  function renderItemRow(item: HandoverItemFragment, rowRef?: (element: HTMLTableRowElement | null) => void) {
    return (
      <tr key={item.key} ref={rowRef}>
        <td style={itemCellS}>{item.displaySeq ?? ''}</td>
        <td style={{ ...itemCellS, textAlign: 'left' }}>
          {item.desc}
          {item.noteLines.map((line, index) => (
            <span key={index} style={{ color: '#555', fontSize: '8pt', display: 'block' }}>
              {line || '\u00A0'}
            </span>
          ))}
          {item.images.length > 0 && (
            <div style={{ marginTop: '2mm', display: 'flex', flexDirection: 'column', gap: '2mm' }}>
              {item.images.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={resolveFileUrl(url)} alt="" style={{ width: '30mm', height: 'auto', objectFit: 'contain', display: 'block' }} />
              ))}
            </div>
          )}
        </td>
        <td style={itemCellS}>{item.qty != null ? item.qty : ''}</td>
        <td style={itemCellS}>{item.unit ?? ''}</td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk) {
    return (
      <>
        
        <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, borderCollapse: 'collapse', marginBottom: '8px', border }}>
          <thead>{itemsHeadRow()}</thead>
          <tbody>
            {chunk.items.map(item => renderItemRow(item))}
            <tr style={{ height: '100%' }}>
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
      <>
        <div style={{ border, padding: '5px 8px', marginTop: '16px', marginBottom: 0 }}>
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11.6pt', marginBottom: '5px' }}>
            ประเมินคุณภาพและข้อเสนอแนะ
          </div>

          <div style={{ fontSize: '10.7pt', fontWeight: 'bold', marginBottom: '1px' }}>1. ประเมินความพึงพอใจต่อผลิตภัณฑ์ และงานบริการ</div>
          <div style={{ fontSize: '10pt', marginBottom: '2px', marginLeft: '10px', lineHeight: 1.26 }}>ท่านมีความพึงพอใจต่อสินค้า และบริการ ในเรื่องความถูกต้อง สมบูรณ์ และสวยงามในระดับใด</div>
          <div style={{ marginLeft: '10px' }}><RatingTextRow /></div>

          <div style={{ fontSize: '10.7pt', fontWeight: 'bold', marginBottom: '1px' }}>2. ประเมินความพึงพอใจต่อฝ่ายขาย</div>
          <div style={{ fontSize: '10pt', marginBottom: '2px', marginLeft: '10px', lineHeight: 1.26 }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การให้ข้อมูล ความรวดเร็วและการบริการของฝ่ายขายในระดับใด</div>
          <div style={{ marginLeft: '10px' }}><RatingTextRow /></div>

          <div style={{ fontSize: '10.7pt', fontWeight: 'bold', marginBottom: '1px' }}>3. ประเมินความพึงพอใจต่อฝ่ายช่าง และติดตั้ง</div>
          <div style={{ fontSize: '10pt', marginBottom: '2px', marginLeft: '10px', lineHeight: 1.26 }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การทำงานให้สำเร็จลุล่วง ถูกต้องตามสมบูรณ์ ตรงต่อเวลา และการบริการของฝ่ายช่างในระดับใด</div>
          <div style={{ marginLeft: '10px' }}><RatingTextRow /></div>
        </div>

        <div style={{ borderLeft: border, borderRight: border, padding: '2px 8px 5px', marginBottom: 0 }}>
          <div style={{ fontWeight: 'bold', fontSize: '8.8pt', marginBottom: '2px' }}>COMMENT</div>
          <div style={{ borderBottom: '1px dotted #555', minHeight: '10px', fontSize: '9pt' }}>&nbsp;</div>
          <div style={{ borderBottom: '1px dotted #555', marginTop: '10px', height: '10px' }} />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0, marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ border, padding: '8px 6px', textAlign: 'center', width: '50%' }}>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '28px' }}>ผู้ตรวจรับงาน</div>
                <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 2px' }}></div>
                <div style={{ fontSize: '8.6pt', marginTop: '20px' }}>วันที่............/............./.............</div>
              </td>
              <td style={{ border, padding: '8px 6px', textAlign: 'center', width: '50%' }}>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '28px' }}>ผู้ส่งมอบงาน</div>
                <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 2px' }}></div>
                <div style={{ fontSize: '8.6pt', marginTop: '20px' }}>วันที่............/............./.............</div>
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
        <div ref={probeRef} style={{ height: '281mm', width: '1px' }} />
        <div ref={headerMeasRef}>{renderHeader(1)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
          <thead ref={theadMeasRef}>{itemsHeadRow()}</thead>
          <tbody>
            {renderItems.map((item, index) => renderItemRow(item, (element) => { rowRefs.current[index] = element }))}
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
            minHeight: '281mm',
            position: 'relative',
          }}
        >
          {renderHeader(index + 1)}
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
