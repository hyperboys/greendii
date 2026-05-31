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

  const border   = '1px solid #555'
  const borderTh = '1px solid #888'

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
    border: borderTh,
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

  const itemCellS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '3px 5px',
    fontSize: '9pt',
    verticalAlign: 'top',
    height: '20px',
    textAlign: 'center',
  }

  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '9pt',
    color: '#333',
  }

  const valueS: React.CSSProperties = {
    fontSize: '9pt',
    borderBottom: '1px dotted #555',
    minWidth: '100px',
    paddingBottom: '1px',
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
      {label ? <div style={{ fontSize: '9pt', marginBottom: '3px' }}>{label}</div> : null}
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

      {/* ═══ Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            {/* Logo */}
            <td style={{ width: '100px', verticalAlign: 'middle', paddingRight: '10px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '90px', height: 'auto' }} />
            </td>
            {/* Company info */}
            <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>{companyName}</div>
              <div style={{ fontWeight: 'bold', fontSize: '10pt', color: '#444' }}>{companyNameEn}</div>
              <div style={{ fontSize: '8pt', color: '#555' }}>{address}</div>
              <div style={{ fontSize: '8pt', color: '#555' }}>โทร. {tel}&nbsp;&nbsp;Fax. +66 2150 7697</div>
              <div style={{ fontSize: '8pt', color: '#555' }}>TAX ID : {taxId}</div>
            </td>
            {/* Title */}
            <td style={{ width: '200px', textAlign: 'center', borderLeft: '2px solid #555', paddingLeft: '12px', verticalAlign: 'middle' }}>
              <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#cc0000', letterSpacing: '1px' }}>
                HAND OVER
              </div>
              <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#cc0000', letterSpacing: '1px' }}>
                JOB
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Info Table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
        <tbody>
          <tr>
            {/* Left Column */}
            <td style={{ width: '50%', padding: '5px 8px', borderRight: border, verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Project',       doc.project || ''],
                    ['Contractor',    doc.contractor || ''],
                    ['Location',      doc.location || ''],
                    ['Contract Name', doc.contactName || ''],
                    ['Customer HP.',  doc.contactTel || ''],
                    ['Product',       doc.product ? doc.product.split('\n')[0] : ''],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ ...labelS, paddingBottom: '5px', width: '120px', verticalAlign: 'top' }}>
                        {label} :
                      </td>
                      <td style={{ ...valueS, paddingBottom: '5px', width: '100%' }}>
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            {/* Right Column */}
            <td style={{ width: '50%', padding: '5px 8px', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Hand Over Job NO.', doc.hoNo],
                    ['Responsibility',    doc.responsibility || ''],
                    ['Quotation No.',     doc.quotation?.quoNo || doc.workOrder?.quotation?.quoNo || ''],
                    ['Sales',             doc.sales?.fullName || ''],
                    ['Date of service',   serviceDateStr],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ ...labelS, paddingBottom: '5px', width: '130px', verticalAlign: 'top' }}>
                        {label} :
                      </td>
                      <td style={{ ...valueS, paddingBottom: '5px', width: '100%' }}>
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Details / Items Table ═══ */}
      <div style={{ fontWeight: 'bold', fontSize: '10pt', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Details of Work
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', border }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '40px' }}>ITEM</th>
            <th style={{ ...thS, textAlign: 'left' }}>Description</th>
            <th style={{ ...thS, width: '55px' }}>QTY</th>
            <th style={{ ...thS, width: '60px' }}>UNIT</th>
            <th style={{ ...thS, width: '80px' }}>REMARK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => (
            <tr key={i}>
              <td style={itemCellS}>
                {line !== null && i === 0 ? '1' : ''}
              </td>
              <td style={{ ...itemCellS, textAlign: 'left', whiteSpace: 'pre-wrap' }}>{line ?? ''}</td>
              <td style={itemCellS}></td>
              <td style={itemCellS}></td>
              <td style={itemCellS}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ═══ Quality Assessment ═══ */}
      <div style={{ border, padding: '8px 10px', marginBottom: '8px' }}>
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
      <div style={{ border, padding: '8px 10px', marginBottom: '10px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '9pt', marginBottom: '6px' }}>COMMENT</div>
        <div style={{ borderBottom: '1px dotted #555', minHeight: '14px', fontSize: '9pt' }}>
          {doc.comment || '\u00A0'}
        </div>
        <div style={{ borderBottom: '1px dotted #555', marginTop: '10px', height: '1px' }}></div>
        <div style={{ borderBottom: '1px dotted #555', marginTop: '10px', height: '1px' }}></div>
      </div>

      {/* ═══ Signature Block ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ border, padding: '8px 6px', textAlign: 'center', width: '50%' }}>
              <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '36px' }}>ผู้ตรวจรับงาน</div>
              <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 4px' }}></div>
              <div style={{ fontSize: '8pt' }}>(…………………………)</div>
              <div style={{ fontSize: '8pt', marginTop: '6px' }}>วันที่............/............./.............</div>
            </td>
            <td style={{ border, padding: '8px 6px', textAlign: 'center', width: '50%' }}>
              <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '36px' }}>ผู้ส่งมอบงาน</div>
              <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 4px' }}></div>
              <div style={{ fontSize: '8pt' }}>(…………………………)</div>
              <div style={{ fontSize: '8pt', marginTop: '6px' }}>วันที่............/............./.............</div>
            </td>
          </tr>
        </tbody>
      </table>

    </div>
  )
}
