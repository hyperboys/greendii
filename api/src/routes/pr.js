const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { notifyByRole, notifyUser } = require('../lib/notify');
const { getPrFirstStep, getPrNextStep, resolvePrFlowStages, getPrCurrentStageSteps, getStepRoleMapping } = require('../lib/approvalFlow');
const { canManageAllDocs, canDeleteOthersDocs } = require('../lib/roles');
const { normalizeRole } = require('../lib/roleAliases');
const { canBypassDocApproval } = require('../lib/approvalBypass');
const { getPrCurrencies, normalizeCurrencyCode } = require('../lib/prCurrency');

const prValidators = [
  body('prTypeId').trim().notEmpty().withMessage('กรุณาเลือกประเภทใบขอซื้อ'),
  body('customer').trim().notEmpty().withMessage('กรุณาระบุลูกค้า'),
  body('projectRef').optional({ nullable: true }).isString(),
  body('dateIssue').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('dateRequired').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('currency').optional({ nullable: true }).isString(),
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

function stripRevisionSuffix(docNo = '') {
  return String(docNo).replace(/-R\d+$/i, '');
}

function buildRevisionDocNo(baseNo, revisionNo) {
  return `${stripRevisionSuffix(baseNo)}-R${revisionNo}`;
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

function normalizePrItem(item, index) {
  const qty = Number(item?.qty ?? 0) || 0;
  const price = Number(item?.price ?? 0) || 0;
  return {
    seq: Number.isFinite(Number(item?.seq)) ? Number(item.seq) : index,
    partNo: item?.partNo == null ? null : String(item.partNo),
    desc: String(item?.desc ?? '').trim(),
    note: item?.note == null ? null : String(item.note),
    qty,
    unit: String(item?.unit ?? '').trim(),
    price,
    amount: qty * price,
    images: Array.isArray(item?.images) ? item.images.map(v => String(v || '')).filter(Boolean) : [],
  };
}

function hasUserApprovedOrRejected(pr, userId) {
  return Array.isArray(pr?.approvalLogs)
    && pr.approvalLogs.some(
      log => log?.approverId === userId && ['approve', 'reject'].includes(log?.action),
    );
}

async function getCurrentPrStageRoles(pr, stepRole) {
  const stageSteps = await getPrCurrentStageSteps(
    pr?.prType?.approvalSteps,
    pr?.sales?.role,
    Number(pr?.approvalStep),
  );

  const roles = stageSteps
    .map(step => normalizeRole(stepRole[step]))
    .filter(Boolean);

  return {
    stageSteps,
    roles: [...new Set(roles)],
  };
}

async function isPendingPrCurrentApprover(user, pr, stepRole) {
  if (!pr || pr.status !== 'pending') return false;

  const { stageSteps, roles } = await getCurrentPrStageRoles(pr, stepRole);
  if (!stageSteps.length || !roles.length) return false;

  const actorRole = normalizeRole(user.role);
  if (!roles.includes(actorRole)) return false;

  // Sales creator cannot approve own doc when stage contains step 1.
  if (stageSteps.includes(1) && actorRole === 'sales' && pr.salesId === user.id) return false;

  return true;
}

async function isPrAccessibleForUser(user, pr, stepRole) {
  if (!pr) return false;
  if (pr.salesId === user.id) return true;
  if (hasUserApprovedOrRejected(pr, user.id)) return true;
  return isPendingPrCurrentApprover(user, pr, stepRole);
}

async function buildPrAccessWhere(user) {
  if (await canBypassDocApproval('pr', user.role)) return {};

  return {
    OR: [
      { salesId: user.id },
      { status: 'pending' },
      {
        approvalLogs: {
          some: {
            approverId: user.id,
            action: { in: ['approve', 'reject'] },
          },
        },
      },
    ],
  };
}

async function notifyPrStage(stepRole, stageSteps, text, options = {}) {
  const roles = [...new Set(
    (stageSteps || [])
      .map(step => normalizeRole(stepRole[step]))
      .filter(Boolean),
  )];

  if (!roles.length) return;

  await Promise.allSettled(
    roles.map(role => notifyByRole(role, text, options)),
  );
}

async function loadAttachmentBytes(att) {
  const fileUrl = att.fileUrl || '';
  if (/^https?:\/\//i.test(fileUrl)) {
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error(`fetch failed ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }
  const path = require('path');
  const fs = require('fs/promises');
  return fs.readFile(path.join(__dirname, '../../uploads', att.filename));
}

function isImageAttachment(att) {
  const mime = String(att?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(att?.originalName || att?.filename || '');
  return /\.(png|jpe?g)$/i.test(name);
}

async function appendPrintableAttachments(basePdf, attachments) {
  const printableAtts = (attachments || []).filter((att) => {
    if (!att) return false;
    if (att.mimeType === 'application/pdf') return true;
    if (isImageAttachment(att)) return true;
    return false;
  });
  if (printableAtts.length === 0) return basePdf;

  const { PDFDocument } = require('pdf-lib');
  let merged;
  try {
    merged = await PDFDocument.load(basePdf);
  } catch {
    return basePdf;
  }

  for (const att of printableAtts) {
    try {
      const bytes = await loadAttachmentBytes(att);
      if (att.mimeType === 'application/pdf') {
        const src = await PDFDocument.load(bytes);
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
        continue;
      }

      // Append image attachments as standalone A4 pages.
      let embeddedImage;
      const mime = String(att?.mimeType || '').toLowerCase();
      const fileName = String(att?.originalName || att?.filename || '').toLowerCase();
      if (mime === 'image/png' || fileName.endsWith('.png')) {
        embeddedImage = await merged.embedPng(bytes);
      } else {
        embeddedImage = await merged.embedJpg(bytes);
      }

      const page = merged.addPage([595.28, 841.89]); // A4 portrait in points
      const margin = 24;
      const maxWidth = page.getWidth() - margin * 2;
      const maxHeight = page.getHeight() - margin * 2;
      const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height, 1);
      const drawWidth = embeddedImage.width * scale;
      const drawHeight = embeddedImage.height * scale;
      const x = (page.getWidth() - drawWidth) / 2;
      const y = (page.getHeight() - drawHeight) / 2;
      page.drawImage(embeddedImage, { x, y, width: drawWidth, height: drawHeight });
    } catch {
      // Skip unreadable / unsupported attachment and keep the rest.
    }
  }

  return Buffer.from(await merged.save());
}

async function assertPrAccessible(req, pr) {
  if (!pr) return;

  if (await canBypassDocApproval('pr', req.user.role)) return;

  const { stepRole } = await getStepRoleMapping();
  const allowed = await isPrAccessibleForUser(req.user, pr, stepRole);

  if (allowed) return;

  const error = new Error('ไม่มีสิทธิ์เข้าถึงเอกสารนี้');
  error.status = 403;
  throw error;
}

async function assertPrCurrentApprover(req, pr) {
  if (await canBypassDocApproval('pr', req.user.role)) return;

  const { stepRole } = await getStepRoleMapping();
  const { stageSteps, roles } = await getCurrentPrStageRoles(pr, stepRole);
  const actorRole = normalizeRole(req.user.role);

  if (!stageSteps.length || !roles.length) {
    const error = new Error('ขั้นอนุมัติของเอกสารไม่ถูกต้อง');
    error.status = 400;
    throw error;
  }

  if (!roles.includes(actorRole)) {
    const error = new Error('ไม่มีสิทธิ์อนุมัติรายการนี้');
    error.status = 403;
    throw error;
  }

  if (stageSteps.includes(1) && actorRole === 'sales' && pr.salesId === req.user.id) {
    const error = new Error('ผู้สร้างเอกสารไม่สามารถอนุมัติขั้น Sales ได้');
    error.status = 403;
    throw error;
  }

  const effectiveStages = await resolvePrFlowStages(pr.prType?.approvalSteps, pr.sales?.role);
  const hasCurrentStage = effectiveStages.some(stage => stage.includes(Number(pr.approvalStep)));
  if (!hasCurrentStage) {
    const error = new Error('ขั้นอนุมัติของเอกสารไม่ถูกต้อง');
    error.status = 400;
    throw error;
  }
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
      sales: { select: { id: true, fullName: true, role: true, signatureText: true } },
      prType: { select: { id: true, name: true, approvalSteps: true } },
      approvalLogs: {
        select: { approverId: true, action: true },
      },
      items: true,
    };

    const list = await prisma.purchaseRequest.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });

    if (await canBypassDocApproval('pr', req.user.role)) {
      const pg = getPagination(req.query);
      if (pg) {
        const data = list.slice(pg.skip, pg.skip + pg.take);
        return res.json(paginated(data, list.length, pg));
      }
      return res.json(list);
    }

    const { stepRole } = await getStepRoleMapping();
    const visibleList = [];
    for (const item of list) {
      if (await isPrAccessibleForUser(req.user, item, stepRole)) {
        visibleList.push(item);
      }
    }

    const pg = getPagination(req.query);
    if (pg) {
      const data = visibleList.slice(pg.skip, pg.skip + pg.take);
      return res.json(paginated(data, visibleList.length, pg));
    }

    res.json(visibleList);
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
    const url = `${uiBase}/print/pr/${req.params.id}?token=${encodeURIComponent(token)}&mode=pdf`;
    const item = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      select: {
        id: true,
        prNo: true,
        salesId: true,
        status: true,
        approvalStep: true,
        sales: {
          select: { role: true },
        },
        prType: {
          select: { approvalSteps: true },
        },
        approvalLogs: {
          select: { approverId: true, action: true },
        },
        attachments: {
          select: { filename: true, fileUrl: true, mimeType: true, originalName: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
    });
    await assertPrAccessible(req, item);
    const pdf = await renderUrlToPdf(url);
    const finalPdf = await appendPrintableAttachments(pdf, item.attachments);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.prNo || 'pr'}.pdf"`);
    res.send(finalPdf);
  } catch (e) { next(e); }
});

// POST /api/pr
router.post('/', authenticate, prValidators, validate, async (req, res, next) => {
  try {
    const {
      workOrderId, prTypeId, customer, projectRef,
      dateIssue, dateRequired, currency, items = [],
      subTotal, specialDiscount, vat, netTotal, remarks,
    } = req.body;
    const allowedCurrencies = await getPrCurrencies();
    const requestedCurrency = normalizeCurrencyCode(currency || 'THB');
    if (!allowedCurrencies.includes(requestedCurrency)) {
      return res.status(400).json({ message: `currency ต้องเป็นหนึ่งใน: ${allowedCurrencies.join(', ')}` });
    }
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
        currency: requestedCurrency,
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
          currency: source.currency || 'THB',
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
      currency, items = [], subTotal, specialDiscount, vat, netTotal, remarks,
    } = req.body;
    let normalizedCurrency;
    if (currency !== undefined) {
      const allowedCurrencies = await getPrCurrencies();
      normalizedCurrency = normalizeCurrencyCode(currency || 'THB');
      if (!allowedCurrencies.includes(normalizedCurrency)) {
        return res.status(400).json({ message: `currency ต้องเป็นหนึ่งใน: ${allowedCurrencies.join(', ')}` });
      }
    }
    const item = await prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: req.params.id } });
      return tx.purchaseRequest.update({
        where: { id: req.params.id },
        data: {
          customer, projectRef,
          prTypeId: prTypeId !== undefined ? (prTypeId || null) : undefined,
          dateIssue: dateIssue ? new Date(dateIssue) : null,
          dateRequired: dateRequired ? new Date(dateRequired) : null,
          currency: normalizedCurrency,
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
      const stages = await resolvePrFlowStages(pr.prType?.approvalSteps, pr.sales.role);
      const steps = stages.map(stage => stage[0]);
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
      const { stepRole } = await getStepRoleMapping();
      const stageSteps = await getPrCurrentStageSteps(pr.prType?.approvalSteps, pr.sales.role, resumeStep);
      await notifyPrStage(stepRole, stageSteps, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
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
      const { stepRole } = await getStepRoleMapping();
      const stageSteps = await getPrCurrentStageSteps(pr.prType?.approvalSteps, pr.sales.role, nextStep);
      await notifyPrStage(stepRole, stageSteps, `ใบขอซื้อ ${pr.prNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
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
