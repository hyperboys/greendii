const EDITABLE_APPROVAL_DOC_STATUSES = ['draft', 'rejected'];

const EDITABLE_APPROVAL_DOC_MESSAGE = 'แก้ไขได้เฉพาะเอกสารสถานะ Draft หรือ Rejected เท่านั้น';

const APPROVAL_ATTACHMENT_LOCK_MESSAGE = 'ส่งอนุมัติแล้ว ต้องถูก reject ก่อนจึงจะแนบไฟล์เพิ่มได้';

function isEditableApprovalDocStatus(status) {
  return EDITABLE_APPROVAL_DOC_STATUSES.includes(status);
}

module.exports = {
  EDITABLE_APPROVAL_DOC_STATUSES,
  EDITABLE_APPROVAL_DOC_MESSAGE,
  APPROVAL_ATTACHMENT_LOCK_MESSAGE,
  isEditableApprovalDocStatus,
};