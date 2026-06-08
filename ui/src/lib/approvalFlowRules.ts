export const EDITABLE_APPROVAL_DOC_STATUSES = ['draft', 'rejected'] as const

export const EDITABLE_APPROVAL_DOC_MESSAGE = 'แก้ไขได้เฉพาะเอกสารสถานะ Draft หรือ Rejected เท่านั้น'

export const APPROVAL_ATTACHMENT_LOCK_MESSAGE = 'ส่งอนุมัติแล้ว ต้องถูก reject ก่อนจึงจะแนบไฟล์เพิ่มได้'

export function isEditableApprovalDocStatus(status?: string | null) {
  return EDITABLE_APPROVAL_DOC_STATUSES.includes((status ?? '') as (typeof EDITABLE_APPROVAL_DOC_STATUSES)[number])
}