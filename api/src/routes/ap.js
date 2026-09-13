const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { validateStateTransition } = require('../lib/stateTransition');
const { recordAuditLog } = require('../lib/auditTrail');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');
const { getPagination, paginated } = require('../lib/pagination');

// ─── 1. PURCHASE ORDERS (PO) ──────────────────────────────────────────────────

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
          include: { supplier: true, items: true, pr: true },
        }),
        prisma.purchaseOrder.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { poDate: 'desc' },
      include: { supplier: true, items: true, pr: true },
    });
    res.json(list);
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
      prId,
      subTotal = 0,
      vat = 0,
      netAmount = 0,
      paymentTerm = 30,
      deliveryDate,
      deliveryLocation,
      items = [],
    } = req.body;

    if (!supplierId) return res.status(400).json({ message: 'กรุณาระบุผู้จำหน่าย (supplierId)' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'ต้องมีรายการสั่งซื้ออย่างน้อย 1 รายการ' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const poNo = await generateNextRunningNumber('po', { date: poDate ? new Date(poDate) : new Date() }, tx);
      const doc = await tx.purchaseOrder.create({
        data: {
          poNo,
          poDate: poDate ? new Date(poDate) : new Date(),
          purchaseType,
          supplierId,
          supplierBranch: supplierBranch || 'สำนักงานใหญ่',
          address,
          contactPerson,
          prId,
          subTotal: parseFloat(subTotal) || 0,
          vat: parseFloat(vat) || 0,
          netAmount: parseFloat(netAmount) || 0,
          paymentTerm: parseInt(paymentTerm, 10) || 30,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          deliveryLocation,
          createdById: req.user.id,
          status: 'draft',
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              productId: it.productId || null,
              desc: String(it.desc || ''),
              qty: parseFloat(it.qty) || 0,
              unitPrice: parseFloat(it.unitPrice) || 0,
              discount: parseFloat(it.discount) || 0,
              amount: parseFloat(it.amount) || 0,
            })),
          },
        },
        include: { items: true, supplier: true },
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
