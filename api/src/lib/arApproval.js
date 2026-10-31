const { invalid } = require('./deliveryOrder');
const { ROLLOUT_READY, planApproval, currentCycle } = require('./accountingApproval');
const { getAccountingAccess, hasAccountingPermission } = require('./accountingAccess');

function arActionPermission(action) {
  return async (req, res, next) => {
    try {
      const permission = ['approve', 'return', 'reject'].includes(action) ? 'approve' : 'create';
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', permission)) {
        return res.status(403).json({ message: 'ไม่มีสิทธิ์ดำเนินการเอกสาร AR' });
      }
      next();
    } catch (error) { next(error); }
  };
}

async function arTransition(tx, docType, document, action, actorId, reason) {
  const cycle = currentCycle(document);
  const editable = document.status === 'draft' || (document.status === 'returned' && cycle?.state === 'returned');
  if (['submit', 'confirm'].includes(action) && !editable) invalid('ส่ง/ยืนยันได้เฉพาะ Draft หรือเอกสารที่ส่งกลับ', 409);
  if (['approve', 'return', 'reject'].includes(action) && (!cycle || document.status !== 'pending')) {
    invalid('เอกสารไม่ได้อยู่ในสายอนุมัติที่รอดำเนินการ', 409);
  }
  if (action === 'cancel' && !['draft', 'returned', 'rejected', 'pending', 'approved'].includes(document.status)) {
    invalid('สถานะนี้ยกเลิกไม่ได้', 409);
  }
  if (action === 'confirm') {
    const config = ROLLOUT_READY ? await tx.accountingApprovalConfig.findUnique({ where: { docType } }) : null;
    if (config?.enabled) invalid('เอกสารนี้ต้องส่งตามสายอนุมัติ ไม่สามารถยืนยันโดยตรง', 409);
    if (cycle && cycle.state !== 'legacy') invalid('เอกสารในสายอนุมัติต้องส่งและอนุมัติครบขั้น', 409);
    return { status: 'approved', posts: true, changes: {} };
  }
  const approval = await planApproval(tx, docType, document, action, actorId, reason);
  if (action !== 'cancel' && !approval.managed) invalid('เอกสารประเภทนี้ยังไม่เปิดใช้สายอนุมัติ กรุณาใช้ยืนยันแบบเดิม', 409);
  return {
    status: action === 'approve' ? (approval.finalApproval ? 'approved' : 'pending')
      : { submit: 'pending', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action],
    posts: action === 'approve' && approval.finalApproval,
    changes: approval.changes,
  };
}

function arEditable(document) {
  return document.status === 'draft' ||
    (document.status === 'returned' && currentCycle(document)?.state === 'returned');
}

module.exports = { arActionPermission, arTransition, arEditable };
