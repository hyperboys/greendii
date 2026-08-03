import type { QuotationItem, WorkOrder, WorkOrderDetailRow, WorkOrderItem } from '@/types'
import { parseColoredLine, stringifyColoredLine, toPlainColoredLine, toPlainColoredMultiline } from '@/lib/coloredText'

const WORKORDER_NOTE_META_SEPARATOR = '\n\n__WO_NOTE_META__\n\n'

function sanitizeWorkOrderText(value?: unknown, options?: { trim?: boolean }): string {
  const trim = options?.trim !== false
  const raw = String(value ?? '')
  const unescaped = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
  const normalized = unescaped.replace(/[\u0000-\u001F\u007F]/g, '')
  return trim ? normalized.trim() : normalized
}

type WorkOrderNoteMeta = {
  noteBlocks?: string[]
  detailBeforeNote?: boolean
}

export type WorkOrderNoteBlock = {
  text: string
  color?: string
}

function parseWorkOrderNoteMeta(rawNote?: string | null): { detailNote: string; meta: WorkOrderNoteMeta } {
  const note = sanitizeWorkOrderText(rawNote, { trim: false })
  if (!note.includes(WORKORDER_NOTE_META_SEPARATOR)) {
    return { detailNote: note, meta: {} }
  }

  const [detailNote, rawMeta] = note.split(WORKORDER_NOTE_META_SEPARATOR, 2)
  try {
    const parsed = JSON.parse(rawMeta || '{}') as WorkOrderNoteMeta
    return {
      detailNote,
      meta: {
        noteBlocks: Array.isArray(parsed.noteBlocks)
          ? parsed.noteBlocks.map((block) => sanitizeWorkOrderText(block, { trim: false }))
          : [],
        detailBeforeNote: parsed.detailBeforeNote === true,
      },
    }
  } catch {
    return { detailNote: note, meta: {} }
  }
}

export function getWorkOrderDetailNoteText(note?: string): string {
  return parseWorkOrderNoteMeta(note).detailNote
}

function buildWorkOrderNote(
  detailRows: WorkOrderDetailRow[],
  noteBlocks?: Array<string | WorkOrderNoteBlock>,
  detailBeforeNote?: boolean,
): string {
  const detailNote = detailRows
    .map((row) => toPlainColoredLine(row.desc))
    .filter(Boolean)
    .join('\n')
  const normalizedNoteBlocks = Array.isArray(noteBlocks)
    ? noteBlocks.map((block) => {
      if (typeof block === 'string') return String(block ?? '')
      return stringifyColoredLine({ text: String(block?.text ?? ''), color: block?.color })
    })
    : []

  if (normalizedNoteBlocks.length === 0 && detailBeforeNote !== true) return detailNote

  const meta: WorkOrderNoteMeta = {}
  if (normalizedNoteBlocks.length > 0) meta.noteBlocks = normalizedNoteBlocks
  if (detailBeforeNote === true) meta.detailBeforeNote = true

  return `${detailNote}${WORKORDER_NOTE_META_SEPARATOR}${JSON.stringify(meta)}`
}

export const createEmptyWorkOrderItem = (seq: number): WorkOrderItem => ({
  seq,
  desc: '',
  note: '',
  detailRows: [],
  qty: 1,
  unit: '',
  images: [],
})

function normalizeDetailRows(
  rows?: WorkOrderDetailRow[] | null,
  options?: { keepEmpty?: boolean; trimText?: boolean },
): WorkOrderDetailRow[] {
  const keepEmpty = options?.keepEmpty === true
  const trimText = options?.trimText !== false
  if (!Array.isArray(rows)) return []
  const normalized = rows
    .map((row) => {
      const descRaw = sanitizeWorkOrderText(row?.desc, { trim: false })
      const unitRaw = sanitizeWorkOrderText(row?.unit, { trim: false })
      const desc = trimText ? descRaw.trim() : descRaw
      const rawQty = row?.qty as unknown
      const qty = rawQty == null || rawQty === '' ? null : Number(rawQty)
      return {
        desc,
        qty: Number.isFinite(qty) ? qty : null,
        unit: trimText ? unitRaw.trim() : unitRaw,
      }
    })

  if (keepEmpty) return normalized
  return normalized.filter((row) => row.desc || row.qty != null || row.unit)
}

function fallbackRowsFromNote(note?: string): WorkOrderDetailRow[] {
  const { detailNote } = parseWorkOrderNoteMeta(note)
  const lines = detailNote.split('\n').map((line) => sanitizeWorkOrderText(line))
  const rows = lines
    .map((line) => ({ desc: line, qty: null, unit: '' }))
    .filter((row) => row.desc)
  return rows
}

export function parseWorkOrderNoteBlocks(note?: string): string[] {
  return parseWorkOrderColoredNoteBlocks(note).map((block) => block.text)
}

export function parseWorkOrderColoredNoteBlocks(note?: string): WorkOrderNoteBlock[] {
  const { meta } = parseWorkOrderNoteMeta(note)
  if (!Array.isArray(meta.noteBlocks)) return []
  return meta.noteBlocks.map((block) => {
    const parsed = parseColoredLine(sanitizeWorkOrderText(block, { trim: false }))
    return { text: parsed.text, color: parsed.color }
  })
}

export function parseWorkOrderDetailBeforeNote(note?: string): boolean {
  const { meta } = parseWorkOrderNoteMeta(note)
  return meta.detailBeforeNote === true
}

export function parseWorkOrderDetailRows(item?: Pick<WorkOrderItem, 'detailRows' | 'note'> | null): WorkOrderDetailRow[] {
  const fromRows = normalizeDetailRows(item?.detailRows, { keepEmpty: true, trimText: false })
  if (fromRows.length > 0) return fromRows

  const fromNote = fallbackRowsFromNote(item?.note)
  if (fromNote.length > 0) return fromNote

  return []
}

export function stringifyWorkOrderDetailRows(
  rows: WorkOrderDetailRow[],
  options?: { noteBlocks?: Array<string | WorkOrderNoteBlock>; detailBeforeNote?: boolean },
): Pick<WorkOrderItem, 'detailRows' | 'note'> {
  const normalizedRows = normalizeDetailRows(rows, { keepEmpty: true, trimText: false })
  return {
    detailRows: normalizedRows,
    note: buildWorkOrderNote(normalizedRows, options?.noteBlocks, options?.detailBeforeNote),
  }
}

export function mapQuotationItemsToWorkOrderItems(items?: QuotationItem[] | null): WorkOrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item, index) => ({
    seq: item.seq ?? index,
    desc: sanitizeWorkOrderText(toPlainColoredLine(item.desc), { trim: false }),
    ...stringifyWorkOrderDetailRows(fallbackRowsFromNote(toPlainColoredMultiline(item.note))),
    qty: Number(item.qty ?? 0),
    unit: sanitizeWorkOrderText(item.unit, { trim: false }),
    images: Array.isArray(item.images)
      ? item.images.map((url) => sanitizeWorkOrderText(url)).filter(Boolean)
      : [],
  }))
}

export function mapWorkOrderItems(items?: WorkOrderItem[] | null): WorkOrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item, index) => ({
    ...stringifyWorkOrderDetailRows(parseWorkOrderDetailRows(item), {
      noteBlocks: parseWorkOrderNoteBlocks(item.note),
      detailBeforeNote: parseWorkOrderDetailBeforeNote(item.note),
    }),
    seq: item.seq ?? index,
    desc: sanitizeWorkOrderText(item.desc, { trim: false }),
    qty: Number(item.qty ?? 0),
    unit: sanitizeWorkOrderText(item.unit, { trim: false }),
    images: Array.isArray(item.images)
      ? item.images.map((url) => sanitizeWorkOrderText(url)).filter(Boolean)
      : [],
  }))
}

export function normalizeWorkOrderItems(items?: WorkOrderItem[] | null): WorkOrderItem[] {
  return mapWorkOrderItems(items)
    .map((item, index) => ({
      ...stringifyWorkOrderDetailRows(normalizeDetailRows(parseWorkOrderDetailRows(item)), {
        noteBlocks: parseWorkOrderNoteBlocks(item.note),
        detailBeforeNote: parseWorkOrderDetailBeforeNote(item.note),
      }),
      seq: index,
      desc: sanitizeWorkOrderText(item.desc),
      qty: Number(item.qty ?? 0),
      unit: sanitizeWorkOrderText(item.unit),
      images: Array.isArray(item.images)
        ? item.images.map((url) => sanitizeWorkOrderText(url)).filter(Boolean)
        : [],
    }))
    .filter(item => toPlainColoredLine(item.desc))
}

export function getWorkOrderItemsSource(doc?: Pick<WorkOrder, 'items' | 'quotation'> | null): WorkOrderItem[] {
  const ownItems = mapWorkOrderItems(doc?.items)
  if (ownItems.length > 0) return ownItems
  return mapQuotationItemsToWorkOrderItems(doc?.quotation?.items)
}
