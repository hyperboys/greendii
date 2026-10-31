const router = require('express').Router();
const prisma = require('../lib/prisma');
const { planApproval } = require('../lib/accountingApproval');
const { authenticate } = require('../middleware/auth');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { validateStateTransition } = require('../lib/stateTransition');
const { recordAuditLog } = require('../lib/auditTrail');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');
const { getPagination, paginated } = require('../lib/pagination');
const { assertActive } = require('../lib/accountingMaster');
const { invalid } = require('../lib/deliveryOrder');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { PO_STATUSES, lockPurchaseOrder, assertNoPoDependents, assertPoSubmittable, purchaseOrderAudit, poActionReason } = require('../lib/purchaseOrderApproval');
const {
  normalizePurchaseOrderItems,
  calculatePurchaseOrderTotals,
  normalizePaymentTerm,
} = require('../lib/purchaseOrder');

// ─── 1. PURCHASE ORDERS (PO) ──────────────────────────────────────────────────

const PURCHASE_ORDER_INCLUDE = {
  supplier: true,
  createdBy: { select: { id: true, fullName: true, position: true, signatureText: true, signatureUrl: true } },
  items: { orderBy: { seq: 'asc' } },
  pr: { select: { id: true, prNo: true } },
  purchaseRequestReferences: {
    include: {
      purchaseRequest: {
        select: {
          id: true, prNo: true, status: true, customer: true, projectRef: true,
          workOrder: { select: { woNo: true } },
          attachments: {
            select: { id: true, originalName: true, mimeType: true, fileUrl: true, uploadedAt: true },
            orderBy: { uploadedAt: 'asc' },
          },
        },
      },
    },
    orderBy: { purchaseRequestId: 'asc' },
  },
  attachments: {
    select: { id: true, originalName: true, mimeType: true, fileUrl: true, uploadedAt: true },
    orderBy: { uploadedAt: 'asc' },
  },
};

function normalizePurchaseRequestIds(body) {
  const raw = body.purchaseRequestIds === undefined
    ? (body.prId ? [body.prId] : [])
    : body.purchaseRequestIds;
  if (!Array.isArray(raw) || raw.some(id => typeof id !== 'string' || !id.trim())) {
    throw Object.assign(new Error('รายการ PR อ้างอิงไม่ถูกต้อง'), { status: 400 });
  }
  return [...new Set(raw.map(id => id.trim()))];
}

// GET /api/ap/purchase-requests — PR references available to Accounting PO users
router.get('/purchase-requests', authenticate, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const requests = await prisma.purchaseRequest.findMany({
      where: {
        active: true,
        ...(q ? {
          OR: [
            { prNo: { contains: q, mode: 'insensitive' } },
            { customer: { contains: q, mode: 'insensitive' } },
            { projectRef: { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true, prNo: true, status: true, customer: true, projectRef: true,
        workOrder: { select: { woNo: true } },
        attachments: {
          select: { id: true, originalName: true, mimeType: true, fileUrl: true, uploadedAt: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(requests);
  } catch (e) { next(e); }
});

// GET /api/ap/purchase-orders
router.get('/purchase-orders', authenticate, async (req, res, next) => {
  try {
    const { status, supplierId, q } = req.query;
    const where = {};
    if (status && !PO_STATUSES.includes(status)) invalid('สถานะ PO ไม่ถูกต้อง');
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (q) where.poNo = { contains: q, mode: 'insensitive' };

    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.purchaseOrder.findMany({
          where,
          orderBy: { poDate: 'desc' },
          skip: pg.skip,
          take: pg.take,
          include: PURCHASE_ORDER_INCLUDE,
        }),
        prisma.purchaseOrder.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { poDate: 'desc' },
      include: PURCHASE_ORDER_INCLUDE,
    });
    res.json(list);
  } catch (e) { next(e); }
});

router.get('/purchase-orders/:id', authenticate, async (req, res, next) => {
  try {
    const doc = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: req.params.id },
      include: PURCHASE_ORDER_INCLUDE,
    });
    const history = await prisma.auditLog.findMany({ where: { entityType: 'purchase_order', entityId: doc.id },
      select: { id: true, action: true, reason: true, newValue: true, performedBy: { select: { fullName: true } }, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    res.json({ ...doc, history: history.map(({ newValue, ...row }) => ({
      ...row, performedBy: typeof newValue?.actorSnapshot?.fullName === 'string'
        ? { fullName: newValue.actorSnapshot.fullName } : row.performedBy,
    })) });
  } catch (e) { next(e); }
});

// POST /api/ap/purchase-orders
router.post('/purchase-orders', authenticate, async (req, res, next) => {
  try {
    const {
      poDate,
      purchaseType = 'domestic',
      supplierId,
      supplierBranch,
      address,
      contactPerson,
      remarks,
      vatConfig = 'VAT7%',
      paymentTerm = 30,
      deliveryDate,
      deliveryLocation,
    } = req.body;

    if (!supplierId) return res.status(400).json({ message: 'กรุณาระบุผู้จำหน่าย (supplierId)' });
    if (!['domestic', 'overseas'].includes(purchaseType)) invalid('ประเภทจัดซื้อไม่ถูกต้อง');
    if (!['VAT7%', 'NO_VAT'].includes(vatConfig)) {
      return res.status(400).json({ message: 'รูปแบบ VAT ไม่ถูกต้อง' });
    }
    const items = normalizePurchaseOrderItems(req.body.items);
    if (items.some(item => !item.desc)) {
      return res.status(400).json({ message: 'กรุณาระบุรายละเอียดสินค้า/บริการทุกรายการ' });
    }
    const requestIds = normalizePurchaseRequestIds(req.body);
    const totals = calculatePurchaseOrderTotals(items, vatConfig);

    const result = await prisma.$transaction(async (tx) => {
      const supplier = await assertActive(tx, 'supplier', supplierId, 'ผู้จำหน่าย');
      for (const item of items) if (item.productId) await assertActive(tx, 'accountProduct', item.productId, 'สินค้า');
      if (requestIds.length > 0) {
        const requests = await tx.purchaseRequest.findMany({
          where: { id: { in: requestIds }, active: true },
          select: { id: true },
        });
        if (requests.length !== requestIds.length) {
          throw Object.assign(new Error('พบ PR อ้างอิงที่ไม่มีอยู่หรือถูกปิดใช้งาน กรุณาโหลดรายการใหม่'), { status: 400 });
        }
      }
      const poNo = await generateNextRunningNumber('po', { date: poDate ? new Date(poDate) : new Date() }, tx);
      const doc = await tx.purchaseOrder.create({
        data: {
          poNo,
          poDate: poDate ? new Date(poDate) : new Date(),
          purchaseType,
          supplierId,
          supplierSnapshot: { code: supplier.code, name: supplier.name, taxId: supplier.taxId, tel: supplier.tel },
          supplierBranch: supplierBranch || 'สำนักงานใหญ่',
          address,
          contactPerson,
          remarks,
          prId: requestIds[0] || null,
          purchaseRequestReferences: {
            create: requestIds.map(purchaseRequestId => ({ purchaseRequestId })),
          },
          subTotal: totals.subTotal,
          discount: totals.discount,
          vat: totals.vat,
          vatConfig,
          netAmount: totals.netAmount,
          paymentTerm: normalizePaymentTerm(paymentTerm),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          deliveryLocation,
          createdById: req.user.id,
          status: 'draft',
          items: { create: items },
        },
        include: PURCHASE_ORDER_INCLUDE,
      });

      await purchaseOrderAudit(tx, req, 'create', null, doc);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.put('/purchase-orders/:id', authenticate, async (req, res, next) => {
  try {
    const {
      poDate,
      purchaseType = 'domestic',
      supplierId,
      supplierBranch,
      address,
      contactPerson,
      remarks,
      purchaseRequestIds,
      vatConfig = 'VAT7%',
      paymentTerm = 30,
      deliveryDate,
      deliveryLocation,
    } = req.body;
    if (!supplierId) return res.status(400).json({ message: 'กรุณาระบุผู้จำหน่าย (supplierId)' });
    if (!['domestic', 'overseas'].includes(purchaseType)) invalid('ประเภทจัดซื้อไม่ถูกต้อง');
    if (!['VAT7%', 'NO_VAT'].includes(vatConfig)) {
      return res.status(400).json({ message: 'รูปแบบ VAT ไม่ถูกต้อง' });
    }
    const items = normalizePurchaseOrderItems(req.body.items);
    if (items.some(item => !item.desc)) {
      return res.status(400).json({ message: 'กรุณาระบุรายละเอียดสินค้า/บริการทุกรายการ' });
    }
    const requestIds = normalizePurchaseRequestIds(req.body);
    const totals = calculatePurchaseOrderTotals(items, vatConfig);

    const result = await prisma.$transaction(async (tx) => {
      const previous = await lockPurchaseOrder(tx, req.params.id, req.body.updatedAt, PURCHASE_ORDER_INCLUDE);
      const reservedPs = await tx.contractorPaymentRequest.count({ where: { poId: previous.id, status: { in: ['pending', 'approved'] } } });
      if (reservedPs) invalid('PO มี PS รออนุมัติ/อนุมัติแล้ว ไม่สามารถแก้ไขได้ ต้องคืนวงเงิน PS ก่อน', 409);
      const activeGr = await tx.goodsReceipt.count({ where: { poId: previous.id, status: { notIn: ['cancelled', 'rejected'] } } });
      if (activeGr) invalid('PO มี GR ที่ยังไม่ปิด ไม่สามารถแก้ไขรายการอ้างอิงได้', 409);
      if (!['draft', 'returned'].includes(previous.status)) {
        throw Object.assign(new Error('แก้ไขได้เฉพาะใบสั่งซื้อสถานะ Draft / ส่งกลับ'), { status: 409 });
      }
      const supplier = previous.supplierId === supplierId ? previous.supplier
        : await assertActive(tx, 'supplier', supplierId, 'ผู้จำหน่าย');
      for (const item of items) if (item.productId && !previous.items.some(old => old.productId === item.productId)) {
        await assertActive(tx, 'accountProduct', item.productId, 'สินค้า');
      }
      if (requestIds.length > 0) {
        const requests = await tx.purchaseRequest.findMany({
          where: { id: { in: requestIds }, active: true },
          select: { id: true },
        });
        if (requests.length !== requestIds.length) {
          throw Object.assign(new Error('พบ PR อ้างอิงที่ไม่มีอยู่หรือถูกปิดใช้งาน กรุณาโหลดรายการใหม่'), { status: 400 });
        }
      }

      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: previous.id } });
      await tx.purchaseOrderPurchaseRequest.deleteMany({ where: { purchaseOrderId: previous.id } });
      const updated = await tx.purchaseOrder.update({
        where: { id: previous.id },
        data: {
          poDate: poDate ? new Date(poDate) : previous.poDate,
          purchaseType,
          supplierId,
          supplierSnapshot: previous.supplierId === supplierId && previous.supplierSnapshot
            ? previous.supplierSnapshot : { code: supplier.code, name: supplier.name, taxId: supplier.taxId, tel: supplier.tel },
          supplierBranch: supplierBranch || 'สำนักงานใหญ่',
          address,
          contactPerson,
          remarks,
          prId: requestIds[0] || null,
          purchaseRequestReferences: {
            create: requestIds.map(purchaseRequestId => ({ purchaseRequestId })),
          },
          subTotal: totals.subTotal,
          discount: totals.discount,
          vat: totals.vat,
          vatConfig,
          netAmount: totals.netAmount,
          paymentTerm: normalizePaymentTerm(paymentTerm),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          deliveryLocation,
          items: { create: items },
        },
        include: PURCHASE_ORDER_INCLUDE,
      });
      await purchaseOrderAudit(tx, req, 'update', previous, updated);
      return updated;
    });
    res.json(result);
  } catch (e) { next(e); }
});

for (const action of ['submit', 'approve', 'return', 'reject', 'cancel']) {
  router.post(`/purchase-orders/:id/${action}`, authenticate, async (req, res, next) => {
    try {
      const permission = action === 'submit' ? 'create' : action === 'cancel' ? 'cancel' : 'approve';
      if (!hasAccountingPermission(await getAccountingAccess(req.user), 'ap', permission)) invalid(`ไม่มีสิทธิ์ ap.${permission}`, 403);
      const reason = poActionReason(action, req.body.reason);
      res.json(await prisma.$transaction(async tx => {
        const previous = await lockPurchaseOrder(tx, req.params.id, req.body.updatedAt, PURCHASE_ORDER_INCLUDE);
        const allowed = action === 'submit' ? ['draft', 'returned']
          : action === 'cancel' ? ['draft', 'returned', 'pending', 'approved'] : ['pending'];
        if (!allowed.includes(previous.status)) invalid('สถานะ PO ไม่รองรับคำสั่งนี้', 409);
        if (action === 'approve' && previous.createdById === req.user.id) invalid('ผู้สร้างไม่สามารถอนุมัติ PO ของตัวเองได้', 403);
        const approval = await planApproval(tx, 'po', previous, action, req.user.id, reason);
        if (['return', 'reject', 'cancel'].includes(action)) await assertNoPoDependents(tx, previous.id);
        if (['submit', 'approve'].includes(action)) {
          assertPoSubmittable(previous);
          for (const item of previous.items) if (item.productId) await assertActive(tx, 'accountProduct', item.productId, 'สินค้า/บริการ');
        }
        const status = action === 'approve' && !approval.finalApproval ? 'pending'
          : { submit: 'pending', approve: 'approved', return: 'returned', reject: 'rejected', cancel: 'cancelled' }[action];
        const doc = await tx.purchaseOrder.update({ where: { id: previous.id },
          data: { status, approvalStep: action === 'approve' ? 1 : 0, ...approval.changes }, include: PURCHASE_ORDER_INCLUDE });
        await purchaseOrderAudit(tx, req, action, previous, doc, reason);
        return doc;
      }));
    } catch (error) { next(error); }
  });
}

// ─── 2. CONTRACTOR PAYMENT REQUESTS (PS) ──────────────────────────────────────

router.use('/contractor-payments', require('./contractor-payments'));

// ─── 3. GOODS RECEIPTS (GR) ───────────────────────────────────────────────────

router.use('/goods-receipts', require('./goods-receipts'));

// ─── 4. PAYMENT VOUCHERS (PV) ─────────────────────────────────────────────────

router.use('/payment-vouchers', require('./payment-vouchers'));

// ─── 5. CHEQUE PAYMENTS (CQ) ──────────────────────────────────────────────────

router.use('/cheque-payments', require('./cheque-payments'));

module.exports = router;
