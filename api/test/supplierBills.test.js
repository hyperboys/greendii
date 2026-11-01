const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupplierBillPrisma } = require('./helpers/supplierBillPrisma');

process.env.JWT_SECRET = 'supplier-bill-isolated-tests';
const fake = createSupplierBillPrisma();
const { db } = fake;
require.cache[require.resolve('../src/lib/prisma')] = { exports: fake.prisma, loaded: true };
for (const file of ['../src/middleware/auth', '../src/lib/accountingAccess', '../src/middleware/accountingAccess', '../src/lib/runningNumber',
  '../src/lib/auditTrail', '../src/routes/supplier-bills', '../src/routes/ap', '../src/routes/accounting-reports']) delete require.cache[require.resolve(file)];
const { authenticate } = require('../src/middleware/auth');
const { requireAccountingResource } = require('../src/middleware/accountingAccess');
const { billTotals, vatCents, documentKey } = require('../src/lib/supplierBill');

const app = express();
app.use(express.json());
app.use('/api/ap', authenticate, requireAccountingResource('ap'), require('../src/routes/ap'));

app.use('/api/accounting-reports', require('../src/routes/accounting-reports'));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));

db.supplier.push(
  { id: 'sup-a', code: 'S001', name: 'Supplier A', taxId: '0105555000001', branch: 'Head office', address: 'Bangkok', paymentTerm: 30, active: true },
  { id: 'sup-b', code: 'S002', name: 'Supplier B', taxId: '0105555000002', branch: null, address: null, paymentTerm: 0, active: true },
  { id: 'sup-off', code: 'S003', name: 'Inactive', paymentTerm: 15, active: false });
const pv = (id, supplierId, fields = {}) => ({ id, pvNo: id.toUpperCase(), pvDate: new Date('2026-11-05'), sourceNo: `SRC-${id}`,
  supplierId, lifecycleVersion: 1, status: 'approved', paidAt: new Date('2026-11-05T03:00:00Z'), reversedAt: null,
  netPayment: '1000.00', wht: '30.00', ...fields });
db.paymentVoucher.push(pv('pv-paid', 'sup-a'), pv('pv-unpaid', 'sup-a', { paidAt: null }), pv('pv-legacy', 'sup-a', { lifecycleVersion: 0 }),
  pv('pv-other', 'sup-b'), pv('pv-race', 'sup-a', { netPayment: '500.00', wht: '0.00' }),
  pv('pv-reverse', 'sup-a', { netPayment: '200.00', wht: '0.00' }), pv('pv-late', 'sup-a', { paidAt: new Date('2026-12-20T03:00:00Z') }));

let server, base, keySeq = 0;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, user = 'maker', body, expected) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json',
    ...(user ? { authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json();
  if (expected !== undefined) assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
  return { status: response.status, body: json };
}
const requestKey = () => `test-request-key-${String(++keySeq).padStart(6, '0')}`;
const billBody = (fields = {}) => ({ requestKey: requestKey(), supplierId: 'sup-a', supplierInvoiceNo: `INV-${keySeq + 1}`,
  supplierInvoiceDate: '2026-10-01', taxInvoiceNo: `TX-${keySeq + 1}`, taxInvoiceDate: '2026-10-01', vatMode: 'VAT7',
  items: [{ desc: 'Materials', amount: '1000.07' }, { desc: 'Freight', amount: '0.47' }], ...fields });
const B = '/api/ap/supplier-bills';
async function confirmedBill(fields) {
  const created = await call('POST', B, 'maker', billBody(fields), 201);
  return (await call('POST', `${B}/${created.body.id}/confirm`, 'approver', { revision: created.body.revision }, 200)).body;
}

test('pure helpers compute exact satang VAT and normalized duplicate keys', () => {
  assert.equal(vatCents(50, 'VAT7'), 4);
  assert.equal(vatCents(100054, 'VAT7'), 7004);
  assert.deepEqual(billTotals([{ amountCents: 100007 }, { amountCents: 47 }], 'VAT7'), { subTotal: 100054, vat: 7004, net: 107058 });
  assert.equal(documentKey(' inv-001 / a '), 'INV-001/A');
  assert.equal(documentKey('ＩＮＶ００１'), 'INV001');
});

test('routes require authentication and the mapped AP permissions', async () => {
  await call('GET', B, null, undefined, 401);
  await call('GET', B, 'nobody', undefined, 403);
  await call('POST', B, 'viewer', billBody(), 403);
  const draft = await call('POST', B, 'maker', billBody(), 201);
  await call('POST', `${B}/${draft.body.id}/confirm`, 'maker', { revision: 1 }, 403);
  await call('POST', `${B}/${draft.body.id}/cancel`, 'maker', { revision: 1, reason: 'x' }, 403);
  await call('POST', `${B}/${draft.body.id}/settlements`, 'approver', { revision: 1, paymentVoucherId: 'pv-paid', amount: 1 }, 403);
  await call('POST', `${B}/${draft.body.id}/settlements/x/void`, 'payer', { revision: 1, reason: 'x' }, 403);
  await call('GET', '/api/accounting-reports/ap/aging', 'maker', undefined, 403);
});

test('draft creation is server-authoritative, snapshots supplier data and defaults due date from credit term', async () => {
  const body = billBody({ subTotal: 1, vat: 999, netAmount: 1, dueDate: undefined });
  const created = await call('POST', B, 'maker', body, 201);
  assert.match(created.body.billNo, /^SB\d{4}\d{4}$/);
  assert.deepEqual([created.body.subTotal, created.body.vat, created.body.netAmount], [1000.54, 70.04, 1070.58]);
  assert.equal(created.body.status, 'draft');
  assert.equal(created.body.revision, 1);
  assert.equal(new Date(created.body.dueDate).toISOString().slice(0, 10), '2026-10-31');
  assert.equal(created.body.dueDateManual, false);
  assert.equal(created.body.supplierSnapshot.name, 'Supplier A');
  assert.equal(created.body.paymentState, null);
  const replay = await call('POST', B, 'maker', body, 201);
  assert.equal(replay.body.id, created.body.id);
  await call('POST', B, 'maker', { ...body, items: [{ desc: 'Other', amount: '1.00' }] }, 409);
  const manual = await call('POST', B, 'maker', billBody({ dueDate: '2026-12-15', creditTermDays: 45 }), 201);
  assert.equal(manual.body.creditTermDays, 45);
  assert.equal(manual.body.dueDateManual, true);
  await call('POST', B, 'maker', billBody({ dueDate: '2026-09-30' }), 400);
  await call('POST', B, 'maker', billBody({ supplierId: 'sup-off' }), 400);
  await call('POST', B, 'maker', billBody({ taxInvoiceNo: null, taxInvoiceDate: null }), 400);
  await call('POST', B, 'maker', billBody({ items: [{ desc: 'Bad', amount: '1.001' }] }), 400);
  const noVat = await call('POST', B, 'maker', billBody({ vatMode: 'NO_VAT', taxInvoiceNo: null, taxInvoiceDate: null, creditTermDays: '0' }), 201);
  assert.deepEqual([noVat.body.vat, noVat.body.netAmount], [0, 1000.54]);
  assert.equal(new Date(noVat.body.dueDate).toISOString().slice(0, 10), '2026-10-01');
});

test('duplicate supplier invoice and tax invoice numbers are rejected, including concurrent creates', async () => {
  await call('POST', B, 'maker', billBody({ supplierInvoiceNo: 'DUP-001', taxInvoiceNo: 'DUPTAX-1' }), 201);
  await call('POST', B, 'maker', billBody({ supplierInvoiceNo: ' dup-001 ', taxInvoiceNo: 'OTHER-1' }), 409);
  await call('POST', B, 'maker', billBody({ supplierInvoiceNo: 'DUP-002', taxInvoiceNo: 'duptax-1' }), 409);
  await call('POST', B, 'maker', billBody({ supplierId: 'sup-b', supplierInvoiceNo: 'DUP-001', taxInvoiceNo: 'DUPTAX-1' }), 201);
  const before = db.supplierBill.length;
  const results = await Promise.all([1, 2, 3].map(index =>
    call('POST', B, 'maker', billBody({ supplierInvoiceNo: 'RACE-001', taxInvoiceNo: `RACE-TAX-${index}` }))));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409, 409]);
  assert.equal(db.supplierBill.length, before + 1);
  const numbers = db.supplierBill.map(bill => bill.billNo);
  assert.equal(new Set(numbers).size, numbers.length);
  const winner = results.find(result => result.status === 201).body;
  await call('POST', `${B}/${winner.id}/cancel`, 'canceller', { revision: 1, reason: 'Entered in error' }, 200);
  await call('POST', B, 'maker', billBody({ supplierInvoiceNo: 'RACE-001' }), 201);
});

test('revisions, maker-checker confirmation and immutable confirmed bills', async () => {
  const created = await call('POST', B, 'maker', billBody({ supplierInvoiceNo: 'REV-001', taxInvoiceNo: 'REV-TX-1' }), 201);
  const path = `${B}/${created.body.id}`;
  const edit = { ...billBody({ supplierInvoiceNo: 'REV-001', taxInvoiceNo: 'REV-TX-1' }), items: [{ desc: 'Edited', amount: '200.00' }] };
  await call('PUT', path, 'maker', { ...edit }, 409);
  await call('PUT', path, 'maker', { ...edit, revision: 9 }, 409);
  const updated = await call('PUT', path, 'maker', { ...edit, revision: 1 }, 200);
  assert.deepEqual([updated.body.revision, updated.body.netAmount, updated.body.items.length], [2, 214, 1]);
  await call('POST', `${path}/confirm`, 'approver', { revision: 1 }, 409);
  const admin = await call('POST', B, 'admin', billBody(), 201);
  await call('POST', `${B}/${admin.body.id}/confirm`, 'admin', { revision: 1 }, 403);
  const confirmed = await call('POST', `${path}/confirm`, 'approver', { revision: 2 }, 200);
  assert.deepEqual([confirmed.body.status, confirmed.body.revision, confirmed.body.paymentState, confirmed.body.outstandingAmount],
    ['confirmed', 3, 'unpaid', 214]);
  await call('POST', `${path}/confirm`, 'approver', { revision: 3 }, 409);
  await call('PUT', path, 'maker', { ...edit, revision: 3 }, 409);
  db.supplier[0].name = 'Renamed supplier';
  const detail = await call('GET', path, 'viewer', undefined, 200);
  assert.equal(detail.body.supplierSnapshot.name, 'Supplier A');
  db.supplier[0].name = 'Supplier A';
  assert.deepEqual(detail.body.history.map(row => row.action).sort(), ['confirm', 'create', 'update']);
  const due = await call('PATCH', `${path}/due-date`, 'maker', { revision: 3, dueDate: '2026-11-20', reason: 'Agreed extension' }, 200);
  assert.deepEqual([due.body.revision, due.body.dueDateManual], [4, true]);
  await call('PATCH', `${path}/due-date`, 'maker', { revision: 4, dueDate: '2026-11-21' }, 400);
  await call('PATCH', `${path}/due-date`, 'maker', { revision: 4, dueDate: '2026-09-01', reason: 'x' }, 400);
  const audit = db.auditLog.filter(row => row.entityId === created.body.id);
  assert.ok(audit.every(row => row.entityType === 'supplier_bill' && row.docNo === created.body.billNo));
  assert.equal(audit.find(row => row.action === 'due_date').reason, 'Agreed extension');
});

test('settlements only allocate real paid PVs of the same supplier within PV capacity and bill outstanding', async () => {
  const bill = await confirmedBill({ supplierInvoiceNo: 'SET-001', taxInvoiceNo: 'SET-TX-1' });
  const path = `${B}/${bill.id}`;
  const draft = await call('POST', B, 'maker', billBody(), 201);
  await call('POST', `${B}/${draft.body.id}/settlements`, 'payer', { revision: 1, paymentVoucherId: 'pv-paid', amount: 1 }, 409);
  for (const id of ['pv-unpaid', 'pv-legacy', 'pv-other']) {
    await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: id, amount: 10 }, 409);
  }
  await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-missing', amount: 10 }, 404);
  await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-paid', amount: '1030.01' }, 409);
  await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-paid', amount: '0' }, 400);
  const eligible = await call('GET', `${path}/payment-vouchers`, 'viewer', undefined, 200);
  assert.deepEqual(eligible.body.map(row => row.id).sort(), ['pv-late', 'pv-paid', 'pv-race', 'pv-reverse']);
  assert.equal(eligible.body.find(row => row.id === 'pv-paid').settlementCapacity, 1030);
  const settled = await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-paid', amount: '1000.00' }, 201);
  assert.deepEqual([settled.body.settledAmount, settled.body.outstandingAmount, settled.body.paymentState], [1000, 70.58, 'partial']);
  await call('POST', `${path}/settlements`, 'payer', { revision: settled.body.revision, paymentVoucherId: 'pv-paid', amount: '1.00' }, 409);
  await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-race', amount: '1.00' }, 409);
  await call('POST', `${path}/settlements`, 'payer', { revision: settled.body.revision, paymentVoucherId: 'pv-race', amount: '70.59' }, 409);
  const other = await confirmedBill({ supplierInvoiceNo: 'SET-002', taxInvoiceNo: 'SET-TX-2' });
  await call('POST', `${B}/${other.id}/settlements`, 'payer', { revision: other.revision, paymentVoucherId: 'pv-paid', amount: '30.01' }, 409);
  const rest = await call('POST', `${B}/${other.id}/settlements`, 'payer', { revision: other.revision, paymentVoucherId: 'pv-paid', amount: '30.00' }, 201);
  assert.equal(rest.body.outstandingAmount, 1040.58);
  const pvRows = db.supplierBillSettlement.filter(row => row.paymentVoucherId === 'pv-paid' && row.status === 'active');
  assert.equal(pvRows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0), 103000);
  const full = await call('POST', `${path}/settlements`, 'payer', { revision: settled.body.revision, paymentVoucherId: 'pv-race', amount: '70.58' }, 201);
  assert.deepEqual([full.body.outstandingAmount, full.body.paymentState], [0, 'paid']);
  await call('POST', `${path}/cancel`, 'canceller', { revision: full.body.revision, reason: 'x' }, 409);
  assert.equal(db.paymentVoucher.find(row => row.id === 'pv-paid').status, 'approved');
});

test('concurrent allocations of one PV lock PV before bill and never exceed capacity', async () => {
  db.paymentVoucher.push(pv('pv-concurrent', 'sup-b', { netPayment: '500.00', wht: '0.00' }));
  const bills = [await confirmedBill({ supplierId: 'sup-b', supplierInvoiceNo: 'CON-1', taxInvoiceNo: 'CON-TX-1' }),
    await confirmedBill({ supplierId: 'sup-b', supplierInvoiceNo: 'CON-2', taxInvoiceNo: 'CON-TX-2' })];
  const logStart = fake.lockLog.length;
  const results = await Promise.all(bills.map(bill => call('POST', `${B}/${bill.id}/settlements`, 'payer',
    { revision: bill.revision, paymentVoucherId: 'pv-concurrent', amount: '400.00' })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal(db.supplierBillSettlement.filter(row => row.paymentVoucherId === 'pv-concurrent' && row.status === 'active').length, 1);
  const byTx = new Map();
  for (const entry of fake.lockLog.slice(logStart)) byTx.set(entry.tx, [...(byTx.get(entry.tx) || []), entry.key.split(':')[0]]);
  for (const order of byTx.values()) assert.deepEqual(order, ['payment_vouchers', 'supplier_bills']);
  const same = await confirmedBill({ supplierId: 'sup-b', supplierInvoiceNo: 'CON-3', taxInvoiceNo: 'CON-TX-3' });
  db.paymentVoucher.push(pv('pv-concurrent-2', 'sup-b', { netPayment: '5000.00', wht: '0.00' }));
  const doubled = await Promise.all([1, 2].map(() => call('POST', `${B}/${same.id}/settlements`, 'payer',
    { revision: same.revision, paymentVoucherId: 'pv-concurrent-2', amount: '10.00' })));
  assert.deepEqual(doubled.map(result => result.status).sort(), [201, 409]);
});

test('reversed PVs stop settling debt; voiding keeps an audited history; failed audit rolls back', async () => {
  const bill = await confirmedBill({ supplierInvoiceNo: 'REVS-001', taxInvoiceNo: 'REVS-TX-1', items: [{ desc: 'Service', amount: '500.00' }] });
  const path = `${B}/${bill.id}`;
  const settled = await call('POST', `${path}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-reverse', amount: '200.00' }, 201);
  assert.equal(settled.body.outstandingAmount, 335);
  Object.assign(db.paymentVoucher.find(row => row.id === 'pv-reverse'), { status: 'cancelled', reversedAt: new Date('2026-11-10') });
  const reversed = await call('GET', path, 'viewer', undefined, 200);
  assert.deepEqual([reversed.body.settledAmount, reversed.body.outstandingAmount, reversed.body.ineffectiveSettlementAmount], [0, 535, 200]);
  assert.equal(reversed.body.settlements[0].effective, false);
  const aging = await call('GET', '/api/accounting-reports/ap/aging?asOfDate=2026-12-31', 'reports', undefined, 200);
  assert.equal(aging.body.rows.find(row => row.documentNo === bill.billNo).outstandingAmount, 535);
  assert.ok(aging.body.warnings.some(warning => warning.includes(bill.billNo)));
  const settlementId = reversed.body.settlements[0].id;
  fake.failAudit(true);
  await call('POST', `${path}/settlements/${settlementId}/void`, 'voider', { revision: settled.body.revision, reason: 'PV reversed' }, 500);
  const auditCount = db.auditLog.length, billCount = db.supplierBill.length, sequences = structuredClone(db.documentSequence);
  await call('POST', B, 'maker', billBody(), 500);
  fake.failAudit(false);
  assert.equal(db.supplierBillSettlement.find(row => row.id === settlementId).status, 'active');
  assert.deepEqual([db.auditLog.length, db.supplierBill.length], [auditCount, billCount]);
  assert.deepEqual(db.documentSequence, sequences);
  await call('POST', `${path}/settlements/${settlementId}/void`, 'voider', { revision: settled.body.revision }, 400);
  const voided = await call('POST', `${path}/settlements/${settlementId}/void`, 'voider', { revision: settled.body.revision, reason: 'PV reversed' }, 200);
  assert.equal(voided.body.settlements[0].status, 'voided');
  assert.equal(db.supplierBillSettlement.find(row => row.id === settlementId).voidReason, 'PV reversed');
  await call('POST', `${path}/settlements/${settlementId}/void`, 'voider', { revision: voided.body.revision, reason: 'again' }, 409);
  await call('POST', `${B}/other/settlements/${settlementId}/void`, 'voider', { revision: 1, reason: 'x' }, 404);
  const cancelled = await call('POST', `${path}/cancel`, 'canceller', { revision: voided.body.revision, reason: 'Supplier credit note' }, 200);
  assert.equal(cancelled.body.status, 'cancelled');
  await call('PATCH', `${path}/due-date`, 'canceller', { revision: cancelled.body.revision, dueDate: '2026-12-01', reason: 'x' }, 409);
  const actions = db.auditLog.filter(row => row.entityId === bill.id).map(row => row.action);
  assert.deepEqual(actions, ['create', 'confirm', 'settle', 'unsettle', 'cancel']);
});

test('AP Aging uses confirmed supplier-bill outstanding, PV paid date as of the report date, and keeps PO commitment separate', async () => {
  const bill = await confirmedBill({ supplierInvoiceNo: 'AGE-001', taxInvoiceNo: 'AGE-TX-1', supplierInvoiceDate: '2026-11-01',
    taxInvoiceDate: '2026-11-01', creditTermDays: 10, items: [{ desc: 'Goods', amount: '2000.00' }] });
  await call('POST', `${B}/${bill.id}/settlements`, 'payer', { revision: bill.revision, paymentVoucherId: 'pv-late', amount: '1030.00' }, 201);
  const draft = await call('POST', B, 'maker', billBody({ supplierInvoiceNo: 'AGE-DRAFT', supplierInvoiceDate: '2026-11-01' }), 201);
  const early = await call('GET', '/api/accounting-reports/ap/aging?asOfDate=2026-11-30', 'reports', undefined, 200);
  assert.equal(early.body.basis, 'supplier_bill_outstanding');
  const row = early.body.rows.find(item => item.documentNo === bill.billNo);
  assert.deepEqual([row.netAmount, row.settledAmount, row.outstandingAmount, row.diffDays, row.supplierInvoiceNo],
    [2140, 0, 2140, 19, 'AGE-001']);
  assert.ok(!early.body.rows.some(item => item.documentNo === draft.body.billNo));
  const late = await call('GET', '/api/accounting-reports/ap/aging?asOfDate=2026-12-31', 'reports', undefined, 200);
  assert.equal(late.body.rows.find(item => item.documentNo === bill.billNo).outstandingAmount, 1110);
  const before = await call('GET', '/api/accounting-reports/ap/aging?asOfDate=2026-10-31', 'reports', undefined, 200);
  assert.ok(!before.body.rows.some(item => item.documentNo === bill.billNo));
  assert.ok(!late.body.rows.some(item => item.outstandingAmount <= 0));
  const commitment = await call('GET', '/api/accounting-reports/ap/po-commitment?asOfDate=2026-12-31', 'reports', undefined, 200);
  assert.equal(commitment.body.basis, 'po_commitment');
});