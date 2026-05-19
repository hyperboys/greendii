import type { Quotation, Settings } from '@/types'

function fmtAmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 }).format(n)
}

const MIN_ROWS = 13

interface Props {
  doc: Quotation
  settings: Settings | null
}

export default function QuotationPrint({ doc, settings }: Props) {
  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-GB')
  const companyName   = settings?.companyName   || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREEN Dii CO., LTD'
  const address       = settings?.address       || '98 Moo 6 T.Klong Sii A.Klongluang Pathumtani 12120'
  const taxId         = settings?.taxId         || '0135549009942'
  const tel           = settings?.tel           || '+662 150 7694-6'
  const email         = settings?.email         || 'kullanit@greendii.com'
  const addressTh     = '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120 โทร. +662 150 7694-6 แฟกซ์. +662 150 7697 HP - 081 900 6685'

  const totalAmount = doc.subTotal - doc.specialDiscount

  // Signature name: "FirstName L." from fullName
  const sigName = (() => {
    const name = doc.sales?.fullName?.trim()
    if (!name) return ''
    const parts = name.split(/\s+/)
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })()

  // Pad rows to minimum
  const rows: (typeof doc.items[0] | null)[] = [
    ...doc.items,
    ...Array(Math.max(0, MIN_ROWS - doc.items.length)).fill(null),
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
    border,
    padding: '3px 5px',
    fontSize: '8.5pt',
    verticalAlign: 'top',
    height: '20px',
  }

  // Customer info table cell styles
  const ciLabelS: React.CSSProperties = {
    border,
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    padding: '3px 6px',
    fontSize: '9pt',
    verticalAlign: 'middle',
    width: '55px',
  }

  const ciValueS: React.CSSProperties = {
    border,
    fontSize: '9pt',
    padding: '3px 6px',
    verticalAlign: 'middle',
    height: '22px',
  }

  const ciRightLabelS: React.CSSProperties = {
    border,
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    padding: '3px 6px',
    fontSize: '9pt',
    verticalAlign: 'middle',
    width: '55px',
    textAlign: 'right',
  }

  const ciRightValueS: React.CSSProperties = {
    border,
    fontSize: '9pt',
    padding: '3px 6px',
    verticalAlign: 'middle',
    height: '22px',
    width: '110px',
  }

  return (
    <div className="print-sheet" style={{ fontFamily: 'Tahoma, Arial, sans-serif', color: '#000', fontSize: '10pt' }}>

      {/* ═══ Company Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            {/* Logo — spans all 6 header rows */}
            <td rowSpan={6} style={{ width: '110px', verticalAlign: 'middle', paddingRight: '12px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '100px', display: 'block' }} />
            </td>
            {/* Row 1: Thai company name — FIRST line */}
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12pt', lineHeight: '1.5' }}>
              {companyName}
            </td>
          </tr>
          <tr>
            {/* Row 2: English company name — Gothic style */}
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14pt', lineHeight: '1.3', fontFamily: 'Impact, "Arial Narrow", Arial, sans-serif', letterSpacing: '1.5px' }}>
              {companyNameEn}
            </td>
          </tr>
          <tr>
            {/* Row 3: English address */}
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              {address}&nbsp;&nbsp;Tel {tel}&nbsp;&nbsp;Fax +662 150 7697
            </td>
          </tr>
          <tr>
            {/* Row 4: Thai address */}
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              {addressTh}
            </td>
          </tr>
          <tr>
            {/* Row 5: TAX ID */}
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              TAX ID : {taxId}
            </td>
          </tr>
          <tr>
            {/* Row 6: Email */}
            <td style={{ textAlign: 'center', fontSize: '8pt', color: '#cc0000', lineHeight: '1.4' }}>
              E-Mail : {email}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ QUOTATION title ═══ */}
      <div style={{
        textAlign: 'center', fontWeight: 'bold', fontSize: '11pt',
        textDecoration: 'underline', marginBottom: '8px',
      }}>
        QUOTATION
      </div>

      {/* ═══ Customer Info — bordered table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={ciLabelS}>To</td>
            <td style={ciValueS}>{doc.customerName}</td>
            <td style={ciRightLabelS}>Date</td>
            <td style={ciRightValueS}>{dateStr}</td>
          </tr>
          <tr>
            <td style={ciLabelS}>Attn</td>
            <td style={ciValueS}>{doc.attn || ''}</td>
            <td style={ciRightLabelS}>Page</td>
            <td style={ciRightValueS}>1</td>
          </tr>
          <tr>
            <td style={ciLabelS}>Address</td>
            <td style={ciValueS}>{doc.address || ''}</td>
            <td style={ciRightLabelS}>Tel</td>
            <td style={ciRightValueS}>{doc.tel || ''}</td>
          </tr>
          <tr>
            <td style={{ ...ciLabelS, borderRight: 'none' }}></td>
            <td style={{ ...ciValueS, borderLeft: 'none' }}></td>
            <td style={ciRightLabelS}>Fax</td>
            <td style={ciRightValueS}></td>
          </tr>
          <tr>
            <td style={{ ...ciLabelS, borderRight: 'none' }}></td>
            <td style={{ ...ciValueS, borderLeft: 'none' }}></td>
            <td style={ciRightLabelS}>Quo.No</td>
            <td style={ciRightValueS}>{doc.quoNo}</td>
          </tr>
          <tr>
            <td style={ciLabelS}>Project</td>
            <td style={ciValueS}>{doc.project}</td>
            <td style={ciRightLabelS}>HP</td>
            <td style={ciRightValueS}></td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Items Table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...thS, width: '5%' }}>Item</th>
            <th rowSpan={2} style={{ ...thS, width: '37%' }}>Description</th>
            <th rowSpan={2} style={{ ...thS, width: '6%' }}>Q&apos;ty</th>
            <th rowSpan={2} style={{ ...thS, width: '7%' }}>Unit</th>
            <th style={{ ...thS, width: '14%' }}>(Material Price)</th>
            <th style={{ ...thS, width: '14%' }}>(Labour Price)</th>
            <th style={{ ...thS, width: '17%' }}>(Total Amount)</th>
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
              <td style={tdS}>
                {item?.desc ?? ''}
                {item?.note
                  ? <span style={{ color: '#555', fontSize: '7.5pt', display: 'block' }}>{item.note}</span>
                  : null}
              </td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtQty(item.qty) : ''}</td>
              <td style={{ ...tdS, textAlign: 'center' }}>{item?.unit ?? ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.materialPrice) : ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.labourPrice) : ''}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtAmt(item.amount) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} style={{ ...tdS, textAlign: 'right', fontWeight: 'bold' }}>Total</td>
            <td style={{ ...tdS, textAlign: 'right' }}>{fmtAmt(doc.subTotal)}</td>
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
            <td colSpan={6} style={{ ...tdS, textAlign: 'right', fontWeight: 'bold' }}>Grand Total Amount</td>
            <td style={{ ...tdS, textAlign: 'right', fontWeight: 'bold' }}>{fmtAmt(doc.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {/* ═══ Terms + Signatures ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '9pt' }}>
        <tbody>
          <tr>
            {/* Left: Terms + Sales signature */}
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: '10px' }}>
              <div style={{ marginBottom: '4px' }}>
                <strong>Condition Term</strong>&nbsp;&nbsp;:&nbsp;{doc.conditionTerm || 'Local Price'}
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Validity Period</strong>&nbsp;&nbsp;:&nbsp;{doc.validityDays ? `${doc.validityDays} Days` : '30 Days'}
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Lead Time</strong>&nbsp;&nbsp;:&nbsp;{doc.leadTime || ''}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <strong style={{ color: 'red' }}>Term Of Payment</strong>&nbsp;&nbsp;:&nbsp;
                <span style={{ color: 'red' }}>{doc.paymentTerm || 'Credit 30 Days'}</span>
              </div>
              <div>Your Faithfully</div>
              <div style={{
                fontFamily: 'cursive',
                fontStyle: 'italic',
                fontSize: '18pt',
                marginTop: '8px',
                marginBottom: '2px',
                lineHeight: 1,
              }}>
                {sigName}
              </div>
              <div>{doc.sales?.fullName || ''}</div>
            </td>

            {/* Right: Customer Confirmation */}
            <td style={{
              width: '50%',
              border: '1px solid #000',
              padding: '10px 16px',
              verticalAlign: 'top',
            }}>
              <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '26px', fontSize: '10pt' }}>
                Customer&nbsp;&nbsp;Confirmation
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '26px' }}>
                <tbody>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '9pt' }}>Signature&nbsp;:&nbsp;</td>
                    <td style={{ borderBottom: '1px dotted #000', padding: 0, height: '18px' }}></td>
                  </tr>
                </tbody>
              </table>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '9pt' }}>Approval Date&nbsp;:&nbsp;</td>
                    <td style={{ borderBottom: '1px dotted #000', padding: 0, height: '18px' }}></td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Bottom Note ═══ */}
      <div style={{
        marginTop: '10px',
        fontSize: '7.5pt',
        fontStyle: 'italic',
        textAlign: 'center',
        fontWeight: 'bold',
        borderTop: '1px solid #555',
        paddingTop: '5px',
      }}>
        If you do not clear information or not get all price of papers, please notify us immediately&nbsp;&nbsp;HP : 081 900 6685
      </div>

    </div>
  )
}
