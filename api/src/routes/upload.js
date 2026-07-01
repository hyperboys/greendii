const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { APPROVAL_ATTACHMENT_LOCK_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { isR2Enabled, uploadToR2, deleteFromR2 } = require('../lib/r2');
const { assertDocAccessible, assertQuotationAccessible } = require('../lib/roles');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ถ้ามี R2 ให้ใช้ memory storage, ถ้าไม่มีใช้ disk
const storage = isR2Enabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|zip|rar/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

function normalizeAttachmentCategory(category) {
  return String(category || '').trim().toLowerCase();
}

function canOwnerAttachApprovedWorkOrderPo(req, workOrder, category) {
  if (!workOrder) return false;
  return workOrder.status === 'approved'
    && workOrder.salesId === req.user.id
    && normalizeAttachmentCategory(category) === 'po';
}

async function assertWorkOrderAttachmentEditable(req, workOrderId, category) {
  if (!workOrderId) return;
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, salesId: true, status: true },
  });
  if (!workOrder) {
    const error = new Error('ไม่พบใบสั่งงาน');
    error.status = 404;
    throw error;
  }
  assertDocAccessible(req, workOrder);
  if (isEditableApprovalDocStatus(workOrder.status)) return;
  if (canOwnerAttachApprovedWorkOrderPo(req, workOrder, category)) return;
  if (!isEditableApprovalDocStatus(workOrder.status)) {
    const error = new Error(APPROVAL_ATTACHMENT_LOCK_MESSAGE);
    error.status = 400;
    throw error;
  }
}

async function assertHandoverAttachmentEditable(req, handOverJobId) {
  if (!handOverJobId) return;
  const handover = await prisma.handOverJob.findUnique({
    where: { id: handOverJobId },
    select: { id: true, salesId: true, status: true },
  });
  if (!handover) {
    const error = new Error('ไม่พบใบส่งมอบงาน');
    error.status = 404;
    throw error;
  }
  assertDocAccessible(req, handover);
  if (!isEditableApprovalDocStatus(handover.status)) {
    const error = new Error(APPROVAL_ATTACHMENT_LOCK_MESSAGE);
    error.status = 400;
    throw error;
  }
}

async function assertPurchaseRequestAttachmentEditable(req, purchaseRequestId) {
  if (!purchaseRequestId) return;
  const purchaseRequest = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseRequestId },
    select: { id: true, salesId: true, status: true },
  });
  if (!purchaseRequest) {
    const error = new Error('ไม่พบใบขอซื้อ');
    error.status = 404;
    throw error;
  }
  assertDocAccessible(req, purchaseRequest);
  if (!isEditableApprovalDocStatus(purchaseRequest.status)) {
    const error = new Error(APPROVAL_ATTACHMENT_LOCK_MESSAGE);
    error.status = 400;
    throw error;
  }
}

async function assertQuotationAttachmentEditable(req, quotationId) {
  if (!quotationId) return;
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, salesId: true, status: true },
  });
  if (!quotation) {
    const error = new Error('ไม่พบใบเสนอราคา');
    error.status = 404;
    throw error;
  }
  assertQuotationAccessible(req, quotation);
  if (!isEditableApprovalDocStatus(quotation.status)) {
    const error = new Error(APPROVAL_ATTACHMENT_LOCK_MESSAGE);
    error.status = 400;
    throw error;
  }
}

// POST /api/upload
router.post('/', authenticate, upload.array('files', 10), async (req, res, next) => {
  try {
    const { category, quotationId, workOrderId, handOverJobId, purchaseRequestId } = req.body;
    if (handOverJobId) {
      return res.status(400).json({ message: 'ปิดการใช้งานเอกสารแนบสำหรับ HandOver แล้ว' });
    }
    await assertQuotationAttachmentEditable(req, quotationId);
    await assertWorkOrderAttachmentEditable(req, workOrderId, category);
    await assertHandoverAttachmentEditable(req, handOverJobId);
    await assertPurchaseRequestAttachmentEditable(req, purchaseRequestId);
    const saved = [];
    for (const file of req.files || []) {
      let filename, fileUrl;

      if (isR2Enabled) {
        // อัพโหลดไป R2
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const key = unique + path.extname(file.originalname);
        fileUrl = await uploadToR2(key, file.buffer, file.mimetype);
        filename = key;
      } else {
        // เก็บบน disk (fallback)
        filename = file.filename;
        fileUrl = `/uploads/${file.filename}`;
      }

      const attachment = await prisma.attachment.create({
        data: {
          filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          fileUrl,
          category: category || null,
          quotationId: quotationId || null,
          workOrderId: workOrderId || null,
          handOverJobId: handOverJobId || null,
          purchaseRequestId: purchaseRequestId || null,
        },
      });
      saved.push(attachment);
    }
    res.status(201).json(saved);
  } catch (e) { next(e); }
});

// DELETE /api/upload/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: req.params.id } });
    await assertQuotationAttachmentEditable(req, att.quotationId);
    await assertWorkOrderAttachmentEditable(req, att.workOrderId, att.category);
    await assertHandoverAttachmentEditable(req, att.handOverJobId);
    await assertPurchaseRequestAttachmentEditable(req, att.purchaseRequestId);
    if (isR2Enabled) {
      await deleteFromR2(att.filename).catch(() => {}); // ไม่ block ถ้า R2 fail
    } else {
      const filePath = path.join(UPLOAD_DIR, att.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.attachment.delete({ where: { id: req.params.id } });
    res.json({ message: 'File deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
