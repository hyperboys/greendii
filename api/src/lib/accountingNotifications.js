const TYPES = Object.freeze({
  purchase_order: 'po', goods_receipt: 'gr', stock_issue: 'is', stock_return: 'sr',
  contractor_payment_request: 'ps', payment_voucher: 'pv', stock_opening_balance: 'opening',
  invoice: 'invoice', billing_note: 'bi', receipt_voucher: 'rv', credit_note: 'cn',
});
const ACTION_LABELS = Object.freeze({
  submit: 'ส่งอนุมัติ', approve: 'อนุมัติ', return: 'ส่งกลับแก้ไข', reject: 'ไม่อนุมัติ', cancel: 'ยกเลิก',
});

async function notifyAccountingAudit(tx, audit, document, actorId) {
  const docType = TYPES[audit.entityType];
  if (!docType || !Object.hasOwn(ACTION_LABELS, audit.action) || !document?.accountingApproval) return;
  // Loaded after the audit module is initialized to avoid the approval/audit import cycle.
  const { documentType, eligibleRecipientsForCycle } = require('./accountingApproval');
  const definition = documentType(docType);
  const messages = [];
  if (document.status === 'pending') {
    const recipients = await eligibleRecipientsForCycle(tx, docType, document);
    for (const userId of recipients) messages.push({
      userId, module: definition.module, docType, documentId: audit.entityId,
      docNo: audit.docNo, action: 'approval_required', text: `${audit.docNo || docType.toUpperCase()} รอคุณอนุมัติ`,
    });
  }
  const creatorId = document.createdById || document.salesId;
  if (creatorId && creatorId !== actorId &&
    ['approved', 'returned', 'rejected', 'cancelled'].includes(document.status)) {
    messages.push({
      userId: creatorId, module: definition.module, docType, documentId: audit.entityId,
      docNo: audit.docNo, action: audit.action, text: `${audit.docNo || docType.toUpperCase()} ${ACTION_LABELS[audit.action]}`,
    });
  }
  if (messages.length) await tx.accountingNotification.createMany({
    data: messages.map(message => ({ ...message, eventId: audit.id })), skipDuplicates: true,
  });
}

module.exports = { notifyAccountingAudit };
