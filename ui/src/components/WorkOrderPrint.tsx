'use client'

import { useEffect } from 'react'
import type { WorkOrder, Settings } from '@/types'

const MIN_ROWS = 12

interface Props {
  doc: WorkOrder
  settings: Settings | null
}

export default function WorkOrderPrint({ doc, settings }: Props) {
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const printTitle = `${doc.woNo}_${stamp}`
    const original = document.title
    const onBefore = () => { document.title = printTitle }
    const onAfter  = () => { document.title = original }
    window.addEventListener('beforeprint', onBefore)
    window.addEventListener('afterprint',  onAfter)
    return () => {
      window.removeEventListener('beforeprint', onBefore)
      window.removeEventListener('afterprint',  onAfter)
    }
  }, [doc.woNo])

  const companyName   = settings?.companyName   || 'บริษัท กรีนส์ดี จำกัด'
  const companyNameEn = settings?.companyNameEn || 'GREENdii CO., LTD'
  const address       = settings?.address       || '98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120'
  const tel           = settings?.tel           || '+662 150 7694-6'

  const border   = '1px solid #555'
  const borderTh = '1px solid #888'

  const checklist: Record<string, boolean> = (doc.docChecklist as Record<string, boolean>) ?? {}
  const chk = (key: string) => !!checklist[key]

  // Quotation items (if linked)
  const qItems = doc.quotation?.items ?? []
  const rows: (typeof qItems[number] | null)[] = [
    ...qItems,
    ...Array(Math.max(0, MIN_ROWS - qItems.length)).fill(null),
  ]

  const dateStr = doc.createdAt
    ? new Date(doc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''
  const installDateStr = doc.installDate
    ? new Date(doc.installDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'
  const qcDateStr = doc.qcDate
    ? new Date(doc.qcDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

  /* ─── style helpers ─── */
  const tdS: React.CSSProperties = {
    border,
    padding: '3px 5px',
    fontSize: '9pt',
    verticalAlign: 'top',
  }
  const thS: React.CSSProperties = {
    border: borderTh,
    padding: '4px 6px',
    backgroundColor: '#dde',
    textAlign: 'center',
    fontSize: '9pt',
    fontWeight: 'bold',
    verticalAlign: 'middle',
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

  const Checkbox = ({ label, checked }: { label: string; checked: boolean }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9pt', marginRight: '14px' }}>
      <span style={{
        display: 'inline-block', width: '11px', height: '11px',
        border: '1.5px solid #555', flexShrink: 0,
        background: checked ? '#333' : '#fff',
      }} />
      {label}
    </label>
  )

  return (
    <div className="print-sheet" style={{ fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '10pt' }}>

      {/* ═══ Header ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            {/* Logo */}
            <td style={{ width: '100px', verticalAlign: 'middle', paddingRight: '10px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="logo" style={{ width: '90px', height: 'auto' }} />
            </td>
            {/* Company info */}
            <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>{companyName}</div>
              <div style={{ fontWeight: 'bold', fontSize: '10pt', color: '#444' }}>{companyNameEn}</div>
              <div style={{ fontSize: '8pt', color: '#555' }}>{address}</div>
              <div style={{ fontSize: '8pt', color: '#555' }}>โทร. {tel}</div>
            </td>
            {/* Title */}
            <td style={{ width: '200px', textAlign: 'center', borderLeft: '2px solid #555', paddingLeft: '12px', verticalAlign: 'middle' }}>
              <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#cc0000', letterSpacing: '1px' }}>
                PROJECT
              </div>
              <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#cc0000', letterSpacing: '1px' }}>
                WORK FORM
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Info Table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', border }}>
        <tbody>
          <tr>
            {/* Left column */}
            <td style={{ width: '50%', padding: '5px 8px', borderRight: border, verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { th: 'PROJECT / โครงการ', val: doc.project },
                    { th: 'LOCATION / สถานที่', val: doc.location },
                    { th: 'PRODUCTS / สินค้า', val: doc.products },
                    { th: 'ผู้รับผิดชอบ', val: doc.responsibility },
                    { th: 'W/O No.', val: doc.woNo },
                  ].map(({ th, val }) => (
                    <tr key={th} style={{ marginBottom: '5px' }}>
                      <td style={{ ...labelS, paddingBottom: '5px', width: '130px', verticalAlign: 'top' }}>
                        {th} :
                      </td>
                      <td style={{ ...valueS, paddingBottom: '5px', width: '100%' }}>
                        {val || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            {/* Right column */}
            <td style={{ width: '50%', padding: '5px 8px', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { th: 'DATE / วันที่', val: dateStr },
                    { th: 'CUSTOMER / ลูกค้า', val: doc.customerName },
                    { th: 'CONTACT / ติดต่อ', val: doc.contactName },
                    { th: 'TEL / เบอร์ติดต่อ', val: doc.contactTel },
                    { th: 'SALES / พนักงานขาย', val: doc.sales?.fullName ?? doc.salesId },
                  ].map(({ th, val }) => (
                    <tr key={th} style={{ marginBottom: '5px' }}>
                      <td style={{ ...labelS, paddingBottom: '5px', width: '140px', verticalAlign: 'top' }}>
                        {th} :
                      </td>
                      <td style={{ ...valueS, paddingBottom: '5px', width: '100%' }}>
                        {val || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Details of Work ═══ */}
      <div style={{ fontWeight: 'bold', fontSize: '10pt', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Details of Work
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: '32px' }}>No.</th>
            <th style={{ ...thS, textAlign: 'left' }}>Description / รายละเอียด</th>
            <th style={{ ...thS, width: '50px' }}>Qty</th>
            <th style={{ ...thS, width: '50px' }}>Unit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={i} style={{ height: '20px' }}>
              <td style={{ ...tdS, textAlign: 'center' }}>{item ? (item.seq !== undefined ? item.seq + 1 : i + 1) : ''}</td>
              <td style={tdS}>
                {item?.desc ?? ''}
                {item?.note
                  ? <span style={{ color: '#555', fontSize: '7.5pt', display: 'block' }}>{item.note}</span>
                  : null}
              </td>
              <td style={{ ...tdS, textAlign: 'right' }}>{item?.qty != null ? item.qty : ''}</td>
              <td style={{ ...tdS, textAlign: 'center' }}>{item?.unit ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ═══ Remark ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...tdS, width: '70px', fontWeight: 'bold', verticalAlign: 'top' }}>Remark :</td>
            <td style={tdS}>{doc.remark ?? ''}</td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Team Assignment Checkboxes ═══ */}
      <div style={{ border, padding: '6px 8px', marginBottom: '8px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '9pt', marginBottom: '5px' }}>Team / ทีมงาน</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <Checkbox label="ส่งของอย่างเดียว" checked={chk('team_delivery_only')} />
          <Checkbox label="ทีมพื้น" checked={chk('team_floor')} />
          <Checkbox label="ทีมโรงงาน 2" checked={chk('team_factory2')} />
          <Checkbox label="ทีมติดตั้ง" checked={chk('team_install')} />
          <Checkbox label="ทีมประตู" checked={chk('team_door')} />
          <Checkbox label="ผู้รับเหมา" checked={chk('team_contractor')} />
        </div>
        {doc.teamAssignment && (
          <div style={{ fontSize: '8.5pt', color: '#444', marginTop: '4px' }}>
            หมายเหตุทีม: {doc.teamAssignment}
          </div>
        )}
      </div>

      {/* ═══ QC / Installation Date / Remark bottom table ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...tdS, fontWeight: 'bold', width: '200px', whiteSpace: 'nowrap' }}>
              QC Date<br /><span style={{ fontWeight: 'normal', fontSize: '8pt' }}>(วันที่ผ่านการ QC)</span>
            </td>
            <td style={tdS}>{qcDateStr}</td>
          </tr>
          <tr>
            <td style={{ ...tdS, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              Installation Date<br /><span style={{ fontWeight: 'normal', fontSize: '8pt' }}>(วันที่ติดตั้งแล้ว)</span>
            </td>
            <td style={tdS}>{installDateStr}</td>
          </tr>
          <tr>
            <td style={{ ...tdS, fontWeight: 'bold' }}>
              Remark<br /><span style={{ fontWeight: 'normal', fontSize: '8pt' }}>(หมายเหตุ)</span>
            </td>
            <td style={{ ...tdS, height: '30px' }}></td>
          </tr>
        </tbody>
      </table>

      {/* ═══ Document Checklist ═══ */}
      <div style={{ border, padding: '6px 8px', marginBottom: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              { left: { label: 'PO', key: 'doc_po' }, right: { label: 'PR', key: 'doc_pr' } },
              { left: { label: 'Quotation', key: 'doc_quotation' }, right: { label: 'Min', key: 'doc_min' } },
              { left: { label: 'Drawing Confirm', key: 'doc_drawing_confirm' }, right: { label: 'Waiting Confirm', key: 'doc_waiting_confirm' } },
              { left: { label: 'Hand Over Job', key: 'doc_handover' }, right: { label: 'Check List', key: 'doc_checklist' } },
            ].map(({ left, right }) => (
              <tr key={left.key}>
                <td style={{ padding: '2px 8px 2px 0', width: '50%' }}>
                  <Checkbox label={left.label} checked={chk(left.key)} />
                </td>
                <td style={{ padding: '2px 0', width: '50%' }}>
                  <Checkbox label={right.label} checked={chk(right.key)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ Signature Row ═══ */}
      {(() => {
        const sigCols = [
          { role: 'Sales',             name: doc.sales?.fullName ?? '' },
          { role: 'Sales Manager',     name: doc.approvalLogs?.find(l => l.step === 2)?.approver?.fullName ?? '' },
          { role: 'Project Manager',   name: doc.approvalLogs?.find(l => l.step === 4)?.approver?.fullName ?? '' },
          { role: 'Managing Director', name: doc.approvalLogs?.find(l => l.step === 5)?.approver?.fullName ?? '' },
        ]
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                {sigCols.map(({ role, name }) => (
                  <td key={role} style={{ border, padding: '4px 6px', textAlign: 'center', width: '25%' }}>
                    <div style={{ fontSize: '8.5pt', fontWeight: 'bold', marginBottom: '28px' }}>{role}</div>
                    <div style={{ borderTop: '1px dotted #555', marginBottom: '3px' }} />
                    <div style={{ fontSize: '8pt' }}>{name || '(…………………………)'}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )
      })()}

    </div>
  )
}
