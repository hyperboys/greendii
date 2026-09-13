/**
 * statusModel.ts — Shared Document Status Model for Frontend UI
 */

export const STANDARD_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PENDING_APPROVAL: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const;

export type DocumentStatus = (typeof STANDARD_STATUS)[keyof typeof STANDARD_STATUS];

export const STATUS_LABELS_TH: Record<string, string> = {
  [STANDARD_STATUS.DRAFT]: 'แบบร่าง',
  [STANDARD_STATUS.SUBMITTED]: 'ยื่นเอกสารแล้ว',
  [STANDARD_STATUS.PENDING_APPROVAL]: 'รออนุมัติ',
  [STANDARD_STATUS.APPROVED]: 'อนุมัติแล้ว',
  [STANDARD_STATUS.REJECTED]: 'ปฏิเสธ',
  [STANDARD_STATUS.RETURNED]: 'ส่งกลับแก้ไข',
  [STANDARD_STATUS.CANCELLED]: 'ยกเลิก',
  [STANDARD_STATUS.COMPLETED]: 'เสร็จสิ้น',
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  [STANDARD_STATUS.DRAFT]: 'bg-gray-100 text-gray-800 border-gray-300',
  [STANDARD_STATUS.SUBMITTED]: 'bg-blue-50 text-blue-800 border-blue-200',
  [STANDARD_STATUS.PENDING_APPROVAL]: 'bg-amber-50 text-amber-800 border-amber-200',
  [STANDARD_STATUS.APPROVED]: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  [STANDARD_STATUS.REJECTED]: 'bg-rose-50 text-rose-800 border-rose-200',
  [STANDARD_STATUS.RETURNED]: 'bg-orange-50 text-orange-800 border-orange-200',
  [STANDARD_STATUS.CANCELLED]: 'bg-slate-100 text-slate-600 border-slate-300',
  [STANDARD_STATUS.COMPLETED]: 'bg-teal-50 text-teal-800 border-teal-200',
};

export function getStatusLabelTh(status?: string | null): string {
  if (!status) return 'แบบร่าง';
  const key = String(status).trim().toLowerCase();
  return STATUS_LABELS_TH[key] || status;
}

export function getStatusBadgeClass(status?: string | null): string {
  if (!status) return STATUS_BADGE_CLASSES[STANDARD_STATUS.DRAFT];
  const key = String(status).trim().toLowerCase();
  return STATUS_BADGE_CLASSES[key] || 'bg-gray-100 text-gray-700 border-gray-200';
}
