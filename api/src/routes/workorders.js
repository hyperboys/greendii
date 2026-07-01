const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getFirstStep, getNextStep, getStepRoleMapping, getFlowSteps } = require('../lib/approvalFlow');
const { normalizeRole, expandRoleAliases } = require('../lib/roleAliases');
const { canManageAllDocs, canDeleteOthersDocs, assertQuotationAccessible } = require('../lib/roles');

const WO_APPROVED_NOTIFY_KEY = 'workOrderApprovedNotify';
const TEAM_CHECKLIST_KEYS = [
  'team_delivery_only',
  'team_floor',
  'team_factory2',
  'team_install',
  'team_door',
  'team_contractor',
];

const workOrderValidators = [
  body('project').trim().notEmpty().withMessage('กรุณาระบุชื่อโครงการ'),
  body('customerName').trim().notEmpty().withMessage('กรุณาระบุชื่อลูกค้า'),
  body('handOverJobId').optional({ nullable: true }).isString().withMessage('รูปแบบ handOverJobId ไม่ถูกต้อง'),
  body('qcDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('installDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('รูปแบบวันที่ไม่ถูกต้อง'),
  body('items').optional().isArray().withMessage('items ต้องเป็น array'),
];

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, initials: true, signatureText: true } },
  quotation: {
    select: {
      id: true, quoNo: true,
      items: { orderBy: { seq: 'asc' } },
    },
  },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true, signatureText: true } } },
    orderBy: { actedAt: 'asc' },
  },
  handOverJobs: {
    select: {
      id: true,
      hoNo: true,
      quotationId: true,
      workOrderId: true,
      project: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  },
  attachments: true,
};

function stripRevisionSuffix(docNo = '') {
  return String(docNo).replace(/-R\d+$/i, '')
}

function buildRevisionDocNo(baseNo, revisionNo) {
  return `${stripRevisionSuffix(baseNo)}-R${revisionNo}`
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

async function nextWorkOrderBaseNo() {
  const yy = String(new Date().getFullYear()).slice(2);
  const prefix = `WO${yy}`;
  const lastWO = await prisma.workOrder.findFirst({
    where: { woNo: { startsWith: prefix } },
    orderBy: { woNo: 'desc' },
  });
  const dbSeq = lastWO ? (parseInt(stripRevisionSuffix(lastWO.woNo).replace(prefix, ''), 10) || 0) : 0;
  const floor = await getDocNumberFloor(prefix);
  const seq = Math.max(dbSeq + 1, floor);
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

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

function normalizeDocChecklist(input, fallback = {}, canEditTeamChecklist = false) {
  const source = input && typeof input === 'object' ? input : {};
  const next = { ...fallback };

  for (const [key, value] of Object.entries(source)) {
    if (TEAM_CHECKLIST_KEYS.includes(key) && !canEditTeamChecklist) continue;
    next[key] = Boolean(value);
  }

  if (!canEditTeamChecklist) {
    for (const key of TEAM_CHECKLIST_KEYS) {
      if (!(key in next)) next[key] = Boolean(fallback[key] ?? false);
    }
  }

  return next;
}

function normalizeWorkOrderItems(items) {
  if (!Array.isArray(items)) return [];

  const normalizeDetailRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        const desc = String(row?.desc ?? '').trim();
        const qtyRaw = row?.qty;
        const qty = qtyRaw === '' || qtyRaw == null ? null : Number(qtyRaw);
        const unit = String(row?.unit ?? '').trim();
        return {
          desc,
          qty: Number.isFinite(qty) ? qty : null,
          unit,
        };
      })
      .filter((row) => row.desc || row.qty != null || row.unit);
  };

  const fallbackDetailRowsFromNote = (note) => String(note ?? '')
    .split('\n')
    .map((line) => String(line).trim())
    .filter(Boolean)
    .map((desc) => ({ desc, qty: null, unit: '' }));

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
      const detailRows = normalizeDetailRows(item?.detailRows);
      const normalizedDetailRows = detailRows.length > 0 ? detailRows : fallbackDetailRowsFromNote(note);
      return {
        seq: Number.isFinite(Number(item?.seq)) ? Number(item.seq) : index,
        desc,
        note: normalizedDetailRows.map((row) => row.desc).join('\n'),
        detailRows: normalizedDetailRows,
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
        select: { seq: true, desc: true, note: true, qty: true, unit: true, images: true },
        orderBy: { seq: 'asc' },
      },
    },
  });
  if (!quotation?.items?.length) return [];
  return quotation.items.map((item, index) => ({
    seq: Number.isFinite(Number(item.seq)) ? Number(item.seq) : index,
    desc: String(item.desc ?? ''),
    note: item.note ?? '',
    qty: Number(item.qty ?? 0),
    unit: String(item.unit ?? ''),
    images: Array.isArray(item.images) ? item.images : [],
  }));
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

async function mergePdfBuffers(buffers) {
  const validBuffers = (buffers || []).filter(b => Buffer.isBuffer(b) && b.length > 0);
  if (validBuffers.length === 0) return Buffer.alloc(0);
  if (validBuffers.length === 1) return validBuffers[0];

  const { PDFDocument } = require('pdf-lib');
  const merged = await PDFDocument.create();
  for (const pdfBuffer of validBuffers) {
    try {
      const src = await PDFDocument.load(pdfBuffer);
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach(page => merged.addPage(page));
    } catch {
      // Skip unreadable buffers and continue merging the remaining PDFs.
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

async function ensureHandOverSelectable(quotationId, handOverJobId, currentWorkOrderId) {
  if (!handOverJobId) return null;

  const handover = await prisma.handOverJob.findUnique({
    where: { id: handOverJobId },
    select: { id: true, quotationId: true, workOrderId: true },
  });

  if (!handover) {
    const error = new Error('ไม่พบเอกสารส่งมอบงานที่เลือก');
    error.status = 400;
    throw error;
  }

  if (quotationId && handover.quotationId !== quotationId) {
    const error = new Error('เอกสารส่งมอบงานที่เลือกไม่สอดคล้องกับใบเสนอราคา');
    error.status = 400;
    throw error;
  }

  if (handover.workOrderId && handover.workOrderId !== currentWorkOrderId) {
    const error = new Error('เอกสารส่งมอบงานนี้ถูกผูกกับใบสั่งงานอื่นแล้ว');
    error.status = 400;
    throw error;
  }

  return handover;
}

async function syncSelectedHandOverJob(workOrderId, handOverJobId, tx = prisma) {
  if (handOverJobId === undefined) return;

  if (!handOverJobId) {
    await tx.handOverJob.updateMany({
      where: { workOrderId },
      data: { workOrderId: null },
    });
    return;
  }

  await tx.handOverJob.updateMany({
    where: {
      workOrderId,
      id: { not: handOverJobId },
    },
    data: { workOrderId: null },
  });

  await tx.handOverJob.update({
    where: { id: handOverJobId },
    data: { workOrderId },
  });
}

async function assertWorkOrderAccessible(req, workOrder) {
  if (!workOrder) return;
  if (canManageAllDocs(req.user.role) || workOrder.salesId === req.user.id) return;

  if (workOrder.status === 'pending') {
    const { stepRole } = await getStepRoleMapping();
    const requiredRole = stepRole[workOrder.approvalStep];
    if (requiredRole && normalizeRole(requiredRole) === normalizeRole(req.user.role)) return;
  }

  const error = new Error('ไม่มีสิทธิ์เข้าถึงเอกสารของผู้อื่น');
  error.status = 403;
  throw error;
}

function buildWorkOrderNotifyMessage(template, wo) {
  const fallback = 'ใบสั่งงาน {woNo} อนุมัติครบแล้ว';
  const source = (typeof template === 'string' && template.trim()) ? template : fallback;
  return source
    .replaceAll('{woNo}', wo.woNo || '-')
    .replaceAll('{project}', wo.project || '-')
    .replaceAll('{customerName}', wo.customerName || '-');
}

async function notifyWorkOrderApprovedTargets(wo, actorUserId) {
  const settings = await prisma.settings.findUnique({
    where: { id: 'main' },
    select: { approvalFlowConfig: true },
  });

  const notifyCfg = settings?.approvalFlowConfig?.[WO_APPROVED_NOTIFY_KEY];
  if (!notifyCfg || typeof notifyCfg !== 'object') return;

  const enabled = Boolean(notifyCfg.enabled);
  if (!enabled) return;

  const roles = Array.isArray(notifyCfg.roles)
    ? notifyCfg.roles.map(r => String(r || '').trim()).filter(Boolean)
    : [];
  const userIds = Array.isArray(notifyCfg.userIds)
    ? notifyCfg.userIds.map(id => String(id || '').trim()).filter(Boolean)
    : [];

  const roleCandidates = Array.from(new Set(roles.flatMap(expandRoleAliases)));
  const [roleUsers, directUsers] = await Promise.all([
    roleCandidates.length
      ? prisma.user.findMany({
          where: { role: { in: roleCandidates }, active: true },
          select: { id: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds }, active: true },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const recipientIds = new Set([
    ...roleUsers.map(u => u.id),
    ...directUsers.map(u => u.id),
  ]);

  if (actorUserId) recipientIds.delete(actorUserId);
  if (wo.salesId) recipientIds.delete(wo.salesId);
  if (recipientIds.size === 0) return;

  const text = buildWorkOrderNotifyMessage(notifyCfg.messageTemplate, wo);
  await Promise.all([...recipientIds].map(userId => notifyUser(userId, text).catch(() => {})));
}

// GET /api/workorders/by-quotation/:quotationId/previous
// Returns the currently active Work Order in the same quotation chain,
// used as the source when creating a WO from a revised quotation (R1/R2/...)
router.get('/by-quotation/:quotationId/previous', authenticate, async (req, res, next) => {
  try {
    const quotation = await prisma.quotation.findUniqueOrThrow({
      where: { id: req.params.quotationId },
      select: { id: true, salesId: true, rootQuotationId: true, revisionNo: true },
    })
    assertQuotationAccessible(req, quotation)

    if (!quotation.revisionNo || quotation.revisionNo <= 0) {
      return res.json(null)
    }

    const rootQuotationId = quotation.rootQuotationId || quotation.id
    const source = await prisma.workOrder.findFirst({
      where: {
        active: true,
        quotation: {
          is: {
            OR: [
              { id: rootQuotationId },
              { rootQuotationId },
            ],
          },
        },
      },
      orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
      include: {
        quotation: { select: { id: true, quoNo: true } },
      },
    })

    res.json(source || null)
  } catch (e) { next(e) }
})

// GET /api/workorders
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, salesId, isClosed, q, active } = req.query;
    const where = {};
    if (status) where.status = status;
    if (salesId) where.salesId = salesId;
    if (isClosed !== undefined) where.isClosed = isClosed === 'true';
    if (active !== undefined) where.active = active === 'true';
    else where.active = true;
    if (q) where.OR = [
      { woNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
    ];
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
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/workorders/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uiBase = getUiBaseUrl(req);
    const item = await prisma.workOrder.findUniqueOrThrow({
      where: { id: req.params.id },
      select: {
        id: true,
        woNo: true,
        quotationId: true,
        salesId: true,
        handOverJobs: {
          select: { id: true, hoNo: true, quotationId: true, updatedAt: true, createdAt: true },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
        attachments: {
          select: { filename: true, fileUrl: true, mimeType: true, originalName: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
    });

    const workOrderUrl = `${uiBase}/print/workorder/${item.id}?token=${encodeURIComponent(token)}&mode=pdf`;
    const buffers = [await renderUrlToPdf(workOrderUrl)];

    if (item.quotationId) {
      const quotationUrl = `${uiBase}/print/quotation/${item.quotationId}?token=${encodeURIComponent(token)}&mode=pdf`;
      try {
        const quotationPdf = await renderUrlToPdf(quotationUrl);
        buffers.push(quotationPdf);
      } catch {
        // Skip quotation PDF if rendering fails.
      }
    }

    const selectedHandOver = item.handOverJobs?.[0] || null;
    if (selectedHandOver?.id) {
      const handOverUrl = `${uiBase}/print/handover/${selectedHandOver.id}?token=${encodeURIComponent(token)}&mode=pdf`;
      try {
        const handOverPdf = await renderUrlToPdf(handOverUrl);
        buffers.push(handOverPdf);
      } catch {
        // Skip handover PDF if rendering fails.
      }
    }

    const mergedMain = await mergePdfBuffers(buffers);
    const finalPdf = await appendPdfAttachments(mergedMain, item.attachments);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.woNo || 'workorder'}.pdf"`);
    res.send(finalPdf);
  } catch (e) { next(e); }
});

// POST /api/workorders
router.post('/', authenticate, workOrderValidators, validate, async (req, res, next) => {
  try {
    const {
      handOverJobId,
      quotationId, project, location, products, items, responsibility,
      customerName, contactName, contactTel, teamAssignment,
      qcDate, installDate, remark, docChecklist,
    } = req.body;
    const normalizedQuotationId = normalizeOptionalId(quotationId);
    const normalizedHandOverJobId = normalizeOptionalId(handOverJobId);
    await ensureQuotationAccessible(req, normalizedQuotationId);
    await ensureHandOverSelectable(normalizedQuotationId, normalizedHandOverJobId, null);
    const normalizedItems = normalizeWorkOrderItems(items);
    const quotationItemsSnapshot = normalizedQuotationId
      ? await getQuotationItemsSnapshot(normalizedQuotationId)
      : [];
    const canEditTeamChecklist = normalizeRole(req.user.role) === 'project_mgr';

    const linkedQuotation = normalizedQuotationId
      ? await prisma.quotation.findUnique({
          where: { id: normalizedQuotationId },
          select: {
            id: true,
            rootQuotationId: true,
            revisionNo: true,
            customerName: true,
            project: true,
          },
        })
      : null

    const isRevisionQuote = Boolean(linkedQuotation && linkedQuotation.revisionNo > 0)

    const wo = await prisma.$transaction(async (tx) => {
      let woNo = await nextWorkOrderBaseNo()
      let rootWorkOrderId = null
      let revisionNo = 0
      let projectValue = project
      let locationValue = location
      let productsValue = products
      let itemsValue = normalizedItems.length > 0 ? normalizedItems : quotationItemsSnapshot
      let responsibilityValue = responsibility
      let customerNameValue = customerName
      let contactNameValue = contactName
      let contactTelValue = contactTel
      let teamAssignmentValue = teamAssignment
      let qcDateValue = qcDate
      let installDateValue = installDate
      let remarkValue = remark
      let checklistValue = normalizeDocChecklist(docChecklist, {}, canEditTeamChecklist)

      if (isRevisionQuote) {
        const rootQuotationId = linkedQuotation.rootQuotationId || linkedQuotation.id
        const prevActiveWo = await tx.workOrder.findFirst({
          where: {
            active: true,
            quotation: {
              OR: [
                { id: rootQuotationId },
                { rootQuotationId },
              ],
            },
          },
          orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
        })

        revisionNo = linkedQuotation.revisionNo

        if (prevActiveWo) {
          woNo = buildRevisionDocNo(prevActiveWo.woNo, revisionNo)
          rootWorkOrderId = prevActiveWo.rootWorkOrderId || prevActiveWo.id

          projectValue = project || prevActiveWo.project
          locationValue = location ?? prevActiveWo.location
          productsValue = products ?? prevActiveWo.products
          itemsValue = normalizedItems.length > 0
            ? normalizedItems
            : (Array.isArray(prevActiveWo.items) && prevActiveWo.items.length > 0
                ? prevActiveWo.items
                : quotationItemsSnapshot)
          responsibilityValue = responsibility ?? prevActiveWo.responsibility
          customerNameValue = customerName || prevActiveWo.customerName
          contactNameValue = contactName ?? prevActiveWo.contactName
          contactTelValue = contactTel ?? prevActiveWo.contactTel
          teamAssignmentValue = teamAssignment ?? prevActiveWo.teamAssignment
          qcDateValue = qcDate || (prevActiveWo.qcDate ? prevActiveWo.qcDate.toISOString().slice(0, 10) : null)
          installDateValue = installDate || (prevActiveWo.installDate ? prevActiveWo.installDate.toISOString().slice(0, 10) : null)
          remarkValue = remark ?? prevActiveWo.remark
          checklistValue = normalizeDocChecklist(docChecklist, prevActiveWo.docChecklist || {}, canEditTeamChecklist)

          await tx.workOrder.update({ where: { id: prevActiveWo.id }, data: { active: false } })
        } else {
          woNo = buildRevisionDocNo(await nextWorkOrderBaseNo(), revisionNo)
          projectValue = project || linkedQuotation.project
          customerNameValue = customerName || linkedQuotation.customerName
          itemsValue = normalizedItems.length > 0 ? normalizedItems : quotationItemsSnapshot
        }
      }

      if (!projectValue || !customerNameValue) {
        const error = new Error('กรุณาระบุข้อมูลลูกค้าและโครงการให้ครบถ้วน')
        error.status = 400
        throw error
      }

      const created = await tx.workOrder.create({
        data: {
          woNo,
          active: true,
          revisionNo,
          rootWorkOrderId,
          quotationId: normalizedQuotationId,
          project: projectValue,
          location: locationValue,
          products: productsValue,
          items: itemsValue,
          responsibility: responsibilityValue,
          customerName: customerNameValue,
          contactName: contactNameValue,
          contactTel: contactTelValue,
          teamAssignment: teamAssignmentValue,
          qcDate: qcDateValue ? new Date(qcDateValue) : null,
          installDate: installDateValue ? new Date(installDateValue) : null,
          remark: remarkValue,
          docChecklist: checklistValue,
          salesId: req.user.id,
          status: 'draft',
        },
      })

      await syncSelectedHandOverJob(created.id, normalizedHandOverJobId, tx)
      return created
    })

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
    if (!isEditableApprovalDocStatus(existing.status)) {
      return res.status(400).json({ message: EDITABLE_APPROVAL_DOC_MESSAGE });
    }
    const {
      handOverJobId,
      quotationId,
      project, location, products, items, responsibility,
      customerName, contactName, contactTel, teamAssignment,
      qcDate, installDate, remark, docChecklist,
    } = req.body;
    const normalizedQuotationId = normalizeOptionalId(quotationId);
    const normalizedHandOverJobId = normalizeOptionalId(handOverJobId);
    await ensureQuotationAccessible(req, normalizedQuotationId);
    await ensureHandOverSelectable(normalizedQuotationId, normalizedHandOverJobId, req.params.id);
    const normalizedItems = normalizeWorkOrderItems(items);
    const quotationRelation = buildOptionalRelationUpdate(normalizedQuotationId);
    const canEditTeamChecklist = normalizeRole(req.user.role) === 'project_mgr';
    const wo = await prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id: req.params.id },
        data: {
          project, location, products, items: normalizedItems, responsibility,
          customerName, contactName, contactTel, teamAssignment,
          qcDate: qcDate ? new Date(qcDate) : null,
          installDate: installDate ? new Date(installDate) : null,
          remark, docChecklist: normalizeDocChecklist(docChecklist, existing.docChecklist || {}, canEditTeamChecklist),
          ...(quotationRelation ? { quotation: quotationRelation } : {}),
        },
      });

      await syncSelectedHandOverJob(req.params.id, normalizedHandOverJobId, tx)
      return updated
    })
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
    let resumeStep = firstStep;
    if (wo.status === 'rejected') {
      const steps = await getFlowSteps('workOrder');
      const currentStep = Number(wo.approvalStep);
      if (steps.includes(currentStep)) {
        // Continue from the step that previously rejected the document.
        resumeStep = currentStep;
      }
    }
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: resumeStep },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: req.body.comment || 'ส่งเข้าอนุมัติ',
      },
    });
    await notifyStep(resumeStep, `ใบสั่งงาน ${wo.woNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    await assertWorkOrderAccessible(req, wo);
    if (wo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const { comment, docChecklist } = req.body || {};
    const { stepRole } = await getStepRoleMapping();
    const requiredRole = normalizeRole(stepRole[wo.approvalStep]);
    const actorRole = normalizeRole(req.user.role);
    const canEditTeamChecklistOnApprove = requiredRole === 'project_mgr' && actorRole === 'project_mgr';
    const nextDocChecklist = canEditTeamChecklistOnApprove
      ? normalizeDocChecklist(docChecklist, wo.docChecklist || {}, true)
      : undefined;
    const nextStep = await getNextStep('workOrder', wo.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const isClosed = nextStep === null;
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: {
        approvalStep: nextStep ?? wo.approvalStep, status: newStatus,
        isClosed, closedAt: isClosed ? new Date() : null,
        ...(nextDocChecklist ? { docChecklist: nextDocChecklist } : {}),
      },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: wo.approvalStep,
        action: 'approve', comment: comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(wo.salesId, `ใบสั่งงาน ${wo.woNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
      await notifyWorkOrderApprovedTargets(wo, req.user.id).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบสั่งงาน ${wo.woNo} รอการอนุมัติจากคุณ`, { excludeUserId: req.user.id }).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    await assertWorkOrderAccessible(req, wo);
    if (wo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.$transaction(async (tx) => {
      // Clear completed approval sequence/signatures from the rejected cycle.
      await tx.approvalLog.deleteMany({
        where: {
          docType: 'workorder',
          workOrderId: wo.id,
          action: 'approve',
        },
      });

      const rejected = await tx.workOrder.update({
        where: { id: req.params.id },
        data: { status: 'rejected' },
      });

      await tx.approvalLog.create({
        data: {
          docType: 'workorder', workOrderId: wo.id,
          approverId: req.user.id, step: wo.approvalStep,
          action: 'reject', comment: req.body.comment || '',
        },
      });

      return rejected;
    });
    await notifyUser(wo.salesId, `ใบสั่งงาน ${wo.woNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
