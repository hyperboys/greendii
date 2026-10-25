const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { validateStateTransition } = require('../lib/stateTransition');
const { recordAuditLog } = require('../lib/auditTrail');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');
const { processApprovalAction } = require('../lib/approvalEngine');
const { getPagination, paginated } = require('../lib/pagination');
const { invalid, moneyCents } = require('../lib/deliveryOrder');
const { lockInvoice, assertPostedInvoice } = require('../lib/invoice');

// ─── 1. PROVISIONAL DELIVERY ORDERS (SO) ─────────────────────────────────────

router.use('/delivery-orders', require('./delivery-orders'));

// ─── 2. INVOICES (IV) ─────────────────────────────────────────────────────────

router.use('/invoices', require('./invoices'));

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
      const ids = [...new Set(invoiceIds)];
      if (ids.length !== invoiceIds.length || ids.some(id => typeof id !== 'string')) invalid('รายการ Invoice ซ้ำหรือไม่ถูกต้อง');
      for (const id of [...ids].sort()) {
        const invoice = await lockInvoice(tx, id);
        assertPostedInvoice(invoice);
        if (Number(invoice.outstandingAmount) <= 0) invalid('Invoice ไม่มียอดค้างรับ', 409);
      }
      // Validate invoices belong to same customer and have outstanding balance
      const invs = await tx.invoice.findMany({
        where: { id: { in: invoiceIds } },
      });

      for (const inv of invs) {
        if (inv.customerId !== customerId) {
          invalid(`ใบแจ้งหนี้ ${inv.ivNo} ไม่ใช่ของลูกค้ารายนี้`);
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
      const inv = await lockInvoice(tx, invoiceId);
      assertPostedInvoice(inv);
      const requestedCN = moneyCents(netAmount, 'ยอดลดหนี้') / 100;
      if (requestedCN <= 0) invalid('ยอดลดหนี้ต้องมากกว่า 0');

      if (requestedCN > Number(inv.outstandingAmount)) {
        invalid(`ยอดใบลดหนี้ (฿${requestedCN}) เกินกว่ายอดลูกหนี้คงค้างของ Invoice (฿${inv.outstandingAmount})`);
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
      const ids = allocations.map(allocation => allocation?.invoiceId);
      if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) invalid('รายการ Invoice รับชำระซ้ำหรือไม่ถูกต้อง');
      for (const id of [...ids].sort()) {
        const invoice = await lockInvoice(tx, id);
        assertPostedInvoice(invoice);
        if (invoice.customerId !== customerId) invalid('Invoice ไม่ใช่ของลูกค้าที่เลือก');
      }
      const rvNo = await generateNextRunningNumber('rv', { date: receiptDate ? new Date(receiptDate) : new Date() }, tx);

      // Process allocations & update invoice outstanding balances
      for (const alloc of allocations) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
        const recv = moneyCents(alloc.receivedAmount, 'ยอดรับชำระ') / 100;
        if (recv <= 0) invalid('ยอดรับชำระต้องมากกว่า 0');
        if (recv > Number(inv.outstandingAmount)) {
          invalid(`ยอดรับชำระเกินกว่ายอดคงค้างของใบแจ้งหนี้ ${inv.ivNo}`);
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
