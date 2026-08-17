'use client'

import { useEffect, useState } from 'react'
import type { PurchaseRequest, Settings } from '@/types'
import { resolveFileUrl } from '@/lib/api'
import { formatBangkokDate, formatBangkokDateTime } from '@/lib/timezone'
import { parsePRDescription, type PRDescriptionBlock } from '@/lib/prDescription'

const PACK_CAP_NON_LAST = 20
const PACK_CAP_LAST = 11

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}

function currencyCode(code?: string): string {
  const c = String(code || 'THB').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : 'THB'
}

function fmtDateTH(dateStr?: string): string {
  return formatBangkokDate(dateStr)
}

function formatSignatureText(signatureText?: string | null, fullName?: string | null): string {
  if (signatureText?.trim()) return signatureText.trim()
  const name = fullName?.trim()
  if (!name) return ''
  const parts = name.split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
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

  return formatBangkokDateTime(latestSubmitAt)
}

const prColumnWidths = ['6%', '38%', '8%', '10%', '16%', '22%'] as const

type PRDescriptionGroup =
  | { type: 'images'; blocks: PRDescriptionBlock[] }
  | { type: 'text'; block: PRDescriptionBlock }

// Consecutive image blocks share one grid so landscape/portrait images can tile like WO/QT.
function groupPRDescriptionBlocks(blocks: PRDescriptionBlock[]): PRDescriptionGroup[] {
  const groups: PRDescriptionGroup[] = []
  for (const block of blocks) {
    if (block.type !== 'image') {
      groups.push({ type: 'text', block })
      continue
    }
    const last = groups[groups.length - 1]
    if (last?.type === 'images') last.blocks.push(block)
    else groups.push({ type: 'images', blocks: [block] })
  }
  return groups
}

type PRItem = PurchaseRequest['items'][number]

interface PageChunk {
  items: PRItem[]
  isLast: boolean
  tail: boolean
}

function itemWeight(item: PRItem): number {
  const blocks = parsePRDescription(item.note, item.images?.length ?? 0)
  const textLines = blocks.filter(block => block.type !== 'image')
  const nonEmptyDetailLines = textLines.filter(block => block.text?.trim().length).length
  const blankDetailLines = textLines.length - nonEmptyDetailLines
  // Images tile 3 per grid row at ~34mm tall, so weight is per row rather than per image.
  const imageCount = Array.isArray(item.images) ? item.images.length : 0
  const imageWeight = Math.ceil(imageCount / 3) * 7

  return (
    1 +
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
  const [imageOrientation, setImageOrientation] = useState<Record<string, 'landscape' | 'portrait'>>({})

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
  const remarksText = String(doc.remarks || '').trim()
  const hasSpecialDiscount = Number(doc.specialDiscount) > 0
  const vatIncluded = Number(doc.vat) > 0
  const moneyCode = currencyCode(doc.currency)
  const showMoneyCode = moneyCode !== 'THB'
  const fmtMoneyWithCode = (amount: number | null | undefined) => {
    const value = fmtAmt(amount)
    if (!value) return ''
    return showMoneyCode ? `${moneyCode} ${value}` : value
  }
  const fmtItemMoney = (amount: number | null | undefined) => (Number(amount) === 0 ? '' : fmtMoneyWithCode(amount))

  function getImageKey(itemIndex: number, imageIndex: number, url: string): string {
    return `${itemIndex}::${imageIndex}::${url}`
  }

  function onImageLoad(imageKey: string, naturalWidth: number, naturalHeight: number) {
    if (!naturalWidth || !naturalHeight) return
    const next: 'landscape' | 'portrait' = naturalWidth > naturalHeight ? 'landscape' : 'portrait'
    setImageOrientation(prev => (prev[imageKey] === next ? prev : { ...prev, [imageKey]: next }))
  }
  const requesterSignature = formatSignatureText(doc.sales?.signatureText, doc.sales?.fullName)
  const requesterDate = getLatestSubmitDate(doc) || fmtDateTH(doc.dateIssue || doc.createdAt)
  const approvalSignatureLog = getPenultimateApprovalLog(doc)
  const approvalSignature = formatSignatureText(
    approvalSignatureLog?.approver?.signatureText,
    approvalSignatureLog?.approver?.fullName,
  )
  const approvalDate = approvalSignatureLog?.actedAt
    ? formatBangkokDateTime(approvalSignatureLog.actedAt)
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

  const summaryLabelS: React.CSSProperties = {
    border,
    padding: '5px 10px',
    fontSize: '12pt',
    textAlign: 'right',
    verticalAlign: 'middle',
    backgroundColor: '#fff',
  }

  const summaryAmountS: React.CSSProperties = {
    ...summaryLabelS,
    width: '22%',
    textAlign: 'right',
    whiteSpace: 'nowrap',
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
          </tr>
        </thead>
        <tbody style={{ height: '100%' }}>
          {chunk.items.map((item, i) => {
            const globalIndex = itemOffset + i
            return (
              <tr key={item.id ?? globalIndex}>
                <td style={{ ...tdS, textAlign: 'center' }}>{item?.partNo ?? ''}</td>
                <td style={{ ...tdS }}>
                  {item?.desc ?? ''}
                  {groupPRDescriptionBlocks(parsePRDescription(item.note, item.images?.length ?? 0)).map((group, groupIdx) => group.type === 'images' ? (
                    <div
                      key={`description-images-${groupIdx}`}
                      style={{
                        marginTop: '1.8mm',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gridAutoFlow: 'dense',
                        gap: '1.6mm',
                        alignItems: 'start',
                        width: '100%',
                      }}
                    >
                      {group.blocks.map((block, idx) => {
                        const url = item.images?.[block.imageIndex ?? -1] || ''
                        const imageKey = getImageKey(globalIndex, block.imageIndex ?? idx, url)
                        const isLandscape = imageOrientation[imageKey] === 'landscape'
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={imageKey}
                            src={resolveFileUrl(url)}
                            alt=""
                            onLoad={(e) => onImageLoad(imageKey, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                            style={{
                              width: '100%',
                              height: 'auto',
                              maxHeight: '34mm',
                              objectFit: 'contain',
                              display: 'block',
                              gridColumn: isLandscape ? 'span 2' : 'span 1',
                            }}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <div key={`description-${groupIdx}`} style={{ marginTop: '2px', whiteSpace: 'pre-wrap', color: group.block.color || undefined }}>
                      {group.block.text || '\u00a0'}
                    </div>
                  ))}
                </td>
                <td style={{ ...tdS, textAlign: 'center' }}>{item?.unit ?? ''}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmtQty(item.qty)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmtItemMoney(item.price)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmtItemMoney(item.amount)}</td>
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
      <div>
        <div style={{ pageBreakInside: 'avoid' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '0px', border }}>
            <colgroup>
              <col style={{ width: '78%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td
                  colSpan={2}
                  style={{
                    ...tdTotalFirstS,
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>หมายเหตุ / Remarks : </span>
                  {remarksText || '\u00A0'}
                </td>
              </tr>
              <tr>
                <td style={{ ...summaryLabelS, fontWeight: 'bold' }}>รวมเป็นเงิน (Sub Total)</td>
                <td style={summaryAmountS}>{fmtMoneyWithCode(doc.subTotal)}</td>
              </tr>
              {hasSpecialDiscount && (
                <tr>
                  <td style={summaryLabelS}>ส่วนลดพิเศษ</td>
                  <td style={summaryAmountS}>{fmtMoneyWithCode(doc.specialDiscount)}</td>
                </tr>
              )}
              <tr>
                <td style={summaryLabelS}>ภาษีมูลค่าเพิ่ม 7% (VAT)</td>
                <td style={summaryAmountS}>{fmtMoneyWithCode(vatIncluded ? doc.vat : 0)}</td>
              </tr>
              <tr>
                <td style={{ ...summaryLabelS, fontWeight: 'bold', backgroundColor: '#eef6e7', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>ยอดรวมสุทธิ (Net Total)</td>
                <td style={{ ...summaryAmountS, fontWeight: 'bold', backgroundColor: '#eef6e7', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>{fmtMoneyWithCode(doc.netTotal)}</td>
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
            <td colSpan={2} style={{ border, padding: '5px 8px', fontSize: '12pt' }}>
              <span style={{ fontWeight: 'bold' }}>Date of Required : </span>{fmtDateTH(doc.dateRequired)}
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
