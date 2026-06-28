const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const nodemailer = require('nodemailer');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
const { assertDocAccessible, canManageAllDocs } = require('../lib/roles');

const ADMIN_ROLES = ['admin', 'director', 'admin_mgr'];
const GENERATED_PREFIX = 'generated:';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
});

function splitEmails(input) {
  return String(input || '')
    .split(/[;,\n\t ]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function extractEmail(raw) {
  const text = String(raw || '').trim();
  const angleMatch = text.match(/<([^<>]+)>/);
  const candidate = (angleMatch ? angleMatch[1] : text).trim();
  return candidate.toLowerCase();
}

function isValidEmail(email) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(email || '').trim());
}

function normalizeEmailList(value) {
  const raw = Array.isArray(value) ? value : splitEmails(value);
  return raw
    .map(extractEmail)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function parseArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return splitEmails(value);
  }
}

function toPlainText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadAttachmentBytes(att) {
  const fileUrl = att.fileUrl || '';
  if (/^https?:\/\//i.test(fileUrl)) {
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error(`fetch failed ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }
  return fs.readFile(path.join(__dirname, '../../uploads', att.filename));
}

function getRequesterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.ip || null;
}

function parseSelectedAttachmentIds(raw) {
  return parseArrayField(raw).map(v => String(v || '').trim()).filter(Boolean);
}

function buildGeneratedAttachments(workOrder) {
  const generated = [
    {
      id: `${GENERATED_PREFIX}workorder:${workOrder.id}`,
      originalName: `${workOrder.woNo || 'workorder'}.pdf`,
      filename: `${workOrder.woNo || 'workorder'}.pdf`,
      mimeType: 'application/pdf',
      size: 0,
      sourceType: 'workorder',
      sourceDocNo: workOrder.woNo,
      sourceLabel: 'Work Order (Generated PDF)',
      virtualType: 'workorder-pdf',
    },
  ];

  if (workOrder.quotationId && workOrder.quotation?.quoNo) {
    generated.push({
      id: `${GENERATED_PREFIX}quotation:${workOrder.quotationId}`,
      originalName: `${workOrder.quotation.quoNo}.pdf`,
      filename: `${workOrder.quotation.quoNo}.pdf`,
      mimeType: 'application/pdf',
      size: 0,
      sourceType: 'quotation',
      sourceDocNo: workOrder.quotation.quoNo,
      sourceLabel: 'Quotation (Generated PDF)',
      virtualType: 'quotation-pdf',
    });
  }

  for (const handover of workOrder.handOverJobs || []) {
    generated.push({
      id: `${GENERATED_PREFIX}handover:${handover.id}`,
      originalName: `${handover.hoNo || 'handover'}.pdf`,
      filename: `${handover.hoNo || 'handover'}.pdf`,
      mimeType: 'application/pdf',
      size: 0,
      sourceType: 'handover',
      sourceDocNo: handover.hoNo || '-',
      sourceLabel: 'Handover (Generated PDF)',
      virtualType: 'handover-pdf',
      handOverJobId: handover.id,
    });
  }

  return generated;
}

async function buildGeneratedPdfBytes(attachment, req, workOrder) {
  const uiBase = getUiBaseUrl(req);
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const query = `?token=${encodeURIComponent(token)}&mode=pdf`;

  if (attachment.virtualType === 'workorder-pdf') {
    return renderUrlToPdf(`${uiBase}/print/workorder/${workOrder.id}${query}`);
  }
  if (attachment.virtualType === 'quotation-pdf' && workOrder.quotationId) {
    return renderUrlToPdf(`${uiBase}/print/quotation/${workOrder.quotationId}${query}`);
  }
  if (attachment.virtualType === 'handover-pdf' && attachment.handOverJobId) {
    return renderUrlToPdf(`${uiBase}/print/handover/${attachment.handOverJobId}${query}`);
  }
  throw new Error('unknown generated attachment type');
}

function getMailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function updateEmailHistory(recipients, customerId) {
  await Promise.all(
    recipients.map(async (email) => {
      await prisma.emailHistory.upsert({
        where: { email_customerId: { email, customerId: customerId || null } },
        create: {
          email,
          customerId: customerId || null,
          lastUsedAt: new Date(),
          useCount: 1,
        },
        update: {
          lastUsedAt: new Date(),
          useCount: { increment: 1 },
        },
      });
    })
  );
}

async function getRelatedAttachments(workOrderId) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      quotation: { select: { id: true, quoNo: true, customerId: true } },
      handOverJobs: { select: { id: true, hoNo: true } },
      attachments: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!workOrder) {
    const error = new Error('ไม่พบ Work Order');
    error.status = 404;
    throw error;
  }

  const quotationAttachments = workOrder.quotationId
    ? await prisma.attachment.findMany({
        where: { quotationId: workOrder.quotationId },
        orderBy: { uploadedAt: 'desc' },
      })
    : [];

  const handoverIds = workOrder.handOverJobs.map(h => h.id);
  const handoverNoMap = Object.fromEntries(workOrder.handOverJobs.map(h => [h.id, h.hoNo]));
  const handoverAttachments = handoverIds.length
    ? await prisma.attachment.findMany({
        where: { handOverJobId: { in: handoverIds } },
        orderBy: { uploadedAt: 'desc' },
      })
    : [];

  const mapped = [
    ...workOrder.attachments.map(att => ({
      ...att,
      sourceType: 'workorder',
      sourceDocNo: workOrder.woNo,
      sourceLabel: 'Work Order',
    })),
    ...quotationAttachments.map(att => ({
      ...att,
      sourceType: 'quotation',
      sourceDocNo: workOrder.quotation?.quoNo || '-',
      sourceLabel: 'Quotation',
    })),
    ...handoverAttachments.map(att => ({
      ...att,
      sourceType: 'handover',
      sourceDocNo: handoverNoMap[att.handOverJobId] || '-',
      sourceLabel: 'Handover',
    })),
    ...buildGeneratedAttachments(workOrder),
  ];

  return {
    workOrder,
    attachments: mapped,
    customerId: workOrder.quotation?.customerId || null,
  };
}

async function createEmailLog({ req, workOrder, to, cc, bcc, subject, bodyHtml, bodyText, selectedAttachments, status, errorMessage }) {
  return prisma.emailLog.create({
    data: {
      workOrderId: workOrder?.id || null,
      quotationId: workOrder?.quotationId || null,
      handOverJobId: workOrder?.handOverJobs?.[0]?.id || null,
      sentById: req.user.id,
      toRecipients: to,
      ccRecipients: cc,
      bccRecipients: bcc,
      subject,
      bodyHtml,
      bodyText,
      attachments: selectedAttachments,
      status,
      errorMessage: errorMessage || null,
      sentAt: new Date(),
      ipAddress: getRequesterIp(req),
      userAgent: req.headers['user-agent'] || null,
    },
  });
}

// GET /api/workorder-emails/workorders
router.get('/workorders', authenticate, async (req, res, next) => {
  try {
    const { woNo, customerName, dateFrom, dateTo } = req.query;

    const where = {
      status: 'approved',
      active: true,
      ...(woNo
        ? { woNo: { contains: String(woNo), mode: 'insensitive' } }
        : {}),
      ...(customerName
        ? { customerName: { contains: String(customerName), mode: 'insensitive' } }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.workOrder.findMany({
      where,
      include: {
        sales: { select: { id: true, fullName: true } },
        quotation: { select: { id: true, quoNo: true, customerId: true } },
      },
      orderBy: [{ closedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    const filtered = rows.filter(row => {
      if (row.salesId === req.user.id) return true;
      return canManageAllDocs(req.user.role);
    });

    res.json(filtered.map(row => ({
      ...row,
      workflowStatus: row.isClosed ? 'Completed' : 'Approved',
    })));
  } catch (e) { next(e); }
});

// GET /api/workorder-emails/workorders/:id/context
router.get('/workorders/:id/context', authenticate, async (req, res, next) => {
  try {
    const { workOrder, attachments, customerId } = await getRelatedAttachments(req.params.id);
    assertDocAccessible(req, workOrder);

    const defaultSubject = `Work Order #${workOrder.woNo} - ${workOrder.customerName}`;
    const defaultBodyHtml = [
      `<p>เรียน ${workOrder.contactName || workOrder.customerName},</p>`,
      `<p>ทางบริษัทขอส่งเอกสารสำหรับงาน <strong>${workOrder.project}</strong> เลขที่ Work Order <strong>${workOrder.woNo}</strong> มาเพื่อทราบและดำเนินการต่อครับ/ค่ะ</p>`,
      '<ul><li>ตรวจสอบรายละเอียดเอกสารแนบ</li><li>หากมีข้อสงสัยสามารถติดต่อทีมงานได้ทันที</li></ul>',
      '<p>ขอบคุณครับ/ค่ะ</p>',
    ].join('');

    res.json({
      workOrder,
      customerId,
      defaultSubject,
      defaultBodyHtml,
      attachments,
    });
  } catch (e) { next(e); }
});

// GET /api/workorder-emails/history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const customerId = String(req.query.customerId || '').trim() || null;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const whereBase = q
      ? {
          email: { contains: q, mode: 'insensitive' },
        }
      : {};

    let rows = [];
    if (customerId) {
      const [customerRows, otherRows] = await Promise.all([
        prisma.emailHistory.findMany({
          where: { ...whereBase, customerId },
          orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
          take: limit,
        }),
        prisma.emailHistory.findMany({
          where: { ...whereBase, OR: [{ customerId: null }, { customerId: { not: customerId } }] },
          orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
          take: limit,
        }),
      ]);
      rows = [...customerRows, ...otherRows];
    } else {
      rows = await prisma.emailHistory.findMany({
        where: whereBase,
        orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
        take: limit,
      });
    }

    const dedup = [];
    const seen = new Set();
    for (const row of rows) {
      const key = row.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(row);
      if (dedup.length >= limit) break;
    }

    res.json(dedup);
  } catch (e) { next(e); }
});

// GET /api/workorder-emails/logs
router.get('/logs', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, workOrderId, status, q, dateFrom, dateTo, sentById } = req.query;
    const where = {
      ...(workOrderId ? { workOrderId: String(workOrderId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(sentById ? { sentById: String(sentById) } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: String(q), mode: 'insensitive' } },
              { bodyText: { contains: String(q), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            sentAt: {
              ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        include: {
          sentBy: { select: { id: true, fullName: true, role: true } },
          workOrder: { select: { id: true, woNo: true, project: true, customerName: true } },
          quotation: { select: { id: true, quoNo: true } },
          handOverJob: { select: { id: true, hoNo: true } },
        },
        orderBy: { sentAt: 'desc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
    ]);

    res.json({ rows, total, page: Number(page), limit: Number(limit) });
  } catch (e) { next(e); }
});

// POST /api/workorder-emails/send
router.post('/send', authenticate, upload.array('extraFiles', 10), async (req, res, next) => {
  try {
    const mailer = getMailer();
    if (!mailer) return res.status(400).json({ message: 'ยังไม่ได้ตั้งค่า SMTP' });

    const workOrderId = String(req.body.workOrderId || '').trim();
    if (!workOrderId) return res.status(400).json({ message: 'กรุณาเลือก Work Order' });

    const to = normalizeEmailList(parseArrayField(req.body.to));
    const cc = normalizeEmailList(parseArrayField(req.body.cc));
    const bcc = normalizeEmailList(parseArrayField(req.body.bcc));
    const subject = String(req.body.subject || '').trim();
    const bodyHtml = String(req.body.bodyHtml || '').trim();
    const selectedAttachmentIds = parseSelectedAttachmentIds(req.body.selectedAttachmentIds);

    const invalid = [...to, ...cc, ...bcc].filter(email => !isValidEmail(email));
    if (invalid.length) {
      return res.status(400).json({ message: `อีเมลไม่ถูกต้อง: ${invalid.join(', ')}` });
    }
    if (!to.length) return res.status(400).json({ message: 'ต้องมีผู้รับอย่างน้อย 1 คน' });
    if (!subject) return res.status(400).json({ message: 'กรุณาระบุ Subject' });

    const { workOrder, attachments, customerId } = await getRelatedAttachments(workOrderId);
    assertDocAccessible(req, workOrder);

    const allowedAttachmentIds = new Set(attachments.map(att => att.id));
    const validSelectedIds = selectedAttachmentIds.filter(id => allowedAttachmentIds.has(id));
    const selectedAttachments = attachments.filter(att => validSelectedIds.includes(att.id));

    const binaryAttachments = await Promise.all(
      selectedAttachments.map(async (att) => {
        const content = att.id.startsWith(GENERATED_PREFIX)
          ? await buildGeneratedPdfBytes(att, req, workOrder)
          : await loadAttachmentBytes(att);
        return {
          filename: att.originalName,
          contentType: att.mimeType,
          content,
        };
      })
    );

    const uploadedAttachments = (req.files || []).map((f) => ({
      filename: f.originalname,
      contentType: f.mimetype,
      content: f.buffer,
    }));

    const payload = {
      from: `"GreenDii" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: to.join(', '),
      ...(cc.length ? { cc: cc.join(', ') } : {}),
      ...(bcc.length ? { bcc: bcc.join(', ') } : {}),
      subject,
      html: bodyHtml || '<p>-</p>',
      text: toPlainText(bodyHtml),
      attachments: [...binaryAttachments, ...uploadedAttachments],
    };

    const allRecipients = [...new Set([...to, ...cc, ...bcc])];
    try {
      await mailer.sendMail(payload);
      await updateEmailHistory(allRecipients, customerId);
      await createEmailLog({
        req,
        workOrder,
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        bodyText: toPlainText(bodyHtml),
        selectedAttachments: [
          ...selectedAttachments.map(att => ({
            id: att.id,
            filename: att.originalName,
            sourceType: att.sourceType,
            sourceLabel: att.sourceLabel,
            sourceDocNo: att.sourceDocNo,
            generated: att.id.startsWith(GENERATED_PREFIX),
          })),
          ...uploadedAttachments.map(f => ({
            filename: f.filename,
            sourceType: 'extra',
            sourceLabel: 'Extra Upload',
            sourceDocNo: '-',
            generated: false,
          })),
        ],
        status: 'sent',
      });
    } catch (sendError) {
      await createEmailLog({
        req,
        workOrder,
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        bodyText: toPlainText(bodyHtml),
        selectedAttachments: selectedAttachments.map(att => ({
          id: att.id,
          filename: att.originalName,
          sourceType: att.sourceType,
          sourceLabel: att.sourceLabel,
          sourceDocNo: att.sourceDocNo,
          generated: att.id.startsWith(GENERATED_PREFIX),
        })),
        status: 'failed',
        errorMessage: sendError?.message || 'send email failed',
      }).catch(() => {});
      throw sendError;
    }

    res.json({
      ok: true,
      message: 'ส่งอีเมลสำเร็จ',
      workOrderId,
      recipientCount: allRecipients.length,
    });
  } catch (e) { next(e); }
});

module.exports = router;
