import type { HandOverJob, Settings } from '@/types'

const MIN_ROWS = 14

interface Props {
  doc: HandOverJob
  settings: Settings | null
}

export default function HandoverPrint({ doc, settings }: Props) {
  const companyName   = settings?.companyName   || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address       = settings?.address       || '98 Moo. 6, T.Khlong Sii, A.Khlongluang, Pathumtani 12120'
  const taxId         = settings?.taxId         || '0135549009942'
  const tel           = settings?.tel           || '+66 2150 7694-6'

  const border = '1px solid #555'

  const serviceDateStr = doc.serviceDate
    ? new Date(doc.serviceDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

  // Split product text into lines for the items table
  const productLines = (doc.product || '').split('\n').filter(l => l.trim() !== '')
  // Pad to MIN_ROWS
  const rows: (string | null)[] = [
    ...productLines,
    ...Array(Math.max(0, MIN_ROWS - productLines.length)).fill(null),
  ]

  const thS: React.CSSProperties = {
    border,
    padding: '4px 6px',
    backgroundColor: '#dde',
    textAlign: 'center',
    fontSize: '9pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }

  const tdS: React.CSSProperties = {
    border,
    padding: '3px 5px',
    fontSize: '9pt',
    verticalAlign: 'top',
    height: '20px',
  }

  const infoLabelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '9pt',
    paddingRight: '4px',
    verticalAlign: 'top',
  }

  const infoValS: React.CSSProperties = {
    fontSize: '9pt',
    verticalAlign: 'top',
    paddingLeft: '4px',
    width: '100%',
  }

  const RATING_OPTS = [
    { v: 5, label: 'ดีมาก' },
    { v: 4, label: 'ดี' },
    { v: 3, label: 'ปานกลาง' },
    { v: 2, label: 'พอใช้' },
    { v: 1, label: 'ปรับปรุง' },
  ]

  const CheckboxRow = ({ label, value }: { label: string; value: number }) => (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '9pt', marginBottom: '3px' }}>{label}</div>
      <div style={{ display: 'flex', gap: '20px', fontSize: '9pt' }}>
        {RATING_OPTS.map(opt => (
          <label key={opt.v} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default' }}>
            <span style={{
              display: 'inline-block', width: '12px', height: '12px',
              border: '1.5px solid #555', marginRight: '3px',
              background: value === opt.v ? '#333' : '#fff',
              verticalAlign: 'middle',
              flexShrink: 0,
            }} />
            {opt.label} ({opt.v})
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <div className="print-sheet" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '10pt' }}>

      {/* ═══ Company Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody>
          <tr>
            {/* Logo */}
            <td rowSpan={4} style={{ width: '110px', verticalAlign: 'middle', paddingRight: '12px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '100px', display: 'block' }} />
            </td>
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13pt', lineHeight: '1.5' }}>{companyName}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', lineHeight: '1.4' }}>{companyNameEn}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.6' }}>
              {address}&nbsp;&nbsp;Tel. {tel}&nbsp;&nbsp;Fax. +66 2150 7697
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'center', fontSize: '8pt', lineHeight: '1.4' }}>
              TAX ID : {taxId}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Title ═══ */}
      <div style={{ textAlign: 'center', fontSize: '16pt', fontWeight: 'bold', letterSpacing: '3px', margin: '8px 0 10px', textDecoration: 'underline' }}>
        HAND OVER JOB
      </div>

      {/* ═══ Info Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            {/* Left Column */}
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: '16px' }}>
              <table style={{ width: '100%' }}>
                <tbody>
                  {[
                    ['Project',       doc.project || '-'],
                    ['Contractor',    doc.contractor || '-'],
                    ['Location',      doc.location || '-'],
                    ['Contract Name', doc.contactName || '-'],
                    ['Customer HP.',  doc.contactTel || '-'],
                    ['Product',       doc.product ? doc.product.split('\n')[0] : '-'],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={infoLabelS}>: {label}</td>
                      <td style={{ ...infoLabelS, fontWeight: 'normal', width: '8px' }}>:</td>
                      <td style={infoValS}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            {/* Right Column */}
            <td style={{ width: '50%', verticalAlign: 'top', paddingLeft: '8px' }}>
              <table style={{ width: '100%' }}>
                <tbody>
                  {[
                    ['Hand Over Job NO.', doc.hoNo],
                    ['Responsibility',    doc.responsibility || '-'],
                    ['Quotation No.',     doc.quotation?.quoNo || doc.workOrder?.quotation?.quoNo || '-'],

                    ['Sales',            doc.sales?.fullName || '-'],
                    ['Date of service',  serviceDateStr],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={infoLabelS}>{label}</td>
                      <td style={{ ...infoLabelS, fontWeight: 'normal', width: '8px' }}>:</td>
                      <td style={infoValS}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Items Table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '40px' }}>ITEM</th>
            <th style={{ ...thS }}>Description</th>
            <th style={{ ...thS, width: '55px' }}>QTY</th>
            <th style={{ ...thS, width: '60px' }}>UNIT</th>
            <th style={{ ...thS, width: '80px' }}>REMARK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => (
            <tr key={i}>
              <td style={{ ...tdS, textAlign: 'center', verticalAlign: 'top' }}>
                {line !== null && i === 0 ? '1' : ''}
              </td>
              <td style={{ ...tdS, whiteSpace: 'pre-wrap' }}>{line ?? ''}</td>
              <td style={tdS}></td>
              <td style={tdS}></td>
              <td style={tdS}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ═══ Quality Assessment ═══ */}
      <div style={{ borderTop: '1.5px solid #333', paddingTop: '8px', marginBottom: '8px' }}>
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', marginBottom: '10px' }}>
          ประเมินคุณภาพและข้อเสนอแนะ
        </div>

        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '2px' }}>1. ประเมินความพึงพอใจต่อผลิตภัณฑ์ และงานบริการ</div>
        <div style={{ fontSize: '9pt', marginBottom: '4px', marginLeft: '12px' }}>ท่านมีความพึงพอใจต่อสินค้า และบริการ ในเรื่องความถูกต้อง สมบูรณ์ และสวยงามในระดับใด</div>
        <CheckboxRow label="" value={doc.qualityProduct} />

        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '2px' }}>2. ประเมินความพึงพอใจต่อฝ่ายขาย</div>
        <div style={{ fontSize: '9pt', marginBottom: '4px', marginLeft: '12px' }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การให้ข้อมูล ความรวดเร็วและการบริการของฝ่ายขายในระดับใด</div>
        <CheckboxRow label="" value={doc.qualitySales} />

        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '2px' }}>3. ประเมินความพึงพอใจต่อฝ่ายช่าง และติดตั้ง</div>
        <div style={{ fontSize: '9pt', marginBottom: '4px', marginLeft: '12px' }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การทำงานให้สำเร็จลุล่วง ถูกต้องตามสมบูรณ์ ตรงต่อเวลา และการบริการของฝ่ายช่างในระดับใด</div>
        <CheckboxRow label="" value={doc.qualityInstall} />
      </div>

      {/* ═══ Comment ═══ */}
      <div style={{ marginBottom: '16px' }}>
        <span style={{ fontWeight: 'bold', fontSize: '9pt' }}>COMMENT</span>
        <span style={{ display: 'inline-block', borderBottom: '1px dotted #555', width: 'calc(100% - 80px)', marginLeft: '8px' }}>
          {doc.comment || '\u00A0'}
        </span>
        <div style={{ borderBottom: '1px dotted #555', marginTop: '6px', height: '1px' }}></div>
        <div style={{ borderBottom: '1px dotted #555', marginTop: '10px', height: '1px' }}></div>
      </div>

      {/* ═══ Signature Block ═══ */}
      <table style={{ width: '100%', marginTop: '24px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', textAlign: 'center', paddingRight: '20px' }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '40px' }}>ผู้ตรวจรับงาน</div>
              <div style={{ borderBottom: '1px solid #555', width: '60%', margin: '0 auto 6px' }}></div>
              <div style={{ fontSize: '9pt' }}>...............................................</div>
              <div style={{ fontSize: '9pt', marginTop: '6px' }}>วันที่............/............./.............</div>
            </td>
            <td style={{ width: '50%', textAlign: 'center', paddingLeft: '20px' }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '40px' }}>ผู้ส่งมอบงาน</div>
              <div style={{ borderBottom: '1px solid #555', width: '60%', margin: '0 auto 6px' }}></div>
              <div style={{ fontSize: '9pt' }}>...............................................</div>
              <div style={{ fontSize: '9pt', marginTop: '6px' }}>วันที่............/............./.............</div>
            </td>
          </tr>
        </tbody>
      </table>

    </div>
  )
}
