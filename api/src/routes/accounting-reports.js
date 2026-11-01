const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { requireAccountingResource } = require('../middleware/accountingAccess');
const { reportFilters, agingBuckets, invoiceIsPosted, poReceiptRow } = require('../lib/accountingReports');
const { BILL_INCLUDE, apBillAgingRow, billBalances } = require('../lib/supplierBill');

router.use(authenticate, requireAccountingResource('reports'));

router.get('/ar/aging', async (req, res, next) => {
  try {
    const { asOfDate } = reportFilters(req.query);
    const invoices = await prisma.invoice.findMany({
      where: {
        OR: [{ status: 'approved' }, { status: 'pending', lifecycleVersion: { not: 1 } }],
        outstandingAmount: { gt: 0 }, ivDate: { lt: new Date(asOfDate.getTime() + 86400000) },
      },
      include: { customer: true }, orderBy: [{ ivDate: 'asc' }, { ivNo: 'asc' }],
    });
    const rows = invoices.map(inv => {
      const due = new Date(inv.dueDate || inv.ivDate);
      const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
      const diffDays = Math.floor((asOfDate.getTime() - dueDay) / 86400000);
      const outstandingAmount = Number(inv.outstandingAmount);
      const customerName = inv.customerName || inv.customer?.name || 'N/A';
      return {
        ivNo: inv.ivNo, customerName, ivDate: inv.ivDate, dueDate: inv.dueDate || inv.ivDate,
        documentNo: inv.ivNo, documentDate: inv.ivDate, partnerName: customerName,
        netAmount: Number(inv.netAmount), outstandingAmount, diffDays,
        ...agingBuckets(outstandingAmount, diffDays),
      };
    });
    res.json({
      asOfDate, basis: 'current_ar_balance',
      warnings: ['ยอดคงค้างปัจจุบันจัดอายุตามวันที่อ้างอิง ไม่ใช่ยอดหนี้ย้อนหลัง ณ วันนั้น'],
      rows,
    });
  } catch (error) { next(error); }
});

router.get('/ap/aging', async (req, res, next) => {
  try {
    const { asOfDate } = reportFilters(req.query);
    const end = new Date(asOfDate.getTime() + 86400000);
    const bills = await prisma.supplierBill.findMany({
      where: { status: 'confirmed', supplierInvoiceDate: { lt: end } },
      include: { settlements: BILL_INCLUDE.settlements }, orderBy: [{ dueDate: 'asc' }, { billNo: 'asc' }],
    });
    const rows = bills.map(bill => apBillAgingRow(bill, asOfDate, agingBuckets)).filter(Boolean);
    const ineffective = bills.filter(bill => billBalances(bill).ineffective > 0).map(bill => bill.billNo);
    res.json({
      asOfDate, basis: 'supplier_bill_outstanding',
      warnings: [
        '?????????????????????????????????/???????????????????????????????? ???????? PV ?????????????????????????????????????????????????????????????/??????????',
        '??????????? PV ????????????????? ????????????????? ? ???????; PO ????????????? ?????????? (????????????????? PO ???) ??????????????????????????????????',
        ...(ineffective.length ? [`?????????????????????? PV ?????????????/?????????????? ????????????????????: ${ineffective.join(', ')}`] : []),
      ],
      rows,
    });
  } catch (error) { next(error); }
});

router.get('/ap/po-commitment', async (req, res, next) => {
  try {
    const { asOfDate } = reportFilters(req.query);
    const pos = await prisma.purchaseOrder.findMany({
      where: { status: { in: ['approved', 'pending'] }, poDate: { lt: new Date(asOfDate.getTime() + 86400000) } },
      include: { supplier: true }, orderBy: [{ poDate: 'asc' }, { poNo: 'asc' }],
    });
    const rows = pos.map(po => {
      const date = new Date(po.poDate);
      const diffDays = Math.floor((asOfDate.getTime() - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / 86400000);
      const supplierName = po.supplierSnapshot?.name || po.supplier?.name || 'N/A';
      const netAmount = Number(po.netAmount);
      return {
        poNo: po.poNo, supplierName, poDate: po.poDate, netAmount, diffDays,
        documentNo: po.poNo, documentDate: po.poDate, partnerName: supplierName,
        ...agingBuckets(netAmount, diffDays),
      };
    });
    res.json({
      asOfDate, basis: 'po_commitment',
      warnings: ['รายงานนี้เป็นยอด PO ตามอายุวันที่สั่งซื้อ ไม่ใช่ AP Aging หรือหนี้เจ้าหนี้คงเหลือจริง และยังไม่หักยอดจ่าย',
        'ต้องยืนยันเอกสารตั้งหนี้และกติกาวันครบกำหนดกับบัญชีก่อนใช้เป็น AP Aging'],
      rows,
    });
  } catch (error) { next(error); }
});

router.get('/recon/delivery-to-invoice', async (req, res, next) => {
  try {
    const { from, to, range } = reportFilters(req.query);
    const orders = await prisma.provisionalDeliveryOrder.findMany({
      where: Object.keys(range).length ? { docDate: range } : {},
      include: { customer: true, invoices: true }, orderBy: [{ docDate: 'asc' }, { soNo: 'asc' }],
    });
    const rows = orders.map(so => {
      const linkedInvoices = so.invoices.filter(invoiceIsPosted).map(inv => inv.ivNo);
      const pendingInvoices = so.invoices.filter(inv => inv.lifecycleVersion === 1 && inv.status === 'pending').map(inv => inv.ivNo);
      const customerName = so.customerName || so.customer?.name || 'N/A';
      return {
        soNo: so.soNo, docDate: so.docDate, customerName, status: so.status,
        documentNo: so.soNo, documentDate: so.docDate, partnerName: customerName,
        linkedInvoices, pendingInvoices,
        isInvoiced: linkedInvoices.length > 0,
        receiptState: so.status === 'cancelled' ? 'cancelled' : linkedInvoices.length ? 'complete' : 'not_received',
        linkedDocuments: linkedInvoices, pendingDocuments: pendingInvoices,
      };
    });
    res.json({ from, to, basis: 'current_document_state', warnings: [], rows });
  } catch (error) { next(error); }
});

router.get('/recon/po-to-goods-receipt', async (req, res, next) => {
  try {
    const { from, to, range } = reportFilters(req.query);
    const pos = await prisma.purchaseOrder.findMany({
      where: Object.keys(range).length ? { poDate: range } : {},
      include: { supplier: true, items: { orderBy: { seq: 'asc' } }, goodsReceipts: { include: { items: true } } },
      orderBy: [{ poDate: 'asc' }, { poNo: 'asc' }],
    });
    const rows = pos.map(po => {
      const row = poReceiptRow(po);
      return { ...row, documentNo: row.poNo, documentDate: row.poDate, partnerName: row.supplierName,
        linkedDocuments: row.goodsReceipts, pendingDocuments: row.pendingGoodsReceipts,
        cancelledDocuments: row.cancelledGoodsReceipts };
    });
    res.json({
      from, to, basis: 'current_document_state',
      warnings: ['สถานะรับคำนวณจาก GR ที่อนุมัติแล้วต่อรายการ PO; จำนวนรออนุมัติยังไม่ใช่ยอดรับจริง และไม่รวมจำนวนต่างหน่วยเข้าด้วยกัน'],
      rows,
    });
  } catch (error) { next(error); }
});

module.exports = router;
