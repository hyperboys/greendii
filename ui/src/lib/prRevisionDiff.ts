import type { PRItem, PRRevisionSnapshot, PurchaseRequest } from '@/types'
import { parseColoredLine } from '@/lib/coloredText'
import { parsePRDescription } from '@/lib/prDescription'

export interface PRValueChange {
  label: string
  before: string
  after: string
}

export interface PRItemFieldChange extends PRValueChange {}

export interface PRItemChange {
  kind: 'added' | 'removed' | 'changed'
  key: string
  before?: PRItem
  after?: PRItem
  fields: PRItemFieldChange[]
}

export interface PRRevisionDiff {
  headerChanges: PRValueChange[]
  itemChanges: PRItemChange[]
  addedAttachments: NonNullable<PRRevisionSnapshot['attachments']>
  removedAttachments: NonNullable<PRRevisionSnapshot['attachments']>
}

const itemFields: Array<{ key: keyof PRItem; label: string }> = [
  { key: 'seq', label: 'ลำดับรายการ' },
  { key: 'partNo', label: 'รหัส P/N' },
  { key: 'desc', label: 'รายการ' },
  { key: 'note', label: 'รายละเอียดเพิ่มเติม' },
  { key: 'qty', label: 'จำนวน' },
  { key: 'unit', label: 'หน่วย' },
  { key: 'price', label: 'ราคาต่อหน่วย' },
  { key: 'amount', label: 'จำนวนเงิน' },
  { key: 'images', label: 'รูปภาพรายการ' },
]

function text(value: unknown): string {
  if (value == null || value === '') return '-'
  if (Array.isArray(value)) return value.length ? `${value.length} รูป` : '-'
  return String(value)
}

function numeric(value: unknown): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

function sameValue(left: unknown, right: unknown, isNumeric = false): boolean {
  if (isNumeric) return numeric(left) === numeric(right)
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
  return String(left ?? '').trim() === String(right ?? '').trim()
}

function attachmentKey(file: NonNullable<PRRevisionSnapshot['attachments']>[number]): string {
  return file.filename || `${file.originalName.trim().toLocaleLowerCase()}|${file.mimeType}|${file.size}`
}

function comparableItemValue(item: PRItem, key: keyof PRItem): unknown {
  if (key === 'desc') return JSON.stringify(parseColoredLine(String(item.desc ?? '')))
  if (key === 'note') {
    return JSON.stringify(parsePRDescription(item.note, 0).map(block => ({
      type: block.type,
      text: block.text,
      color: block.color,
      imageIndex: block.imageIndex,
    })))
  }
  return item[key]
}

function displayItemValue(item: PRItem, key: keyof PRItem): string {
  if (key === 'desc') return parseColoredLine(String(item.desc ?? '')).text || '-'
  if (key === 'note') {
    const blocks = parsePRDescription(item.note, 0)
    return blocks.map(block => block.type === 'image' ? `[รูป ${Number(block.imageIndex) + 1}]` : block.text || '').filter(Boolean).join('\n') || '-'
  }
  return text(item[key])
}

function diffAttachments(
  before: NonNullable<PRRevisionSnapshot['attachments']>,
  after: NonNullable<PRRevisionSnapshot['attachments']>,
) {
  const remaining = new Map<string, number>()
  for (const file of after) remaining.set(attachmentKey(file), (remaining.get(attachmentKey(file)) ?? 0) + 1)

  const removedAttachments: typeof before = []
  for (const file of before) {
    const key = attachmentKey(file)
    const count = remaining.get(key) ?? 0
    if (count > 0) remaining.set(key, count - 1)
    else removedAttachments.push(file)
  }

  const prior = new Map<string, number>()
  for (const file of before) prior.set(attachmentKey(file), (prior.get(attachmentKey(file)) ?? 0) + 1)
  const addedAttachments: typeof after = []
  for (const file of after) {
    const key = attachmentKey(file)
    const count = prior.get(key) ?? 0
    if (count > 0) prior.set(key, count - 1)
    else addedAttachments.push(file)
  }
  return { addedAttachments, removedAttachments }
}

export function getPRRevisionDiff(
  previous: PRRevisionSnapshot,
  current: PurchaseRequest,
): PRRevisionDiff {
  const headerFields: Array<{ label: string; before: unknown; after: unknown }> = [
    { label: 'Supplier', before: previous.customer, after: current.customer },
    { label: 'Project Ref', before: previous.projectRef, after: current.projectRef },
    { label: 'อ้างอิง WO', before: previous.workOrder?.woNo ?? previous.workOrderId, after: current.workOrder?.woNo ?? current.workOrderId },
    { label: 'ประเภท PR', before: previous.prType?.name ?? previous.prTypeId, after: current.prType?.name ?? current.prTypeId },
    { label: 'Date of Issue', before: previous.dateIssue?.slice(0, 10), after: current.dateIssue?.slice(0, 10) },
    { label: 'Date of Required', before: previous.dateRequired?.slice(0, 10), after: current.dateRequired?.slice(0, 10) },
    { label: 'สกุลเงิน', before: previous.currency || 'THB', after: current.currency || 'THB' },
    { label: 'ยอดรวม', before: previous.subTotal, after: current.subTotal },
    { label: 'ส่วนลดพิเศษ', before: previous.specialDiscount, after: current.specialDiscount },
    { label: 'VAT', before: previous.vat, after: current.vat },
    { label: 'ยอดสุทธิ', before: previous.netTotal, after: current.netTotal },
    { label: 'Remarks', before: previous.remarks, after: current.remarks },
  ]
  const numericHeaderLabels = new Set(['ยอดรวม', 'ส่วนลดพิเศษ', 'VAT', 'ยอดสุทธิ'])
  const headerChanges = headerFields
    .filter(field => !sameValue(field.before, field.after, numericHeaderLabels.has(field.label)))
    .map(field => ({ label: field.label, before: text(field.before), after: text(field.after) }))

  const previousItems = new Map((previous.items ?? []).map((item, index) => [item.revisionKey || item.id || `previous-${index}`, item]))
  const currentItems = new Map((current.items ?? []).map((item, index) => [item.revisionKey || item.id || `current-${index}`, item]))
  const itemChanges: PRItemChange[] = []

  for (const [key, before] of Array.from(previousItems.entries())) {
    const after = currentItems.get(key)
    if (!after) {
      itemChanges.push({ kind: 'removed', key, before, fields: [] })
      continue
    }
    const fields = itemFields
      .filter(field => !sameValue(
        comparableItemValue(before, field.key),
        comparableItemValue(after, field.key),
        ['qty', 'price', 'amount'].includes(field.key),
      ))
      .map(field => ({
        label: field.label,
        before: displayItemValue(before, field.key),
        after: displayItemValue(after, field.key),
      }))
    if (fields.length > 0) itemChanges.push({ kind: 'changed', key, before, after, fields })
  }

  for (const [key, after] of Array.from(currentItems.entries())) {
    if (!previousItems.has(key)) itemChanges.push({ kind: 'added', key, after, fields: [] })
  }

  const attachments = diffAttachments(previous.attachments ?? [], current.attachments ?? [])
  return { headerChanges, itemChanges, ...attachments }
}