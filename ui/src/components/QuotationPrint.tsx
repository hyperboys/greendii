'use client'

import { useEffect } from 'react'
import type { Quotation, Settings } from '@/types'
import { resolveFileUrl } from '@/lib/api'

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

const MIN_ROWS = 3
// Row-weight pack capacities. 1 weight ≈ 1 row at ~7mm.
// A4 portrait content area: 297mm − 10mm top − 10mm bottom = 277mm.
// Header + customer info box ~ 95mm; column header ~ 14mm; totals + terms ~ 90mm.
// Non-last items area = 277 − 95 − 14 = 168mm ≈ 24 rows.
// Last page items area = 277 − 95 − 14 − 90 = 78mm ≈ 11 rows.
const PACK_CAP_NON_LAST = 22
const PACK_CAP_LAST = 14
// Render this many filler rows on non-last pages — overflow:hidden + fixed height
// on .quotation-page clips the excess so column borders always reach the bottom.
const FILLER_NON_LAST = 28

interface Props {
  doc: Quotation
  settings: Settings | null
}

type Item = Quotation['items'][number]

function splitDescriptionLines(note?: string): string[] {
  return (note ?? '')
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean)
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
  // 1 base row for the item line itself, +1 per note line,
  // +3 per image (30mm-wide image renders ~20–25mm tall ≈ 3 rows of ~7mm).
  return (
    1 +
    splitDescriptionLines(it.note).length +
    (Array.isArray(it.images) ? it.images.length * 3 : 0)
  )
}

interface PageChunk {
  items: Item[]
  isLast: boolean
  capacity: number
}

function paginateItems(items: Item[]): PageChunk[] {
  const weights = items.map(itemWeight)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  // Single page case
  if (totalWeight <= PACK_CAP_LAST) {
    return [{ items, isLast: true, capacity: PACK_CAP_LAST }]
  }

  // Greedy from the END: pick items for the last page until LAST cap is reached.
  let lastWeight = 0
  let splitAt = items.length
  for (let i = items.length - 1; i >= 0; i--) {
    if (lastWeight + weights[i] <= PACK_CAP_LAST) {
      lastWeight += weights[i]
      splitAt = i
    } else {
      break
    }
  }
  // Ensure at least one non-last page exists (push at least one item back if all fit on last)
  if (splitAt === 0) splitAt = 1

  const nonLast = items.slice(0, splitAt)
  const last = items.slice(splitAt)

  // Pack non-last items greedily
  const pages: PageChunk[] = []
  let current: Item[] = []
  let currentWeight = 0
  for (let i = 0; i < nonLast.length; i++) {
    const w = weights[i]
    if (currentWeight + w > PACK_CAP_NON_LAST && current.length > 0) {
      pages.push({ items: current, isLast: false, capacity: PACK_CAP_NON_LAST })
      current = [nonLast[i]]
      currentWeight = w
    } else {
      current.push(nonLast[i])
      currentWeight += w
    }
  }
  if (current.length > 0) {
    pages.push({ items: current, isLast: false, capacity: PACK_CAP_NON_LAST })
  }
  pages.push({ items: last, isLast: true, capacity: PACK_CAP_LAST })
  return pages
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

  const border = '1px solid #000'

  const thS: React.CSSProperties = {
    border,
    padding: '4px 5px',
    backgroundColor: '#c6e0b4',
    textAlign: 'center',
    fontSize: '8pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
    lineHeight: '0.5',
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
    lineHeight: 1.0,
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
            <div style={{ fontWeight: 'bold', fontFamily: 'var(--font-thai)', fontSize: '22pt', lineHeight: '1.4' }}>{companyName}</div>
            <div style={{ fontWeight: 'bold', fontSize: '16pt', lineHeight: '1.4', fontFamily: 'var(--font-display)' }}>{companyNameEn}</div>
          </div>
          <div />
        </div>

        <div style={{ textAlign: 'center', fontFamily: 'var(--font-thai)', marginBottom: '6px' }}>
          <div style={{ fontSize: '12pt', lineHeight: '1.4' }}>
            {address}&nbsp;&nbsp;Tel {tel}
          </div>
          <div style={{ fontSize: '12pt', lineHeight: '1.4' }}>
            {addressTh}{salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
          </div>
          <div style={{ fontSize: '14pt', lineHeight: '1.2' }}>{website}</div>
          <div style={{ fontSize: '14pt', lineHeight: '1.2' }}>TAX ID : {taxId}</div>
          <div style={{ fontSize: '14pt', lineHeight: '1.2', color: '#cc0000' }}>E-Mail : {email}</div>
        </div>

        {/* ═══ QUOTATION title ═══ */}
        <div style={{
          textAlign: 'center', fontWeight: 'bold', fontSize: '16pt',
          textDecoration: 'underline', marginBottom: '8px', fontFamily: 'var(--font-thai)',
        }}>
          QUOTATION
        </div>

        {/* ═══ Customer Info — Single box with 2 columns ═══ */}
        <div style={{ border: '2px solid #000', marginBottom: '8px', fontFamily: 'var(--font-thai)' }}>
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
                  <td style={{ padding: '2px 6px', fontSize: '12pt', height: '28px', verticalAlign: 'middle' }}>{row.leftLabel}</td>
                  <td style={{ textAlign: 'center', padding: '2px 0', fontSize: '12pt', height: '28px', verticalAlign: 'middle' }}>{row.leftLabel ? ':' : ''}</td>
                  <td style={{ padding: '2px 6px', fontSize: '12pt', height: '28px', verticalAlign: 'middle', wordBreak: 'break-word' }}>{row.leftValue}</td>
                  <td style={{ padding: '2px 6px', fontSize: '12pt', height: '28px', verticalAlign: 'middle' }}>{row.rightLabel}</td>
                  <td style={{ textAlign: 'center', padding: '2px 0', fontSize: '12pt', height: '28px', verticalAlign: 'middle' }}>{row.rightLabel ? ':' : ''}</td>
                  <td style={{ padding: '2px 6px', fontSize: '12pt', height: '28px', verticalAlign: 'middle', wordBreak: 'break-word' }}>{row.rightValue}</td>
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
              {line}
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
          {item ? fmtAmt(item.materialPrice) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? fmtAmt(item.labourPrice) : ''}
        </td>
        <td style={{ ...baseTd, textAlign: 'right', fontFamily: 'var(--font-thai)', fontSize: '12pt' }}>
          {item ? fmtAmt(item.amount) : ''}
        </td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk, itemOffset: number) {
    // Last page: no filler — totals come right after the last item.
    // Non-last: render many fillers; overflow:hidden + fixed height clips excess
    //           so column borders always extend to bottom of page.
    const used = chunk.items.reduce((s, it) => s + itemWeight(it), 0)
    const fillerCount = chunk.isLast
      ? 0
      : Math.max(FILLER_NON_LAST - used, MIN_ROWS - chunk.items.length, 0)

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '19%' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Item</th>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Description</th>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Q&apos;ty</th>
            <th rowSpan={2} style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>Unit</th>
            <th style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>(Material Price)</th>
            <th style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>(Labour Price)</th>
            <th style={{ ...thS, fontWeight: 'bold', fontSize: '12pt', fontFamily: 'var(--font-thai)' }}>(Total Amount)</th>
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
          {Array.from({ length: fillerCount }).map((_, i) => renderItemRow(null, 0, chunk.items.length + i, false))}
        </tbody>
        {chunk.isLast && (
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
        )}
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
          <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '4px', fontSize: '11pt' }}>
            Customer&nbsp;&nbsp;Confirmation
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
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
          }}
        >
          {renderHeader(pi + 1)}
          {renderItemsTable(page, offsets[pi])}
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
                borderTop: '1px solid #000',
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
