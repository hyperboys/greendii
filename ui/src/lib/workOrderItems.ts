import type { QuotationItem, WorkOrder, WorkOrderDetailRow, WorkOrderItem } from '@/types'
import { toPlainColoredLine, toPlainColoredMultiline } from '@/lib/coloredText'

export const createEmptyWorkOrderItem = (seq: number): WorkOrderItem => ({
  seq,
  desc: '',
  note: '',
  detailRows: [{ desc: '', qty: null, unit: '' }],
  qty: 1,
  unit: '',
  images: [],
})

function normalizeDetailRows(rows?: WorkOrderDetailRow[] | null): WorkOrderDetailRow[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      const desc = String(row?.desc ?? '').trim()
      const qty = row?.qty == null || row?.qty === '' ? null : Number(row.qty)
      return {
        desc,
        qty: Number.isFinite(qty) ? qty : null,
        unit: String(row?.unit ?? '').trim(),
      }
    })
    .filter((row) => row.desc || row.qty != null || row.unit)
}

function fallbackRowsFromNote(note?: string): WorkOrderDetailRow[] {
  const lines = String(note ?? '').split('\n').map((line) => line.trim())
  const rows = lines
    .map((line) => ({ desc: line, qty: null, unit: '' }))
    .filter((row) => row.desc)
  return rows
}

export function parseWorkOrderDetailRows(item?: Pick<WorkOrderItem, 'detailRows' | 'note'> | null): WorkOrderDetailRow[] {
  const fromRows = normalizeDetailRows(item?.detailRows)
  if (fromRows.length > 0) return fromRows

  const fromNote = fallbackRowsFromNote(item?.note)
  if (fromNote.length > 0) return fromNote

  return [{ desc: '', qty: null, unit: '' }]
}

export function stringifyWorkOrderDetailRows(rows: WorkOrderDetailRow[]): Pick<WorkOrderItem, 'detailRows' | 'note'> {
  const normalizedRows = normalizeDetailRows(rows)
  return {
    detailRows: normalizedRows,
    note: normalizedRows.map((row) => row.desc).join('\n'),
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
    ...stringifyWorkOrderDetailRows(parseWorkOrderDetailRows(item)),
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
      ...stringifyWorkOrderDetailRows(parseWorkOrderDetailRows(item)),
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
