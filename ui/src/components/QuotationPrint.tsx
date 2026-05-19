import type { Quotation, Settings } from '@/types'

function fmtAmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 }).format(n)
}

const MIN_ROWS = 12

interface Props {
  doc: Quotation
  settings: Settings | null
}

export default function QuotationPrint({ doc, settings }: Props) {
  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-GB')
  const companyName   = settings?.companyName   || 'บริษัท กรีนดิอี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREEN Dii CO., LTD'
  const address       = settings?.address       || '98 Moo 6 T.Klong Sii A.Klongluang Pathumtani 12120'
  const taxId         = settings?.taxId         || '0135549009942'
  const tel           = settings?.tel           || '+662 150 7694-6'
  const email         = settings?.email         || 'kullanit@greendii.com'

  const totalAmount = doc.subTotal - doc.specialDiscount

  // Pad rows to minimum
  const rows: (typeof doc.items[0] | null)[] = [
    ...doc.items,
    ...Array(Math.max(0, MIN_ROWS - doc.items.length)).fill(null),
  ]

  const border = '1px solid #aaa'

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

  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    paddingRight: '4px',
    paddingBottom: '3px',
    fontSize: '9pt',
    verticalAlign: 'top',
  }

  const valueS: React.CSSProperties = {
    borderBottom: '1px solid #999',
    fontSize: '9pt',
    paddingBottom: '2px',
    paddingLeft: '4px',
    verticalAlign: 'top',
    width: '100%',
  }

  return (
    <div className="print-sheet" style={{ fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '10pt' }}>

      {/* ═══ Company Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            {/* Logo */}
            <td rowSpan={5} style={{ width: '110px', verticalAlign: 'middle', paddingRight: '12px' }}>
              <div style={{
                border: '2px solid #2d5a2d',
                width: '100px',
                textAlign: 'center',
                fontFamily: '"Arial Black", Arial, sans-serif',
                overflow: 'hidden',
                borderRadius: '2px',
              }}>
                <div style={{
                  background: '#fff', color: '#2d7a2d',
                  fontSize: '15pt', fontWeight: '900',
                  padding: '4px 4px 2px', letterSpacing: '1px', lineHeight: '1.1',
                }}>GREEN</div>
                <div style={{
                  background: '#4a8a4a', color: '#fff',
                  fontSize: '6.5pt', padding: '3px 4px',
                  fontFamily: 'Arial, sans-serif', lineHeight: '1.1',
                }}>Company Limited</div>
                <div style={{
                  background: '#1a3d1a', color: '#fff',
                  fontSize: '18pt', fontWeight: '900',
                  padding: '4px 4px 3px', letterSpacing: '2px', lineHeight: '1.1',
                }}>Dii</div>
              </div>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13pt', lineHeight: '1.5' }}>
              {companyName}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', lineHeight: '1.4' }}>
              {companyNameEn}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              {address}&nbsp;&nbsp;Tel {tel}&nbsp;&nbsp;Fax +662 150 7697
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              TAX ID : {taxId}
            </td>
          </tr>
          <tr>
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

      {/* ═══ Customer Info ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={labelS}>To</td>
            <td style={valueS}>{doc.customerName}</td>
            <td style={{ width: '12px' }}></td>
            <td style={{ ...labelS, textAlign: 'right' }}>Date</td>
            <td style={{ ...valueS, width: '120px' }}>{dateStr}</td>
          </tr>
          <tr>
            <td style={{ ...labelS, paddingTop: '3px' }}>Attn</td>
            <td style={{ ...valueS, paddingTop: '3px' }}>{doc.attn || ''}</td>
            <td></td>
            <td style={{ ...labelS, textAlign: 'right', paddingTop: '3px' }}>Page</td>
            <td style={{ ...valueS, paddingTop: '3px' }}>1</td>
          </tr>
          <tr>
            <td style={{ ...labelS, paddingTop: '3px' }}>Address</td>
            <td style={{ ...valueS, paddingTop: '3px' }}>{doc.address || ''}</td>
            <td></td>
            <td style={{ ...labelS, textAlign: 'right', paddingTop: '3px' }}>Tel</td>
            <td style={{ ...valueS, paddingTop: '3px' }}>{doc.tel || ''}</td>
          </tr>
          <tr>
            <td></td>
            <td style={{ borderBottom: '1px solid #999', height: '18px' }}></td>
            <td></td>
            <td style={{ ...labelS, textAlign: 'right', paddingTop: '3px' }}>Fax</td>
            <td style={{ ...valueS, paddingTop: '3px' }}></td>
          </tr>
          <tr>
            <td></td>
            <td style={{ borderBottom: '1px solid #999', height: '18px' }}></td>
            <td></td>
            <td style={{ ...labelS, textAlign: 'right', paddingTop: '3px' }}>Quo.No</td>
            <td style={{ ...valueS, paddingTop: '3px' }}>{doc.quoNo}</td>
          </tr>
          <tr>
            <td></td>
            <td style={{ borderBottom: '1px solid #999', height: '18px' }}></td>
            <td></td>
            <td style={{ ...labelS, textAlign: 'right', paddingTop: '3px' }}>HP</td>
            <td style={{ ...valueS, paddingTop: '3px' }}></td>
          </tr>
          <tr>
            <td style={{ ...labelS, paddingTop: '3px' }}>Project</td>
            <td colSpan={4} style={{ ...valueS, paddingTop: '3px' }}>{doc.project}</td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Items Table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '5%' }}>Item</th>
            <th style={{ ...thS, width: '37%' }}>Description</th>
            <th style={{ ...thS, width: '6%' }}>Q&apos;ty</th>
            <th style={{ ...thS, width: '7%' }}>Unit</th>
            <th style={{ ...thS, width: '14%' }}>(Material Price)<br />Unit Price</th>
            <th style={{ ...thS, width: '14%' }}>(Labour Price)<br />Unit Price</th>
            <th style={{ ...thS, width: '17%' }}>(Total Amount)<br />Thai Baht</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={i}>
              <td style={{ ...tdS, textAlign: 'center' }}>{item ? (item.seq ?? i + 1) : ''}</td>
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
            <td colSpan={6} style={{ ...tdS, textAlign: 'right', color: 'red' }}>Special Discount</td>
            <td style={{ ...tdS, textAlign: 'right', color: 'red' }}>
              {doc.specialDiscount > 0 ? fmtAmt(doc.specialDiscount) : ''}
            </td>
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
                <strong>Validity Period</strong>&nbsp;&nbsp;:&nbsp;{doc.validityDays} Days
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Lead Time</strong>&nbsp;&nbsp;:&nbsp;{doc.leadTime || ''}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <strong style={{ color: 'red' }}>Term Of Payment</strong>&nbsp;&nbsp;:&nbsp;
                <span style={{ color: 'red' }}>{doc.paymentTerm || ''}</span>
              </div>
              <div>Your Faithfully</div>
              <div style={{
                fontFamily: 'cursive',
                fontSize: '18pt',
                marginTop: '8px',
                marginBottom: '2px',
                lineHeight: 1,
              }}>
                {doc.sales?.initials || doc.sales?.fullName || ''}
              </div>
              <div style={{ fontWeight: 'bold' }}>{doc.sales?.fullName || ''}</div>
            </td>

            {/* Right: Customer Confirmation */}
            <td style={{
              width: '50%',
              border: '1px solid #aaa',
              padding: '10px 16px',
              verticalAlign: 'top',
            }}>
              <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '26px', fontSize: '10pt' }}>
                Customer&nbsp;&nbsp;Confirmation
              </div>
              <div style={{ marginBottom: '26px', lineHeight: '1.5' }}>
                Signature&nbsp;:&nbsp;
                <span style={{
                  borderBottom: '1px solid #555',
                  display: 'inline-block',
                  width: '180px',
                  verticalAlign: 'bottom',
                }}></span>
              </div>
              <div style={{ lineHeight: '1.5' }}>
                Approval Date&nbsp;:&nbsp;
                <span style={{
                  borderBottom: '1px solid #555',
                  display: 'inline-block',
                  width: '155px',
                  verticalAlign: 'bottom',
                }}></span>
              </div>
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
