const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getFirstStep, getNextStep } = require('../lib/approvalFlow');
const { canManageAllDocs, canDeleteOthersDocs, assertDocAccessible, assertQuotationAccessible } = require('../lib/roles');

const workOrderValidators = [
  body('project').trim().notEmpty().withMessage('กรุณาระบุชื่อโครงการ'),
  body('customerName').trim().notEmpty().withMessage('กรุณาระบุชื่อลูกค้า'),
  body('qcDate').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('installDate').optional({ nullable: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
];

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, initials: true } },
  quotation: {
    select: {
      id: true, quoNo: true,
      items: { orderBy: { seq: 'asc' } },
    },
  },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true } } },
    orderBy: { actedAt: 'asc' },
  },
  attachments: true,
};

function normalizeOptionalId(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function buildOptionalRelationUpdate(id) {
  if (id === undefined) return undefined;
  return id ? { connect: { id } } : { disconnect: true };
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

async function appendPdfAttachments(basePdf, attachments) {
  const pdfAtts = (attachments || []).filter(a => a.mimeType === 'application/pdf');
  if (pdfAtts.length === 0) return basePdf;
  const { PDFDocument } = require('pdf-lib');
  let merged;
  try {
    merged = await PDFDocument.load(basePdf);
  } catch {
    return basePdf;
  }
  for (const att of pdfAtts) {
    try {
      const bytes = await loadAttachmentBytes(att);
      const src = await PDFDocument.load(bytes);
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach(p => merged.addPage(p));
    } catch {
      // skip unreadable / encrypted PDF attachment
    }
  }
  return Buffer.from(await merged.save());
}

async function ensureQuotationAccessible(req, quotationId) {
  if (!quotationId) return;
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, salesId: true },
  });
  if (!quotation) {
    const error = new Error('ไม่พบใบเสนอราคาที่อ้างอิง');
    error.status = 400;
    throw error;
  }
  assertQuotationAccessible(req, quotation);
}

// GET /api/workorders
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, salesId, isClosed, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (salesId) where.salesId = salesId;
    if (isClosed !== undefined) where.isClosed = isClosed === 'true';
    if (q) where.OR = [
      { woNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
    ];
    if (!canManageAllDocs(req.user.role)) where.salesId = req.user.id;

    const listInclude = { sales: { select: { id: true, fullName: true } } };
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.workOrder.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
        prisma.workOrder.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.workOrder.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/workorders/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.workOrder.findUniqueOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_FULL,
    });
    assertDocAccessible(req, item);
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/workorders/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uiBase = getUiBaseUrl(req);
    const url = `${uiBase}/print/workorder/${req.params.id}?token=${encodeURIComponent(token)}&mode=pdf`;
    const item = await prisma.workOrder.findUniqueOrThrow({
      where: { id: req.params.id },
      select: {
        woNo: true,
        salesId: true,
        attachments: {
          select: { filename: true, fileUrl: true, mimeType: true, originalName: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
    });
    assertDocAccessible(req, item);
    const pdf = await renderUrlToPdf(url);
    const finalPdf = await appendPdfAttachments(pdf, item.attachments);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.woNo || 'workorder'}.pdf"`);
    res.send(finalPdf);
  } catch (e) { next(e); }
});

// POST /api/workorders
router.post('/', authenticate, workOrderValidators, validate, async (req, res, next) => {
  try {
    const {
      quotationId, project, location, products, responsibility,
      customerName, contactName, contactTel, teamAssignment,
      qcDate, installDate, remark, docChecklist,
    } = req.body;
    if (!project || !customerName) {
      return res.status(400).json({ message: 'project and customerName required' });
    }
    const yy = String(new Date().getFullYear()).slice(2);
    const lastWO = await prisma.workOrder.findFirst({
      where: { woNo: { startsWith: `WO${yy}` } },
      orderBy: { woNo: 'desc' },
    });
    const seq = lastWO ? (parseInt(lastWO.woNo.replace(`WO${yy}`, ''), 10) || 0) + 1 : 1;
    const woNo = `WO${yy}${String(seq).padStart(3, '0')}`;
    const normalizedQuotationId = normalizeOptionalId(quotationId);
    await ensureQuotationAccessible(req, normalizedQuotationId);
    const wo = await prisma.workOrder.create({
      data: {
        woNo, quotationId: normalizedQuotationId, project, location, products, responsibility,
        customerName, contactName, contactTel, teamAssignment,
        qcDate: qcDate ? new Date(qcDate) : null,
        installDate: installDate ? new Date(installDate) : null,
        remark, docChecklist: docChecklist || {},
        salesId: req.user.id, status: 'draft',
      },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: 'สร้างใบสั่งงาน',
      },
    });
    res.status(201).json(wo);
  } catch (e) { next(e); }
});

// PUT /api/workorders/:id
router.put('/:id', authenticate, workOrderValidators, validate, async (req, res, next) => {
  try {
    const existing = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.isClosed) return res.status(400).json({ message: 'Work order is closed' });
    if (existing.salesId !== req.user.id && !canManageAllDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเอกสารของผู้อื่น' });
    }
    const {
      quotationId,
      project, location, products, responsibility,
      customerName, contactName, contactTel, teamAssignment,
      qcDate, installDate, remark, docChecklist,
    } = req.body;
    const normalizedQuotationId = normalizeOptionalId(quotationId);
    await ensureQuotationAccessible(req, normalizedQuotationId);
    const quotationRelation = buildOptionalRelationUpdate(normalizedQuotationId);
    const wo = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: {
        project, location, products, responsibility,
        customerName, contactName, contactTel, teamAssignment,
        qcDate: qcDate ? new Date(qcDate) : null,
        installDate: installDate ? new Date(installDate) : null,
        remark, docChecklist: docChecklist || existing.docChecklist,
        ...(quotationRelation ? { quotation: quotationRelation } : {}),
      },
    });
    res.json(wo);
  } catch (e) { next(e); }
});

// DELETE /api/workorders/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (wo.salesId !== req.user.id && !canDeleteOthersDocs(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ลบเอกสารของผู้อื่น' });
    }
    if (!['draft', 'rejected'].includes(wo.status)) {
      return res.status(400).json({ message: 'ลบได้เฉพาะเอกสารที่อยู่ในสถานะ Draft หรือ Rejected เท่านั้น' });
    }
    await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!['draft', 'rejected'].includes(wo.status)) return res.status(400).json({ message: 'ส่งได้เฉพาะ Draft หรือ Rejected เท่านั้น' });
    const firstStep = await getFirstStep('workOrder');
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: firstStep },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: req.body.comment || 'ส่งเข้าอนุมัติ',
      },
    });
    await notifyStep(firstStep, `ใบสั่งงาน ${wo.woNo} รอการอนุมัติจากคุณ`).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (wo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const nextStep = await getNextStep('workOrder', wo.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const isClosed = nextStep === null;
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: {
        approvalStep: nextStep ?? wo.approvalStep, status: newStatus,
        isClosed, closedAt: isClosed ? new Date() : null,
      },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: wo.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(wo.salesId, `ใบสั่งงาน ${wo.woNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบสั่งงาน ${wo.woNo} รอการอนุมัติจากคุณ`).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (wo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: wo.approvalStep,
        action: 'reject', comment: req.body.comment || '',
      },
    });
    await notifyUser(wo.salesId, `ใบสั่งงาน ${wo.woNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
