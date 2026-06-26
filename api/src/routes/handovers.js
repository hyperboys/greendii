const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getFirstStep, getNextStep, getFlowSteps } = require('../lib/approvalFlow');
const { DOC_MANAGER_ROLES, canManageAllDocs, canDeleteOthersDocs } = require('../lib/roles');

const MANAGER_ROLES = DOC_MANAGER_ROLES;

const handoverValidators = [
  body('project').trim().notEmpty().withMessage('กรุณาระบุชื่อโครงการ'),
  body('serviceDate').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('qualityProduct').optional().isFloat({ min: 0 }),
  body('qualitySales').optional().isFloat({ min: 0 }),
  body('qualityInstall').optional().isFloat({ min: 0 }),
  body('items').optional().isArray().withMessage('items ต้องเป็น array'),
];

function normalizeHandoverItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const desc = String(item?.desc ?? '').trim();
      if (!desc) return null;
      const qtyRaw = Number(item?.qty);
      const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      const unit = String(item?.unit ?? '').trim();
      const note = item?.note == null ? '' : String(item.note);
      const images = Array.isArray(item?.images)
        ? item.images.map(v => String(v || '')).filter(Boolean)
        : [];
      return {
        seq: Number.isFinite(Number(item?.seq)) ? Number(item.seq) : index,
        desc,
        note,
        qty,
        unit,
        images,
      };
    })
    .filter(Boolean);
}

async function getQuotationItemsSnapshot(quotationId) {
  if (!quotationId) return [];
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      items: {
        select: { seq: true, desc: true, note: true, detailRows: true, qty: true, unit: true, images: true },
        orderBy: { seq: 'asc' },
      },
    },
  });
  if (!quotation?.items?.length) return [];
  return quotation.items.map((item, index) => ({
    seq: Number.isFinite(Number(item.seq)) ? Number(item.seq) : index,
    desc: String(item.desc ?? ''),
    note: item.note ?? '',
    detailRows: Array.isArray(item.detailRows) ? item.detailRows : [],
    qty: Number(item.qty ?? 0),
    unit: String(item.unit ?? ''),
    images: Array.isArray(item.images) ? item.images : [],
  }));
}

function buildOptionalRelationUpdate(id) {
  if (id === undefined) return undefined;
  return id ? { connect: { id } } : { disconnect: true };
}

async function assertQuotationAccessible(req, quotationId) {
  if (!quotationId || MANAGER_ROLES.includes(req.user.role)) return;
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, salesId: true },
  });
  if (!quotation || quotation.salesId !== req.user.id) {
    const error = new Error('Forbidden quotation');
    error.status = 403;
    throw error;
  }
}

async function findWorkOrderIdByQuotationId(quotationId) {
  if (!quotationId) return null;
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      quotationId,
      active: true,
      status: { not: 'cancelled' },
    },
    orderBy: [
      { revisionNo: 'desc' },
      { createdAt: 'desc' },
    ],
    select: { id: true },
  });
  return workOrder?.id || null;
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

// GET /api/handovers
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (q) where.OR = [
      { hoNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
    ];
    const listInclude = { sales: { select: { id: true, fullName: true } } };
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.handOverJob.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
        prisma.handOverJob.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.handOverJob.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/handovers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.handOverJob.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        sales: { select: { id: true, fullName: true } },
        quotation: {
          select: {
            id: true,
            quoNo: true,
            sales: { select: { id: true, fullName: true, email: true, phone: true } },
            items: {
              select: { id: true, seq: true, desc: true, note: true, detailRows: true, qty: true, unit: true, images: true },
              orderBy: { seq: 'asc' },
            },
          },
        },
        workOrder: {
          select: {
            id: true,
            woNo: true,
            quotation: {
              select: {
                id: true,
                quoNo: true,
                sales: { select: { id: true, fullName: true, email: true, phone: true } },
                items: {
                  select: { id: true, seq: true, desc: true, note: true, detailRows: true, qty: true, unit: true, images: true },
                  orderBy: { seq: 'asc' },
                },
              },
            },
          },
        },
        approvalLogs: {
          include: { approver: { select: { id: true, fullName: true, role: true } } },
          orderBy: { actedAt: 'asc' },
        },
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/handovers/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uiBase = getUiBaseUrl(req);
    const url = `${uiBase}/print/handover/${req.params.id}?token=${encodeURIComponent(token)}`;
    const item = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id }, select: { hoNo: true, salesId: true } });
    const pdf = await renderUrlToPdf(url);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.hoNo || 'handover'}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// POST /api/handovers
router.post('/', authenticate, handoverValidators, validate, async (req, res, next) => {
  try {
    const {
      quotationId, workOrderId, project, contractor, location,
      contactName, contactTel, product, responsibility,
      serviceDate, qualityProduct, qualitySales, qualityInstall, comment, items,
    } = req.body;
    if (!project) return res.status(400).json({ message: 'project required' });
    const yy = String(new Date().getFullYear()).slice(2);
    const hoPrefix = `HO${yy}`;
    const lastHO = await prisma.handOverJob.findFirst({
      where: { hoNo: { startsWith: hoPrefix } },
      orderBy: { hoNo: 'desc' },
    });
    const hoDbSeq = lastHO ? (parseInt(lastHO.hoNo.replace(hoPrefix, ''), 10) || 0) : 0;
    const hoFloor = await getDocNumberFloor(hoPrefix);
    const hoSeq = Math.max(hoDbSeq + 1, hoFloor);
    const hoNo = `${hoPrefix}${String(hoSeq).padStart(3, '0')}`;
    await assertQuotationAccessible(req, quotationId);

    // If user selected quotation and did not explicitly send workOrderId,
    // auto-link the latest active work order created from that quotation.
    const resolvedWorkOrderId = workOrderId || await findWorkOrderIdByQuotationId(quotationId);
    const normalizedItems = normalizeHandoverItems(items);
    const itemsSnapshot = normalizedItems.length > 0
      ? normalizedItems
      : await getQuotationItemsSnapshot(quotationId);

    const item = await prisma.handOverJob.create({
      data: {
        hoNo,
        quotationId: quotationId || null,
        workOrderId: resolvedWorkOrderId,
        project, contractor, location,
        contactName, contactTel, product, items: itemsSnapshot, responsibility,
        serviceDate: serviceDate ? new Date(serviceDate) : null,
        qualityProduct: qualityProduct || 0,
        qualitySales: qualitySales || 0,
        qualityInstall: qualityInstall || 0,
        comment, salesId: req.user.id, status: 'draft',
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/handovers/:id
router.put('/:id', authenticate, handoverValidators, validate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!isEditableApprovalDocStatus(ho.status)) return res.status(400).json({ message: EDITABLE_APPROVAL_DOC_MESSAGE });
    if (ho.salesId !== req.user.id && !canManageAllDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเอกสารของผู้อื่น' });
    }
    const {
      quotationId, workOrderId, project, contractor, location, contactName, contactTel,
      product, responsibility, serviceDate,
      qualityProduct, qualitySales, qualityInstall, comment, items,
    } = req.body;
    await assertQuotationAccessible(req, quotationId);
    const quotationRelation = buildOptionalRelationUpdate(quotationId);
    const workOrderRelation = buildOptionalRelationUpdate(workOrderId);
    const normalizedItems = normalizeHandoverItems(items);
    const nextItemsSnapshot = items === undefined
      ? undefined
      : (normalizedItems.length > 0
          ? normalizedItems
          : await getQuotationItemsSnapshot(quotationId));
    const item = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: {
        project, contractor, location, contactName, contactTel,
        product, responsibility,
        ...(nextItemsSnapshot !== undefined ? { items: nextItemsSnapshot } : {}),
        serviceDate: serviceDate ? new Date(serviceDate) : undefined,
        qualityProduct, qualitySales, qualityInstall, comment,
        ...(quotationRelation ? { quotation: quotationRelation } : {}),
        ...(workOrderRelation ? { workOrder: workOrderRelation } : {}),
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/handovers/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.salesId !== req.user.id && !canDeleteOthersDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ลบเอกสารของผู้อื่น' });
    }
    if (!['draft', 'rejected'].includes(ho.status)) {
      return res.status(400).json({ message: 'ลบได้เฉพาะเอกสารที่อยู่ในสถานะ Draft หรือ Rejected เท่านั้น' });
    }
    await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/handovers/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!['draft', 'rejected'].includes(ho.status)) return res.status(400).json({ message: 'ส่งได้เฉพาะ Draft หรือ Rejected เท่านั้น' });
    const firstStep = await getFirstStep('handover');
    let resumeStep = firstStep;
    if (ho.status === 'rejected') {
      const steps = await getFlowSteps('handover');
      const currentStep = Number(ho.approvalStep);
      if (steps.includes(currentStep)) {
        resumeStep = currentStep;
      }
    }
    const updated = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: resumeStep },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'handover', handOverJobId: ho.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: req.body.comment || 'ส่งเข้าอนุมัติ',
      },
    });
    await notifyStep(resumeStep, `ใบส่งมอบงาน ${ho.hoNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/handovers/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const nextStep = await getNextStep('handover', ho.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const updated = await prisma.handOverJob.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep ?? ho.approvalStep, status: newStatus },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'handover', handOverJobId: ho.id,
        approverId: req.user.id, step: ho.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(ho.salesId, `ใบส่งมอบงาน ${ho.hoNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบส่งมอบงาน ${ho.hoNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/handovers/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const ho = await prisma.handOverJob.findUniqueOrThrow({ where: { id: req.params.id } });
    if (ho.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.approvalLog.deleteMany({
        where: {
          docType: 'handover',
          handOverJobId: ho.id,
          action: 'approve',
        },
      });

      const rejected = await tx.handOverJob.update({
        where: { id: req.params.id },
        data: { status: 'rejected' },
      });

      await tx.approvalLog.create({
        data: {
          docType: 'handover', handOverJobId: ho.id,
          approverId: req.user.id, step: ho.approvalStep,
          action: 'reject', comment: req.body.comment || '',
        },
      });

      return rejected;
    });
    await notifyUser(ho.salesId, `ใบส่งมอบงาน ${ho.hoNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
