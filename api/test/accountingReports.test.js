const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const queries = [];
const data = { invoices: [], pos: [], orders: [], bills: [] };
const prisma = {
  user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
  accountingUserRole: { findUnique: async ({ where }) => ({ role: { id: 'reports', name: 'Reports',
    permissions: where.userId === 'viewer' ? ['reports.view'] : ['ar.view'] } }) },
  invoice: { findMany: async args => {
    queries.push(['invoice', args]);
    return data.invoices.filter(row => (row.status === 'approved' || (row.status === 'pending' && row.lifecycleVersion !== 1)) &&
      row.outstandingAmount > 0 && row.ivDate < args.where.ivDate.lt);
  } },
  purchaseOrder: { findMany: async args => {
    queries.push(['po', args]);
    return data.pos.filter(row => !args.where.poDate || ((!args.where.poDate.gte || row.poDate >= args.where.poDate.gte) &&
      (!args.where.poDate.lt || row.poDate < args.where.poDate.lt)));
  } },
  supplierBill: { findMany: async args => {
    queries.push(['bill', args]);
    return data.bills.filter(row => row.status === args.where.status && row.supplierInvoiceDate < args.where.supplierInvoiceDate.lt);
  } },
  provisionalDeliveryOrder: { findMany: async args => { queries.push(['so', args]); return data.orders; } },
};
require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
const { poReceiptRow, reportFilters, agingBuckets, invoiceIsPosted } = require('../src/lib/accountingReports');

const po = (receipts = []) => ({
  poNo: 'PO1', poDate: new Date('2026-10-01'), status: 'approved',
  supplierSnapshot: { name: 'Saved supplier' }, supplier: { name: 'Renamed supplier' },
  items: [{ id: 'a', qty: '2.000', unit: 'pcs', desc: 'A' }, { id: 'b', qty: '1.000', unit: 'box', desc: 'B' }],
  goodsReceipts: receipts,
});
const gr = (status, lines, lifecycleVersion = 1) => ({
  grNo: `GR-${status}`, status, lifecycleVersion,
  items: lines.map(([poLineId, currentReceiptQty]) => ({ poLineId, currentReceiptQty })),
});

test('PO reconciliation counts only approved receipts per PO line, not presence or aggregate units', () => {
  assert.equal(poReceiptRow(po()).receiptState, 'not_received');
  const partial = poReceiptRow(po([gr('approved', [['a', '2.000']]), gr('pending', [['b', '1.000']]),
    gr('draft', [['b', '1.000']]), gr('cancelled', [['b', '1.000']]), gr('returned', [['b', '1.000']])]));
  assert.equal(partial.receiptState, 'partial');
  assert.equal(partial.hasReceipt, true);
  assert.equal(partial.supplierName, 'Saved supplier');
  assert.deepEqual(partial.goodsReceipts, ['GR-approved']);
  assert.deepEqual(partial.cancelledGoodsReceipts, ['GR-cancelled']);
  assert.deepEqual(partial.lines.map(line => [line.receivedQty, line.pendingQty, line.remainingQty]), [
    [2, 0, 0], [0, 1, 1],
  ]);
  assert.equal(poReceiptRow(po([gr('approved', [['a', '2.000'], ['b', '1.000']])])).receiptState, 'complete');
  assert.equal(poReceiptRow({ ...po([gr('approved', [['a', '2.000'], ['b', '1.000']])]), status: 'cancelled' }).receiptState, 'cancelled');
});

test('Legacy, orphan mappings and overreceipts are visibly review-required, not reconciled', () => {
  for (const receipts of [[gr('approved', [[null, '3.000']], 0)],
    [gr('approved', [['unknown', '1.000']])], [gr('approved', [['a', '2.001']])]]) {
    const row = poReceiptRow(po(receipts));
    assert.equal(row.receiptState, 'review_required');
    assert.ok(row.reviewReasons.length);
  }
  assert.equal(poReceiptRow({ ...po(), items: [] }).receiptState, 'review_required');
  assert.equal(poReceiptRow(po([gr('cancelled', [[null, '3.000']], 0)])).receiptState, 'not_received');
});

test('Reports validate single dates/ranges and keep Aging buckets mutually exclusive', () => {
  for (const query of [{ asOfDate: '2026-02-30' }, { from: ['2026-10-01', '2026-10-02'] },
    { from: '2026-11-01', to: '2026-10-01' }, { to: 'invalid' }]) {
    assert.throws(() => reportFilters(query), error => error.status === 400);
  }
  assert.equal(reportFilters({ asOfDate: '2026-10-31' }).asOfDate.toISOString().slice(0, 10), '2026-10-31');
  for (const [days, key] of [[0, 'current'], [1, 'days1To30'], [30, 'days1To30'], [31, 'days31To60'],
    [60, 'days31To60'], [61, 'days61To90'], [90, 'days61To90'], [91, 'over90Days']]) {
    const buckets = agingBuckets(107.01, days);
    assert.equal(buckets[key], 107.01);
    assert.equal(Object.values(buckets).filter(value => value !== 0).length, 1);
  }
});

test('Managed pending/returned/rejected invoices are not posted debt or delivery reconciliation', () => {
  assert.equal(invoiceIsPosted({ status: 'approved', lifecycleVersion: 1 }), true);
  assert.equal(invoiceIsPosted({ status: 'pending', lifecycleVersion: 0 }), true);
  for (const status of ['draft', 'pending', 'returned', 'rejected', 'cancelled']) {
    assert.equal(invoiceIsPosted({ status, lifecycleVersion: 1 }), false);
  }
});

test('All four report HTTP routes enforce Accounting access, validated filters and truthful report bases', async t => {
  process.env.JWT_SECRET = 'accounting-reports-isolated-tests';
  data.pos = [po([gr('approved', [['a', '1.000']])])];
  data.invoices = ['approved', 'pending', 'returned', 'rejected', 'cancelled'].map((status, index) => ({
    ivNo: `IV${index}`, ivDate: new Date('2026-10-01'), dueDate: new Date('2026-10-01'),
    lifecycleVersion: 1, status, netAmount: 107.01, outstandingAmount: 107.01, customerName: 'Saved customer',
  }));
  data.invoices.push({ ...data.invoices[0], ivNo: 'future', ivDate: new Date('2026-11-01') });
  const paidPv = { lifecycleVersion: 1, status: 'approved', paidAt: new Date('2026-10-05'), reversedAt: null };
  data.bills = ['confirmed', 'draft', 'cancelled'].map((status, index) => ({ billNo: `SB${index}`, status,
    supplierInvoiceNo: `INV${index}`, supplierInvoiceDate: new Date('2026-10-01'), dueDate: new Date('2026-10-01'),
    netAmount: '107.01', supplierSnapshot: { name: 'Saved supplier' }, settlements: [
      { status: 'active', amount: '7.00', paymentVoucher: paidPv },
      { status: 'active', amount: '50.00', paymentVoucher: { ...paidPv, status: 'cancelled', reversedAt: new Date('2026-10-06') } },
      { status: 'voided', amount: '100.00', paymentVoucher: paidPv }] }));
  data.orders = [{ soNo: 'SO1', docDate: new Date('2026-10-01'), status: 'approved', customer: { name: 'Customer' },
    invoices: data.invoices.slice(1, 5) }];
  const app = express();
  app.use('/api/accounting-reports', require('../src/routes/accounting-reports'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(path, user = 'viewer', expected = 200) {
    const token = user && jwt.sign({ sub: user }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/accounting-reports${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }
  for (const path of ['/ar/aging', '/ap/aging', '/ap/po-commitment', '/recon/delivery-to-invoice', '/recon/po-to-goods-receipt']) {
    await request(path, null, 401);
    await request(path, 'unassigned', 403);
  }
  await request('/ar/aging?asOfDate=2026-02-30', 'viewer', 400);
  await request('/recon/po-to-goods-receipt?from=2026-11-01&to=2026-10-01', 'viewer', 400);
  const ar = await request('/ar/aging?asOfDate=2026-10-31');
  assert.deepEqual(ar.rows.map(row => row.documentNo), ['IV0']);
  assert.equal(ar.rows[0].days1To30, 107.01);
  assert.equal(ar.rows[0].partnerName, 'Saved customer');
  assert.equal(ar.basis, 'current_ar_balance');
  assert.ok(ar.warnings.length);
  const bills = await request('/ap/aging?asOfDate=2026-10-31');
  assert.equal(bills.basis, 'supplier_bill_outstanding');
  assert.deepEqual(bills.rows.map(row => [row.documentNo, row.netAmount, row.settledAmount, row.outstandingAmount, row.days1To30]),
    [['SB0', 107.01, 7, 100.01, 100.01]]);
  assert.equal(bills.rows[0].partnerName, 'Saved supplier');
  assert.ok(bills.warnings.some(warning => warning.includes('SB0')));
  const ap = await request('/ap/po-commitment?asOfDate=2026-10-31');
  assert.equal(ap.basis, 'po_commitment');
  assert.ok(ap.warnings[0].includes('ไม่ใช่ AP Aging'));
  const delivery = await request('/recon/delivery-to-invoice?from=2026-10-01&to=2026-10-31');
  assert.equal(delivery.rows[0].isInvoiced, false);
  assert.deepEqual(delivery.rows[0].pendingDocuments, ['IV1']);
  const receipt = await request('/recon/po-to-goods-receipt?from=2026-10-01&to=2026-10-31');
  assert.equal(receipt.rows[0].receiptState, 'partial');
  const query = queries.findLast(([model]) => model === 'po')[1];
  assert.equal(query.where.poDate.gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(query.where.poDate.lt.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(query.include.goodsReceipts.include.items, true);
});
