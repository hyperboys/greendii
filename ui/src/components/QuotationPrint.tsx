'use client'

import { useEffect } from 'react'
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
// Row-weight pack capacities. 1 weight ≈ 1 row at ~7mm.
// A4 portrait content area: 297mm − 6mm top − 10mm bottom = 281mm.
// Header + customer info box ~ 95mm; column header ~ 14mm; totals + terms ~ 90mm.
// Non-last items area = 277 − 95 − 14 = 168mm ≈ 24 rows.
// Last page items area = 277 − 95 − 14 − 90 = 78mm ≈ 11 rows.
const PACK_CAP_NON_LAST = 22
const PACK_CAP_LAST = 14

interface Props {
  doc: Quotation
  settings: Settings | null
}

type Item = Quotation['items'][number]

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
        if (next.length > 42 && current) {
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

function itemWeight(it: Item): number {
  // 1 base row for the item line itself.
  // Non-empty note lines cost ~1 row; intentionally blank note lines cost less,
  // so users can add visual spacing without forcing an early page break.
  // +3 per image (30mm-wide image renders ~20–25mm tall ≈ 3 rows of ~7mm).
  const noteLines = splitDescriptionLines(it.note)
  const nonEmptyNoteLines = noteLines.filter(Boolean).length
  const blankNoteLines = noteLines.length - nonEmptyNoteLines

  return (
    1 +
    nonEmptyNoteLines +
    blankNoteLines * 0.35 +
    (Array.isArray(it.images) ? it.images.length * 3 : 0)
  )
}

interface PageChunk {
  items: Item[]
  isLast: boolean
  capacity: number
}

function paginateItems(items: Item[]): PageChunk[] {
  if (items.length === 0) {
    return [{ items: [], isLast: true, capacity: PACK_CAP_LAST }]
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
    capacity: i === rawPages.length - 1 ? PACK_CAP_LAST : PACK_CAP_NON_LAST,
  }))
}

export default function QuotationPrint({ doc, settings }: Props) {
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

  // Signature text: use signatureText if set, otherwise derive "FirstName L." from fullName
  const sigName = (() => {
    if (doc.sales?.signatureText?.trim()) return doc.sales.signatureText.trim()
    const name = doc.sales?.fullName?.trim()
    if (!name) return ''
    const parts = name.split(/\s+/)
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })()

  const pages = paginateItems(doc.items)
  const totalPages = pages.length

  const border = '2px solid #000'
  const tableFrameBorder = '2px solid #000'

  const thS: React.CSSProperties = {
    border,
    padding: '4px 5px',
    backgroundColor: '#c6e0b4',
    textAlign: 'center',
    fontSize: '8pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
    lineHeight: '1.0',
  }

  const tdS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '3px 5px',
    fontSize: '12pt',
    verticalAlign: 'top',
    height: '20px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  const tfootTdS: React.CSSProperties = {
    ...tdS,
    padding: '1px 5px',
    height: 'auto',
    lineHeight: 0.8,
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
      { leftLabel: '', leftValue: addressLines[2], rightLabel: 'HP', rightValue: salesHp || '' },
      { leftLabel: 'Project', leftValue: doc.project || '', rightLabel: '', rightValue: '' },
    ]

    return (
      <>
        {/* ═══ Company Header ═══ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr 120px',
            columnGap: 0,
            alignItems: 'center',
            fontFamily: 'var(--font-thai)',
          }}
        >
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '120px', display: 'block' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', fontFamily: 'var(--font-thai)', fontSize: '18pt', lineHeight: '1.0' }}>{companyName}</div>
            <div style={{ fontWeight: 'bold', fontSize: '14pt', lineHeight: '1.0', fontFamily: 'var(--font-display)' }}>{companyNameEn}</div>
          </div>
          <div />
        </div>

        <div style={{ textAlign: 'center', fontFamily: 'var(--font-thai)', marginBottom: '2px' }}>
          <div style={{ fontSize: '12pt', lineHeight: '1.0' }}>
            {address}&nbsp;&nbsp;Tel {tel}
          </div>
          <div style={{ fontSize: '12pt', lineHeight: '1.0' }}>
            {addressTh}{salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
          </div>
          <div style={{ fontSize: '14pt', lineHeight: '1.0' }}>{website}</div>
          <div style={{ fontSize: '12pt', lineHeight: '1.0' }}>TAX ID : {taxId}</div>
          <div style={{ fontSize: '12pt', lineHeight: '1.0', color: '#cc0000' }}>E-Mail : {email}</div>
        </div>

        {/* ═══ QUOTATION title ═══ */}
        <div style={{
          textAlign: 'center', fontWeight: 'bold', fontSize: '16pt',
          textDecoration: 'underline', marginBottom: '4px', fontFamily: 'var(--font-thai)',
        }}>
          QUOTATION
        </div>

        {/* ═══ Customer Info — Single box with 2 columns ═══ */}
        <div style={{ border: '2px solid #000', marginBottom: '10px', fontFamily: 'var(--font-thai)' }}>
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
                  <td style={{ padding: '2px 6px', fontSize: '12pt', lineHeight: '0.8', height: '20px', verticalAlign: 'middle' }}>{row.leftLabel}</td>
                  <td style={{ textAlign: 'center', padding: '2px 0', fontSize: '12pt', lineHeight: '0.8', height: '20px', verticalAlign: 'middle' }}>{row.leftLabel ? ':' : ''}</td>
                  <td style={{ padding: '2px 6px', fontSize: '12pt', lineHeight: '0.8', height: '20px', verticalAlign: 'middle', wordBreak: 'break-word' }}>{row.leftValue}</td>
                  <td style={{ padding: '2px 6px', fontSize: '12pt', lineHeight: '0.8', height: '20px', verticalAlign: 'middle' }}>{row.rightLabel}</td>
                  <td style={{ textAlign: 'center', padding: '2px 0', fontSize: '12pt', lineHeight: '0.8', height: '20px', verticalAlign: 'middle' }}>{row.rightLabel ? ':' : ''}</td>
                  <td style={{ padding: '2px 6px', fontSize: '12pt', lineHeight: '0.8', height: '20px', verticalAlign: 'middle', wordBreak: 'break-word' }}>{row.rightValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  function renderItemRow(item: Item | null, displaySeq: number, key: number, _isLastItem: boolean = false) {
    const baseTd: React.CSSProperties = { ...tdS }
    return (
      <tr key={key}>
        <td style={{ ...baseTd, textAlign: 'center', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? displaySeq : ''}
        </td>
        <td style={{ ...baseTd, fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item?.desc ?? ''}
          {item && splitDescriptionLines(item.note).map((line, idx) => (
            <span key={idx} style={{ color: '#555', fontSize: '10pt', display: 'block', fontFamily: 'var(--font-thai)' }}>
              {line || '\u00A0'}
            </span>
          ))}
          {item && Array.isArray(item.images) && item.images.length > 0 && (
            <div style={{ marginTop: '2mm', display: 'flex', flexDirection: 'column', gap: '2mm' }}>
              {item.images.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={idx} src={resolveFileUrl(url)} alt="" style={{ width: '30mm', height: 'auto', objectFit: 'contain', display: 'block' }} />
              ))}
            </div>
          )}
        </td>
        <td style={{ ...baseTd, textAlign: 'center', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? fmtQty(item.qty) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'center', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item?.unit ?? ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? fmtAmtBlankZero(item.materialPrice) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? fmtAmtBlankZero(item.labourPrice) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? fmtAmtBlankZero(item.amount) : ''}
        </td>
      </tr>
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

  function renderItemsTable(chunk: PageChunk, itemOffset: number) {
    return (
      <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: tableFrameBorder, borderLeft: tableFrameBorder, borderRight: tableFrameBorder }}>
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '47%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Item</th>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Description</th>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Q&apos;ty</th>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Unit</th>
            <th style={{ ...thS, fontWeight: 'bold', fontSize: '11pt', lineHeight: '1.0', whiteSpace: 'nowrap', fontFamily: 'var(--font-thai)' }}>(Material Price)</th>
            <th style={{ ...thS, fontWeight: 'bold', fontSize: '11pt', lineHeight: '1.0', whiteSpace: 'nowrap', fontFamily: 'var(--font-thai)' }}>(Labour Price)</th>
            <th style={{ ...thS, fontWeight: 'bold', fontSize: '11pt', lineHeight: '1.0', whiteSpace: 'nowrap', fontFamily: 'var(--font-thai)' }}>(Total Amount)</th>
          </tr>
          <tr>
            <th style={{ ...thS, fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Unit Price</th>
            <th style={{ ...thS, fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Unit Price</th>
            <th style={{ ...thS, fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Thai Baht</th>
          </tr>
        </thead>
        <tbody>
          {chunk.items.map((item, i) => {
            const globalIndex = itemOffset + i
            const displaySeq = (item.seq !== undefined ? item.seq + 1 : globalIndex + 1)
            const isLastActual = i === chunk.items.length - 1
            return renderItemRow(item, displaySeq, i, isLastActual)
          })}
          {renderFlexibleFillerRow(chunk.items.length)}
        </tbody>
      </table>
    )
  }

  function renderTotalsTable() {
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
            <td colSpan={6} style={{ ...tfootTdS, borderTop: border, textAlign: 'right', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Total</td>
            <td style={{ ...tfootTdS, borderTop: border, textAlign: 'right', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.subTotal)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tfootTdS, textAlign: 'right', color: 'red', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Special Discount</td>
            <td style={{ ...tfootTdS, textAlign: 'right', color: 'red', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.specialDiscount)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tfootTdS, textAlign: 'right', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Total Amount</td>
            <td style={{ ...tfootTdS, textAlign: 'right', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>{fmtAmt(totalAmount)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tfootTdS, textAlign: 'right', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Vat 7%</td>
            <td style={{ ...tfootTdS, textAlign: 'right', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.vat)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tfootTdS, borderTop: border, borderBottom: border, textAlign: 'right', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Grand Total Amount</td>
            <td style={{ ...tfootTdS, borderTop: border, borderBottom: border, textAlign: 'right', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>{fmtAmt(doc.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  function renderTermsAndSignatures() {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '8px', fontSize: '11pt' }}>
        <div style={{ width: '65%', paddingRight: '8px', lineHeight: 1.3 }}>
          <div><strong>Condition Term</strong>&nbsp;&nbsp;:&nbsp;{doc.conditionTerm || 'Local Price'}</div>
          <div><strong>Validity Period</strong>&nbsp;&nbsp;:&nbsp;{doc.validityDays ? `${doc.validityDays} Days` : '30 Days'}</div>
          <div><strong>Lead Time</strong>&nbsp;&nbsp;:&nbsp;{doc.leadTime || ''}</div>
          <div>
            <strong style={{ color: 'red' }}>Term Of Payment</strong>&nbsp;&nbsp;:&nbsp;
            <span style={{ color: 'red' }}>{doc.paymentTerm || 'Credit 30 Days'}</span>
          </div>
          <div style={{ fontSize: '11pt', marginTop: '4px' }}>Your Faithfully</div>
          <div style={{
            fontFamily: 'var(--font-signature)',
            fontStyle: 'italic',
            fontSize: '18pt',
            marginTop: '2px',
            marginBottom: '0',
            lineHeight: 1,
          }}>{sigName}</div>
          <div style={{ fontSize: '11pt' }}>{doc.sales?.fullName || ''}</div>
        </div>

        <div style={{ width: '45%', border: '1px solid #000', padding: '3px 6px', alignSelf: 'flex-start' }}>
          <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '16px', fontSize: '11pt' }}>
            Customer&nbsp;&nbsp;Confirmation
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '11pt' }}>Signature&nbsp;:&nbsp;</td>
                <td style={{ padding: '0 2px', verticalAlign: 'bottom', fontSize: '11pt', letterSpacing: '3px', overflow: 'hidden', whiteSpace: 'nowrap', color: '#555' }}>{'.'.repeat(37)}</td>
              </tr>
            </tbody>
          </table>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '11pt' }}>Approval Date&nbsp;:&nbsp;</td>
                <td style={{ padding: '0 2px', verticalAlign: 'bottom', fontSize: '11pt', letterSpacing: '3px', overflow: 'hidden', whiteSpace: 'nowrap', color: '#555' }}>{'.'.repeat(34)}</td>
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
        marginTop: '4px',
        fontSize: '11pt',
        fontStyle: 'italic',
        textAlign: 'center',
        fontWeight: 'bold',
        borderTop: '1px solid #555',
        paddingTop: '5px',
      }}>
        If you do not clear information or not get all price of papers, please notify us immediately
        {salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
      </div>
    )
  }

  // Compute item offsets per page
  const offsets: number[] = []
  let acc = 0
  for (const p of pages) {
    offsets.push(acc)
    acc += p.items.length
  }

  return (
    <div className="print-sheet quotation-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '18pt' }}>
      {pages.map((page, pi) => (
        <div
          key={pi}
          className="quotation-page"
          style={{
            pageBreakAfter: pi < pages.length - 1 ? 'always' : 'auto',
            breakAfter: pi < pages.length - 1 ? 'page' : 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '281mm',
          }}
        >
          {renderHeader(pi + 1)}
          {renderItemsTable(page, offsets[pi])}
          {page.isLast && renderTotalsTable()}
          {page.isLast && renderTermsAndSignatures()}
          {page.isLast && renderBottomNote()}
          {!page.isLast && (
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
