import type { Quotation, Settings } from '@/types'

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

const MIN_ROWS = 3

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
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    padding: '3px 6px',
    fontSize: '9pt',
    verticalAlign: 'middle',
    width: '55px',
    fontFamily: "Century Gothic, 'Century Gothic', sans-serif",
  }

  const ciValueS: React.CSSProperties = {
    fontSize: '9pt',
    padding: '3px 6px',
    verticalAlign: 'middle',
    height: '22px',
    width: '54%',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    fontFamily: "Century Gothic, 'Century Gothic', sans-serif",
  }

  const ciRightLabelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    padding: '3px 6px',
    fontSize: '9pt',
    verticalAlign: 'middle',
    width: '12%',
    textAlign: 'left',
    fontFamily: "Century Gothic, 'Century Gothic', sans-serif",
  }

  const ciRightValueS: React.CSSProperties = {
    fontSize: '9pt',
    padding: '3px 6px',
    verticalAlign: 'middle',
    height: '22px',
    width: '22%',
    fontFamily: "Century Gothic, 'Century Gothic', sans-serif",
  }

  return (
    <div className="print-sheet quotation-print" style={{ fontFamily: 'Tahoma, Arial, sans-serif', color: '#000', fontSize: '10pt' }}>

      {/* ═══ Company Header ═══ */}
      <div style={{ position: 'relative', marginBottom: '8px', textAlign: 'center', fontFamily: "'Cordia New', Tahoma, Arial, sans-serif" }}>
        {/* Logo — absolutely positioned so it does not affect text centering */}
        <div style={{ position: 'absolute', left: '0px', top: '20%', transform: 'translateY(-50%)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '120px', display: 'block' }} />
        </div>
        {/* Thai company name */}
        <div style={{ fontWeight: 'bold', fontFamily: "'Cordia New', Tahoma, Arial, sans-serif", fontSize: '22pt', lineHeight: '1.5' }}>{companyName}</div>
        {/* English company name */}
        <div style={{ fontWeight: 'bold', fontSize: '16pt', lineHeight: '1.5', fontFamily: 'Broadway, "Broadway BT", fantasy' }}>{companyNameEn}</div>
        {/* English address */}
        <div style={{ fontFamily: "'Cordia New', Tahoma, Arial, sans-serif", fontSize: '16pt', lineHeight: '1.2' }}>&nbsp;&nbsp;&nbsp;&nbsp;{address}&nbsp;&nbsp;Tel {tel}</div>
        {/* Thai address */}
        <div style={{ fontFamily: "'Cordia New', Tahoma, Arial, sans-serif", fontSize: '16pt', lineHeight: '1.2' }}>&nbsp;&nbsp;&nbsp;&nbsp;{addressTh}{salesHp ? <>&nbsp;&nbsp;HP : {salesHp}</> : null}</div>
        {/* Website */}
        <div style={{ fontFamily: "'Cordia New', Tahoma, Arial, sans-serif", fontSize: '16pt', lineHeight: '1.2' }}>&nbsp;&nbsp;&nbsp;&nbsp;{website}</div>
        {/* TAX ID */}
        <div style={{ fontFamily: "'Cordia New', Tahoma, Arial, sans-serif", fontSize: '16pt', lineHeight: '1.2' }}>TAX ID : {taxId}</div>
        {/* Email */}
        <div style={{ fontFamily: "'Cordia New', Tahoma, Arial, sans-serif", fontSize: '16pt', color: '#cc0000', lineHeight: '1.2' }}>E-Mail : {email}</div>
      </div>

      {/* ═══ QUOTATION title ═══ */}
      <div style={{
        textAlign: 'center', fontWeight: 'bold', fontSize: '11pt',
        textDecoration: 'underline', marginBottom: '8px',
      }}>
        QUOTATION
      </div>

      {/* ═══ Customer Info — bordered table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: '8px' }}>
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
            <td style={ciRightValueS}>{pageText}</td>
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
      <div style={{ overflow: 'visible' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...thS, width: '5%' }}>Item</th>
            <th rowSpan={2} style={{ ...thS, width: '33%' }}>Description</th>
            <th rowSpan={2} style={{ ...thS, width: '8%' }}>Q&apos;ty</th>
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
              <td style={{ ...tdS, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {item?.desc ?? ''}
                {splitDescriptionLines(item?.note).map((line, idx) => (
                  <span key={idx} style={{ color: '#555', fontSize: '7.5pt', display: 'block' }}>
                    {line}
                  </span>
                ))}
              </td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item ? fmtQty(item.qty) : ''}</td>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 0, fontSize: '9pt', pageBreakInside: 'avoid', breakInside: 'avoid-page' }}>
        {/* Left: Terms + Sales signature */}
        <div style={{ width: '64%', paddingRight: '8px' }}>
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
          <div style={{ fontSize: '10pt' }}>Your Faithfully</div>
          <div style={{
            fontFamily: '"Brush Script MT", "Brush Script Std", cursive',
            fontStyle: 'italic',
            fontSize: '22pt',
            marginTop: '8px',
            marginBottom: '2px',
            lineHeight: 1,
          }}>
            {sigName}
          </div>
          <div style={{ fontSize: '10pt' }}>{doc.sales?.fullName || ''}</div>
        </div>

        {/* Right: Customer Confirmation */}
        <div style={{
          width: '34%',
          border: '1px solid #000',
          padding: '3px 6px',
          alignSelf: 'flex-start',
        }}>
          <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '6px', fontSize: '10pt' }}>
            Customer&nbsp;&nbsp;Confirmation
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '9pt' }}>Signature&nbsp;:&nbsp;</td>
                <td style={{ borderBottom: '1px dotted #000', padding: 0, height: '30px' }}></td>
              </tr>
            </tbody>
          </table>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'nowrap', padding: 0, fontSize: '9pt' }}>Approval Date&nbsp;:&nbsp;</td>
                <td style={{ borderBottom: '1px dotted #000', padding: 0, height: '30px' }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Bottom Note ═══ */}
      <div style={{
        marginTop: '10px',
        fontSize: '7.5pt',
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
