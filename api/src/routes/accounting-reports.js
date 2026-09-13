const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { assertActionAuthorized } = require('../lib/authorizationPolicy');

// ─── 12.2 ACCOUNTS RECEIVABLE REPORTS ────────────────────────────────────────

// GET /api/accounting-reports/ar/aging — AR Aging Report
router.get('/ar/aging', authenticate, async (req, res, next) => {
  try {
    await assertActionAuthorized(req.user, 'export');
    const { asOfDate = new Date() } = req.query;

    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['approved', 'pending'] },
        outstandingAmount: { gt: 0 },
      },
      include: { customer: true },
    });

    const targetDate = new Date(asOfDate);
    const result = invoices.map((inv) => {
      const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.ivDate);
      const diffDays = Math.floor((targetDate.getTime() - due.getTime()) / (1000 * 3600 * 24));

      let current = 0;
      let days1To30 = 0;
      let days31To60 = 0;
      let days61To90 = 0;
      let over90Days = 0;

      const amt = Number(inv.outstandingAmount);
      if (diffDays <= 0) current = amt;
      else if (diffDays <= 30) days1To30 = amt;
      else if (diffDays <= 60) days31To60 = amt;
      else if (diffDays <= 90) days61To90 = amt;
      else over90Days = amt;

      return {
        ivNo: inv.ivNo,
        customerName: inv.customer ? inv.customer.name : 'N/A',
        ivDate: inv.ivDate,
        dueDate: inv.dueDate,
        netAmount: Number(inv.netAmount),
        outstandingAmount: amt,
        diffDays,
        current,
        days1To30,
        days31To60,
        days61To90,
        over90Days,
      };
    });

    res.json({ asOfDate: targetDate, rows: result });
  } catch (e) { next(e); }
});

// ─── 12.3 ACCOUNTS PAYABLE REPORTS ──────────────────────────────────────────

// GET /api/accounting-reports/ap/aging — AP Aging Report
router.get('/ap/aging', authenticate, async (req, res, next) => {
  try {
    await assertActionAuthorized(req.user, 'export');
    const { asOfDate = new Date() } = req.query;

    const pos = await prisma.purchaseOrder.findMany({
      where: { status: { in: ['approved', 'pending'] } },
      include: { supplier: true },
    });

    const targetDate = new Date(asOfDate);
    const result = pos.map((po) => {
      const poDate = new Date(po.poDate);
      const diffDays = Math.floor((targetDate.getTime() - poDate.getTime()) / (1000 * 3600 * 24));

      const amt = Number(po.netAmount);
      let current = 0;
      let days1To30 = 0;
      let days31To60 = 0;
      let days61To90 = 0;
      let over90Days = 0;

      if (diffDays <= 0) current = amt;
      else if (diffDays <= 30) days1To30 = amt;
      else if (diffDays <= 60) days31To60 = amt;
      else if (diffDays <= 90) days61To90 = amt;
      else over90Days = amt;

      return {
        poNo: po.poNo,
        supplierName: po.supplier ? po.supplier.name : 'N/A',
        poDate: po.poDate,
        netAmount: amt,
        diffDays,
        current,
        days1To30,
        days31To60,
        days61To90,
        over90Days,
      };
    });

    res.json({ asOfDate: targetDate, rows: result });
  } catch (e) { next(e); }
});

// ─── 12.6 RECONCILIATION REPORTS ────────────────────────────────────────────

// GET /api/accounting-reports/recon/delivery-to-invoice
router.get('/recon/delivery-to-invoice', authenticate, async (req, res, next) => {
  try {
    const deliveryOrders = await prisma.provisionalDeliveryOrder.findMany({
      include: { customer: true, invoices: true },
    });

    const rows = deliveryOrders.map(so => ({
      soNo: so.soNo,
      docDate: so.docDate,
      customerName: so.customer ? so.customer.name : 'N/A',
      status: so.status,
      linkedInvoices: so.invoices.map(i => i.ivNo),
      isInvoiced: so.invoices.length > 0,
    }));

    res.json({ rows });
  } catch (e) { next(e); }
});

// GET /api/accounting-reports/recon/po-to-goods-receipt
router.get('/recon/po-to-goods-receipt', authenticate, async (req, res, next) => {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: { supplier: true, goodsReceipts: true },
    });

    const rows = pos.map(po => ({
      poNo: po.poNo,
      poDate: po.poDate,
      supplierName: po.supplier ? po.supplier.name : 'N/A',
      status: po.status,
      goodsReceipts: po.goodsReceipts.map(gr => gr.grNo),
      hasReceipt: po.goodsReceipts.length > 0,
    }));

    res.json({ rows });
  } catch (e) { next(e); }
});

module.exports = router;
