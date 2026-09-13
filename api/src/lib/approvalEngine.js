/**
 * approvalEngine.js — Approval Workflow Engine Foundation
 *
 * Processes approval transitions, step progression, authorization, and audit logging
 * inside a single database transaction.
 */

const prisma = require('./prisma');
const { getStepRoleMapping, getFlowSteps, getNextStep } = require('./approvalFlow');
const { validateStateTransition } = require('./stateTransition');
const { assertActionAuthorized } = require('./authorizationPolicy');
const { recordAuditLog } = require('./auditTrail');

/**
 * Process approval action on a document within a transaction.
 */
async function processApprovalAction(params = {}, client = null) {
  const { docType, docId, action, req, comment } = params;
  if (!docType || !docId || !action || !req?.user) {
    throw new Error('processApprovalAction requires docType, docId, action, and req.user');
  }

  const act = String(action).trim().toLowerCase();

  const executeApprovalLogic = async (tx) => {
    // 1. Fetch step mapping & flow configuration
    const { stepRole } = await getStepRoleMapping();
    const flowSteps = await getFlowSteps(docType);

    // 2. Fetch document record (supports quotation, workOrder, handOver, purchaseRequest)
    let doc = null;
    let updateModel = null;
    let docNo = '';

    if (docType === 'quotation') {
      doc = await tx.quotation.findUnique({ where: { id: docId } });
      updateModel = tx.quotation;
      docNo = doc?.quoNo;
    } else if (docType === 'workOrder') {
      doc = await tx.workOrder.findUnique({ where: { id: docId } });
      updateModel = tx.workOrder;
      docNo = doc?.woNo;
    } else if (docType === 'handover') {
      doc = await tx.handOverJob.findUnique({ where: { id: docId } });
      updateModel = tx.handOverJob;
      docNo = doc?.hoNo;
    } else if (docType === 'pr') {
      doc = await tx.purchaseRequest.findUnique({ where: { id: docId } });
      updateModel = tx.purchaseRequest;
      docNo = doc?.prNo;
    }

    if (!doc) {
      const err = new Error(`ไม่พบเอกสาร ID "${docId}" สำหรับประเภท "${docType}"`);
      err.status = 404;
      throw err;
    }

    const currentStep = doc.approvalStep || 0;
    const currentStepRole = stepRole[currentStep] || '';

    // 3. Authorize action
    await assertActionAuthorized(req.user, act, doc, { docType, requiredRole: currentStepRole });

    // 4. Calculate target status & step based on action
    let targetStatus = doc.status;
    let nextStep = currentStep;

    if (act === 'submit') {
      validateStateTransition(doc.status, 'pending', act, { reason: comment });
      targetStatus = flowSteps.length === 0 ? 'approved' : 'pending';
      nextStep = flowSteps.length > 0 ? flowSteps[0] : 0;
    } else if (act === 'approve') {
      validateStateTransition(doc.status, 'approved', act, { reason: comment });
      const calculatedNext = await getNextStep(docType, currentStep);
      if (calculatedNext === null) {
        targetStatus = 'approved';
        nextStep = currentStep;
      } else {
        targetStatus = 'pending';
        nextStep = calculatedNext;
      }
    } else if (act === 'reject') {
      validateStateTransition(doc.status, 'rejected', act, { reason: comment });
      targetStatus = 'rejected';
    } else if (act === 'return') {
      validateStateTransition(doc.status, 'returned', act, { reason: comment });
      targetStatus = 'returned';
    } else if (act === 'cancel') {
      validateStateTransition(doc.status, 'cancelled', act, { reason: comment });
      targetStatus = 'cancelled';
    } else {
      const err = new Error(`คำสั่งอนุมัติ "${action}" ไม่ถูกต้อง`);
      err.status = 400;
      throw err;
    }

    // 5. Update document record
    const updatedDoc = await updateModel.update({
      where: { id: docId },
      data: {
        status: targetStatus,
        approvalStep: nextStep,
      },
    });

    // 6. Record ApprovalLog
    const approvalLogData = {
      docType,
      approverId: req.user.id,
      step: currentStep,
      action: act === 'submit' ? 'submit' : act === 'approve' ? 'approve' : 'reject',
      comment: comment || null,
    };
    if (docType === 'quotation') approvalLogData.quotationId = docId;
    else if (docType === 'workOrder') approvalLogData.workOrderId = docId;
    else if (docType === 'handover') approvalLogData.handOverJobId = docId;
    else if (docType === 'pr') approvalLogData.prId = docId;

    await tx.approvalLog.create({ data: approvalLogData });

    // 7. Record Domain AuditLog inside transaction
    await recordAuditLog({
      entityType: docType,
      entityId: docId,
      docNo,
      action: `approval.${act}`,
      oldValue: { status: doc.status, approvalStep: currentStep },
      newValue: { status: targetStatus, approvalStep: nextStep },
      performedById: req.user.id,
      reason: comment || null,
      req,
    }, tx);

    return {
      doc: updatedDoc,
      previousStatus: doc.status,
      newStatus: targetStatus,
      previousStep: currentStep,
      nextStep,
    };
  };

  if (client) {
    return executeApprovalLogic(client);
  }

  return prisma.$transaction(async (tx) => {
    return executeApprovalLogic(tx);
  });
}

module.exports = {
  processApprovalAction,
};
