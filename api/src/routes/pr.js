const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getPrFirstStep, getPrNextStep, resolvePrFlow, getStepRoleMapping } = require('../lib/approvalFlow');
const { canManageAllDocs, canDeleteOthersDocs } = require('../lib/roles');
const { normalizeRole } = require('../lib/roleAliases');
const { canBypassDocApproval } = require('../lib/approvalBypass');

const prValidators = [
  body('prTypeId').trim().notEmpty().withMessage('กรุณาเลือกประเภทใบขอซื้อ'),
  body('customer').trim().notEmpty().withMessage('กรุณาระบุลูกค้า'),
  body('projectRef').optional({ nullable: true }).isString(),
  body('dateIssue').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('dateRequired').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('items').optional().isArray().withMessage('items ต้องเป็น array'),
  body('items.*.desc').optional({ nullable: true }).isString(),
  body('items.*.qty').optional().isFloat({ min: 0 }).withMessage('จำนวนต้องไม่ติดลบ'),
  body('items.*.price').optional().isFloat({ min: 0 }).withMessage('ราคาต้องไม่ติดลบ'),
  body('items.*.images').optional().isArray().withMessage('images ต้องเป็น array'),
  body('subTotal').optional().isFloat({ min: 0 }),
  body('vat').optional().isFloat({ min: 0 }),
  body('netTotal').optional().isFloat({ min: 0 }),
];

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, role: true, signatureText: true } },
  prType: { select: { id: true, name: true, approvalSteps: true } },
  workOrder: { select: { id: true, woNo: true } },
  items: { orderBy: { seq: 'asc' } },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true } } },
    orderBy: { actedAt: 'asc' },
  },
  attachments: true,
};

async function buildPrAccessWhere(user) {
  if (await canBypassDocApproval('pr', user.role)) return {};

  const baseConditions = [{ salesId: user.id }];
  const { roleStep } = await getStepRoleMapping();
  const myStep = roleStep[normalizeRole(user.role)];

  if (myStep) {
    baseConditions.push({
      status: 'pending',
      approvalStep: myStep,
      ...(myStep === 1 ? { NOT: { salesId: user.id } } : {}),
    });
  }

  baseConditions.push({
    status: 'approved',
    approvalLogs: {
      some: {
        approverId: user.id,
        action: 'approve',
      },
    },
  });

  return { OR: baseConditions };
}

async function assertPrAccessible(req, pr) {
  if (!pr) return;

  if (await canBypassDocApproval('pr', req.user.role)) return;

  if (pr.salesId === req.user.id) return;

  if (pr.status === 'approved') {
    const approvedByMe = Array.isArray(pr.approvalLogs)
      && pr.approvalLogs.some(log => log?.approverId === req.user.id && log?.action === 'approve');
    if (approvedByMe) return;
  }

  if (pr.status === 'pending') {
    const { roleStep } = await getStepRoleMapping();
    const myStep = roleStep[normalizeRole(req.user.role)];
    if (myStep && Number(pr.approvalStep) === Number(myStep)) {
      if (Number(myStep) !== 1 || pr.salesId !== req.user.id) return;
    }
  }

  const error = new Error('ไม่มีสิทธิ์เข้าถึงเอกสารนี้');
  error.status = 403;
  throw error;
}

async function assertPrCurrentApprover(req, pr) {
  if (await canBypassDocApproval('pr', req.user.role)) return;

  const { stepRole } = await getStepRoleMapping();
  const requiredRole = normalizeRole(stepRole[pr.approvalStep]);
  const actorRole = normalizeRole(req.user.role);

  if (!requiredRole || requiredRole !== actorRole) {
    const error = new Error('ไม่มีสิทธิ์อนุมัติรายการนี้');
    error.status = 403;
    throw error;
  }

  if (Number(pr.approvalStep) === 1 && pr.salesId === req.user.id) {
    const error = new Error('ผู้สร้างเอกสารไม่สามารถอนุมัติขั้น Sales ได้');
    error.status = 403;
    throw error;
  }

  const effectiveSteps = await resolvePrFlow(pr.prType?.approvalSteps, pr.sales?.role);
  if (!effectiveSteps.includes(Number(pr.approvalStep))) {
    const error = new Error('ขั้นอนุมัติของเอกสารไม่ถูกต้อง');
    error.status = 400;
    throw error;
  }
}

function stripRevisionSuffix(docNo = '') {
  return String(docNo).replace(/-R\d+$/i, '');
}

function buildRevisionDocNo(baseNo, revisionNo) {
  return `${stripRevisionSuffix(baseNo)}-R${revisionNo}`;
}

function normalizePrItem(item, seq) {
  const qty = Number(item?.qty ?? 0) || 0;
  const price = Number(item?.price ?? 0) || 0;
  return {
    seq,
    partNo: item?.partNo || null,
    desc: String(item?.desc || ''),
    note: item?.note || null,
    qty,
    unit: String(item?.unit || ''),
    price,
    amount: Number(item?.amount ?? (qty * price)) || 0,
    images: Array.isArray(item?.images) ? item.images.filter(Boolean) : [],
  };
}

async function getDocNumberFloor(prefix) {
  const settings = await prisma.settings.findUnique({
    where: { id: 'main' },
    select: { approvalFlowConfig: true },
  });
  const cfg = settings?.approvalFlowConfig;
  const floors = (cfg && typeof cfg === 'object' && cfg.docNoFloors && typeof cfg.docNoFloors === 'object')
    ? cfg.docNoFloors
    : {};
  const floor = Number(floors[prefix]);
  return Number.isFinite(floor) && floor > 0 ? Math.floor(floor) : 1;
}

// GET /api/pr
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, q, active } = req.query;
    const andWhere = [await buildPrAccessWhere(req.user)];
    if (status) andWhere.push({ status });
    if (active !== undefined) andWhere.push({ active: active === 'true' });
    else andWhere.push({ active: true });
    if (q) {
      andWhere.push({
        OR: [
          { prNo: { contains: q, mode: 'insensitive' } },
          { customer: { contains: q, mode: 'insensitive' } },
          { projectRef: { contains: q, mode: 'insensitive' } },
          { prType: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    const where = { AND: andWhere };
    const listInclude = {
      sales: { select: { id: true, fullName: true, signatureText: true } },
      prType: { select: { id: true, name: true, approvalSteps: true } },
      items: true,
    };
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.purchaseRequest.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
        prisma.purchaseRequest.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.purchaseRequest.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/pr/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_FULL,
    });
    await assertPrAccessible(req, item);
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/pr/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uiBase = getUiBaseUrl(req);
    const url = `${uiBase}/print/pr/${req.params.id}?token=${encodeURIComponent(token)}`;
    const item = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      select: {
        id: true,
        prNo: true,
        salesId: true,
        status: true,
        approvalStep: true,
        approvalLogs: {
          select: { approverId: true, action: true },
        },
      },
    });
    await assertPrAccessible(req, item);
    const pdf = await renderUrlToPdf(url);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.prNo || 'pr'}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// POST /api/pr
router.post('/', authenticate, prValidators, validate, async (req, res, next) => {
  try {
    const {
      workOrderId, prTypeId, customer, projectRef,
      dateIssue, dateRequired, items = [],
      subTotal, specialDiscount, vat, netTotal, remarks,
    } = req.body;
    if (!customer) return res.status(400).json({ message: 'customer required' });
    const yy = String(new Date().getFullYear()).slice(2);
    const prPrefix = `PR${yy}`;
    const lastPR = await prisma.purchaseRequest.findFirst({
      where: { prNo: { startsWith: prPrefix } },
      orderBy: { prNo: 'desc' },
    });
    const prDbSeq = lastPR ? (parseInt(lastPR.prNo.replace(prPrefix, ''), 10) || 0) : 0;
    const prFloor = await getDocNumberFloor(prPrefix);
    const prSeq = Math.max(prDbSeq + 1, prFloor);
    const prNo = `${prPrefix}${String(prSeq).padStart(3, '0')}`;
    const item = await prisma.purchaseRequest.create({
      data: {
        prNo, workOrderId: workOrderId || null, prTypeId: prTypeId || null, customer, projectRef,
        dateIssue: dateIssue ? new Date(dateIssue) : null,
        dateRequired: dateRequired ? new Date(dateRequired) : null,
        subTotal: subTotal || 0, specialDiscount: specialDiscount || 0, vat: vat || 0, netTotal: netTotal || 0,
        remarks, salesId: req.user.id, status: 'draft', active: true, revisionNo: 0,
        items: {
          create: items.map((it, i) => normalizePrItem(it, i)),
        },
      },
      include: INCLUDE_FULL,
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/revise
router.post('/:id/revise', authenticate, async (req, res, next) => {
  try {
    const source = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { items: { orderBy: { seq: 'asc' } } },
    });

    if (source.salesId !== req.user.id && !canManageAllDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ทำ Revision เอกสารของผู้อื่น' });
    }
    if (source.status !== 'approved') {
      return res.status(400).json({ message: 'ทำ Revision ได้เฉพาะใบขอซื้อที่อนุมัติแล้วเท่านั้น' });
    }
    if (!source.active) {
      return res.status(400).json({ message: 'ใบขอซื้อนี้ไม่ใช่ฉบับที่ active ล่าสุด' });
    }

    const rootId = source.rootPurchaseRequestId || source.id;
    const revisionNo = (source.revisionNo || 0) + 1;
    const revisedNo = buildRevisionDocNo(source.prNo, revisionNo);

    const revised = await prisma.$transaction(async (tx) => {
      await tx.purchaseRequest.update({ where: { id: source.id }, data: { active: false } });

      return tx.purchaseRequest.create({
        data: {
          prNo: revisedNo,
          active: true,
          revisionNo,
          rootPurchaseRequestId: rootId,
          workOrderId: source.workOrderId,
          prTypeId: source.prTypeId,
          salesId: source.salesId,
          customer: source.customer,
          projectRef: source.projectRef,
          dateIssue: source.dateIssue,
          dateRequired: source.dateRequired,
          subTotal: source.subTotal,
          specialDiscount: source.specialDiscount,
          vat: source.vat,
          netTotal: source.netTotal,
          remarks: source.remarks,
          status: 'draft',
          approvalStep: 0,
          items: {
            create: source.items.map((it, i) => normalizePrItem(it, it.seq ?? i)),
          },
        },
        include: INCLUDE_FULL,
      });
    });

    res.status(201).json(revised);
  } catch (e) { next(e); }
});

// PUT /api/pr/:id
router.put('/:id', authenticate, prValidators, validate, async (req, res, next) => {
  try {
    const existing = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.salesId !== req.user.id && !canManageAllDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเอกสารของผู้อื่น' });
    }
    if (!isEditableApprovalDocStatus(existing.status)) {
      return res.status(400).json({ message: EDITABLE_APPROVAL_DOC_MESSAGE });
    }
    const {
      customer, projectRef, dateIssue, dateRequired, prTypeId,
      items = [], subTotal, specialDiscount, vat, netTotal, remarks,
    } = req.body;
    const item = await prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: req.params.id } });
      return tx.purchaseRequest.update({
        where: { id: req.params.id },
        data: {
          customer, projectRef,
          prTypeId: prTypeId !== undefined ? (prTypeId || null) : undefined,
          dateIssue: dateIssue ? new Date(dateIssue) : null,
          dateRequired: dateRequired ? new Date(dateRequired) : null,
          subTotal: subTotal || 0, specialDiscount: specialDiscount || 0, vat: vat || 0, netTotal: netTotal || 0,
          remarks,
          items: {
            create: items.map((it, i) => normalizePrItem(it, i)),
          },
        },
        include: INCLUDE_FULL,
      });
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/pr/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (pr.salesId !== req.user.id && !canDeleteOthersDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ลบเอกสารของผู้อื่น' });
    }
    if (!['draft', 'rejected'].includes(pr.status)) {
      return res.status(400).json({ message: 'ลบได้เฉพาะเอกสารที่อยู่ในสถานะ Draft หรือ Rejected เท่านั้น' });
    }
    await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/pr/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { prType: { select: { approvalSteps: true } }, sales: { select: { role: true } } },
    });
    if (!['draft', 'rejected'].includes(pr.status)) return res.status(400).json({ message: 'ส่งได้เฉพาะ Draft หรือ Rejected เท่านั้น' });

    const firstStep = await getPrFirstStep(pr.prType?.approvalSteps, pr.sales.role);
    let resumeStep = firstStep;
    if (pr.status === 'rejected') {
      const steps = await resolvePrFlow(pr.prType?.approvalSteps, pr.sales.role);
      const currentStep = Number(pr.approvalStep);
      if (steps.includes(currentStep)) {
        resumeStep = currentStep;
      }
    }
    const newStatus = resumeStep === null ? 'approved' : 'pending';

    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: newStatus, approvalStep: resumeStep ?? 0 },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: 'ส่งเข้าอนุมัติ',
      },
    });

    if (newStatus === 'approved') {
      // ทุกขั้นถูกข้าม (ผู้สร้างครอบคลุมสายอนุมัติ) หรือไม่มีขั้นอนุมัติ → อนุมัติทันที
      await notifyUser(pr.salesId, `ใบขอซื้อ ${pr.prNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(resumeStep, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { prType: { select: { approvalSteps: true } }, sales: { select: { role: true } } },
    });
    if (pr.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    await assertPrCurrentApprover(req, pr);

    const nextStep = await getPrNextStep(pr.prType?.approvalSteps, pr.sales.role, pr.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const updated = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep ?? pr.approvalStep, status: newStatus },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'pr', prId: pr.id,
        approverId: req.user.id, step: pr.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(pr.salesId, `ใบขอซื้อ ${pr.prNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/pr/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { prType: { select: { approvalSteps: true } }, sales: { select: { role: true } } },
    });
    if (pr.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    await assertPrCurrentApprover(req, pr);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.approvalLog.deleteMany({
        where: {
          docType: 'pr',
          prId: pr.id,
          action: 'approve',
        },
      });

      const rejected = await tx.purchaseRequest.update({
        where: { id: req.params.id },
        data: { status: 'rejected' },
      });

      await tx.approvalLog.create({
        data: {
          docType: 'pr', prId: pr.id,
          approverId: req.user.id, step: pr.approvalStep,
          action: 'reject', comment: req.body.comment || '',
        },
      });

      return rejected;
    });
    await notifyUser(pr.salesId, `ใบขอซื้อ ${pr.prNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
