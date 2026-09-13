const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { validateStateTransition } = require('../lib/stateTransition');
const { recordAuditLog } = require('../lib/auditTrail');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');
const { processApprovalAction } = require('../lib/approvalEngine');
const { getPagination, paginated } = require('../lib/pagination');

// ─── 1. PROVISIONAL DELIVERY ORDERS (SO) ─────────────────────────────────────

// GET /api/ar/delivery-orders
router.get('/delivery-orders', authenticate, async (req, res, next) => {
  try {
    const { status, customerId, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (q) where.soNo = { contains: q, mode: 'insensitive' };

    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.provisionalDeliveryOrder.findMany({
          where,
          orderBy: { docDate: 'desc' },
          skip: pg.skip,
          take: pg.take,
          include: { customer: true, items: true, workOrder: true },
        }),
        prisma.provisionalDeliveryOrder.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.provisionalDeliveryOrder.findMany({
      where,
      orderBy: { docDate: 'desc' },
      include: { customer: true, items: true, workOrder: true },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/ar/delivery-orders
router.post('/delivery-orders', authenticate, async (req, res, next) => {
  try {
    const { docDate, customerId, customerBranch, shippingAddress, receiver, workOrderId, remark, items = [] } = req.body;
    if (!customerId) return res.status(400).json({ message: 'กรุณาระบุลูกค้า (customerId)' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const soNo = await generateNextRunningNumber('so', { date: docDate ? new Date(docDate) : new Date() }, tx);
      const doc = await tx.provisionalDeliveryOrder.create({
        data: {
          soNo,
          docDate: docDate ? new Date(docDate) : new Date(),
          customerId,
          customerBranch: customerBranch || 'สำนักงานใหญ่',
          shippingAddress,
          receiver,
          workOrderId,
          remark,
          salesId: req.user.id,
          status: 'draft',
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              productId: it.productId || null,
              desc: String(it.desc || ''),
              qty: parseFloat(it.qty) || 0,
              unit: it.unit || '',
              remark: it.remark || null,
            })),
          },
        },
        include: { items: true, customer: true },
      });

      await recordAuditLog({
        entityType: 'provisional_delivery_order',
        entityId: doc.id,
        docNo: doc.soNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 2. INVOICES (IV) ─────────────────────────────────────────────────────────

// GET /api/ar/invoices
router.get('/invoices', authenticate, async (req, res, next) => {
  try {
    const { status, customerId, q, unpaidOnly } = req.query;
    const where = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (unpaidOnly === 'true') where.outstandingAmount = { gt: 0 };
    if (q) where.ivNo = { contains: q, mode: 'insensitive' };

    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.invoice.findMany({
          where,
          orderBy: { ivDate: 'desc' },
          skip: pg.skip,
          take: pg.take,
          include: { customer: true, items: true },
        }),
        prisma.invoice.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.invoice.findMany({
      where,
      orderBy: { ivDate: 'desc' },
      include: { customer: true, items: true },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/ar/invoices
router.post('/invoices', authenticate, async (req, res, next) => {
  try {
    const {
      ivDate,
      customerId,
      customerBranch,
      taxId,
      address,
      customerPoNo,
      creditTerm = 30,
      workOrderId,
      provisionalDeliveryOrderId,
      subTotal = 0,
      discount = 0,
      vat = 0,
      netAmount = 0,
      remark,
      items = [],
    } = req.body;

    if (!customerId) return res.status(400).json({ message: 'กรุณาระบุลูกค้า (customerId)' });

    const result = await prisma.$transaction(async (tx) => {
      const ivNo = await generateNextRunningNumber('iv', { date: ivDate ? new Date(ivDate) : new Date() }, tx);
      const calcDueDate = new Date(ivDate ? new Date(ivDate) : new Date());
      calcDueDate.setDate(calcDueDate.getDate() + (parseInt(creditTerm, 10) || 30));

      const doc = await tx.invoice.create({
        data: {
          ivNo,
          ivDate: ivDate ? new Date(ivDate) : new Date(),
          customerId,
          customerBranch: customerBranch || 'สำนักงานใหญ่',
          taxId,
          address,
          salesId: req.user.id,
          customerPoNo,
          creditTerm: parseInt(creditTerm, 10) || 30,
          dueDate: calcDueDate,
          workOrderId,
          provisionalDeliveryOrderId,
          subTotal: parseFloat(subTotal) || 0,
          discount: parseFloat(discount) || 0,
          vat: parseFloat(vat) || 0,
          netAmount: parseFloat(netAmount) || 0,
          outstandingAmount: parseFloat(netAmount) || 0,
          status: 'draft',
          remark,
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              productId: it.productId || null,
              desc: String(it.desc || ''),
              qty: parseFloat(it.qty) || 0,
              unitPrice: parseFloat(it.unitPrice) || 0,
              lineDiscount: parseFloat(it.lineDiscount) || 0,
              vat: parseFloat(it.vat) || 0,
              amount: parseFloat(it.amount) || 0,
            })),
          },
        },
        include: { items: true, customer: true },
      });

      await recordAuditLog({
        entityType: 'invoice',
        entityId: doc.id,
        docNo: doc.ivNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 3. BILLING NOTES (BI) ───────────────────────────────────────────────────

// GET /api/ar/billing-notes
router.get('/billing-notes', authenticate, async (req, res, next) => {
  try {
    const { status, customerId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const list = await prisma.billingNote.findMany({
      where,
      orderBy: { billingDate: 'desc' },
      include: { customer: true, invoices: { include: { invoice: true } } },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/ar/billing-notes
router.post('/billing-notes', authenticate, async (req, res, next) => {
  try {
    const { billingDate, customerId, customerBranch, contactPerson, expectedPaymentDate, invoiceIds = [], remark } = req.body;
    if (!customerId) return res.status(400).json({ message: 'กรุณาระบุลูกค้า' });
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ message: 'ต้องเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Validate invoices belong to same customer and have outstanding balance
      const invs = await tx.invoice.findMany({
        where: { id: { in: invoiceIds } },
      });

      for (const inv of invs) {
        if (inv.customerId !== customerId) {
          throw new Error(`ใบแจ้งหนี้ ${inv.ivNo} ไม่ใช่ของลูกค้ารายนี้`);
        }
      }

      const totalAmount = invs.reduce((sum, inv) => sum + Number(inv.outstandingAmount), 0);
      const biNo = await generateNextRunningNumber('bi', { date: billingDate ? new Date(billingDate) : new Date() }, tx);

      const doc = await tx.billingNote.create({
        data: {
          biNo,
          billingDate: billingDate ? new Date(billingDate) : new Date(),
          customerId,
          customerBranch: customerBranch || 'สำนักงานใหญ่',
          contactPerson,
          expectedPaymentDate: expectedPaymentDate ? new Date(expectedPaymentDate) : null,
          totalAmount,
          salesId: req.user.id,
          status: 'draft',
          remark,
          invoices: {
            create: invs.map((inv) => ({
              invoiceId: inv.id,
              outstandingAmount: inv.outstandingAmount,
              billingAmount: inv.outstandingAmount,
            })),
          },
        },
        include: { invoices: { include: { invoice: true } }, customer: true },
      });

      await recordAuditLog({
        entityType: 'billing_note',
        entityId: doc.id,
        docNo: doc.biNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 4. CREDIT NOTES (CN) ────────────────────────────────────────────────────

// POST /api/ar/credit-notes
router.post('/credit-notes', authenticate, async (req, res, next) => {
  try {
    const { cnDate, invoiceId, reason, amountBeforeVat = 0, vat = 0, netAmount = 0, items = [] } = req.body;
    if (!invoiceId) return res.status(400).json({ message: 'กรุณาระบุใบแจ้งหนี้อ้างอิง (invoiceId)' });

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const requestedCN = parseFloat(netAmount) || 0;

      if (requestedCN > Number(inv.outstandingAmount)) {
        throw new Error(`ยอดใบลดหนี้ (฿${requestedCN}) เกินกว่ายอดลูกหนี้คงค้างของ Invoice (฿${inv.outstandingAmount})`);
      }

      const cnNo = await generateNextRunningNumber('cn', { date: cnDate ? new Date(cnDate) : new Date() }, tx);
      const doc = await tx.creditNote.create({
        data: {
          cnNo,
          cnDate: cnDate ? new Date(cnDate) : new Date(),
          invoiceId,
          customerId: inv.customerId,
          customerBranch: inv.customerBranch,
          reason,
          amountBeforeVat: parseFloat(amountBeforeVat) || 0,
          vat: parseFloat(vat) || 0,
          netAmount: requestedCN,
          salesId: req.user.id,
          status: 'approved', // Reduce AR balance on approval/creation
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              desc: String(it.desc || ''),
              qty: parseFloat(it.qty) || 0,
              unitPrice: parseFloat(it.unitPrice) || 0,
              amountBeforeVat: parseFloat(it.amountBeforeVat) || 0,
              vat: parseFloat(it.vat) || 0,
              netAmount: parseFloat(it.netAmount) || 0,
            })),
          },
        },
        include: { items: true },
      });

      // Reduce invoice outstanding amount
      const newOutstanding = Math.max(0, Number(inv.outstandingAmount) - requestedCN);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { outstandingAmount: newOutstanding },
      });

      await recordAuditLog({
        entityType: 'credit_note',
        entityId: doc.id,
        docNo: doc.cnNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 5. RECEIPT VOUCHERS (RV) ────────────────────────────────────────────────

// POST /api/ar/receipt-vouchers
router.post('/receipt-vouchers', authenticate, async (req, res, next) => {
  try {
    const {
      receiptDate,
      customerId,
      paymentMethod = 'transfer',
      bankName,
      refNo,
      chequeNo,
      chequeDate,
      totalReceived = 0,
      whtAmount = 0,
      bankFee = 0,
      remark,
      allocations = [], // [{ invoiceId, receivedAmount, whtAmount }]
    } = req.body;

    if (!customerId) return res.status(400).json({ message: 'กรุณาระบุลูกค้า' });
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ message: 'ต้องมีรายการจัดสรรรับชำระอย่างน้อย 1 รายการ' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const rvNo = await generateNextRunningNumber('rv', { date: receiptDate ? new Date(receiptDate) : new Date() }, tx);

      // Process allocations & update invoice outstanding balances
      for (const alloc of allocations) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
        const recv = parseFloat(alloc.receivedAmount) || 0;
        if (recv > Number(inv.outstandingAmount)) {
          throw new Error(`ยอดรับชำระเกินกว่ายอดคงค้างของใบแจ้งหนี้ ${inv.ivNo}`);
        }
        const newOutstanding = Math.max(0, Number(inv.outstandingAmount) - recv);
        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: { outstandingAmount: newOutstanding },
        });
      }

      const doc = await tx.receiptVoucher.create({
        data: {
          rvNo,
          receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
          customerId,
          paymentMethod,
          bankName,
          refNo,
          chequeNo,
          chequeDate: chequeDate ? new Date(chequeDate) : null,
          totalReceived: parseFloat(totalReceived) || 0,
          whtAmount: parseFloat(whtAmount) || 0,
          bankFee: parseFloat(bankFee) || 0,
          remark,
          salesId: req.user.id,
          status: 'approved',
          allocations: {
            create: allocations.map((a) => ({
              invoiceId: a.invoiceId,
              receivedAmount: parseFloat(a.receivedAmount) || 0,
              whtAmount: parseFloat(a.whtAmount) || 0,
            })),
          },
        },
        include: { allocations: true, customer: true },
      });

      await recordAuditLog({
        entityType: 'receipt_voucher',
        entityId: doc.id,
        docNo: doc.rvNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

module.exports = router;
