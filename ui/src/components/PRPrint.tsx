'use client'

import { useEffect } from 'react'
import type { PurchaseRequest, Settings } from '@/types'

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

function fmtDateTH(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear() - 1957 // Buddhist era
  return `${day}/${month}/${year}`
}

const MIN_ROWS = 40

interface Props {
  doc: PurchaseRequest
  settings: Settings | null
}

export default function PRPrint({ doc, settings }: Props) {
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
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address       = settings?.address       || '98 Moo 6 T.Klongsii, A.KlongLuang, Pathumthani 12120'
  const addressTh     = '98 หมู่ 6 ต. คลองสี่ อ. คลองหลวง จ. ปทุมธานี  12120'
  const tel           = settings?.tel           || '662 150 7694 - 7  662 577 0907'
  const fax           = '662 150 7697'

  const border = '1px solid #000'
  const hasSpecialDiscount = Number(doc.specialDiscount) > 0

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
    padding: '2px 5px',
    fontSize: '8.5pt',
    verticalAlign: 'top',
    height: '18px',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  const tdTotalS: React.CSSProperties = {
    border,
    padding: '2px 5px',
    fontSize: '8.5pt',
    verticalAlign: 'top',
    height: '18px',
  }

  // Pad rows to minimum
  const rows: (typeof doc.items[0] | null)[] = [
    ...doc.items,
    ...Array(Math.max(0, MIN_ROWS - doc.items.length)).fill(null),
  ]

  return (
    <div
      className="print-sheet"
      style={{
        fontFamily: 'var(--font-body)',
        color: '#000',
        fontSize: '10pt',
      }}
    >
      <div style={{ height: '277mm', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ═══ Company Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody>
          <tr>
            {/* Logo */}
            <td rowSpan={4} style={{ width: '110px', verticalAlign: 'middle', paddingRight: '10px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '100px', display: 'block' }} />
            </td>
            {/* Company name (Thai) */}
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14pt', lineHeight: '1.4', verticalAlign: 'bottom' }}>
              {companyName}
            </td>
            {/* Document type label */}
            <td rowSpan={4} style={{ width: '160px', verticalAlign: 'middle', paddingLeft: '10px' }}>
              <div style={{
                border: '2px solid #000',
                padding: '10px 14px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '10pt',
                lineHeight: '1.6',
              }}>
                ใบขอซื้อ / PURCHASE REQUEST
              </div>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              {address}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              {addressTh}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              Tel : {tel}&nbsp;&nbsp;&nbsp;Fax : {fax}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ PR Info ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody>
          <tr>
            <td style={{ border, padding: '3px 8px', fontSize: '9pt', fontWeight: 'bold', width: '50%' }}>
              Purchase Request No. {doc.prNo}
            </td>
            <td style={{ border, padding: '3px 8px', fontSize: '9pt', width: '50%' }}>
              <span style={{ fontWeight: 'bold' }}>Customer : </span>{doc.customer}
            </td>
          </tr>
          <tr>
            <td style={{ border, padding: '3px 8px', fontSize: '9pt' }}>
              <span style={{ fontWeight: 'bold' }}>Date of Issue : </span>{fmtDateTH(doc.dateIssue)}
            </td>
            <td style={{ border, padding: '3px 8px', fontSize: '9pt' }}>
              <span style={{ fontWeight: 'bold' }}>Project Ref : </span>{doc.projectRef || ''}
            </td>
          </tr>
          <tr>
            <td style={{ border, padding: '3px 8px', fontSize: '9pt' }}>
              <span style={{ fontWeight: 'bold' }}>Date of Required : </span>{fmtDateTH(doc.dateRequired)}
            </td>
            <td style={{ border, padding: '3px 8px', fontSize: '9pt' }}>
              <span style={{ fontWeight: 'bold' }}>Remarks : </span>{doc.remarks || ''}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Items Table ( fills remaining space down to Summary ) ═══ */}
      <div style={{ flex: 1, overflow: 'hidden', borderBottom: border }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '5%' }}>รหัส<br />P/N</th>
            <th style={{ ...thS, width: '38%' }}>รายละเอียด<br />DETAIL</th>
            <th style={{ ...thS, width: '8%' }}>หน่วยนับ<br />UNIT</th>
            <th style={{ ...thS, width: '8%' }}>จำนวน<br />QTY</th>
            <th style={{ ...thS, width: '14%' }}>ราคาต่อหน่วย<br />UNIT PRICE</th>
            <th style={{ ...thS, width: '14%' }}>จำนวนเงิน<br />AMOUNT</th>
            <th style={{ ...thS, width: '13%' }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={i}>
              <td style={{ ...tdS, textAlign: 'center' }}>{item?.partNo ?? ''}</td>
              <td style={{ ...tdS }}>{item?.desc ?? ''}</td>
              <td style={{ ...tdS, textAlign: 'center' }}>{item?.unit ?? ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtQty(item.qty) : ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.price) : ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.amount) : ''}</td>
              <td style={{ ...tdS }}></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* ═══ Summary ═══ */}
      <div style={{ pageBreakInside: 'avoid' }}>
        <table style={{ width: '42%', marginLeft: 'auto', borderCollapse: 'collapse', marginTop: '0px' }}>
          <tbody>
            {hasSpecialDiscount && (
              <tr>
                <td style={{ ...tdTotalS, textAlign: 'right' }}>ส่วนลดพิเศษ</td>
                <td style={{ ...tdTotalS, textAlign: 'right' }}>{fmtAmt(doc.specialDiscount)}</td>
              </tr>
            )}
            <tr>
              <td style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold', width: '60%' }}>รวมเงิน Sub Total</td>
              <td style={{ ...tdTotalS, textAlign: 'right', width: '40%' }}>{fmtAmt(doc.subTotal)}</td>
            </tr>
            <tr>
              <td style={{ ...tdTotalS, textAlign: 'right' }}>ภาษีมูลค่าเพิ่ม 7 % ( VAT)</td>
              <td style={{ ...tdTotalS, textAlign: 'right' }}>{Number(doc.vat) > 0 ? fmtAmt(doc.vat) : ''}</td>
            </tr>
            <tr>
              <td style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>ยอดเงินสุทธิ Net Total</td>
              <td style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>{fmtAmt(doc.netTotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* ═══ Signatures ═══ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '9pt' }}>
          <tbody>
            <tr>
              <td style={{
                width: '40%',
                border,
                padding: '6px 10px 14px',
                verticalAlign: 'top',
              }}>
                <div style={{ whiteSpace: 'nowrap' }}>ผู้ขออนุมัติสั่งซื้อ / Request by</div>
                <div style={{ marginTop: '14px', whiteSpace: 'nowrap' }}>
                  วันที่ / Date ……………………………………
                </div>
              </td>
              <td style={{ width: '20%' }}></td>
              <td style={{
                width: '40%',
                border,
                padding: '6px 10px 14px',
                verticalAlign: 'top',
              }}>
                <div style={{ whiteSpace: 'nowrap' }}>ผู้อนุมัติ / Approval ……………………………</div>
                <div style={{ marginTop: '14px', whiteSpace: 'nowrap' }}>
                  วันที่ / Date ……………………………………
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      </div>

    </div>
  )
}
