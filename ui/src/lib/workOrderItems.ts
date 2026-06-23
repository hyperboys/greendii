import type { QuotationItem, WorkOrder, WorkOrderItem } from '@/types'

export const createEmptyWorkOrderItem = (seq: number): WorkOrderItem => ({
  seq,
  desc: '',
  note: '',
  qty: 1,
  unit: '',
  images: [],
})

export function parseWorkOrderDescLines(note?: string): string[] {
  const lines = (note ?? '').split('\n')
  return lines.length > 0 ? lines : ['']
}

export function stringifyWorkOrderDescLines(lines: string[]): string {
  return lines.join('\n')
}

export function mapQuotationItemsToWorkOrderItems(items?: QuotationItem[] | null): WorkOrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item, index) => ({
    seq: item.seq ?? index,
    desc: item.desc ?? '',
    note: item.note ?? '',
    qty: Number(item.qty ?? 0),
    unit: item.unit ?? '',
    images: Array.isArray(item.images) ? item.images : [],
  }))
}

export function mapWorkOrderItems(items?: WorkOrderItem[] | null): WorkOrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item, index) => ({
    seq: item.seq ?? index,
    desc: item.desc ?? '',
    note: item.note ?? '',
    qty: Number(item.qty ?? 0),
    unit: item.unit ?? '',
    images: Array.isArray(item.images) ? item.images : [],
  }))
}

export function normalizeWorkOrderItems(items?: WorkOrderItem[] | null): WorkOrderItem[] {
  return mapWorkOrderItems(items)
    .map((item, index) => ({
      seq: index,
      desc: String(item.desc ?? '').trim(),
      note: String(item.note ?? ''),
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
