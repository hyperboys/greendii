'use client'

import { useEffect } from 'react'
import type { Quotation, Settings } from '@/types'

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

const MIN_ROWS = 3
// Target rows per page — used to pad with empty rows when items are few
// so the items table fills the page and Terms + Signatures sit at the bottom.
// Adjust this number if the table overflows / under-fills A4.
const ROWS_PER_PAGE = 13

interface Props {
  doc: Quotation
  settings: Settings | null
}

function splitDescriptionLines(note?: string): string[] {
  return (note ?? '')
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean)
}

export default function QuotationPrint({ doc, settings }: Props) {
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const printTitle = `${doc.quoNo}_${stamp}`
    const original = document.title
    const onBefore = () => { document.title = printTitle }
    const onAfter  = () => { document.title = original }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint',  onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint',  onAfter)
    }
  }, [doc.quoNo])

  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-GB')
  const companyName   = settings?.companyName   || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address       = settings?.address       || '98 Moo 6 T.Klong Sii A.Klongluang Pathumthani 12120'
  const taxId         = settings?.taxId         || '0135549009942'
  const tel           = settings?.tel           || '+662 150 7694-5'
  const website       = settings?.website      || 'www.greendiicompany.com'
  const email = doc.sales?.email || settings?.email || 'admin2gd@greendii.com'
  const salesHp = doc.sales?.phone?.trim()
  const addressTh     = '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120 โทร. +662 150 7694-5'
  const currentPage = Number.isFinite(Number(doc.page)) && Number(doc.page) > 0 ? Number(doc.page) : 1
  const totalPages = Number.isFinite(Number(doc.totalPages)) && Number(doc.totalPages) > 0 ? Number(doc.totalPages) : 1
  const pageText = `${currentPage}/${Math.max(currentPage, totalPages)}`

  const totalAmount = doc.subTotal - doc.specialDiscount

  // Signature text: use signatureText if set, otherwise derive "FirstName L." from fullName
  const sigName = (() => {
    if (doc.sales?.signatureText?.trim()) return doc.sales.signatureText.trim()
    const name = doc.sales?.fullName?.trim()
    if (!name) return ''
    const parts = name.split(/\s+/)
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })()

  // Pad rows so the table fills the page when items are few.
  // Each item takes 1 row + 1 row per note line + ~3 rows per image (~30mm tall).
  const usedRowEstimate = doc.items.reduce(
    (sum, it) => sum + 1 + splitDescriptionLines(it.note).length + (Array.isArray(it.images) ? it.images.length * 3 : 0),
    0,
  )
  const fillerCount = Math.max(
    MIN_ROWS - doc.items.length,
    ROWS_PER_PAGE - usedRowEstimate,
    0,
  )
  const rows: (typeof doc.items[0] | null)[] = [
    ...doc.items,
    ...Array(fillerCount).fill(null),
  ]

  const border = '1px solid #000'

  const thS: React.CSSProperties = {
    border,
    padding: '4px 5px',
    backgroundColor: '#c6e0b4',
    textAlign: 'center',
    fontSize: '8pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
    lineHeight: '1.3',
  }

  const tdS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '3px 5px',
    fontSize: '8.5pt',
    verticalAlign: 'top',
    height: '20px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  // Customer info table cell styles (no borders)
  const ciLabelS: React.CSSProperties = {
    fontFamily: 'var(--font-en)',
    fontSize: '10pt',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    verticalAlign: 'middle',
    padding: '3px 6px',
    width: '12%',
  }

  const ciValueS: React.CSSProperties = {
    fontFamily: 'var(--font-en)',
    fontSize: '9pt',
    verticalAlign: 'middle',
    padding: '3px 6px',
    width: '54%',
    height: '22px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  const ciRightLabelS: React.CSSProperties = {
    fontFamily: 'var(--font-en)',
    fontSize: '10pt',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    verticalAlign: 'middle',
    padding: '3px 6px',
    width: '12%',
  }

  const ciRightValueS: React.CSSProperties = {
    fontFamily: 'var(--font-en)',
    fontSize: '9pt',
    verticalAlign: 'middle',
    padding: '3px 6px',
    width: '22%',
    height: '22px',
  }

  return (
    <div className="print-sheet quotation-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '18pt' }}>

      {/* ═══ Company Header ═══ */}
      {/* Row 1: Logo (left cell) + Company names (center cell) */}
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

      {/* Row 2: Contact details — full-width centered, no column constraint */}
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-thai)', marginBottom: '6px' }}>
        <div style={{ fontSize: '16pt', lineHeight: '1.4' }}>
          {address}&nbsp;&nbsp;Tel {tel}
        </div>
        <div style={{ fontSize: '16pt', lineHeight: '1.4' }}>
          {addressTh}{salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
        </div>
        <div style={{ fontSize: '16pt', lineHeight: '1.3' }}>{website}</div>
        <div style={{ fontSize: '16pt', lineHeight: '1.3' }}>TAX ID : {taxId}</div>
        <div style={{ fontSize: '16pt', lineHeight: '1.3', color: '#cc0000' }}>E-Mail : {email}</div>
      </div>

      {/* ═══ QUOTATION title ═══ */}
      <div style={{
        textAlign: 'center', fontWeight: 'bold', fontSize: '16pt',
        textDecoration: 'underline', marginBottom: '8px', fontFamily: 'var(--font-thai)',
      }}>
        QUOTATION
      </div>

      {/* ═══ Customer Info — bordered table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: '8px', border: '1px solid #000', fontFamily: 'var(--font-en)' }}>
        <tbody>
          <tr>
            <td style={ciLabelS}>To</td>
            <td style={ciValueS}>:&nbsp;{doc.customerName}</td>
            <td style={ciRightLabelS}>Date</td>
            <td style={ciRightValueS}>:&nbsp;{dateStr}</td>
          </tr>
          <tr>
            <td style={ciLabelS}>Attn</td>
            <td style={ciValueS}>:&nbsp;{doc.attn || ''}</td>
            <td style={ciRightLabelS}>Page</td>
            <td style={ciRightValueS}>:&nbsp;{pageText}</td>
          </tr>
          <tr>
            <td style={ciLabelS}>Address</td>
            <td style={ciValueS}>:&nbsp;{doc.address || ''}</td>
            <td style={ciRightLabelS}>Tel</td>
            <td style={ciRightValueS}>:&nbsp;{doc.tel || ''}</td>
          </tr>
          <tr>

          </tr>
          <tr>
            <td style={{ ...ciLabelS, borderRight: 'none' }}></td>
            <td style={{ ...ciValueS, borderLeft: 'none' }}></td>
            <td style={ciRightLabelS}>Quo.No</td>
            <td style={ciRightValueS}>:&nbsp;{doc.quoNo}</td>
          </tr>
          <tr>
            <td style={ciLabelS}>Project</td>
            <td style={ciValueS}>:&nbsp;{doc.project}</td>
            <td style={ciRightLabelS}>HP</td>
            <td style={ciRightValueS}>:&nbsp;</td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Items Table ═══ */}
      <div style={{ overflow: 'visible' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' ,fontFamily: 'var(--font-thai)' ,fontSize: '10pt'}}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...thS, width: '5%' ,fontWeight: 'bold'}}>Item</th>
            <th rowSpan={2} style={{ ...thS, width: '33%',fontWeight: 'bold' }}>Description</th>
            <th rowSpan={2} style={{ ...thS, width: '8%',fontWeight: 'bold' }}>Q&apos;ty</th>
            <th rowSpan={2} style={{ ...thS, width: '7%' ,fontWeight: 'bold'}}>Unit</th>
            <th style={{ ...thS, width: '14%',fontWeight: 'bold' }}>(Material Price)</th>
            <th style={{ ...thS, width: '14%' ,fontWeight: 'bold'}}>(Labour Price)</th>
            <th style={{ ...thS, width: '17%' ,fontWeight: 'bold'}}>(Total Amount)</th>
          </tr>
          <tr>
            <th style={thS}>Unit Price</th>
            <th style={thS}>Unit Price</th>
            <th style={thS}>Thai Baht</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={i}>
              <td style={{ ...tdS, textAlign: 'center' }}>{item ? (item.seq !== undefined ? item.seq + 1 : i + 1) : ''}</td>
              <td style={{ ...tdS, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {item?.desc ?? ''}
                {splitDescriptionLines(item?.note).map((line, idx) => (
                  <span key={idx} style={{ color: '#555', fontSize: '7.5pt', display: 'block' }}>
                    {line}
                  </span>
                ))}
                {Array.isArray(item?.images) && item!.images!.length > 0 && (
                  <div style={{ marginTop: '2mm', display: 'flex', flexDirection: 'column', gap: '2mm' }}>
                    {item!.images!.map((url, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={url}
                        alt=""
                        style={{ width: '30mm', height: 'auto', objectFit: 'contain', display: 'block' }}
                      />
                    ))}
                  </div>
                )}
              </td>
              <td style={{ ...tdS, textAlign: 'center' }}>{item ? fmtQty(item.qty) : ''}</td>
              <td style={{ ...tdS, textAlign: 'center' }}>{item?.unit ?? ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.materialPrice) : ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.labourPrice) : ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.amount) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot style={{ pageBreakInside: 'avoid' }}>
          <tr>
            <td colSpan={6} style={{ ...tdS, borderTop: border, textAlign: 'right', fontWeight: 'bold' }}>Total</td>
            <td style={{ ...tdS, borderTop: border, textAlign: 'right' }}>{fmtAmt(doc.subTotal)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tdS, textAlign: 'right', color: 'red', fontWeight: 'bold' }}>Special Discount</td>
            <td style={{ ...tdS, textAlign: 'right', color: 'red' }}>{fmtAmt(doc.specialDiscount)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tdS, textAlign: 'right', fontWeight: 'bold' }}>Total Amount</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{fmtAmt(totalAmount)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tdS, textAlign: 'right' }}>Vat 7%</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{fmtAmt(doc.vat)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ ...tdS, borderTop: border, borderBottom: border, textAlign: 'right', fontWeight: 'bold' }}>Grand Total Amount</td>
            <td style={{ ...tdS, borderTop: border, borderBottom: border, textAlign: 'right', fontWeight: 'bold' }}>{fmtAmt(doc.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
      </div>

      {/* ═══ Terms + Signatures ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px', fontSize: '14pt', pageBreakInside: 'avoid', breakInside: 'avoid-page' }}>
        {/* Left: Terms + Sales signature */}
        <div style={{ width: '65%', paddingRight: '8px' }}>
          <div style={{ marginBottom: '4px' }}>
            <strong>Condition Term</strong>&nbsp;&nbsp;:&nbsp;{doc.conditionTerm || 'Local Price'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Validity Period</strong>&nbsp;&nbsp;:&nbsp;{doc.validityDays ? `${doc.validityDays} Days` : '30 Days'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Lead Time</strong>&nbsp;&nbsp;:&nbsp;{doc.leadTime || ''}
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong style={{ color: 'red' }}>Term Of Payment</strong>&nbsp;&nbsp;:&nbsp;
            <span style={{ color: 'red' }}>{doc.paymentTerm || 'Credit 30 Days'}</span>
          </div>
          <div style={{ fontSize: '14pt' }}>Your Faithfully</div>
          <div style={{
            fontFamily: 'var(--font-signature)',
            fontStyle: 'italic',
            fontSize: '22pt',
            marginTop: '8px',
            marginBottom: '2px',
            lineHeight: 1,
          }}>
            {sigName}
          </div>
          <div style={{ fontSize: '14pt' }}>{doc.sales?.fullName || ''}</div>
        </div>

        {/* Right: Customer Confirmation */}
        <div style={{
          width: '45%',
          border: '1px solid #000',
          padding: '3px 6px',
          alignSelf: 'flex-start',
        }}>
          <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '6px', fontSize: '14pt' }}>
            Customer&nbsp;&nbsp;Confirmation
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '14pt' }}>Signature&nbsp;:&nbsp;</td>
                <td style={{ padding: '0 2px', verticalAlign: 'bottom', fontSize: '14pt', letterSpacing: '3px', overflow: 'hidden', whiteSpace: 'nowrap', color: '#555' }}>{'.' .repeat(37)}</td>
              </tr>
            </tbody>
          </table>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '14pt' }}>Approval Date&nbsp;:&nbsp;</td>
                <td style={{ padding: '0 2px', verticalAlign: 'bottom', fontSize: '14pt', letterSpacing: '3px', overflow: 'hidden', whiteSpace: 'nowrap', color: '#555' }}>{'.' .repeat(34)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Bottom Note ═══ */}
      <div style={{
        marginTop: '10px',
        fontSize: '14pt',
        fontStyle: 'italic',
        textAlign: 'center',
        fontWeight: 'bold',
        borderTop: '1px solid #555',
        paddingTop: '5px',
        pageBreakInside: 'avoid',
        breakInside: 'avoid-page',
      }}>
        If you do not clear information or not get all price of papers, please notify us immediately
        {salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}
      </div>

    </div>
  )
}
