const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { validateStateTransition } = require('../lib/stateTransition');
const { recordAuditLog } = require('../lib/auditTrail');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');
const { getPagination, paginated } = require('../lib/pagination');
const { assertActive } = require('../lib/accountingMaster');
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
    res.json(doc);
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

      await recordAuditLog({
        entityType: 'purchase_order',
        entityId: doc.id,
        docNo: doc.poNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

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
      const previous = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: req.params.id },
        include: PURCHASE_ORDER_INCLUDE,
      });
      if (previous.status !== 'draft') {
        throw Object.assign(new Error('แก้ไขได้เฉพาะใบสั่งซื้อสถานะ Draft'), { status: 409 });
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
      await recordAuditLog({
        entityType: 'purchase_order',
        entityId: updated.id,
        docNo: updated.poNo,
        action: 'update',
        oldValue: previous,
        newValue: updated,
        req,
      }, tx);
      return updated;
    });
    res.json(result);
  } catch (e) { next(e); }
});

// ─── 2. CONTRACTOR PAYMENT REQUESTS (PS) ──────────────────────────────────────

// POST /api/ap/contractor-payments
router.post('/contractor-payments', authenticate, async (req, res, next) => {
  try {
    const {
      docDate,
      poId,
      supplierId,
      paymentRound = 1,
      poAmount = 0,
      currentRequestAmount = 0,
      vat = 0,
      wht = 0,
      retention = 0,
      netAmount = 0,
      items = [],
    } = req.body;

    if (!poId) return res.status(400).json({ message: 'กรุณาระบุใบสั่งซื้ออ้างอิง (poId)' });

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
      await assertActive(tx, 'supplier', supplierId || po.supplierId, 'ผู้จำหน่าย');

      // Calculate previously requested amounts for this PO
      const previousRequests = await tx.contractorPaymentRequest.findMany({
        where: { poId, status: { in: ['approved', 'pending', 'draft'] } },
      });
      const previouslyRequested = previousRequests.reduce((sum, req) => sum + Number(req.currentRequestAmount), 0);
      const remaining = Number(po.netAmount) - previouslyRequested;
      const currentReq = parseFloat(currentRequestAmount) || 0;

      if (currentReq > remaining) {
        throw new Error(`ยอดเบิกครั้งนี้ (฿${currentReq}) เกินกว่ายอด PO คงเหลือ (฿${remaining})`);
      }

      const psNo = await generateNextRunningNumber('ps', {
        date: docDate ? new Date(docDate) : new Date(),
        round: parseInt(paymentRound, 10) || 1,
      }, tx);

      const doc = await tx.contractorPaymentRequest.create({
        data: {
          psNo,
          docDate: docDate ? new Date(docDate) : new Date(),
          poId,
          supplierId: supplierId || po.supplierId,
          paymentRound: parseInt(paymentRound, 10) || 1,
          poAmount: Number(po.netAmount),
          previouslyRequestedAmount: previouslyRequested,
          remainingAmount: Math.max(0, remaining - currentReq),
          currentRequestAmount: currentReq,
          vat: parseFloat(vat) || 0,
          wht: parseFloat(wht) || 0,
          retention: parseFloat(retention) || 0,
          netAmount: parseFloat(netAmount) || 0,
          createdById: req.user.id,
          status: 'draft',
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              desc: String(it.desc || ''),
              amount: parseFloat(it.amount) || 0,
              remark: it.remark || null,
            })),
          },
        },
        include: { items: true },
      });

      await recordAuditLog({
        entityType: 'contractor_payment_request',
        entityId: doc.id,
        docNo: doc.psNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 3. GOODS RECEIPTS (GR) ───────────────────────────────────────────────────

// POST /api/ap/goods-receipts
router.post('/goods-receipts', authenticate, async (req, res, next) => {
  try {
    const { receiptDate, poId, supplierId, warehouseId, sender, receiver, remark, items = [] } = req.body;
    if (!poId) return res.status(400).json({ message: 'กรุณาระบุใบสั่งซื้ออ้างอิง (poId)' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'ต้องมีรายการรับสินค้าอย่างน้อย 1 รายการ' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: poId },
        include: { items: { include: { product: true } } },
      });
      await assertActive(tx, 'supplier', supplierId || po.supplierId, 'ผู้จำหน่าย');
      if (warehouseId) await assertActive(tx, 'warehouse', warehouseId, 'คลังสินค้า');
      for (const item of items) if (item.productId) await assertActive(tx, 'accountProduct', item.productId, 'สินค้า');

      const grNo = await generateNextRunningNumber('gr', { date: receiptDate ? new Date(receiptDate) : new Date() }, tx);

      const doc = await tx.goodsReceipt.create({
        data: {
          grNo,
          receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
          poId,
          supplierId: supplierId || po.supplierId,
          warehouseId,
          sender,
          receiver,
          remark,
          createdById: req.user.id,
          status: 'approved',
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              productId: it.productId || null,
              orderedQty: parseFloat(it.orderedQty) || 0,
              previouslyReceivedQty: parseFloat(it.previouslyReceivedQty) || 0,
              remainingQty: parseFloat(it.remainingQty) || 0,
              currentReceiptQty: parseFloat(it.currentReceiptQty) || 0,
            })),
          },
        },
        include: { items: true },
      });

      // Stock Movement creation for Stored / Manufactured products
      if (warehouseId) {
        for (const item of items) {
          if (!item.productId) continue;
          const product = await tx.accountProduct.findUnique({ where: { id: item.productId } });

          // Service items do not affect stock
          if (product && product.productType !== 'service') {
            const receiptQty = parseFloat(item.currentReceiptQty) || 0;

            // 1. Create StockMovement
            await tx.stockMovement.create({
              data: {
                movementType: 'in',
                productId: item.productId,
                warehouseId,
                qtyIn: receiptQty,
                qtyOut: 0,
                sourceDocType: 'goods_receipt',
                sourceDocId: doc.id,
                sourceDocNo: doc.grNo,
                transactionDate: doc.receiptDate,
                createdById: req.user.id,
                remark: `รับสินค้าจาก PO: ${po.poNo}`,
              },
            });

            // 2. Upsert StockBalance
            const existingBalance = await tx.stockBalance.findUnique({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            });

            const currentOnHand = existingBalance ? Number(existingBalance.onHand) : 0;
            const newOnHand = currentOnHand + receiptQty;
            const currentReserved = existingBalance ? Number(existingBalance.reserved) : 0;
            const newAvailable = Math.max(0, newOnHand - currentReserved);

            await tx.stockBalance.upsert({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              create: {
                warehouseId,
                productId: item.productId,
                onHand: newOnHand,
                reserved: 0,
                available: newOnHand,
              },
              update: {
                onHand: newOnHand,
                available: newAvailable,
              },
            });
          }
        }
      }

      await recordAuditLog({
        entityType: 'goods_receipt',
        entityId: doc.id,
        docNo: doc.grNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 4. PAYMENT VOUCHERS (PV) ─────────────────────────────────────────────────

// POST /api/ap/payment-vouchers
router.post('/payment-vouchers', authenticate, async (req, res, next) => {
  try {
    const {
      pvDate,
      supplierId,
      sourceDocType,
      sourceDocId,
      amountBeforeTax = 0,
      vat = 0,
      wht = 0,
      otherDeduction = 0,
      netPayment = 0,
      paymentMethod = 'transfer',
      bankAccount,
      items = [],
    } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const pvNo = await generateNextRunningNumber('pv', { date: pvDate ? new Date(pvDate) : new Date() }, tx);
      if (supplierId) await assertActive(tx, 'supplier', supplierId, 'ผู้จำหน่าย');
      const doc = await tx.paymentVoucher.create({
        data: {
          pvNo,
          pvDate: pvDate ? new Date(pvDate) : new Date(),
          supplierId,
          sourceDocType,
          sourceDocId,
          amountBeforeTax: parseFloat(amountBeforeTax) || 0,
          vat: parseFloat(vat) || 0,
          wht: parseFloat(wht) || 0,
          otherDeduction: parseFloat(otherDeduction) || 0,
          netPayment: parseFloat(netPayment) || 0,
          paymentMethod,
          bankAccount,
          createdById: req.user.id,
          status: 'draft',
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              desc: String(it.desc || ''),
              amount: parseFloat(it.amount) || 0,
            })),
          },
        },
        include: { items: true },
      });

      await recordAuditLog({
        entityType: 'payment_voucher',
        entityId: doc.id,
        docNo: doc.pvNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 5. CHEQUE PAYMENTS (CQ) ──────────────────────────────────────────────────

// POST /api/ap/cheque-payments
router.post('/cheque-payments', authenticate, async (req, res, next) => {
  try {
    const { paymentVoucherId, bankAccount, chequeNo, chequeDate, payee, amount = 0, remark } = req.body;
    if (!paymentVoucherId || !bankAccount || !chequeNo) {
      return res.status(400).json({ message: 'กรุณาระบุ paymentVoucherId, bankAccount และ chequeNo' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Unique check per bank account
      const existing = await tx.chequePayment.findUnique({
        where: { bankAccount_chequeNo: { bankAccount, chequeNo } },
      });
      if (existing) {
        throw new Error(`เลขเช็ค ${chequeNo} ในบัญชี ${bankAccount} มีในระบบแล้ว`);
      }

      const cqNo = await generateNextRunningNumber('cq', { date: chequeDate ? new Date(chequeDate) : new Date() }, tx);
      const doc = await tx.chequePayment.create({
        data: {
          cqNo,
          paymentVoucherId,
          bankAccount,
          chequeNo,
          chequeDate: chequeDate ? new Date(chequeDate) : new Date(),
          payee,
          amount: parseFloat(amount) || 0,
          status: 'Prepared',
          remark,
          createdById: req.user.id,
        },
      });

      await recordAuditLog({
        entityType: 'cheque_payment',
        entityId: doc.id,
        docNo: doc.cqNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// PATCH /api/ap/cheque-payments/:id/status
router.patch('/cheque-payments/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status, releaseDate, remark } = req.body;
    const validStatuses = ['Prepared', 'Printed', 'Signed', 'Released', 'Cleared', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `สถานะเช็คไม่ถูกต้อง (${validStatuses.join(', ')})` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const cheque = await tx.chequePayment.findUniqueOrThrow({ where: { id: req.params.id } });

      if (cheque.status === 'Cancelled') {
        throw new Error('ไม่สามารถเปลี่ยนสถานะเช็คที่ยกเลิกแล้วได้');
      }

      const updated = await tx.chequePayment.update({
        where: { id: req.params.id },
        data: {
          status,
          releaseDate: releaseDate ? new Date(releaseDate) : cheque.releaseDate,
          remark: remark || cheque.remark,
        },
      });

      await recordAuditLog({
        entityType: 'cheque_payment',
        entityId: cheque.id,
        docNo: cheque.cqNo,
        action: `cheque.status_change.${status.toLowerCase()}`,
        oldValue: { status: cheque.status },
        newValue: { status: updated.status },
        req,
      }, tx);

      return updated;
    });

    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
