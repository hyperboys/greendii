'use client'

import { useEffect, useMemo } from 'react'
import type { HandOverJob, Settings } from '@/types'

const PACK_CAP_NON_LAST = 26
const PACK_CAP_LAST = 10

interface Props {
  doc: HandOverJob
  settings: Settings | null
  onReady?: () => void
}

interface PageChunk {
  lines: string[]
  tail: boolean
}

function paginateLines(lines: string[]): PageChunk[] {
  if (lines.length === 0) return [{ lines: [], tail: true }]

  const rawPages: string[][] = []
  let current: string[] = []
  let count = 0

  for (const line of lines) {
    if (count + 1 > PACK_CAP_NON_LAST && current.length > 0) {
      rawPages.push(current)
      current = [line]
      count = 1
    } else {
      current.push(line)
      count += 1
    }
  }
  if (current.length > 0) rawPages.push(current)

  // Keep room on the last page for quality/comment/signatures.
  let last = rawPages[rawPages.length - 1]
  while (last.length > PACK_CAP_LAST) {
    const overflow = last.splice(PACK_CAP_LAST)
    rawPages.push(overflow)
    last = rawPages[rawPages.length - 1]
  }

  return rawPages.map((page, i) => ({
    lines: page,
    tail: i === rawPages.length - 1,
  }))
}

export default function HandoverPrint({ doc, settings, onReady }: Props) {
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

  const productLines = useMemo(
    () => (doc.product || '').split('\n').map(v => v.trim()).filter(Boolean),
    [doc.product],
  )
  const pages = useMemo(() => paginateLines(productLines), [productLines])
  const totalPages = pages.length

  useEffect(() => {
    if (!onReady) return
    requestAnimationFrame(() => { onReady() })
  }, [onReady, pages])

  const thS: React.CSSProperties = {
    border: borderTh,
    padding: '5px 6px',
    backgroundColor: '#dde',
    textAlign: 'center',
    fontSize: '10pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  }

  const tdS: React.CSSProperties = {
    border,
    padding: '4px 6px',
    fontSize: '10pt',
    verticalAlign: 'top',
    height: '23px',
  }

  const itemCellS: React.CSSProperties = {
    borderLeft: border,
    borderRight: border,
    padding: '4px 6px',
    fontSize: '10pt',
    verticalAlign: 'top',
    height: '23px',
    textAlign: 'center',
  }

  const labelS: React.CSSProperties = {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    fontSize: '10pt',
    color: '#333',
  }

  const valueS: React.CSSProperties = {
    fontSize: '10pt',
    borderBottom: '1px dotted #555',
    minWidth: '100px',
    paddingBottom: '2px',
  }

  const RATING_OPTS = [
    { v: 5, label: 'ดีมาก' },
    { v: 4, label: 'ดี' },
    { v: 3, label: 'ปานกลาง' },
    { v: 2, label: 'พอใช้' },
    { v: 1, label: 'ปรับปรุง' },
  ]

  const RatingTextRow = () => (
    <div style={{ marginBottom: '9px', fontSize: '10pt', lineHeight: 1.5, display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
      {RATING_OPTS.map((opt) => (
        <span key={opt.v} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              border: '1px solid #555',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              flexShrink: 0,
            }}
          />
          <span>{opt.label} ({opt.v})</span>
        </span>
      ))}
    </div>
  )

  function renderHeader(currentPage: number) {
    return (
      <>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ width: '118px', verticalAlign: 'middle', paddingRight: '10px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="Green Dii Co., Ltd." style={{ width: '106px', height: 'auto' }} />
              </td>
              <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12pt', lineHeight: 1.2 }}>{companyName}</div>
                <div style={{ fontWeight: 'bold', fontSize: '10.5pt', color: '#444', lineHeight: 1.2 }}>{companyNameEn}</div>
                <div style={{ fontSize: '8.6pt', color: '#555' }}>{address}</div>
                <div style={{ fontSize: '8.6pt', color: '#555' }}>โทร. {tel}&nbsp;&nbsp;Fax. +66 2150 7697</div>
                <div style={{ fontSize: '8.6pt', color: '#555' }}>TAX ID : {taxId}</div>
              </td>
              <td style={{ width: '210px', textAlign: 'center', borderLeft: '2px solid #555', paddingLeft: '12px', verticalAlign: 'middle' }}>
                <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#9e2f2f', letterSpacing: '1px', lineHeight: 1.15 }}>
                  HAND OVER JOB
                </div>
                <div style={{ fontSize: '9pt', marginTop: '6px', color: '#555' }}>Page {currentPage}/{totalPages}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', padding: '6px 9px', borderRight: border, verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Project',       doc.project || ''],
                      ['Contractor',    doc.contractor || ''],
                      ['Location',      doc.location || ''],
                      ['Contract Name', doc.contactName || ''],
                      ['Customer HP.',  doc.contactTel || ''],
                      ['Product',       productLines[0] || ''],
                    ].map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ ...labelS, paddingBottom: '6px', width: '132px', verticalAlign: 'top' }}>{label} :</td>
                        <td style={{ ...valueS, paddingBottom: '6px', width: '100%' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              <td style={{ width: '50%', padding: '6px 9px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Hand Over Job NO.', doc.hoNo],
                      ['Responsibility',    doc.responsibility || ''],
                      ['Quotation No. / Work order No.', `${doc.quotation?.quoNo || doc.workOrder?.quotation?.quoNo || '-'} / ${doc.workOrder?.woNo || '-'}`],
                      ['Sales',             doc.sales?.fullName || ''],
                      ['Date of service',   serviceDateStr],
                    ].map(([label, val]) => (
                      <tr key={label}>
                        <td style={{ ...labelS, paddingBottom: '6px', width: '180px', verticalAlign: 'top' }}>{label} :</td>
                        <td style={{ ...valueS, paddingBottom: '6px', width: '100%' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }

  function renderItemsTable(lines: string[], offset: number) {
    return (
      <>
        <div style={{ fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Details of Work
        </div>
        <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, borderCollapse: 'collapse', marginBottom: '8px', border }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: '40px' }}>ITEM</th>
              <th style={thS}>Description</th>
              <th style={{ ...thS, width: '70px' }}>QTY</th>
              <th style={{ ...thS, width: '70px' }}>UNIT</th>
              <th style={{ ...thS, width: '80px' }}>REMARK</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const globalIndex = offset + i
              return (
                <tr key={i}>
                  <td style={{ ...itemCellS, fontWeight: globalIndex === 0 ? 'bold' : 'normal' }}>{globalIndex === 0 ? '1' : ''}</td>
                  <td style={{ ...itemCellS, textAlign: 'left', whiteSpace: 'pre-wrap' }}>{line}</td>
                  <td style={itemCellS}></td>
                  <td style={itemCellS}></td>
                  <td style={itemCellS}></td>
                </tr>
              )
            })}
            <tr style={{ height: '100%' }}>
              <td style={{ ...itemCellS, height: '100%', fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, height: '100%', textAlign: 'left', fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, height: '100%', fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, height: '100%', fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
              <td style={{ ...itemCellS, height: '100%', fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }

  function renderTail() {
    return (
      <>
        <div style={{ border, padding: '8px 10px', marginBottom: '8px' }}>
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', marginBottom: '8px' }}>
            ประเมินคุณภาพและข้อเสนอแนะ
          </div>

          <div style={{ fontSize: '9.8pt', fontWeight: 'bold', marginBottom: '2px' }}>1. ประเมินความพึงพอใจต่อผลิตภัณฑ์ และงานบริการ</div>
          <div style={{ fontSize: '9.8pt', marginBottom: '3px', marginLeft: '12px', lineHeight: 1.35 }}>ท่านมีความพึงพอใจต่อสินค้า และบริการ ในเรื่องความถูกต้อง สมบูรณ์ และสวยงามในระดับใด</div>
          <div style={{ marginLeft: '12px' }}><RatingTextRow /></div>

          <div style={{ fontSize: '9.8pt', fontWeight: 'bold', marginBottom: '2px' }}>2. ประเมินความพึงพอใจต่อฝ่ายขาย</div>
          <div style={{ fontSize: '9.8pt', marginBottom: '3px', marginLeft: '12px', lineHeight: 1.35 }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การให้ข้อมูล ความรวดเร็วและการบริการของฝ่ายขายในระดับใด</div>
          <div style={{ marginLeft: '12px' }}><RatingTextRow /></div>

          <div style={{ fontSize: '9.8pt', fontWeight: 'bold', marginBottom: '2px' }}>3. ประเมินความพึงพอใจต่อฝ่ายช่าง และติดตั้ง</div>
          <div style={{ fontSize: '9.8pt', marginBottom: '3px', marginLeft: '12px', lineHeight: 1.35 }}>ท่านมีความพึงพอใจต่อการทำงาน ติดต่อประสานงาน การทำงานให้สำเร็จลุล่วง ถูกต้องตามสมบูรณ์ ตรงต่อเวลา และการบริการของฝ่ายช่างในระดับใด</div>
          <div style={{ marginLeft: '12px' }}><RatingTextRow /></div>
        </div>

        <div style={{ border, padding: '8px 10px', marginBottom: '8px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '9.5pt', marginBottom: '8px' }}>COMMENT</div>
          <div style={{ borderBottom: '1px dotted #555', minHeight: '16px', fontSize: '10pt' }}>
            {doc.comment || '\u00A0'}
          </div>
          <div style={{ borderBottom: '1px dotted #555', marginTop: '16px', height: '1px' }}></div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ border, padding: '8px 6px', textAlign: 'center', width: '50%' }}>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '28px' }}>ผู้ตรวจรับงาน</div>
                <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: '9pt' }}>(…………………………)</div>
                <div style={{ fontSize: '8.6pt', marginTop: '6px' }}>วันที่............/............./.............</div>
              </td>
              <td style={{ border, padding: '8px 6px', textAlign: 'center', width: '50%' }}>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '28px' }}>ผู้ส่งมอบงาน</div>
                <div style={{ borderTop: '1px dotted #555', width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: '9pt' }}>(…………………………)</div>
                <div style={{ fontSize: '8.6pt', marginTop: '6px' }}>วันที่............/............./.............</div>
              </td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }

  return (
    <div className="print-sheet handover-print" style={{ fontFamily: 'var(--font-body)', color: '#000', fontSize: '10pt' }}>
      {pages.map((page, pi) => {
        const offset = pages.slice(0, pi).reduce((sum, p) => sum + p.lines.length, 0)
        const pageNum = pi + 1
        const isLast = pageNum === totalPages
        return (
          <div
            key={pi}
            className="handover-page"
            style={{
              pageBreakAfter: isLast ? 'auto' : 'always',
              breakAfter: isLast ? 'auto' : 'page',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '281mm',
              position: 'relative',
            }}
          >
            {renderHeader(pageNum)}
            {renderItemsTable(page.lines, offset)}
            {page.tail && renderTail()}
            {!page.tail && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderTop: border,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
