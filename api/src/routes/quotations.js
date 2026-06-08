const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } = require('../lib/approvalFlowRules');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getFirstStep, getNextStep } = require('../lib/approvalFlow');
const { canManageAllQuotations, assertQuotationAccessible } = require('../lib/roles');

const quotationValidators = [
  body('customerName').trim().notEmpty().withMessage('กรุณาระบุชื่อลูกค้า'),
  body('project').trim().notEmpty().withMessage('กรุณาระบุชื่อโครงการ'),
  body('validityDays').optional().isInt({ min: 0 }).withMessage('จำนวนวันต้องเป็นจำนวนเต็มไม่ติดลบ'),
  body('items').optional().isArray().withMessage('items ต้องเป็น array'),
  body('items.*.qty').optional().isFloat({ min: 0 }).withMessage('จำนวนต้องไม่ติดลบ'),
  body('items.*.materialPrice').optional().isFloat({ min: 0 }).withMessage('ราคาต้องไม่ติดลบ'),
  body('items.*.labourPrice').optional().isFloat({ min: 0 }).withMessage('ราคาต้องไม่ติดลบ'),
  body('subTotal').optional().isFloat({ min: 0 }),
  body('vat').optional().isFloat({ min: 0 }),
  body('grandTotal').optional().isFloat({ min: 0 }),
];

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, initials: true, email: true, phone: true, signatureText: true } },
  customer: { select: { id: true, name: true } },
  items: { orderBy: { seq: 'asc' } },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true } } },
    orderBy: { actedAt: 'asc' },
  },
  attachments: true,
};

const MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director']

async function ensureCustomerBelongsToSales(req, customerId) {
  if (!customerId || MANAGER_ROLES.includes(req.user.role)) return
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, salesId: true } })
  if (!customer || customer.salesId !== req.user.id) {
    const error = new Error('Forbidden customer')
    error.status = 403
    throw error
  }
}

// GET /api/quotations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, salesId, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (salesId) where.salesId = salesId;
    if (q) where.OR = [
      { quoNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
    ];
    // Sales only sees their own quotations (unless manager+)
    if (!canManageAllQuotations(req.user.role)) {
      where.salesId = req.user.id;
    }
    const listInclude = {
      sales: { select: { id: true, fullName: true, phone: true } },
      items: true,
    };
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.quotation.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
        prisma.quotation.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.quotation.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/quotations/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.quotation.findUniqueOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_FULL,
    });
    assertQuotationAccessible(req, item);
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/quotations/:id/pdf  — server-side PDF (cross-OS consistent)
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const { renderUrlToPdf, getUiBaseUrl } = require('../lib/pdf');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uiBase = getUiBaseUrl(req);
    const url = `${uiBase}/print/quotation/${req.params.id}?token=${encodeURIComponent(token)}`;
    const item = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id }, select: { quoNo: true, salesId: true } });
    assertQuotationAccessible(req, item);
    const pdf = await renderUrlToPdf(url);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.quoNo || 'quotation'}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// POST /api/quotations
router.post('/', authenticate, quotationValidators, validate, async (req, res, next) => {
  try {
    const {
      customerName, customerId, attn, project, address, tel,
      conditionTerm, validityDays, leadTime, paymentTerm,
      items = [], subTotal, specialDiscount, vat, grandTotal, remark,
    } = req.body;
    if (!project || !customerName) {
      return res.status(400).json({ message: 'project, customerName required' });
    }
    // Auto-generate quoNo: QGD-MMYY-INITIALS+SEQ3 (e.g. QGD-0526-KC001)
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(2);
    const initials = (req.user.initials || 'XX').toUpperCase();
    const prefix = `QGD-${mm}${yy}-${initials}`;
    const last = await prisma.quotation.findFirst({
      where: { quoNo: { startsWith: prefix } },
      orderBy: { quoNo: 'desc' },
    });
    const seq = last ? (parseInt(last.quoNo.replace(prefix, ''), 10) || 0) + 1 : 1;
    const quoNo = `${prefix}${String(seq).padStart(3, '0')}`;
    await ensureCustomerBelongsToSales(req, customerId)
    const quo = await prisma.quotation.create({
      data: {
        quoNo, customerName, customerId: customerId || null, attn, project, address, tel,
        conditionTerm, validityDays: validityDays || 30, leadTime, paymentTerm,
        subTotal: subTotal || 0, specialDiscount: specialDiscount || 0, vat: vat || 0, grandTotal: grandTotal || 0,
        remark, salesId: req.user.id, status: 'draft',
        items: {
          create: items.map((it, i) => ({
            seq: i, desc: it.desc, note: it.note || null, qty: it.qty, unit: it.unit,
            materialPrice: it.materialPrice || 0, labourPrice: it.labourPrice || 0,
            price: (it.materialPrice || 0) + (it.labourPrice || 0), amount: it.amount,
            images: Array.isArray(it.images) ? it.images.filter(Boolean) : [],
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    res.status(201).json(quo);
  } catch (e) { next(e); }
});

// PUT /api/quotations/:id
router.put('/:id', authenticate, quotationValidators, validate, async (req, res, next) => {
  try {
    const existing = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.salesId !== req.user.id && !canManageAllQuotations(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเอกสารของผู้อื่น' });
    }
    if (!isEditableApprovalDocStatus(existing.status)) {
      return res.status(400).json({ message: EDITABLE_APPROVAL_DOC_MESSAGE });
    }
    const {
      customerName, customerId, attn, project, address, tel,
      conditionTerm, validityDays, leadTime, paymentTerm,
      items = [], subTotal, specialDiscount, vat, grandTotal, remark,
    } = req.body;
    await ensureCustomerBelongsToSales(req, customerId)
    // Delete old items and recreate atomically
    const quo = await prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: req.params.id } });
      return tx.quotation.update({
        where: { id: req.params.id },
        data: {
          customerName, customerId: customerId || null, attn, project, address, tel,
          conditionTerm, validityDays, leadTime, paymentTerm,
          subTotal: subTotal || 0, specialDiscount: specialDiscount || 0, vat: vat || 0, grandTotal: grandTotal || 0,
          remark,
          items: {
            create: items.map((it, i) => ({
              seq: i, desc: it.desc, note: it.note || null, qty: it.qty, unit: it.unit,
              materialPrice: it.materialPrice || 0, labourPrice: it.labourPrice || 0,
              price: (it.materialPrice || 0) + (it.labourPrice || 0), amount: it.amount,
              images: Array.isArray(it.images) ? it.images.filter(Boolean) : [],
            })),
          },
        },
        include: INCLUDE_FULL,
      });
    });
    res.json(quo);
  } catch (e) { next(e); }
});

// POST /api/quotations/:id/submit  (draft/rejected → approved directly, no approval flow)
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    assertQuotationAccessible(req, quo);
    if (!['draft', 'rejected'].includes(quo.status)) return res.status(400).json({ message: 'ส่งได้เฉพาะ Draft หรือ Rejected เท่านั้น' });
    const firstStep = await getFirstStep('quotation');
    // If no approval steps configured, auto-approve immediately
    const autoApprove = firstStep === null;
    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status: autoApprove ? 'approved' : 'pending', approvalStep: firstStep ?? 0 },
      include: INCLUDE_FULL,
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'quotation', quotationId: quo.id,
        approverId: req.user.id, step: 0,
        action: autoApprove ? 'approve' : 'submit',
        comment: req.body.comment || (autoApprove ? 'อนุมัติอัตโนมัติ' : 'ส่งเอกสารเข้าอนุมัติ'),
      },
    });
    if (!autoApprove) {
      await notifyStep(firstStep, `ใบเสนอราคา ${quo.quoNo} รอการอนุมัติจากคุณ`).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/quotations/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (quo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const nextStep = await getNextStep('quotation', quo.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { approvalStep: nextStep ?? quo.approvalStep, status: newStatus },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'quotation', quotationId: quo.id,
        approverId: req.user.id, step: quo.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(quo.salesId, `ใบเสนอราคา ${quo.quoNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบเสนอราคา ${quo.quoNo} รอการอนุมัติจากคุณ`).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/quotations/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (quo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'quotation', quotationId: quo.id,
        approverId: req.user.id, step: quo.approvalStep,
        action: 'reject', comment: req.body.comment || '',
      },
    });
    await notifyUser(quo.salesId, `ใบเสนอราคา ${quo.quoNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/quotations/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const quo = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    assertQuotationAccessible(req, quo);
    if (quo.status === 'approved') return res.status(400).json({ message: 'Cannot delete approved quotation' });
    await prisma.quotation.update({ where: { id: req.params.id }, data: { status: 'cancelled' } });
    res.json({ message: 'Quotation cancelled' });
  } catch (e) { next(e); }
});

module.exports = router;
