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
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

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
  // Per updated PR template the Fax segment is dropped from the Tel line.
  const telDisplay    = tel.replace(/\s*(?:Fax|แฟกซ์|แฟ็กซ์)\s*[:：]?.*$/i, '').trim()

  const border = '1px solid #000'
  const hasSpecialDiscount = Number(doc.specialDiscount) > 0

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

  return (
    <div
      className="print-sheet"
      style={{
        fontFamily: 'var(--font-body)',
        color: '#000',
        fontSize: '11pt',
      }}
    >
      <div style={{ height: '277mm', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

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
            <td rowSpan={4} style={{ width: '170px', verticalAlign: 'middle', paddingLeft: '10px' }}>
              <div style={{
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '14pt',
                lineHeight: '1.3',
              }}>
                <div>ใบขอซื้อ /</div>
                <div>PURCHASE REQUEST</div>
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
            <td style={{ border, padding: '5px 8px', fontSize: '12pt' }}>
              <span style={{ fontWeight: 'bold' }}>Date of Required : </span>{fmtDateTH(doc.dateRequired)}
            </td>
            <td style={{ border, padding: '5px 8px', fontSize: '12pt' }}>
              <span style={{ fontWeight: 'bold' }}>Remarks : </span>{doc.remarks || ''}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Items Table ( fills remaining space down to Summary ) ═══ */}
      <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, borderCollapse: 'collapse', tableLayout: 'fixed', border }}>
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '34%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...thS }}>รหัส<br />P/N</th>
            <th style={{ ...thS }}>รายละเอียด<br />DETAIL</th>
            <th style={{ ...thS }}>หน่วยนับ<br />UNIT</th>
            <th style={{ ...thS }}>จำนวน<br />QTY</th>
            <th style={{ ...thS }}>ราคาต่อหน่วย<br />UNIT PRICE</th>
            <th style={{ ...thS }}>จำนวนเงิน<br />AMOUNT</th>
            <th style={{ ...thS }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, i) => (
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
          {/* Flexible filler row — stretches column lines down to summary */}
          <tr style={{ height: '100%' }}>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
            <td style={{ ...tdS, height: '100%' }}>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Summary ( continues the frame, closed at bottom ) ═══ */}
      <div style={{ pageBreakInside: 'avoid' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '0px' }}>
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <tbody>
            {hasSpecialDiscount && (
              <tr>
                <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
                <td colSpan={2} style={{ ...tdTotalS, textAlign: 'right' }}>ส่วนลดพิเศษ</td>
                <td style={{ ...tdTotalS, textAlign: 'right' }}>{fmtAmt(doc.specialDiscount)}</td>
                <td style={{ border: 'none' }}>&nbsp;</td>
              </tr>
            )}
            <tr>
              <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
              <td colSpan={2} style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>รวมเงิน Sub Total</td>
              <td style={{ ...tdTotalS, textAlign: 'right' }}>{fmtAmt(doc.subTotal)}</td>
              <td style={{ border: 'none' }}>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
              <td colSpan={2} style={{ ...tdTotalS, textAlign: 'right' }}>ภาษีมูลค่าเพิ่ม 7 % ( VAT)</td>
              <td style={{ ...tdTotalS, textAlign: 'right' }}>{Number(doc.vat) > 0 ? fmtAmt(doc.vat) : ''}</td>
              <td style={{ border: 'none' }}>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
              <td colSpan={2} style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>ยอดเงินสุทธิ Net Total</td>
              <td style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>{fmtAmt(doc.netTotal)}</td>
              <td style={{ border: 'none' }}>&nbsp;</td>
            </tr>
          </tbody>
        </table>

        {/* ═══ Signatures ═══ */}
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
                  <span style={{ flex: 1, borderBottom: '1px dotted #666', height: '0.9em' }} />
                </div>
                <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>วันที่ / Date</span>
                  <span style={{ flex: 1, borderBottom: '1px dotted #666', height: '0.9em' }} />
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
                  <span style={{ flex: 1, borderBottom: '1px dotted #666', height: '0.9em' }} />
                </div>
                <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>วันที่ / Date</span>
                  <span style={{ flex: 1, borderBottom: '1px dotted #666', height: '0.9em' }} />
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
