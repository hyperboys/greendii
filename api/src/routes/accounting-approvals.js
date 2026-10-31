const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { recordAuditLog } = require('../lib/auditTrail');
const { invalid } = require('../lib/deliveryOrder');
const { DOCUMENTS, ROLLOUT_READY, documentType, validateConfiguration, currentCycle, eligibleForCycle } = require('../lib/accountingApproval');

router.use(authenticate);

router.get('/configuration', requireRole('admin'), async (_req, res, next) => {
  try {
    const saved = await prisma.accountingApprovalConfig.findMany();
    res.json({ rolloutReady: ROLLOUT_READY,
      configurations: Object.keys(DOCUMENTS).map(docType => saved.find(row => row.docType === docType) ||
        { docType, enabled: false, steps: [], revision: 0, updatedAt: null }) });
  } catch (error) { next(error); }
});

router.put('/configuration/:docType', requireRole('admin'), async (req, res, next) => {
  try {
    const docType = req.params.docType;
    documentType(docType);
    if (!Number.isInteger(req.body?.revision) || req.body.revision < 0) invalid('ต้องระบุ revision ปัจจุบัน');
    res.json(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`accounting-approval-config:${docType}`}))`;
      const previous = await tx.accountingApprovalConfig.findUnique({ where: { docType } });
      if ((previous?.revision || 0) !== req.body.revision) invalid('การตั้งค่าถูกแก้ไขแล้ว กรุณาโหลดใหม่', 409);
      const data = await validateConfiguration(tx, docType, req.body);
      const saved = await tx.accountingApprovalConfig.upsert({ where: { docType },
        create: { docType, ...data, revision: 1 },
        update: { ...data, revision: { increment: 1 } } });
      await recordAuditLog({ entityType: 'accounting_approval_config', entityId: docType,
        action: 'update', oldValue: previous, newValue: saved, req }, tx);
      return saved;
    }));
  } catch (error) { next(error); }
});

router.get('/pending', async (req, res, next) => {
  try {
    const access = await getAccountingAccess(req.user);
    if (!access.allowed) invalid('ไม่มีสิทธิ์ Accounting', 403);
    const pending = [];
    for (const [docType, descriptor] of Object.entries(DOCUMENTS)) {
      if (!hasAccountingPermission(access, descriptor.module, 'approve')) continue;
      // Only new snapshotted cycles belong in this inbox; legacy one-step
      // documents remain in their existing module lists.
      const documents = await prisma[descriptor.model].findMany({ where: {
        status: 'pending', accountingApproval: { not: require('@prisma/client').Prisma.DbNull },
      }, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 500 });
      for (const document of documents) {
        if (!(await eligibleForCycle(prisma, docType, document, req.user.id))) continue;
        const cycle = currentCycle(document);
        pending.push({ docType, id: document.id, docNo: document[descriptor.number],
          updatedAt: document.updatedAt, submittedAt: cycle.submittedAt,
          step: cycle.approvals.length + 1, steps: cycle.steps.length,
          target: cycle.steps[cycle.approvals.length].label,
          href: `/approvals/${docType}/${encodeURIComponent(document.id)}`,
          documentHref: `${descriptor.href}/${encodeURIComponent(document.id)}` });
      }
    }
    res.json(pending);
  } catch (error) { next(error); }
});

router.get('/:docType/:id', async (req, res, next) => {
  try {
    const descriptor = documentType(req.params.docType);
    const access = await getAccountingAccess(req.user);
    if (!hasAccountingPermission(access, descriptor.module, 'view')) invalid('ไม่มีสิทธิ์ดูเอกสาร Accounting', 403);
    const document = await prisma[descriptor.model].findUnique({ where: { id: req.params.id } });
    if (!document) invalid('ไม่พบเอกสาร', 404);
    res.json({ accountingApproval: document.accountingApproval || null, status: document.status, updatedAt: document.updatedAt,
      docNo: document[descriptor.number], documentHref: `${descriptor.href}/${encodeURIComponent(document.id)}`,
      canApprove: await eligibleForCycle(prisma, req.params.docType, document, req.user.id) });
  } catch (error) { next(error); }
});

module.exports = router;
