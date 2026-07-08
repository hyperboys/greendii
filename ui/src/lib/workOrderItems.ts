import type { QuotationItem, WorkOrder, WorkOrderDetailRow, WorkOrderItem } from '@/types'
import { toPlainColoredLine, toPlainColoredMultiline } from '@/lib/coloredText'

const WORKORDER_NOTE_META_SEPARATOR = '\n\n__WO_NOTE_META__\n\n'

type WorkOrderNoteMeta = {
  noteBlocks?: string[]
  detailBeforeNote?: boolean
}

function parseWorkOrderNoteMeta(rawNote?: string | null): { detailNote: string; meta: WorkOrderNoteMeta } {
  const note = String(rawNote ?? '')
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
          ? parsed.noteBlocks.map((block) => String(block ?? ''))
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
  noteBlocks?: string[],
  detailBeforeNote?: boolean,
): string {
  const detailNote = detailRows.map((row) => row.desc).filter(Boolean).join('\n')
  const normalizedNoteBlocks = Array.isArray(noteBlocks)
    ? noteBlocks.map((block) => String(block ?? ''))
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
      const descRaw = String(row?.desc ?? '')
      const unitRaw = String(row?.unit ?? '')
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
  const lines = detailNote.split('\n').map((line) => line.trim())
  const rows = lines
    .map((line) => ({ desc: line, qty: null, unit: '' }))
    .filter((row) => row.desc)
  return rows
}

export function parseWorkOrderNoteBlocks(note?: string): string[] {
  const { meta } = parseWorkOrderNoteMeta(note)
  return Array.isArray(meta.noteBlocks) ? meta.noteBlocks : []
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
  options?: { noteBlocks?: string[]; detailBeforeNote?: boolean },
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
    desc: toPlainColoredLine(item.desc),
    ...stringifyWorkOrderDetailRows(fallbackRowsFromNote(toPlainColoredMultiline(item.note))),
    qty: Number(item.qty ?? 0),
    unit: item.unit ?? '',
    images: Array.isArray(item.images) ? item.images : [],
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
    desc: item.desc ?? '',
    qty: Number(item.qty ?? 0),
    unit: item.unit ?? '',
    images: Array.isArray(item.images) ? item.images : [],
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
      desc: String(item.desc ?? '').trim(),
      qty: Number(item.qty ?? 0),
      unit: String(item.unit ?? '').trim(),
      images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
    }))
    .filter(item => item.desc)
}

export function getWorkOrderItemsSource(doc?: Pick<WorkOrder, 'items' | 'quotation'> | null): WorkOrderItem[] {
  const ownItems = mapWorkOrderItems(doc?.items)
  if (ownItems.length > 0) return ownItems
  return mapQuotationItemsToWorkOrderItems(doc?.quotation?.items)
}
