const { invalid } = require('./deliveryOrder');

const DOCUMENTS = Object.freeze({
  po: { module: 'ap', model: 'purchaseOrder', number: 'poNo', href: '/ap/vouchers' },
  gr: { module: 'ap', model: 'goodsReceipt', number: 'grNo', href: '/ap/vouchers/gr' },
  is: { module: 'inventory', model: 'stockIssue', number: 'issueNo', href: '/inventory/issues' },
  sr: { module: 'inventory', model: 'stockReturn', number: 'returnNo', href: '/inventory/returns' },
  ps: { module: 'ap', model: 'contractorPaymentRequest', number: 'psNo', href: '/ap/vouchers/ps' },
  pv: { module: 'ap', model: 'paymentVoucher', number: 'pvNo', href: '/ap/vouchers/pv' },
  opening: { module: 'inventory', model: 'stockOpeningBalance', number: 'openingNo', href: '/inventory/opening-balances' },
  invoice: { module: 'ar', model: 'invoice', number: 'ivNo', href: '/ar/invoices' },
  bi: { module: 'ar', model: 'billingNote', number: 'biNo', href: '/ar/billing-notes' },
  rv: { module: 'ar', model: 'receiptVoucher', number: 'rvNo', href: '/ar/receipts' },
  cn: { module: 'ar', model: 'creditNote', number: 'cnNo', href: '/ar/credit-notes' },
});

// Deliberately closed until AR settlement reservations and all eleven UI adapters
// have been verified. Neither a settings write nor an environment flag bypasses it.
const ROLLOUT_READY = false;

function documentType(docType) {
  if (!Object.hasOwn(DOCUMENTS, docType)) invalid('ประเภทเอกสาร Accounting ไม่ถูกต้อง', 400);
  return DOCUMENTS[docType];
}

function normalizeSteps(steps, enabled) {
  if (!Array.isArray(steps) || steps.length > 20 || (enabled && !steps.length)) {
    invalid('ต้องกำหนดลำดับอนุมัติ 1–20 ขั้นเมื่อเปิดใช้งาน');
  }
  return steps.map(step => {
    if (!step || typeof step !== 'object' || Array.isArray(step) ||
      !['role', 'user'].includes(step.kind) || typeof step.targetId !== 'string' ||
      !step.targetId.trim() || step.targetId.length > 100 ||
      Object.keys(step).some(key => !['kind', 'targetId'].includes(key))) {
      invalid('ขั้นอนุมัติต้องระบุ kind (role/user) และ targetId เท่านั้น');
    }
    return { kind: step.kind, targetId: step.targetId.trim() };
  });
}

async function actorAccess(tx, id, module) {
  const actor = await tx.user.findUnique({
    where: { id },
    select: { id: true, active: true, role: true, fullName: true, signatureText: true, signatureUrl: true,
      accountingAssignment: { include: { role: true } } },
  });
  const permissions = actor?.accountingAssignment?.role?.permissions || [];
  return {
    actor,
    roleId: actor?.accountingAssignment?.roleId || null,
    eligible: Boolean(actor?.active && (actor.role === 'admin' ||
      (permissions.includes(`${module}.view`) && permissions.includes(`${module}.approve`)))),
  };
}

async function validateTargets(tx, docType, steps, creatorId) {
  const { module } = documentType(docType);
  const snapshot = [];
  for (const step of steps) {
    if (step.kind === 'user') {
      const access = await actorAccess(tx, step.targetId, module);
      if (!access.eligible || access.actor.id === creatorId) invalid('ผู้อนุมัติที่เลือกไม่มีสิทธิ์/ปิดใช้งาน หรือเป็นผู้สร้างเอกสาร', 400);
      snapshot.push({ ...step, label: access.actor.fullName });
    } else {
      const role = await tx.accountingRole.findUnique({ where: { id: step.targetId },
        include: { assignments: { include: { user: { select: { id: true, active: true } } } } } });
      if (!role || !role.permissions.includes(`${module}.view`) ||
        !role.permissions.includes(`${module}.approve`) ||
        !role.assignments.some(assignment => assignment.user.active && assignment.user.id !== creatorId)) {
        invalid('บทบาทอนุมัติไม่มีผู้ใช้ที่ใช้งานและมีสิทธิ์อนุมัติ (ไม่นับผู้สร้าง)', 400);
      }
      snapshot.push({ ...step, label: role.name });
    }
  }
  return snapshot;
}

function currentCycle(document) {
  const snapshot = document.accountingApproval;
  if (snapshot == null) return null;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.cycles) || !snapshot.cycles.length) invalid('ข้อมูลลำดับอนุมัติผิดปกติ กรุณาตรวจสอบ', 409);
  const cycle = snapshot.cycles[snapshot.cycles.length - 1];
  if (!Array.isArray(cycle.steps) || (cycle.state !== 'legacy' && !cycle.steps.length) || !Array.isArray(cycle.approvals) ||
    cycle.steps.some(step => !['role', 'user'].includes(step.kind) || typeof step.targetId !== 'string' || !step.targetId) ||
    cycle.approvals.length > cycle.steps.length || cycle.approvals.some((entry, index) => entry.step !== index + 1)) {
    invalid('ข้อมูลรอบอนุมัติผิดปกติ กรุณาตรวจสอบ', 409);
  }
  return cycle;
}

async function eligibleForCycle(tx, docType, document, actorId) {
  const cycle = currentCycle(document);
  const creatorId = document.createdById || document.salesId;
  if (!cycle || cycle.state !== 'pending' || document.status !== 'pending' ||
    !creatorId || actorId === creatorId) return false;
  const step = cycle.steps[cycle.approvals.length];
  const access = await actorAccess(tx, actorId, documentType(docType).module);
  return Boolean(step && access.eligible &&
    (step.kind === 'user' ? step.targetId === actorId : step.targetId === access.roleId));
}

// Caller must hold its existing document row lock, verify updatedAt, and persist
// changes together with the business posting and audit in the same transaction.
async function planApproval(tx, docType, document, action, actorId, reason = null) {
  documentType(docType);
  const cycle = currentCycle(document);
  const creatorId = document.createdById || document.salesId;
  const revisionDate = () => new Date(Math.max(Date.now(), (new Date(document.updatedAt).getTime() || 0) + 1));
  if (action === 'approve' && (!creatorId || creatorId === actorId)) invalid('ผู้สร้างห้ามอนุมัติเอกสารตัวเอง แม้เป็น admin', 403);
  if (action === 'submit') {
    const config = await tx.accountingApprovalConfig.findUnique({ where: { docType } });
    if (!config?.enabled) {
      // Retain old cycles, but the new unconfigured cycle must use old behavior.
      if (!cycle) return { changes: {}, finalApproval: false, managed: false };
      const history = structuredClone(document.accountingApproval);
      history.cycles.push({ cycle: history.cycles.length + 1, state: 'legacy', steps: [], approvals: [],
        submittedAt: new Date().toISOString(), submittedById: actorId });
      return { changes: { accountingApproval: history, updatedAt: revisionDate() }, finalApproval: false, managed: false };
    }
    if (!ROLLOUT_READY) invalid('ยังไม่เปิด rollout: ต้องตรวจครบทั้ง 11 ประเภทและการจองยอด AR ก่อน', 409);
    if (!creatorId) invalid('ไม่พบผู้สร้างเอกสารสำหรับตรวจสิทธิ์อนุมัติ', 409);
    const steps = await validateTargets(tx, docType, normalizeSteps(config.steps, true), creatorId);
    const snapshot = document.accountingApproval == null ? { version: 1, cycles: [] } : structuredClone(document.accountingApproval);
    snapshot.cycles.push({ cycle: snapshot.cycles.length + 1, configRevision: config.revision,
      state: 'pending', submittedAt: new Date().toISOString(), submittedById: actorId, steps, approvals: [] });
    return { managed: true, finalApproval: false, changes: { accountingApproval: snapshot, approvalStep: 1, updatedAt: revisionDate() } };
  }
  if (!cycle || cycle.state === 'legacy') return { changes: {}, finalApproval: action === 'approve', managed: false };
  if (!['approve', 'return', 'reject', 'cancel'].includes(action)) return { changes: {}, finalApproval: false, managed: true };
  if (action !== 'cancel' && !(await eligibleForCycle(tx, docType, document, actorId))) invalid('ไม่ใช่ผู้อนุมัติในขั้นปัจจุบัน หรือเป็นผู้สร้างเอกสาร', 403);
  if (['return', 'reject', 'cancel'].includes(action) && (!reason || !reason.trim())) invalid('กรุณาระบุเหตุผล');
  const snapshot = structuredClone(document.accountingApproval);
  const next = snapshot.cycles[snapshot.cycles.length - 1];
  let finalApproval = false;
  if (action === 'approve') {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId} FOR SHARE`;
    await tx.$queryRaw`SELECT aur.user_id FROM accounting_user_roles aur
      JOIN accounting_roles r ON r.id = aur.role_id WHERE aur.user_id = ${actorId} FOR SHARE OF aur, r`;
    if (!(await eligibleForCycle(tx, docType, document, actorId))) invalid('สิทธิ์ผู้อนุมัติเปลี่ยนแล้ว กรุณาโหลดใหม่', 403);
    const { actor } = await actorAccess(tx, actorId, documentType(docType).module);
    if (actor.signatureUrl) await tx.accountingApprovalSignature.upsert({
      where: { url: actor.signatureUrl }, create: { url: actor.signatureUrl }, update: {},
    });
    next.approvals.push({ step: next.approvals.length + 1, actorId: actor.id,
      fullName: actor.fullName, signatureText: actor.signatureText || null, signatureUrl: actor.signatureUrl || null,
      approvedAt: new Date().toISOString() });
    finalApproval = next.approvals.length === next.steps.length;
    next.state = finalApproval ? 'approved' : 'pending';
  } else {
    next.state = { return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
    next.closedAt = new Date().toISOString();
    next.closedById = actorId;
    next.reason = reason;
  }
  return { managed: true, finalApproval,
    changes: { accountingApproval: snapshot, updatedAt: revisionDate(),
      approvalStep: finalApproval ? next.steps.length : next.approvals.length + 1 } };
}

async function validateConfiguration(tx, docType, body) {
  documentType(docType);
  if (!body || typeof body.enabled !== 'boolean') invalid('enabled ต้องเป็น boolean');
  const steps = normalizeSteps(body.steps, body.enabled);
  await validateTargets(tx, docType, steps);
  if (body.enabled && !ROLLOUT_READY) invalid('ยังไม่เปิด rollout: ต้องตรวจครบทั้ง 11 ประเภทและการจองยอด AR ก่อน', 409);
  return { enabled: body.enabled, steps };
}

module.exports = { DOCUMENTS, ROLLOUT_READY, documentType, normalizeSteps, actorAccess, validateTargets,
  validateConfiguration, currentCycle, eligibleForCycle, planApproval };
