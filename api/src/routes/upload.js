const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { APPROVAL_ATTACHMENT_LOCK_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { isR2Enabled, uploadToR2, deleteFromR2 } = require('../lib/r2');
const { assertDocAccessible, assertQuotationAccessible } = require('../lib/roles');
const { normalizeRole } = require('../lib/roleAliases');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { lockReceipt } = require('../lib/receiptVoucher');
const { invalid } = require('../lib/deliveryOrder');
const { recordAuditLog } = require('../lib/auditTrail');
const { lockVoucher, assertVoucherEvidence, voucherAudit } = require('../lib/paymentVoucher');
const { lockCheque, assertChequeEvidence, chequeAudit } = require('../lib/chequePayment');
const { lockPurchaseOrder, assertPoEvidence, purchaseOrderAudit } = require('../lib/purchaseOrderApproval');
const { lockReceipt: lockGoodsReceipt, assertReceiptEvidence, receiptAudit } = require('../lib/goodsReceipt');
const { lockIssue, assertIssueEvidence, issueAudit } = require('../lib/stockIssue');

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

const PO_ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const PO_ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ATTACHMENT_AMOUNT_CATEGORIES = new Set(['po', 'mom']);
const WO_APPROVED_PO_ATTACH_ROLES_KEY = 'workOrderApprovedPoAttachRoles';
const DEFAULT_WO_APPROVED_PO_ATTACH_ROLES = ['sales', 'coordinator'];

function isPoFileAllowed(file) {
  const ext = path.extname(file?.originalname || '').toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  return PO_ALLOWED_EXT.has(ext) && PO_ALLOWED_MIME.has(mime);
}

function removeTempUploadedFiles(files = []) {
  if (isR2Enabled) return;
  for (const file of files) {
    const filename = file?.filename;
    if (!filename) continue;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function normalizeAttachmentCategory(category) {
  return String(category || '').trim().toLowerCase();
}

function normalizeOriginalFileName(name) {
  const raw = sanitizeEscapedUnicode(String(name || '')).trim();
  if (!raw) return 'attachment';

  const hasThai = /[\u0E00-\u0E7F]/.test(raw);
  if (hasThai) return raw;

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8').trim();
    if (!decoded) return raw;
    if (decoded.includes('\uFFFD')) return raw;

    const decodedHasThai = /[\u0E00-\u0E7F]/.test(decoded);
    const looksMojibake = /(?:Ã.|à¸|à¹|â.)/.test(raw);
    if (decodedHasThai || looksMojibake) return decoded;
  } catch {
    // Keep original name when conversion fails.
  }

  return raw;
}

function sanitizeEscapedUnicode(input) {
  if (!input) return '';
  const unescaped = String(input)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u00A0\u2007\u202F]/g, ' ');
  return unescaped.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function parsePoAmount(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).replace(/,/g, '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

async function getApprovedWorkOrderPoAttachRoles() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'main' },
      select: { approvalFlowConfig: true },
    });
    const configuredRoles = settings?.approvalFlowConfig?.[WO_APPROVED_PO_ATTACH_ROLES_KEY];
    if (Array.isArray(configuredRoles)) {
      const roles = configuredRoles.map(String).map(r => r.trim()).filter(Boolean);
      if (roles.length > 0) return roles;
    }
  } catch {
    // fallback to defaults below when settings are unreadable
  }
  return DEFAULT_WO_APPROVED_PO_ATTACH_ROLES;
}

async function canManageApprovedWorkOrderAttachments(req, workOrder) {
  if (!workOrder) return false;
  if (workOrder.status !== 'approved') return false;

  const allowedRoles = await getApprovedWorkOrderPoAttachRoles();
  const actorRole = normalizeRole(req.user.role);
  return allowedRoles.map(normalizeRole).includes(actorRole);
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

  // Exception: after WO is approved, configured roles may manage attachments
  // across document categories, even when they are not the owner.
  if (await canManageApprovedWorkOrderAttachments(req, workOrder)) return;

  assertDocAccessible(req, workOrder);
  if (isEditableApprovalDocStatus(workOrder.status)) return;
  if (!isEditableApprovalDocStatus(workOrder.status)) {
    const error = new Error(APPROVAL_ATTACHMENT_LOCK_MESSAGE);
    error.status = 400;
    throw error;
  }
}

async function touchWorkOrderPoState(workOrderId) {
  if (!workOrderId) return;
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { docChecklist: true },
  });
  const baseChecklist = (workOrder && typeof workOrder.docChecklist === 'object' && workOrder.docChecklist)
    ? workOrder.docChecklist
    : {};
  const poCount = await prisma.attachment.count({ where: { workOrderId, category: 'po' } });
  if (poCount > 0) {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        hasPo: true,
        poAttachedDate: new Date(),
        poStatus: 'มี PO แล้ว',
        docChecklist: { ...baseChecklist, doc_po: true },
      },
    });
    return;
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      hasPo: false,
      poAttachedDate: null,
      poStatus: 'ยังไม่มี PO',
      docChecklist: { ...baseChecklist, doc_po: false },
    },
  });
}

async function writePoAuditLog({ workOrderId, userId, action, filename }) {
  if (!workOrderId || !userId || !filename) return;
  await prisma.workOrderPoAudit.create({
    data: {
      workOrderId,
      userId,
      action,
      filename,
    },
  });
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
  if (req.body.stockIssueId || req.body.paymentVoucherId || req.body.chequePaymentId || req.body.purchaseOrderId || req.body.goodsReceiptId) {
    const issue = Boolean(req.body.stockIssueId), gr = Boolean(req.body.goodsReceiptId), cheque = Boolean(req.body.chequePaymentId), po = Boolean(req.body.purchaseOrderId);
    const label = issue ? 'ใบเบิก' : gr ? 'GR' : po ? 'PO' : cheque ? 'CQ' : 'PV';
    const binding = issue ? 'stockIssueId' : gr ? 'goodsReceiptId' : po ? 'purchaseOrderId' : cheque ? 'chequePaymentId' : 'paymentVoucherId';
    const audit = issue ? issueAudit : gr ? receiptAudit : po ? purchaseOrderAudit : cheque ? chequeAudit : voucherAudit;
    const evidence = issue ? assertIssueEvidence : gr ? assertReceiptEvidence : po ? assertPoEvidence : cheque ? assertChequeEvidence : assertVoucherEvidence;
    const model = issue ? 'stockIssue' : gr ? 'goodsReceipt' : po ? 'purchaseOrder' : cheque ? 'chequePayment' : 'paymentVoucher';
    const lock = issue ? lockIssue : gr ? lockGoodsReceipt : po ? lockPurchaseOrder : cheque ? lockCheque : lockVoucher;
    const storedKeys = [];
    try {
      if (['quotationId', 'workOrderId', 'handOverJobId', 'purchaseRequestId', 'purchaseOrderId', 'receiptVoucherId',
        'paymentVoucherId', 'chequePaymentId', 'goodsReceiptId', 'stockIssueId'].some(key => key !== binding && req.body[key])) invalid(`ไฟล์ ${label} ต้องไม่ผูกเอกสารอื่นพร้อมกัน`);
      if (!req.files?.length) invalid('กรุณาเลือกไฟล์แนบ');
      if (req.files.some(file => !isPoFileAllowed(file))) invalid(`หลักฐาน ${label} อนุญาตเฉพาะ PDF/JPG/PNG`);
      const saved = await prisma.$transaction(async tx => {
        const doc = await lock(tx, req.body[binding], req.body.updatedAt);
        if (cheque) await lockVoucher(tx, doc.paymentVoucherId, null, false);
        await evidence(req, doc, req.body.category);
        const results = [];
        for (const file of req.files) {
          const filename = isR2Enabled ? `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}` : file.filename;
          const fileUrl = isR2Enabled ? await uploadToR2(filename, file.buffer, file.mimetype) : `/uploads/${filename}`;
          storedKeys.push(filename);
          results.push(await tx.attachment.create({ data: { filename, fileUrl, originalName: normalizeOriginalFileName(file.originalname),
            mimeType: file.mimetype, size: file.size, category: req.body.category, [binding]: doc.id } }));
        }
        const updated = await tx[model].update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
        await audit(tx, req, 'attach', null, updated, `category=${req.body.category}; ${results.map(row => row.originalName).join(', ')}`);
        return results;
      });
      return res.status(201).json(saved);
    } catch (error) {
      try {
        if (isR2Enabled) { for (const key of storedKeys) await deleteFromR2(key); }
        else removeTempUploadedFiles(req.files || []);
      } catch (cleanupError) { return next(new AggregateError([error, cleanupError], `${error.message}; ล้างไฟล์ไม่สำเร็จ: ${cleanupError.message}`)); }
      return next(error);
    }
  }
  if (req.body.receiptVoucherId) {
    const storedKeys = [];
    try {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) invalid('ไม่มีสิทธิ์จัดการเอกสารแนบ RV', 403);
      if (['quotationId', 'workOrderId', 'handOverJobId', 'purchaseRequestId', 'purchaseOrderId'].some(key => req.body[key])) invalid('ไฟล์ RV ต้องไม่ผูกเอกสารประเภทอื่นพร้อมกัน');
      if (!req.files?.length) invalid('กรุณาเลือกไฟล์แนบ');
      const saved = await prisma.$transaction(async tx => {
        const doc = await lockReceipt(tx, req.body.receiptVoucherId, req.body.updatedAt);
        if (doc.status !== 'draft') invalid('จัดการหลักฐานได้เฉพาะ RV Draft', 409);
        const results = [];
        for (const file of req.files) {
          const filename = isR2Enabled ? `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}` : file.filename;
          const fileUrl = isR2Enabled ? await uploadToR2(filename, file.buffer, file.mimetype) : `/uploads/${filename}`;
          storedKeys.push(filename);
          results.push(await tx.attachment.create({ data: { filename, fileUrl, originalName: normalizeOriginalFileName(file.originalname),
            mimeType: file.mimetype, size: file.size, category: 'receipt-evidence', receiptVoucherId: doc.id } }));
        }
        await tx.receiptVoucher.update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
        await recordAuditLog({ entityType: 'receipt_voucher', entityId: doc.id, docNo: doc.rvNo,
          action: 'attach', newValue: results, req }, tx);
        return results;
      });
      return res.status(201).json(saved);
    } catch (error) {
      try {
        if (isR2Enabled) { for (const key of storedKeys) await deleteFromR2(key); }
        else removeTempUploadedFiles(req.files || []);
      } catch (cleanupError) { return next(new AggregateError([error, cleanupError], `${error.message}; ล้างไฟล์ที่อัปโหลดไม่สำเร็จ: ${cleanupError.message}`)); }
      return next(error);
    }
  }
  try {
    const { category, quotationId, workOrderId, handOverJobId, purchaseRequestId, purchaseOrderId, poAmount } = req.body;
    const normalizedCategory = normalizeAttachmentCategory(category);
    const parsedPoAmount = parsePoAmount(poAmount);
    if (handOverJobId) {
      return res.status(400).json({ message: 'ปิดการใช้งานเอกสารแนบสำหรับ HandOver แล้ว' });
    }
    if (normalizedCategory === 'po' && (req.files || []).some(file => !isPoFileAllowed(file))) {
      removeTempUploadedFiles(req.files || []);
      return res.status(400).json({ message: 'ไฟล์ PO อนุญาตเฉพาะ PDF, JPG, PNG' });
    }
    if (ATTACHMENT_AMOUNT_CATEGORIES.has(normalizedCategory) && parsedPoAmount === null) {
      removeTempUploadedFiles(req.files || []);
      const label = normalizedCategory === 'mom' ? 'MIN' : 'PO';
      return res.status(400).json({ message: `กรุณากรอกยอดเงิน ${label} ก่อนแนบไฟล์` });
    }
    await assertQuotationAttachmentEditable(req, quotationId);
    await assertWorkOrderAttachmentEditable(req, workOrderId, normalizedCategory);
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
          originalName: normalizeOriginalFileName(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          fileUrl,
          category: normalizedCategory || null,
          poAmount: ATTACHMENT_AMOUNT_CATEGORIES.has(normalizedCategory) ? parsedPoAmount : null,
          quotationId: quotationId || null,
          workOrderId: workOrderId || null,
          handOverJobId: handOverJobId || null,
          purchaseRequestId: purchaseRequestId || null,
          purchaseOrderId: purchaseOrderId || null,
        },
      });

      if (normalizedCategory === 'po' && workOrderId) {
        await writePoAuditLog({
          workOrderId,
          userId: req.user.id,
          action: 'upload',
          filename: attachment.originalName,
        });
      }
      saved.push(attachment);
    }

    if (normalizedCategory === 'po' && workOrderId && saved.length > 0) {
      await touchWorkOrderPoState(workOrderId);
    }

    res.status(201).json(saved);
  } catch (e) { next(e); }
});

// PATCH /api/upload/:id/po-amount
router.patch('/:id/po-amount', authenticate, async (req, res, next) => {
  try {
    const hasPoAmount = req.body?.poAmount !== undefined && req.body?.poAmount !== null && String(req.body.poAmount).trim() !== '';
    const poAmount = hasPoAmount ? parsePoAmount(req.body.poAmount) : null;
    if (hasPoAmount && poAmount === null) {
      return res.status(400).json({ message: 'กรุณากรอกยอดเงินให้ถูกต้อง' });
    }

    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: req.params.id } });
    const normalizedCategory = normalizeAttachmentCategory(attachment.category);
    if (!ATTACHMENT_AMOUNT_CATEGORIES.has(normalizedCategory) || !attachment.workOrderId) {
      return res.status(400).json({ message: 'แก้ไขยอดได้เฉพาะไฟล์ PO/MIN ของ Work Order' });
    }

    await assertWorkOrderAttachmentEditable(req, attachment.workOrderId, normalizedCategory);
    const closeRemark = req.body?.closeRemark === undefined
      ? undefined
      : (String(req.body.closeRemark || '').trim() || null);
    const updated = await prisma.$transaction(async (tx) => {
      const updatedAttachment = await tx.attachment.update({
        where: { id: attachment.id },
        data: hasPoAmount ? { poAmount } : {},
      });
      if (closeRemark !== undefined) {
        await tx.workOrder.update({
          where: { id: attachment.workOrderId },
          data: { closeRemark },
        });
      }
      return updatedAttachment;
    });
    if (normalizedCategory === 'po') {
      await writePoAuditLog({
        workOrderId: attachment.workOrderId,
        userId: req.user.id,
        action: 'update_amount',
        filename: attachment.originalName,
      });
    }

    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/upload/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: req.params.id } });
    if (att.stockIssueId && ['quotationId', 'workOrderId', 'handOverJobId', 'purchaseRequestId', 'purchaseOrderId',
      'receiptVoucherId', 'paymentVoucherId', 'chequePaymentId', 'goodsReceiptId'].some(key => att[key])) invalid('ไฟล์ใบเบิกผูกหลายเอกสาร ต้องตรวจสอบก่อนลบ', 409);
    if ((att.purchaseOrderId || att.goodsReceiptId) && ['quotationId', 'workOrderId', 'handOverJobId', 'purchaseRequestId',
      'receiptVoucherId', 'paymentVoucherId', 'chequePaymentId'].some(key => att[key])) {
      invalid('ไฟล์ PO เดิมผูกหลายเอกสาร ต้องตรวจสอบการอ้างอิงก่อนลบ', 409);
    }
    if (att.goodsReceiptId && att.purchaseOrderId) invalid('ไฟล์ผูก GR และ PO พร้อมกัน ต้องตรวจสอบก่อนลบ', 409);
    if (att.stockIssueId || att.paymentVoucherId || att.chequePaymentId || att.purchaseOrderId || att.goodsReceiptId) {
      const issue = Boolean(att.stockIssueId), gr = Boolean(att.goodsReceiptId), cheque = Boolean(att.chequePaymentId), po = Boolean(att.purchaseOrderId);
      const id = issue ? att.stockIssueId : gr ? att.goodsReceiptId : po ? att.purchaseOrderId : cheque ? att.chequePaymentId : att.paymentVoucherId;
      await prisma.$transaction(async tx => {
        const doc = await (issue ? lockIssue : gr ? lockGoodsReceipt : po ? lockPurchaseOrder : cheque ? lockCheque : lockVoucher)(tx, id, req.body?.updatedAt);
        if (cheque) await lockVoucher(tx, doc.paymentVoucherId, null, false);
        await (issue ? assertIssueEvidence : gr ? assertReceiptEvidence : po ? assertPoEvidence : cheque ? assertChequeEvidence : assertVoucherEvidence)(req, doc, po ? 'accounting-po' : att.category);
        await tx.attachment.delete({ where: { id: att.id } });
        const updated = await tx[issue ? 'stockIssue' : gr ? 'goodsReceipt' : po ? 'purchaseOrder' : cheque ? 'chequePayment' : 'paymentVoucher'].update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
        await (issue ? issueAudit : gr ? receiptAudit : po ? purchaseOrderAudit : cheque ? chequeAudit : voucherAudit)(tx, req, 'detach', null, updated, `${att.category}; ${att.originalName}`);
      });
      if (!await prisma.attachment.count({ where: { filename: att.filename } })) {
        if (isR2Enabled) await deleteFromR2(att.filename);
        else {
          const target = path.join(UPLOAD_DIR, att.filename);
          if (fs.existsSync(target)) fs.unlinkSync(target);
        }
      }
      return res.json({ message: 'ลบหลักฐานแล้ว' });
    }
    if (att.receiptVoucherId) {
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ar', 'create')) invalid('ไม่มีสิทธิ์จัดการเอกสารแนบ RV', 403);
      await prisma.$transaction(async tx => {
        const doc = await lockReceipt(tx, att.receiptVoucherId, req.body?.updatedAt);
        if (doc.status !== 'draft') invalid('จัดการหลักฐานได้เฉพาะ RV Draft', 409);
        await tx.attachment.delete({ where: { id: att.id } });
        await tx.receiptVoucher.update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
        await recordAuditLog({ entityType: 'receipt_voucher', entityId: doc.id, docNo: doc.rvNo,
          action: 'detach', oldValue: att, req }, tx);
      });
      const remaining = await prisma.attachment.count({ where: { filename: att.filename } });
      if (!remaining) {
        if (isR2Enabled) await deleteFromR2(att.filename);
        else {
          const target = path.join(UPLOAD_DIR, att.filename);
          if (fs.existsSync(target)) fs.unlinkSync(target);
        }
      }
      return res.json({ message: 'ลบเอกสารแนบแล้ว' });
    }
    const normalizedCategory = normalizeAttachmentCategory(att.category);
    await assertQuotationAttachmentEditable(req, att.quotationId);
    await assertWorkOrderAttachmentEditable(req, att.workOrderId, normalizedCategory);
    await assertHandoverAttachmentEditable(req, att.handOverJobId);
    await assertPurchaseRequestAttachmentEditable(req, att.purchaseRequestId);
    const hasOtherReferences = await prisma.attachment.count({
      where: { filename: att.filename, id: { not: att.id } },
    });
    if (hasOtherReferences === 0) {
      if (isR2Enabled) {
        await deleteFromR2(att.filename).catch(() => {}); // ไม่ block ถ้า R2 fail
      } else {
        const filePath = path.join(UPLOAD_DIR, att.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    await prisma.attachment.delete({ where: { id: req.params.id } });

    if (normalizedCategory === 'po' && att.workOrderId) {
      await writePoAuditLog({
        workOrderId: att.workOrderId,
        userId: req.user.id,
        action: 'delete',
        filename: att.originalName,
      });
      await touchWorkOrderPoState(att.workOrderId);
    }

    res.json({ message: 'File deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
