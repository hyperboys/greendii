'use client'

import { useEffect } from 'react'
import type { PurchaseRequest, Settings } from '@/types'
import { resolveFileUrl } from '@/lib/api'

const PACK_CAP_NON_LAST = 20
const PACK_CAP_LAST = 11

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

function currencyPrefix(code?: string): string {
  const c = String(code || 'THB').trim().toUpperCase()
  if (c === 'THB') return '฿'
  if (c === 'USD') return '$'
  return `${c} `
}

function currencyCode(code?: string): string {
  const c = String(code || 'THB').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : 'THB'
}

function fmtDateTH(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function formatSignatureText(signatureText?: string | null, fullName?: string | null): string {
  if (signatureText?.trim()) return signatureText.trim()
  const name = fullName?.trim()
  if (!name) return ''
  const parts = name.split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

function splitDescriptionLines(note?: string): string[] {
  if (note == null) return []
  const lines = note.split('\n').map(v => v.trim())
  if (lines.length === 1 && lines[0] === '') return []
  return lines
}

function isImageAttachment(mimeType?: string, fileName?: string): boolean {
  if (String(mimeType || '').toLowerCase().startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(fileName || ''))
}

function attachmentUrl(fileUrl?: string, filename?: string): string {
  if (fileUrl && String(fileUrl).trim()) return resolveFileUrl(fileUrl)
  if (filename && String(filename).trim()) return resolveFileUrl(`/uploads/${filename}`)
  return ''
}

const DETAIL_ROWS_MARKER = '__PR_DETAIL_ROWS__'

function parseNoteParts(note?: string): { noteText: string; detailLines: string[] } {
  const raw = note ?? ''
  const markerIdx = raw.indexOf(DETAIL_ROWS_MARKER)
  if (markerIdx === -1) return { noteText: raw, detailLines: [] }
  const noteText = raw.slice(0, markerIdx).replace(/\n$/, '')
  const detailBlock = raw.slice(markerIdx + DETAIL_ROWS_MARKER.length).replace(/^\n/, '')
  const detailLines = detailBlock.length > 0 ? detailBlock.split('\n') : []
  return { noteText, detailLines }
}

function getPenultimateApprovalLog(doc: PurchaseRequest) {
  const historyLogs = [...(doc.approvalLogs ?? [])]
    .sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

  const latestSubmitAt = [...historyLogs]
    .reverse()
    .find(log => log.action === 'submit')?.actedAt

  const cycleLogs = latestSubmitAt
    ? historyLogs.filter(log => new Date(log.actedAt).getTime() >= new Date(latestSubmitAt).getTime())
    : historyLogs

  const approvedLogs = cycleLogs
    .filter(log => log.action === 'approve')
    .sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

  if (approvedLogs.length === 0) return null
  return approvedLogs[approvedLogs.length - 2] ?? approvedLogs[approvedLogs.length - 1]
}

function getLatestSubmitDate(doc: PurchaseRequest): string {
  const historyLogs = [...(doc.approvalLogs ?? [])]
    .sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime())

  const latestSubmitAt = [...historyLogs]
    .reverse()
    .find(log => log.action === 'submit')?.actedAt

  if (!latestSubmitAt) return ''

  const d = new Date(latestSubmitAt)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day}/${month}/${year} ${time}`
}

const prColumnWidths = ['5%', '40%', '8%', '8%', '13%', '13%', '13%'] as const

type PRItem = PurchaseRequest['items'][number]

interface PageChunk {
  items: PRItem[]
  isLast: boolean
  tail: boolean
}

function itemWeight(item: PRItem): number {
  const { noteText, detailLines } = parseNoteParts(item.note)
  const noteLines = splitDescriptionLines(noteText)
  const nonEmptyNoteLines = noteLines.filter(line => line.trim().length > 0).length
  const blankNoteLines = noteLines.length - nonEmptyNoteLines
  const nonEmptyDetailLines = detailLines.filter(line => line.trim().length > 0).length
  const blankDetailLines = detailLines.length - nonEmptyDetailLines
  const imageWeight = Array.isArray(item.images) ? item.images.length * 3 : 0

  return (
    1 +
    nonEmptyNoteLines * 0.6 +
    blankNoteLines * 0.3 +
    nonEmptyDetailLines * 0.6 +
    blankDetailLines * 0.3 +
    imageWeight
  )
}

function paginateItems(items: PRItem[]): PageChunk[] {
  if (items.length === 0) return [{ items: [], isLast: true, tail: true }]

  const rawPages: PRItem[][] = []
  let current: PRItem[] = []
  let currentWeight = 0

  for (const item of items) {
    const weight = itemWeight(item)
    if (current.length > 0 && currentWeight + weight > PACK_CAP_NON_LAST) {
      rawPages.push(current)
      current = [item]
      currentWeight = weight
    } else {
      current.push(item)
      currentWeight += weight
    }
  }
  if (current.length > 0) rawPages.push(current)

  const last = rawPages[rawPages.length - 1]
  let lastWeight = last.reduce((sum, item) => sum + itemWeight(item), 0)
  if (lastWeight > PACK_CAP_LAST && last.length > 1) {
    const overflow: PRItem[] = []
    while (lastWeight > PACK_CAP_LAST && last.length > 1) {
      const moved = last.pop() as PRItem
      overflow.unshift(moved)
      lastWeight -= itemWeight(moved)
    }
    if (overflow.length > 0) rawPages.push(overflow)
  }

  return rawPages.map((pageItems, pageIndex) => ({
    items: pageItems,
    isLast: pageIndex === rawPages.length - 1,
    tail: pageIndex === rawPages.length - 1,
  }))
}

interface Props {
  doc: PurchaseRequest
  settings: Settings | null
  embedPdfAttachments?: boolean
}

export default function PRPrint({ doc, settings, embedPdfAttachments = true }: Props) {
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
  const address       = settings?.address       || '98 Moo 6 T.Klongsii, A.KlongLuang, Pathumthani 12120'
  const addressTh     = '98 หมู่ 6 ต. คลองสี่ อ. คลองหลวง จ. ปทุมธานี  12120'
  const tel           = settings?.tel           || '662 150 7694 - 7  662 577 0907'
  // Per updated PR template the Fax segment is dropped from the Tel line.
  const telDisplay    = tel.replace(/\s*(?:Fax|แฟกซ์|แฟ็กซ์)\s*[:：]?.*$/i, '').trim()

  const border = '1px solid #000'
  const hasSpecialDiscount = Number(doc.specialDiscount) > 0
  const vatIncluded = Number(doc.vat) > 0
  const moneyCode = currencyCode(doc.currency)
  const showMoneyCode = moneyCode !== 'THB'
  const fmtMoneyWithCode = (amount: number | null | undefined) => {
    const value = fmtAmt(amount)
    if (!value) return ''
    return showMoneyCode ? `${moneyCode} ${value}` : value
  }
  const requesterSignature = formatSignatureText(doc.sales?.signatureText, doc.sales?.fullName)
  const requesterDate = getLatestSubmitDate(doc) || fmtDateTH(doc.dateIssue || doc.createdAt)
  const approvalSignatureLog = getPenultimateApprovalLog(doc)
  const approvalSignature = formatSignatureText(
    approvalSignatureLog?.approver?.signatureText,
    approvalSignatureLog?.approver?.fullName,
  )
  const approvalDate = approvalSignatureLog?.actedAt
    ? fmtDateTH(approvalSignatureLog.actedAt) + ' ' + new Date(approvalSignatureLog.actedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : ''
  const attachmentSheets = (Array.isArray(doc.attachments) ? doc.attachments : []).filter(att => {
    const hasSource = Boolean((att.fileUrl && String(att.fileUrl).trim()) || (att.filename && String(att.filename).trim()))
    if (!hasSource) return false
    if (isImageAttachment(att.mimeType, att.originalName || att.filename)) return true
    if (att.mimeType === 'application/pdf') return embedPdfAttachments
    return false
  })
  const pages = paginateItems(Array.isArray(doc.items) ? doc.items : [])
  const totalPages = pages.length + attachmentSheets.length

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

  const tdTotalFirstS: React.CSSProperties = {
    ...tdTotalS,
    borderTop: '0',
  }

  function renderFlexibleFillerRow(key: number) {
    const fillerTd: React.CSSProperties = {
      ...tdS,
      height: '100%',
      paddingTop: 0,
      paddingBottom: 0,
      lineHeight: 0,
      fontSize: 0,
    }

    return (
      <tr key={key} style={{ height: '100%' }}>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
        <td style={fillerTd}>&nbsp;</td>
      </tr>
    )
  }

  function renderItemsTable(chunk: PageChunk, pageIndex: number) {
    const itemOffset = pages.slice(0, pageIndex).reduce((sum, page) => sum + page.items.length, 0)
    return (
      <table style={{ width: '100%', flex: '1 1 0', minHeight: 0, height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border }}>
        <colgroup>
          {prColumnWidths.map((width, i) => <col key={i} style={{ width }} />)}
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
        <tbody style={{ height: '100%' }}>
          {chunk.items.map((item, i) => {
            const noteParts = parseNoteParts(item.note)
            const globalIndex = itemOffset + i
            return (
              <tr key={item.id ?? globalIndex}>
                <td style={{ ...tdS, textAlign: 'center' }}>{item?.partNo ?? ''}</td>
                <td style={{ ...tdS }}>
                  {item?.desc ?? ''}
                  {splitDescriptionLines(noteParts.noteText).map((line, idx) => (
                    <div key={idx} style={{ marginTop: idx === 0 ? '2px' : '0', whiteSpace: 'pre-wrap' }}>
                      {line || '\u00a0'}
                    </div>
                  ))}
                  {noteParts.detailLines.map((line, idx) => (
                    <div key={`detail-${idx}`} style={{ marginTop: idx === 0 ? '2px' : '0', whiteSpace: 'pre-wrap' }}>
                      {line || '\u00a0'}
                    </div>
                  ))}
                  {Array.isArray(item.images) && item.images.length > 0 && (
                    <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {item.images.map((url, imgIdx) => (
                        <img
                          key={`pr-item-img-${globalIndex}-${imgIdx}`}
                          src={resolveFileUrl(url)}
                          alt=""
                          style={{ width: '14mm', height: '14mm', objectFit: 'cover', border: '1px solid #d1d5db', borderRadius: '3px' }}
                        />
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ ...tdS, textAlign: 'center' }}>{item?.unit ?? ''}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmtQty(item.qty)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmtMoneyWithCode(item.price)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmtMoneyWithCode(item.amount)}</td>
                <td style={{ ...tdS }}></td>
              </tr>
            )
          })}
          {renderFlexibleFillerRow(chunk.items.length)}
        </tbody>
      </table>
    )
  }

  function renderSummaryAndSignatures() {
    return (
      <div style={{ marginTop: 'auto' }}>
        <div style={{ pageBreakInside: 'avoid' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '0px' }}>
            <colgroup>
              {prColumnWidths.map((width, i) => <col key={i} style={{ width }} />)}
            </colgroup>
            <tbody>
              {hasSpecialDiscount && (
                <tr>
                  <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
                  <td colSpan={2} style={{ ...tdTotalFirstS, textAlign: 'right' }}>ส่วนลดพิเศษ</td>
                  <td style={{ ...tdTotalFirstS, textAlign: 'right' }}>{fmtMoneyWithCode(doc.specialDiscount)}</td>
                  <td style={{ border: 'none' }}>&nbsp;</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
                <td colSpan={2} style={{ ...(hasSpecialDiscount ? tdTotalS : tdTotalFirstS), textAlign: 'right', fontWeight: 'bold' }}>รวมเงิน Sub Total</td>
                <td style={{ ...(hasSpecialDiscount ? tdTotalS : tdTotalFirstS), textAlign: 'right' }}>{fmtMoneyWithCode(doc.subTotal)}</td>
                <td style={{ border: 'none' }}>&nbsp;</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
                <td colSpan={2} style={{ ...tdTotalS, textAlign: 'right' }}>ภาษีมูลค่าเพิ่ม 7 % ( VAT)</td>
                <td style={{ ...tdTotalS, textAlign: 'right' }}>{fmtMoneyWithCode(vatIncluded ? doc.vat : 0)}</td>
                <td style={{ border: 'none' }}>&nbsp;</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ border: 'none' }}>&nbsp;</td>
                <td colSpan={2} style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>ยอดเงินสุทธิ Net Total</td>
                <td style={{ ...tdTotalS, textAlign: 'right', fontWeight: 'bold' }}>{fmtMoneyWithCode(doc.netTotal)}</td>
                <td style={{ border: 'none' }}>&nbsp;</td>
              </tr>
            </tbody>
          </table>

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
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '1.15em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-signature)',
                        fontStyle: 'italic',
                        fontSize: '14pt',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {requesterSignature || '\u00A0'}
                    </span>
                  </div>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>วันที่ / Date</span>
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '0.9em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {requesterDate || '\u00A0'}
                    </span>
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
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '1.15em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-signature)',
                        fontStyle: 'italic',
                        fontSize: '14pt',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {approvalSignature || '\u00A0'}
                    </span>
                  </div>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>วันที่ / Date</span>
                    <span
                      style={{
                        flex: 1,
                        borderBottom: '1px dotted #666',
                        minHeight: '0.9em',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        lineHeight: 1,
                        paddingBottom: '1px',
                      }}
                    >
                      {approvalDate || '\u00A0'}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div
      className="print-sheet pr-print"
      style={{
        fontFamily: 'var(--font-body)',
        color: '#000',
        fontSize: '11pt',
      }}
    >
      {pages.map((page, pageIndex) => (
      <div
        key={`pr-page-${pageIndex}`}
        className="pr-page"
        style={{
          minHeight: '277mm',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          pageBreakAfter: pageIndex < totalPages - 1 ? 'always' : 'auto',
          breakAfter: pageIndex < totalPages - 1 ? 'page' : 'auto',
          position: 'relative',
        }}
      >

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
            <td rowSpan={4} style={{ width: '190px', verticalAlign: 'top', paddingLeft: '10px', paddingTop: '2px' }}>
              <div style={{
                textAlign: 'center',
                fontWeight: 'bold',
                lineHeight: '1.2',
              }}>
                <div style={{ fontSize: '17pt' }}>ใบขอซื้อ </div>
                <div style={{ fontSize: '17pt' }}>PURCHASE REQUEST</div>
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
      {renderItemsTable(page, pageIndex)}

      {page.tail && renderSummaryAndSignatures()}
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
      ))}

      {attachmentSheets.map((att, ai) => {
        const isLastSheet = ai === attachmentSheets.length - 1
        const isImage = isImageAttachment(att.mimeType, att.originalName || att.filename)
        const url = attachmentUrl(att.fileUrl, att.filename)
        return (
          <div
            key={`pr-att-${att.id || att.filename || ai}`}
            className="pr-page pr-attachment-page"
            style={{
              minHeight: '277mm',
              display: 'flex',
              flexDirection: 'column',
              pageBreakAfter: pages.length + ai < totalPages - 1 ? 'always' : 'auto',
              breakAfter: pages.length + ai < totalPages - 1 ? 'page' : 'auto',
            }}
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={att.originalName || att.filename || ''}
                style={{ maxWidth: '100%', maxHeight: '277mm', objectFit: 'contain', margin: 'auto', display: 'block' }}
              />
            ) : (
              <iframe
                src={url}
                title={att.originalName || `pr-attachment-${ai + 1}`}
                style={{ width: '100%', height: '277mm', border: 'none', background: '#fff' }}
              />
            )}
          </div>
        )
      })}

    </div>
  )
}
