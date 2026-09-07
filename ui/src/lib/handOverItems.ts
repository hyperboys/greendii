import type { HandOverItem, QuotationItem, WorkOrderDetailRow } from '@/types'
import { parseColoredLine, stringifyColoredLine, toPlainColoredLine, toPlainColoredMultiline } from '@/lib/coloredText'

const HANDOVER_NOTE_META_SEPARATOR = '\n\n__HO_NOTE_META__\n\n'
const HANDOVER_NOTE_META_TOKEN = '__HO_NOTE_META__'

function sanitizeHandOverText(value?: unknown, options?: { trim?: boolean }): string {
  const trim = options?.trim !== false
  const raw = String(value ?? '')
  const unescaped = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
  // Keep newline/tab characters so note blocks can still be parsed and rendered.
  const normalized = unescaped.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return trim ? normalized.trim() : normalized
}

type HandOverNoteMeta = {
  noteBlocks?: string[]
  detailBeforeNote?: boolean
}

export type HandOverNoteBlock = {
  text: string
  color?: string
}

function parseHandOverNoteMeta(rawNote?: string | null): { detailNote: string; meta: HandOverNoteMeta } {
  const note = sanitizeHandOverText(rawNote, { trim: false })
  if (!note.includes(HANDOVER_NOTE_META_TOKEN)) {
    return { detailNote: note, meta: {} }
  }

  const tokenIndex = note.indexOf(HANDOVER_NOTE_META_TOKEN)
  const detailNote = note.slice(0, tokenIndex).replace(/[\n\r\s]*$/, '')
  const rawMeta = note
    .slice(tokenIndex + HANDOVER_NOTE_META_TOKEN.length)
    .replace(/^[\n\r\s]*/, '')
  try {
    const parsed = JSON.parse(rawMeta || '{}') as HandOverNoteMeta
    return {
      detailNote,
      meta: {
        noteBlocks: Array.isArray(parsed.noteBlocks)
          ? parsed.noteBlocks.map((block) => sanitizeHandOverText(block, { trim: false }))
          : [],
        detailBeforeNote: parsed.detailBeforeNote === true,
      },
    }
  } catch {
    return { detailNote: note, meta: {} }
  }
}

export function getHandOverDetailNoteText(note?: string): string {
  return parseHandOverNoteMeta(note).detailNote
}

function buildHandOverNote(
  detailRows: WorkOrderDetailRow[],
  noteBlocks?: Array<string | HandOverNoteBlock>,
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

  const meta: HandOverNoteMeta = {}
  if (normalizedNoteBlocks.length > 0) meta.noteBlocks = normalizedNoteBlocks
  if (detailBeforeNote === true) meta.detailBeforeNote = true

  return `${detailNote}${HANDOVER_NOTE_META_SEPARATOR}${JSON.stringify(meta)}`
}

export const createEmptyHandOverItem = (seq: number): HandOverItem => ({
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
      const descRaw = sanitizeHandOverText(row?.desc, { trim: false })
      const unitRaw = sanitizeHandOverText(row?.unit, { trim: false })
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
  const { detailNote } = parseHandOverNoteMeta(note)
  const lines = detailNote.split('\n').map((line) => sanitizeHandOverText(line))
  const rows = lines
    .map((line) => ({ desc: line, qty: null, unit: '' }))
    .filter((row) => row.desc)
  return rows
}

export function parseHandOverNoteBlocks(note?: string): string[] {
  return parseHandOverColoredNoteBlocks(note).map((block) => block.text)
}

export function parseHandOverColoredNoteBlocks(note?: string): HandOverNoteBlock[] {
  const { meta } = parseHandOverNoteMeta(note)
  if (!Array.isArray(meta.noteBlocks)) return []
  return meta.noteBlocks.map((block) => {
    const parsed = parseColoredLine(sanitizeHandOverText(block, { trim: false }))
    return { text: parsed.text, color: parsed.color }
  })
}

export function parseHandOverDetailBeforeNote(note?: string): boolean {
  const { meta } = parseHandOverNoteMeta(note)
  return meta.detailBeforeNote === true
}

export function parseHandOverDetailRows(item?: Pick<HandOverItem, 'detailRows' | 'note'> | null): WorkOrderDetailRow[] {
  const fromRows = normalizeDetailRows(item?.detailRows, { keepEmpty: true, trimText: false })
  if (fromRows.length > 0) return fromRows

  const fromNote = fallbackRowsFromNote(item?.note)
  if (fromNote.length > 0) return fromNote

  return []
}

export function stringifyHandOverDetailRows(
  rows: WorkOrderDetailRow[],
  options?: { noteBlocks?: Array<string | HandOverNoteBlock>; detailBeforeNote?: boolean },
): Pick<HandOverItem, 'detailRows' | 'note'> {
  const normalizedRows = normalizeDetailRows(rows, { keepEmpty: true, trimText: false })
  return {
    detailRows: normalizedRows,
    note: buildHandOverNote(normalizedRows, options?.noteBlocks, options?.detailBeforeNote),
  }
}

export function mapQuotationItemsToHandOverItems(items?: QuotationItem[] | null): HandOverItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item, index) => ({
    seq: item.seq ?? index,
    desc: sanitizeHandOverText(toPlainColoredLine(item.desc), { trim: false }),
    ...stringifyHandOverDetailRows(fallbackRowsFromNote(toPlainColoredMultiline(item.note))),
    qty: Number(item.qty ?? 0),
    unit: sanitizeHandOverText(item.unit, { trim: false }),
    images: Array.isArray(item.images)
      ? item.images.map((url) => sanitizeHandOverText(url)).filter(Boolean)
      : [],
  }))
}

// Legacy items only had a single freeform `remark`; fold it into note blocks when no meta note exists yet.
export function mapHandOverItems(items?: HandOverItem[] | null): HandOverItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item, index) => {
    const hasMetaNote = parseHandOverColoredNoteBlocks(item.note).length > 0 || parseHandOverDetailBeforeNote(item.note)
    const legacyRemark = sanitizeHandOverText(item.remark, { trim: false })
    const noteBlocks = hasMetaNote
      ? parseHandOverColoredNoteBlocks(item.note)
      : (legacyRemark ? [{ text: legacyRemark }] : [])
    return {
      ...stringifyHandOverDetailRows(parseHandOverDetailRows(item), {
        noteBlocks,
        detailBeforeNote: parseHandOverDetailBeforeNote(item.note),
      }),
      seq: item.seq ?? index,
      desc: sanitizeHandOverText(item.desc, { trim: false }),
      qty: Number(item.qty ?? 0),
      unit: sanitizeHandOverText(item.unit, { trim: false }),
      images: Array.isArray(item.images)
        ? item.images.map((url) => sanitizeHandOverText(url)).filter(Boolean)
        : [],
    }
  })
}

export function normalizeHandOverItems(items?: HandOverItem[] | null): HandOverItem[] {
  return mapHandOverItems(items)
    .map((item, index) => ({
      ...stringifyHandOverDetailRows(normalizeDetailRows(parseHandOverDetailRows(item)), {
        noteBlocks: parseHandOverColoredNoteBlocks(item.note),
        detailBeforeNote: parseHandOverDetailBeforeNote(item.note),
      }),
      seq: index,
      desc: sanitizeHandOverText(item.desc),
      qty: Number(item.qty ?? 0),
      unit: sanitizeHandOverText(item.unit),
      images: Array.isArray(item.images)
        ? item.images.map((url) => sanitizeHandOverText(url)).filter(Boolean)
        : [],
    }))
    .filter(item => toPlainColoredLine(item.desc))
}
