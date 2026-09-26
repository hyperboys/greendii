import type { CSSProperties } from 'react'
import type { PRRevisionSnapshot, PurchaseRequest } from '@/types'
import { getPRRevisionDiff, type PRItemChange, type PRRevisionDiff } from '@/lib/prRevisionDiff'
import { parseColoredLine } from '@/lib/coloredText'

interface Props {
  doc: PurchaseRequest
  previous: PRRevisionSnapshot
  print?: boolean
}

const printCell: CSSProperties = { border: '1px solid #777', padding: '5px 7px', verticalAlign: 'top', wordBreak: 'break-word' }

function money(value: string, currency?: string) {
  if (value === '-') return value
  const amount = Number(value)
  return Number.isFinite(amount)
    ? `${currency && currency !== 'THB' ? `${currency} ` : ''}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
    : value
}

function describeItemChange(change: PRItemChange): string {
  const desc = change.after?.desc || change.before?.desc
  return (desc ? parseColoredLine(desc).text : '') || change.after?.partNo || change.before?.partNo || 'รายการไม่มีชื่อ'
}

function renderFieldChange(change: PRRevisionDiff['headerChanges'][number], print: boolean, currency?: string) {
  const value = (text: string) => change.label === 'ยอดรวม' || change.label === 'ส่วนลดพิเศษ' || change.label === 'VAT' || change.label === 'ยอดสุทธิ'
    ? money(text, currency)
    : text
  return (
    <tr key={change.label}>
      <td className="px-3 py-2 font-medium text-gray-700" style={print ? printCell : undefined}>{change.label}</td>
      <td className="px-3 py-2 text-red-700" style={print ? printCell : undefined}>{value(change.before)}</td>
      <td className="px-3 py-2 text-green-800" style={print ? printCell : undefined}>{value(change.after)}</td>
    </tr>
  )
}

export default function PRRevisionSummary({ doc, previous, print = false }: Props) {
  const diff = getPRRevisionDiff(previous, doc)
  const hasChanges = diff.headerChanges.length > 0 || diff.itemChanges.length > 0
    || diff.addedAttachments.length > 0 || diff.removedAttachments.length > 0
  const labelStyle: CSSProperties | undefined = print ? { background: '#f2f2f2', fontWeight: 700 } : undefined
  const titleClass = print ? 'text-base font-bold text-black' : 'text-base font-semibold text-gray-900'
  const mutedClass = print ? 'text-xs text-gray-700' : 'text-xs text-gray-500'

  return (
    <section className={print ? 'pr-revision-summary text-black' : 'card border border-amber-200 bg-amber-50 p-5 no-print'} style={print ? { fontSize: '10pt' } : undefined}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className={titleClass}>สรุปการแก้ไข Revision {doc.revisionNo ?? ''}</h3>
          <p className={mutedClass}>เปรียบเทียบกับ {previous.prNo}</p>
        </div>
        <p className={mutedClass}>{doc.prNo}</p>
      </header>

      <div className={print ? 'mb-4 border border-gray-500 p-2' : 'mb-4 rounded border border-amber-200 bg-white p-3'}>
        <div className={print ? 'mb-1 font-bold' : 'mb-1 text-sm font-semibold text-gray-700'}>เหตุผลในการแก้ไข</div>
        <p className="whitespace-pre-wrap">{doc.revisionReason?.trim() || 'ไม่มีการระบุเหตุผล'}</p>
      </div>

      {!hasChanges ? (
        <p className={print ? 'py-3 text-center font-semibold' : 'py-3 text-center text-sm text-gray-600'}>ไม่พบข้อมูลที่เปลี่ยนแปลงจากฉบับก่อนหน้า</p>
      ) : (
        <>
          {diff.headerChanges.length > 0 && (
            <div className="mb-4">
              <h4 className={print ? 'mb-1 font-bold' : 'mb-2 text-sm font-semibold text-gray-800'}>ข้อมูลเอกสารและยอดเงิน</h4>
              <table className={print ? 'w-full border-collapse' : 'w-full border-collapse bg-white text-sm'}>
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left" style={print ? { ...printCell, ...labelStyle } : undefined}>รายการ</th>
                    <th className="px-3 py-2 text-left" style={print ? { ...printCell, ...labelStyle } : undefined}>เดิม</th>
                    <th className="px-3 py-2 text-left" style={print ? { ...printCell, ...labelStyle } : undefined}>แก้เป็น</th>
                  </tr>
                </thead>
                <tbody>{diff.headerChanges.map(change => renderFieldChange(change, print, doc.currency))}</tbody>
              </table>
            </div>
          )}

          {diff.itemChanges.length > 0 && (
            <div className="mb-4">
              <h4 className={print ? 'mb-1 font-bold' : 'mb-2 text-sm font-semibold text-gray-800'}>รายการสินค้า/วัสดุ</h4>
              <div className={print ? '' : 'overflow-x-auto'}>
                <table className={print ? 'w-full border-collapse' : 'w-full min-w-[600px] border-collapse bg-white text-sm'}>
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left" style={print ? { ...printCell, ...labelStyle } : undefined}>สถานะ</th>
                      <th className="px-3 py-2 text-left" style={print ? { ...printCell, ...labelStyle } : undefined}>รายการ</th>
                      <th className="px-3 py-2 text-left" style={print ? { ...printCell, ...labelStyle } : undefined}>รายละเอียดที่เปลี่ยน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.itemChanges.map(change => (
                      <tr key={change.key}>
                        <td className="px-3 py-2 font-semibold" style={print ? printCell : undefined}>
                          {change.kind === 'added' ? 'เพิ่ม' : change.kind === 'removed' ? 'ลบ' : 'แก้ไข'}
                        </td>
                        <td className="px-3 py-2" style={print ? printCell : undefined}>
                          {change.kind === 'changed' ? `${describeItemChange(change)} (#${change.after?.seq ?? change.before?.seq ?? '-'})` : describeItemChange(change)}
                        </td>
                        <td className="px-3 py-2" style={print ? printCell : undefined}>
                          {change.kind === 'changed'
                            ? change.fields.map(field => `${field.label}: ${field.before} → ${field.after}`).join(' · ')
                            : change.kind === 'added'
                              ? `จำนวน ${change.after?.qty ?? 0} ${change.after?.unit ?? ''} · ราคา ${money(String(change.after?.price ?? 0), doc.currency)}`
                              : `เดิม ${change.before?.qty ?? 0} ${change.before?.unit ?? ''} · ราคา ${money(String(change.before?.price ?? 0), doc.currency)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(diff.addedAttachments.length > 0 || diff.removedAttachments.length > 0) && (
            <div className="mb-2">
              <h4 className={print ? 'mb-1 font-bold' : 'mb-2 text-sm font-semibold text-gray-800'}>ไฟล์แนบ</h4>
              <ul className={print ? 'list-disc pl-5' : 'list-disc space-y-1 pl-5 text-sm'}>
                {diff.addedAttachments.map(file => <li key={`added-${file.id}`}>เพิ่ม: {file.originalName}</li>)}
                {diff.removedAttachments.map(file => <li key={`removed-${file.id}`}>ไม่มีในฉบับนี้: {file.originalName}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}