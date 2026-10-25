const test = require('node:test');
const assert = require('node:assert/strict');

function calculateDueDate(invoiceDate, creditTerm) {
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + (parseInt(creditTerm, 10) || 30));
  return d;
}

function calculateInvoiceTotals(items = [], lineDiscount = 0, documentDiscount = 0, vatRate = 0.07) {
  const subTotal = items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitPrice)), 0);
  const afterDiscount = Math.max(0, subTotal - lineDiscount - documentDiscount);
  const vat = Number((afterDiscount * vatRate).toFixed(2));
  const netAmount = Number((afterDiscount + vat).toFixed(2));
  return { subTotal, afterDiscount, vat, netAmount };
}

function validateCreditNoteLimit(invoiceOutstanding, requestedCreditNoteAmount) {
  const outstanding = Number(invoiceOutstanding) || 0;
  const cnAmount = Number(requestedCreditNoteAmount) || 0;
  if (cnAmount > outstanding) {
    throw new Error(`ยอดใบลดหนี้ (฿${cnAmount}) เกินกว่ายอดลูกหนี้คงค้าง (฿${outstanding})`);
  }
  return true;
}

test('Accounts Receivable - Due Date Calculation', () => {
  const ivDate = new Date('2026-09-01T00:00:00Z');
  const dueDate = calculateDueDate(ivDate, 30);
  assert.equal(dueDate.toISOString().slice(0, 10), '2026-10-01');
});

test('Accounts Receivable - Invoice Totals & VAT Calculation', () => {
  const items = [
    { qty: 2, unitPrice: 1000 },
    { qty: 1, unitPrice: 500 },
  ];
  const totals = calculateInvoiceTotals(items, 100, 0, 0.07);
  assert.equal(totals.subTotal, 2500);
  assert.equal(totals.afterDiscount, 2400);
  assert.equal(totals.vat, 168);
  assert.equal(totals.netAmount, 2568);
});

test('Accounts Receivable - Credit Note Outstanding Limit', () => {
  assert.equal(validateCreditNoteLimit(1000, 500), true);
  assert.throws(
    () => validateCreditNoteLimit(500, 600),
    /เกินกว่ายอดลูกหนี้คงค้าง/,
  );
});

test('Invoice HTTP lifecycle: authoritative money/SO, debt only on confirm, locks, permissions, dependents and legacy guards', async t => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-invoice-test';
  t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
  let state = { invoices: [], audits: [], bi: [], rv: [], rvDocs: [], cn: [], cnDocs: [] };
  let sequence = 0;
  let failAudit = false;
  let queue = Promise.resolve();
  const customer = { id: 'c', code: 'C001', name: 'Customer', active: true, vatConfig: 'VAT7%', creditTerm: 30, branches: [], taxId: '123', address: 'Billing' };
  const source = { id: 'so', soNo: 'SO-1', status: 'draft', customerId: 'c', customerBranch: 'Main', shippingAddress: 'Shipping',
    creditTerm: 0, vatConfig: 'VAT7%', discount: '5', items: [
      { desc: 'Source line', partNo: 'P1', qty: 3, unit: 'pcs', unitPrice: '10.25', discount: '0.75' },
      { desc: 'Manual', qty: 2, unit: 'set', unitPrice: '20', discount: '0' },
    ] };
  const included = doc => doc ? structuredClone({ ...doc, customer, provisionalDeliveryOrder: doc.provisionalDeliveryOrderId ? { id: 'so', soNo: 'SO-1' } : null }) : null;
  const matches = (doc, where) => (!where.id || (typeof where.id === 'string' ? doc.id === where.id : doc.id !== where.id.not))
    && (!where.provisionalDeliveryOrderId || doc.provisionalDeliveryOrderId === where.provisionalDeliveryOrderId)
    && (!where.status || (typeof where.status === 'string' ? doc.status === where.status : doc.status !== where.status.not));
  const prisma = {
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({ role: { permissions: where.userId === 'writer' ? ['ar.view', 'ar.create'] : ['ar.view'] } }) },
    accountCustomer: { findUnique: async ({ where }) => where.id === 'c' ? customer : null },
    accountProduct: { findMany: async () => [] },
    workOrder: { findUnique: async () => null },
    provisionalDeliveryOrder: { findUnique: async ({ where }) => where.id === 'so' ? structuredClone(source) : null, findMany: async () => [source] },
    invoice: {
      findUnique: async ({ where }) => included(state.invoices.find(doc => doc.id === where.id)),
      findUniqueOrThrow: async ({ where }) => included(state.invoices.find(doc => doc.id === where.id)),
      findMany: async ({ where } = {}) => state.invoices.filter(doc => !where?.id?.in || where.id.in.includes(doc.id)).map(included),
      count: async ({ where }) => state.invoices.filter(doc => matches(doc, where)).length,
      create: async ({ data }) => {
        const doc = { ...data, id: `iv-${++sequence}`, updatedAt: new Date(Date.now() + sequence), items: data.items.create };
        state.invoices.push(doc); return included(doc);
      },
      update: async ({ where, data }) => {
        const doc = state.invoices.find(doc => doc.id === where.id);
        Object.assign(doc, data, { updatedAt: new Date(Date.now() + ++sequence) });
        if (data.items) doc.items = data.items.create;
        return included(doc);
      },
    },
    billingNoteInvoice: { count: async ({ where }) => state.bi.filter(id => id === where.invoiceId).length, findMany: async () => [] },
    receiptAllocation: { count: async ({ where }) => state.rv.filter(id => id === where.invoiceId).length },
    creditNote: {
      count: async ({ where }) => state.cn.filter(id => id === where.invoiceId).length,
      findMany: async () => [],
      findUnique: async ({ where }) => structuredClone(state.cnDocs.find(row => row.id === where.id)),
      create: async ({ data }) => {
        state.cn.push(data.invoiceId);
        const doc = { ...data, id: 'cn', updatedAt: new Date(Date.now() + ++sequence), items: data.items.create };
        state.cnDocs.push(doc); return structuredClone(doc);
      },
      update: async ({ where, data }) => {
        const doc = state.cnDocs.find(row => row.id === where.id);
        Object.assign(doc, data, { updatedAt: new Date(Date.now() + ++sequence) });
        if (data.items) doc.items = data.items.create;
        return structuredClone(doc);
      },
    },
    billingNote: { create: async ({ data }) => {
      state.bi.push(...data.invoices.create.map(row => row.invoiceId));
      return { id: 'bi', ...data };
    } },
    receiptVoucher: {
      create: async ({ data }) => {
        const doc = { ...data, id: 'rv', updatedAt: new Date(Date.now() + ++sequence), allocations: data.allocations.create, attachments: [] };
        state.rvDocs.push(doc); return structuredClone(doc);
      },
      findUnique: async ({ where }) => structuredClone(state.rvDocs.find(row => row.id === where.id)),
      update: async ({ where, data }) => {
        const doc = state.rvDocs.find(row => row.id === where.id);
        Object.assign(doc, data, { updatedAt: new Date(Date.now() + ++sequence) });
        if (data.allocations) doc.allocations = data.allocations.create;
        if (doc.status === 'approved') state.rv.push(...doc.allocations.map(row => row.invoiceId));
        return structuredClone(doc);
      },
    },
    auditLog: {
      create: async ({ data }) => { if (failAudit) throw new Error('Audit unavailable'); state.audits.push(data); return data; },
      findMany: async ({ where }) => state.audits.filter(log => log.entityId === where.entityId),
    },
    $transaction: callback => {
      const result = queue.then(async () => {
        const before = structuredClone(state);
        try { return await callback(prisma); } catch (error) { state = before; throw error; }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
  require.cache[require.resolve('../src/lib/runningNumber')] = { exports: { generateNextRunningNumber: async () => `IV-${++sequence}` }, loaded: true };
  const { authenticate } = require('../src/middleware/auth');
  const { requireAccountingResource } = require('../src/middleware/accountingAccess');
  const app = express();
  app.use(express.json());
  app.use('/api/ar', authenticate, requireAccountingResource('ar'), require('../src/routes/ar'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/ar`;
  async function request(route, method = 'GET', body, user = 'writer') {
    if (route === '/credit-notes' && method === 'POST') body = { cnDate: '2026-10-25', reason: 'Credit',
      items: [{ desc: 'Discount', qty: 1, unit: 'รายการ', unitPrice: 1 }], ...body };
    if (route === '/receipt-vouchers' && method === 'POST') body = { receiptDate: '2026-10-25', paymentMethod: 'cash', ...body };
    const response = await fetch(`${base}${route}`, { method, headers: {
      'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    return { status: response.status, data };
  }
  const payload = { ivDate: '2026-10-25', customerId: 'c', creditTerm: 0, discount: 5, items: source.items, subTotal: 1, netAmount: 1 };
  assert.equal((await request('/invoices', 'POST', payload, null)).status, 401);
  assert.equal((await request('/invoices', 'POST', payload, 'viewer')).status, 403);
  assert.equal((await request('/invoices/sources')).status, 200);
  assert.equal((await request('/invoices/sources', 'GET', undefined, 'viewer')).status, 403);
  assert.equal((await request('/invoices')).status, 200);
  for (const patch of [{ ivDate: '2026-02-31' }, { items: [] }, { items: {} }, { items: [null] }, { discount: 71 }, { creditTerm: 2147483647 },
    { items: [{ desc: 'Bad', qty: 1.5, unit: 'pcs' }] }, { items: [{ desc: 'Bad', qty: 1, unit: 'pcs', unitPrice: -1 }] }]) {
    assert.equal((await request('/invoices', 'POST', { ...payload, ...patch })).status, 400, JSON.stringify(patch));
  }
  let created = await request('/invoices', 'POST', payload);
  assert.equal(created.status, 201);
  let doc = created.data;
  assert.equal(doc.netAmount, 69.55);
  assert.equal(doc.outstandingAmount, 0);
  assert.equal(doc.dueDate.slice(0, 10), '2026-10-25');
  assert.equal(doc.customerName, 'Customer');
  assert.equal(doc.items[0].lineDiscount, 0.75);
  const id = doc.id;
  for (const [path, body] of [
    ['/billing-notes', { customerId: 'c', billingDate: '2026-10-25', invoices: [{ invoiceId: id, billingAmount: 1 }] }],
    ['/credit-notes', { invoiceId: id, netAmount: 1 }],
    ['/receipt-vouchers', { customerId: 'c', allocations: [{ invoiceId: id, receivedAmount: 1 }] }],
  ]) assert.equal((await request(path, 'POST', body)).status, 409, path);
  assert.equal((await request(`/invoices/${id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt }, 'viewer')).status, 403);
  assert.equal((await request(`/invoices/${id}`, 'PUT', { ...payload, updatedAt: '2000-01-01' })).status, 409);
  doc = (await request(`/invoices/${id}`, 'PUT', { ...payload, vatConfig: 'NO_VAT', updatedAt: doc.updatedAt })).data;
  assert.equal(doc.netAmount, 65);
  assert.equal(doc.outstandingAmount, 0);
  const confirm = { updatedAt: doc.updatedAt };
  const confirmed = await Promise.all([request(`/invoices/${id}/confirm`, 'POST', confirm), request(`/invoices/${id}/confirm`, 'POST', confirm)]);
  assert.deepEqual(confirmed.map(row => row.status).sort(), [200, 409]);
  doc = confirmed.find(row => row.status === 200).data;
  assert.equal(doc.status, 'approved');
  assert.equal(doc.outstandingAmount, 65);
  assert.equal((await request(`/invoices/${id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt })).status, 409);
  const paid = (await request('/invoices', 'POST', payload)).data;
  const posted = (await request(`/invoices/${paid.id}/confirm`, 'POST', { updatedAt: paid.updatedAt })).data;
  assert.equal((await request('/receipt-vouchers', 'POST', { customerId: 'foreign', allocations: [{ invoiceId: posted.id, receivedAmount: 1 }] })).status, 404);
  assert.equal((await request('/receipt-vouchers', 'POST', { customerId: 'c', allocations: [{ invoiceId: posted.id, receivedAmount: -1 }] })).status, 400);
  assert.equal((await request('/receipt-vouchers', 'POST', { customerId: 'c', allocations: [{ invoiceId: posted.id, receivedAmount: 70 }] })).status, 400);
  const rv = await request('/receipt-vouchers', 'POST', { customerId: 'c', totalReceived: 10, allocations: [{ invoiceId: posted.id, receivedAmount: 10 }] });
  assert.equal(rv.status, 201);
  assert.equal(state.invoices.find(row => row.id === paid.id).outstandingAmount, 69.55, 'Draft does not reduce debt');
  assert.equal((await request(`/receipt-vouchers/${rv.data.id}/confirm`, 'POST', { updatedAt: rv.data.updatedAt })).status, 200);
  const afterPayment = state.invoices.find(row => row.id === paid.id);
  assert.equal(afterPayment.outstandingAmount, 59.55);
  assert.equal((await request(`/invoices/${paid.id}/cancel`, 'POST', { updatedAt: afterPayment.updatedAt, reason: 'Cannot' })).status, 409);
  const cn = await request('/credit-notes', 'POST', { invoiceId: paid.id, netAmount: 1 });
  assert.equal(cn.status, 201);
  assert.equal(state.invoices.find(row => row.id === paid.id).outstandingAmount, 59.55);
  assert.equal((await request(`/credit-notes/${cn.data.id}/confirm`, 'POST', { updatedAt: cn.data.updatedAt })).status, 200);
  assert.equal(state.invoices.find(row => row.id === paid.id).outstandingAmount, 58.48);
  assert.equal((await request('/billing-notes', 'POST', { customerId: 'c', billingDate: '2026-10-25', invoices: [{ invoiceId: id, billingAmount: 65 }] })).status, 201);
  assert.equal((await request(`/invoices/${id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Blocked by BI' })).status, 409);
  state.bi = [];
  for (const key of ['bi', 'rv', 'cn']) {
    state[key].push(id);
    assert.equal((await request(`/invoices/${id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Test' })).status, 409);
    state[key] = [];
  }
  assert.equal((await request(`/invoices/${id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: ' ' })).status, 400);
  failAudit = true;
  assert.equal((await request(`/invoices/${id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Rollback' })).status, 500);
  assert.equal(state.invoices.find(row => row.id === id).status, 'approved');
  failAudit = false;
  doc = (await request(`/invoices/${id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Cancelled' })).data;
  assert.equal(doc.outstandingAmount, 0);
  assert.equal(doc.status, 'cancelled');
  customer.branches.push(
    { id: 'hq', name: 'Head office', addresses: [{ kind: 'billing', address: 'HQ billing' }] },
    { id: 'main', name: 'Main', addresses: [{ kind: 'billing', address: 'Source branch billing' }] },
  );
  const fromSource = { ...payload, provisionalDeliveryOrderId: 'so', items: [{ desc: 'Forged' }], discount: 999 };
  const attempts = await Promise.all([request('/invoices', 'POST', fromSource), request('/invoices', 'POST', fromSource)]);
  assert.deepEqual(attempts.map(row => row.status).sort(), [201, 409]);
  const linked = attempts.find(row => row.status === 201).data;
  assert.equal(linked.netAmount, 69.55);
  assert.equal(linked.items.length, 2);
  assert.equal(linked.items[0].desc, 'Source line');
  assert.equal(linked.customerBranch, 'Main');
  assert.equal(linked.address, 'Source branch billing');
  assert.equal((await request('/invoices', 'POST', { ...fromSource, customerId: 'foreign' })).status, 400);
  assert.equal((await request(`/invoices/${linked.id}`, 'PUT', { ...payload, updatedAt: linked.updatedAt })).status, 409);
  await request(`/invoices/${linked.id}/cancel`, 'POST', { updatedAt: linked.updatedAt, reason: 'Replace' });
  const replacement = await request('/invoices', 'POST', fromSource);
  assert.equal(replacement.status, 201);
  await request(`/invoices/${replacement.data.id}/cancel`, 'POST', { updatedAt: replacement.data.updatedAt, reason: 'Replace' });
  source.customerBranch = 'Historical branch';
  const historicalBranch = await request('/invoices', 'POST', fromSource);
  assert.equal(historicalBranch.status, 201);
  assert.equal(historicalBranch.data.customerBranch, 'Historical branch');
  source.status = 'cancelled';
  assert.equal((await request('/invoices', 'POST', fromSource)).status, 409);
  state.invoices.push({ id: 'legacy', lifecycleVersion: 0, status: 'draft', outstandingAmount: 100, updatedAt: new Date() });
  assert.equal((await request('/invoices/legacy/confirm', 'POST', { updatedAt: new Date().toISOString() })).status, 409);
  assert.equal(state.invoices.find(row => row.id === 'legacy').outstandingAmount, 100);
  assert.equal((await request('/invoices/missing')).status, 404);
  assert.ok((await request(`/invoices/${id}`)).data.history.some(log => log.action === 'confirm'));
});

test('Invoice SQL rollout preserves historical balances and scopes source uniqueness to the new lifecycle', () => {
  const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'sql', 'accounting-invoices.sql'), 'utf8');
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS invoices_live_source_v1/);
  assert.match(sql, /WHERE lifecycle_version = 1 AND status <> 'cancelled'/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/);
  const billingSql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'sql', 'accounting-billing-notes.sql'), 'utf8');
  assert.match(billingSql, /BEGIN;/);
  assert.match(billingSql, /COMMIT;/);
  assert.match(billingSql, /lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  assert.match(billingSql, /invoice_net_amount DECIMAL\(12,2\)/);
  assert.doesNotMatch(billingSql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/);
});

test('Billing Note HTTP partial lifecycle: reservations, source balances, cancellation cutoff, permissions, legacy and audit rollback', async t => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-bi-test';
  t.after(() => { if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
  const invoice = id => ({ id, customerId: 'c', ivNo: `IV-${id}`, ivDate: new Date('2026-10-01'), dueDate: new Date('2026-10-31'),
    lifecycleVersion: 1, status: 'approved', netAmount: '100.15', outstandingAmount: '80.05' });
  let state = { invoices: [invoice('i1'), invoice('i2')], docs: [], logs: [], receipt: false, credit: false };
  let sequence = 0;
  let failAudit = false;
  let queue = Promise.resolve();
  const prisma = {
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({ role: { permissions: where.userId === 'writer' ? ['ar.view', 'ar.create'] : ['ar.view'] } }) },
    accountCustomer: { findUnique: async ({ where }) => where.id === 'c' ? { id: 'c', name: 'Snapshot', code: 'C1', active: true, branches: [], address: 'Saved address' } : null },
    invoice: { findUnique: async ({ where }) => state.invoices.find(row => row.id === where.id), findMany: async () => state.invoices },
    billingNoteInvoice: { count: async ({ where }) => state.docs.filter(doc => doc.status !== 'cancelled' && doc.id !== where.billingNoteId?.not)
      .flatMap(doc => doc.invoices).filter(row => row.invoiceId === where.invoiceId).length },
    billingNote: {
      findUnique: async ({ where }) => structuredClone(state.docs.find(doc => doc.id === where.id)),
      findMany: async () => structuredClone(state.docs),
      create: async ({ data }) => {
        const doc = { ...data, id: `b${++sequence}`, invoices: data.invoices.create, createdAt: new Date(), updatedAt: new Date(Date.now() + sequence) };
        state.docs.push(doc); return structuredClone(doc);
      },
      update: async ({ where, data }) => {
        const doc = state.docs.find(row => row.id === where.id);
        Object.assign(doc, data, { updatedAt: new Date(Date.now() + ++sequence) });
        if (data.invoices) doc.invoices = data.invoices.create;
        return structuredClone(doc);
      },
    },
    receiptAllocation: { count: async ({ where }) => {
      assert.ok(where.OR[1].receiptVoucher.OR[0].confirmedAt.gte);
      assert.equal(where.receiptVoucher.status, 'approved');
      return Number(state.receipt);
    } },
    creditNote: { count: async ({ where }) => { assert.ok(where.OR[0].confirmedAt.gte); return Number(state.credit); } },
    auditLog: {
      create: async ({ data }) => { if (failAudit) throw new Error('Audit offline'); state.logs.push(data); return data; },
      findMany: async ({ where }) => state.logs.filter(row => row.entityId === where.entityId),
    },
    $transaction: callback => {
      const result = queue.then(async () => {
        const before = structuredClone(state);
        try { return await callback(prisma); } catch (error) { state = before; throw error; }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
  delete require.cache[require.resolve('../src/routes/billing-notes')];
  const app = express();
  app.use(express.json());
  app.use('/api/ar', require('../src/middleware/auth').authenticate,
    require('../src/middleware/accountingAccess').requireAccountingResource('ar'));
  app.use('/api/ar/billing-notes', require('../src/routes/billing-notes'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(route = '', method = 'GET', body, user = 'writer') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ar/billing-notes${route}`, { method, headers: {
      'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    return { status: response.status, data };
  }
  const body = { customerId: 'c', billingDate: '2026-10-25', expectedPaymentDate: '2026-11-01',
    invoices: [{ invoiceId: 'i1', billingAmount: '10.01' }, { invoiceId: 'i2', billingAmount: '20.02' }], totalAmount: 999999 };
  assert.equal((await request('', 'POST', body, null)).status, 401);
  assert.equal((await request('', 'POST', body, 'viewer')).status, 403);
  assert.equal((await request('/sources?customerId=c', 'GET', undefined, 'viewer')).status, 403);
  assert.equal((await request('', 'POST', { ...body, invoices: [{ invoiceId: 'missing', billingAmount: 1 }] })).status, 404);
  for (const patch of [{ invoices: [] }, { invoices: [null] }, { billingDate: '2026-02-31' }, { expectedPaymentDate: '2026-10-01' },
    { invoices: [{ invoiceId: 'i1', billingAmount: 0 }] }, { invoices: [{ invoiceId: 'i1', billingAmount: 80.06 }] },
    { invoices: [{ invoiceId: 'i1', billingAmount: 1.001 }] }, { invoices: [body.invoices[0], body.invoices[0]] }]) {
    assert.equal((await request('', 'POST', { ...body, ...patch })).status, 400, JSON.stringify(patch));
  }
  for (const [key, value] of [['status', 'draft'], ['lifecycleVersion', 0], ['customerId', 'foreign'], ['outstandingAmount', '0']]) {
    const old = state.invoices[0][key]; state.invoices[0][key] = value;
    assert.ok([400, 409].includes((await request('', 'POST', body)).status));
    state.invoices[0][key] = old;
  }
  state.docs.push({ id: 'legacy-live', lifecycleVersion: 0, status: 'draft', invoices: [{ invoiceId: 'i1' }] });
  assert.equal((await request('', 'POST', body)).status, 409, 'Legacy active BI also reserves its invoices');
  state.docs = [];
  const attempts = await Promise.all([request('', 'POST', body), request('', 'POST', body)]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [201, 409]);
  let doc = attempts.find(result => result.status === 201).data;
  assert.equal(doc.totalAmount, 30.03);
  assert.equal(doc.customerName, 'Snapshot');
  assert.equal(doc.invoices[0].invoiceNetAmount, '100.15');
  assert.equal(state.invoices[0].outstandingAmount, '80.05', 'BI must never change debt');
  assert.equal((await request()).status, 200);
  assert.equal((await request('/sources?customerId=c')).status, 200);
  assert.equal((await request(`/${doc.id}`)).status, 200);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...body, updatedAt: doc.updatedAt }, 'viewer')).status, 403);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...body, updatedAt: '2000-01-01' })).status, 409);
  state.invoices[0].outstandingAmount = '75.05';
  assert.equal((await request(`/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })).status, 409);
  doc = (await request(`/${doc.id}`, 'PUT', { ...body, updatedAt: doc.updatedAt })).data;
  state.receipt = true;
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...body, invoices: [body.invoices[1]], updatedAt: doc.updatedAt })).status, 409,
    'Cannot remove a source after settlement to evade the cancellation guard');
  state.receipt = false;
  const confirmed = await Promise.all([request(`/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt }), request(`/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })]);
  assert.deepEqual(confirmed.map(result => result.status).sort(), [200, 409]);
  doc = confirmed.find(result => result.status === 200).data;
  assert.equal(doc.status, 'approved');
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...body, updatedAt: doc.updatedAt })).status, 409);
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: '' })).status, 400);
  for (const key of ['receipt', 'credit']) {
    state[key] = true;
    assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Blocked' })).status, 409);
    state[key] = false;
  }
  failAudit = true;
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Rollback' })).status, 500);
  assert.equal(state.docs[0].status, 'approved');
  failAudit = false;
  doc = (await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Reissue' })).data;
  assert.equal(doc.status, 'cancelled');
  assert.equal((await request('', 'POST', body)).status, 201, 'Cancellation releases source invoices');
  assert.equal(state.invoices[0].outstandingAmount, '75.05');
  state.docs.push({ id: 'legacy-bi', lifecycleVersion: 0, status: 'draft', updatedAt: new Date() });
  assert.equal((await request('/legacy-bi/confirm', 'POST', { updatedAt: new Date().toISOString() })).status, 409);
  assert.equal((await request('/missing')).status, 404);
  assert.ok(state.logs.some(row => row.action === 'confirm'));
});

test('RV HTTP lifecycle: exact settlement, BI closure/release/reversal, evidence, permissions and rollback', async t => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-receipt-test';
  t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
  let tick = 0, failAudit = false, queue = Promise.resolve();
  const revision = () => new Date(Date.now() + ++tick);
  const customer = { id: 'c', name: 'Customer', code: 'C1', active: true, branches: [], address: 'Address', taxId: '123' };
  const invoice = id => ({ id, ivNo: `IV-${id}`, ivDate: new Date('2026-10-25'), dueDate: null,
    customerId: 'c', lifecycleVersion: 1, status: 'approved', netAmount: 1000, outstandingAmount: 1000 });
  let state = { invoices: [invoice('i1'), invoice('i2'), invoice('i3')], bills: [], docs: [], logs: [], attachments: [] };
  const clone = value => value == null ? null : structuredClone(value);
  const included = doc => doc ? clone({ ...doc, customer, attachments: state.attachments.filter(row => row.receiptVoucherId === doc.id),
    allocations: doc.allocations.map(row => ({ ...row, invoice: state.invoices.find(inv => inv.id === row.invoiceId),
      billingNote: state.bills.find(bill => bill.id === row.billingNoteId) || null })) }) : null;
  const active = bill => bill.status !== 'cancelled' && !bill.completedAt;
  const links = () => state.bills.flatMap(bill => bill.invoices.map(row => ({ ...row, billingNoteId: bill.id, billingNote: bill, invoice: state.invoices.find(inv => inv.id === row.invoiceId) })));
  const prisma = {
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({ role: { permissions: where.userId === 'writer' ? ['ar.view', 'ar.create'] : ['ar.view'] } }) },
    accountCustomer: { findUnique: async ({ where }) => where.id === 'c' ? customer : null },
    invoice: {
      findUnique: async ({ where }) => clone(state.invoices.find(row => row.id === where.id)),
      findMany: async ({ where }) => state.invoices.filter(row => row.customerId === where.customerId && row.status === 'approved' && row.lifecycleVersion === 1 && row.outstandingAmount > 0),
      update: async ({ where, data }) => { const row = state.invoices.find(row => row.id === where.id); Object.assign(row, data); return clone(row); },
    },
    billingNoteInvoice: {
      findMany: async ({ where }) => clone(links().filter(row => row.invoiceId === where.invoiceId && active(row.billingNote))),
      count: async ({ where }) => links().filter(row => (typeof where.invoiceId === 'string' ? row.invoiceId === where.invoiceId : where.invoiceId.in.includes(row.invoiceId))
        && row.billingNoteId !== where.billingNoteId?.not && active(row.billingNote)
        && (!where.billingNote.createdAt || row.billingNote.createdAt >= where.billingNote.createdAt.gte)).length,
    },
    billingNote: {
      findMany: async ({ where }) => clone(state.bills.filter(row => where.id?.in ? where.id.in.includes(row.id) : row.customerId === where.customerId && row.status === 'approved' && !row.completedAt)
        .map(row => ({ ...row, invoices: row.invoices.map(line => ({ ...line, invoice: state.invoices.find(inv => inv.id === line.invoiceId) })) }))),
      findUnique: async ({ where }) => clone(state.bills.find(row => row.id === where.id)),
      update: async ({ where, data }) => { const row = state.bills.find(row => row.id === where.id); Object.assign(row, data, { updatedAt: revision() }); return clone(row); },
      create: async ({ data }) => {
        const row = { ...data, id: `bi-${++tick}`, completedAt: null, createdAt: revision(), updatedAt: revision(), invoices: data.invoices.create };
        state.bills.push(row); return clone(row);
      },
    },
    receiptAllocation: {
      findMany: async ({ where }) => clone(state.docs.filter(doc => doc.status === 'approved' && doc.lifecycleVersion === 1)
        .flatMap(doc => doc.allocations).filter(row => row.billingNoteId === where.billingNoteId && (!where.invoiceId || row.invoiceId === where.invoiceId))),
      count: async () => 0,
    },
    creditNote: { count: async () => 0 },
    receiptVoucher: {
      findMany: async () => state.docs.map(included),
      findUnique: async ({ where }) => included(state.docs.find(row => row.id === where.id)),
      create: async ({ data }) => {
        const row = { ...data, id: `rv-${++tick}`, createdAt: revision(), updatedAt: revision(), allocations: data.allocations.create };
        state.docs.push(row); return included(row);
      },
      update: async ({ where, data }) => {
        const row = state.docs.find(row => row.id === where.id);
        Object.assign(row, data, { updatedAt: revision() });
        if (data.allocations) row.allocations = data.allocations.create;
        return included(row);
      },
    },
    attachment: {
      create: async ({ data }) => { const row = { ...data, id: `att-${++tick}`, uploadedAt: revision() }; state.attachments.push(row); return clone(row); },
      findUniqueOrThrow: async ({ where }) => { const row = state.attachments.find(row => row.id === where.id); if (!row) throw new Error('Missing attachment'); return clone(row); },
      count: async ({ where }) => state.attachments.filter(row => row.filename === where.filename).length,
      delete: async ({ where }) => { state.attachments = state.attachments.filter(row => row.id !== where.id); },
    },
    auditLog: {
      create: async ({ data }) => { if (failAudit) throw new Error('Audit unavailable'); state.logs.push(data); return data; },
      findMany: async ({ where }) => clone(state.logs.filter(row => row.entityId === where.entityId).map((row, i) => ({ id: `log-${i}`, ...row }))),
    },
    $transaction: callback => {
      const result = queue.then(async () => { const before = clone(state); try { return await callback(prisma); } catch (error) { state = before; throw error; } });
      queue = result.catch(() => {}); return result;
    },
  };
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
  require.cache[require.resolve('../src/lib/runningNumber')] = { exports: { generateNextRunningNumber: async kind => `${kind}-${++tick}` }, loaded: true };
  require.cache[require.resolve('../src/lib/r2')] = { exports: { isR2Enabled: false }, loaded: true };
  for (const module of ['ar', 'receipt-vouchers', 'billing-notes', 'upload']) delete require.cache[require.resolve(`../src/routes/${module}`)];
  const { authenticate } = require('../src/middleware/auth');
  const { requireAccountingResource } = require('../src/middleware/accountingAccess');
  const app = express();
  app.use(express.json());
  app.use('/api/ar', authenticate, requireAccountingResource('ar'), require('../src/routes/ar'));
  app.use('/api/upload', require('../src/routes/upload'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(route = '/ar/receipt-vouchers', method = 'GET', body, user = 'writer') {
    const multipart = body instanceof FormData;
    const response = await fetch(`${base}${route}`, { method, headers: {
      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
      ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}),
    }, ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  const payload = { receiptDate: '2026-10-25', customerId: 'c', paymentMethod: 'transfer', bankName: 'Bank', refNo: 'TR-1',
    whtCertificateNo: 'WHT-1', allocations: [{ invoiceId: 'i1', receivedAmount: 960, whtAmount: 30, bankFee: 10 }] };
  assert.equal((await request(undefined, 'GET', undefined, null)).status, 401);
  assert.equal((await request(undefined, 'POST', payload, 'viewer')).status, 403);
  assert.equal((await request('/ar/receipt-vouchers/sources?customerId=c', 'GET', undefined, 'viewer')).status, 403);
  for (const change of [{ receiptDate: '2026-02-30' }, { paymentMethod: 'cheque' }, { bankName: '' }, { refNo: '' }, { whtCertificateNo: '' },
    { allocations: [{ invoiceId: 'i1', receivedAmount: 1000.001 }] }, { allocations: [{ invoiceId: 'i1', receivedAmount: -1 }] },
    { allocations: [{ invoiceId: 'i1', receivedAmount: 1001 }] }, { allocations: [{ invoiceId: 'i1', receivedAmount: 0 }] },
    { allocations: [payload.allocations[0], payload.allocations[0]] }]) assert.equal((await request(undefined, 'POST', { ...payload, ...change })).status, 400);
  for (const field of ['status', 'lifecycleVersion', 'customerId']) {
    const row = state.invoices[0], before = row[field]; row[field] = field === 'status' ? 'draft' : field === 'lifecycleVersion' ? 0 : 'other';
    assert.equal((await request(undefined, 'POST', payload)).status, field === 'customerId' ? 400 : 409); state.invoices[0][field] = before;
  }
  const bill = { id: 'bi', biNo: 'BI-1', customerId: 'c', lifecycleVersion: 1, status: 'draft', totalAmount: 1000,
    createdAt: new Date('2026-10-24'), updatedAt: revision(), completedAt: null, invoices: [{ invoiceId: 'i1', billingAmount: 1000 }] };
  state.bills.push(bill);
  assert.equal((await request(undefined, 'POST', payload)).status, 409, 'Draft BI blocks receipts');
  assert.equal((await request('/ar/receipt-vouchers/sources?customerId=c')).data.invoices.some(row => row.id === 'i1'), false);
  state.bills[0].status = 'approved';
  const sources = await request('/ar/receipt-vouchers/sources?customerId=c');
  assert.equal(sources.status, 200); assert.equal(sources.data.billingNotes[0].invoices[0].limit, 1000);
  let result = await request(undefined, 'POST', { ...payload, totalReceived: 999999 });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  let doc = result.data;
  assert.equal(doc.status, 'draft'); assert.equal(doc.totalReceived, 960); assert.equal(doc.whtAmount, 30); assert.equal(doc.bankFee, 10);
  assert.equal(doc.allocations[0].billingNoteId, 'bi'); assert.equal(state.invoices[0].outstandingAmount, 1000);
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}`, 'GET', undefined, 'viewer')).status, 200);
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt }, 'viewer')).status, 403);
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}`, 'PUT', { ...payload, updatedAt: 'stale' })).status, 409);
  result = await request(`/ar/receipt-vouchers/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt, remark: 'Updated draft' });
  assert.equal(result.status, 200); doc = result.data;
  const upload = async (user = 'writer') => {
    const form = new FormData(); form.set('receiptVoucherId', doc.id); form.set('updatedAt', doc.updatedAt);
    form.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'evidence.pdf');
    return request('/upload', 'POST', form, user);
  };
  assert.equal((await upload('viewer')).status, 403);
  const attached = await upload();
  assert.equal(attached.status, 201, JSON.stringify(attached.data));
  let attachment = attached.data[0];
  t.after(() => { for (const row of [attachment, ...state.attachments]) { const filename = path.join(__dirname, '..', 'uploads', row.filename); if (fs.existsSync(filename)) fs.unlinkSync(filename); } });
  doc = (await request(`/ar/receipt-vouchers/${doc.id}`)).data;
  assert.equal(doc.attachments.length, 1);
  assert.equal((await request(`/upload/${attachment.id}`, 'DELETE', { updatedAt: doc.updatedAt })).status, 200);
  doc = (await request(`/ar/receipt-vouchers/${doc.id}`)).data;
  assert.equal(doc.attachments.length, 0);
  attachment = (await upload()).data[0]; doc = (await request(`/ar/receipt-vouchers/${doc.id}`)).data;
  failAudit = true;
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })).status, 500);
  assert.equal(state.invoices[0].outstandingAmount, 1000); assert.equal(state.bills[0].completedAt, null);
  failAudit = false;
  const confirmed = await Promise.all([request(`/ar/receipt-vouchers/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt }), request(`/ar/receipt-vouchers/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })]);
  assert.deepEqual(confirmed.map(row => row.status).sort(), [200, 409]); doc = confirmed.find(row => row.status === 200).data;
  assert.equal(state.invoices[0].outstandingAmount, 0); assert.ok(state.bills[0].completedAt);
  assert.equal((await request(`/upload/${attachment.id}`, 'DELETE', { updatedAt: doc.updatedAt })).status, 409);
  assert.equal((await upload()).status, 409);
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt })).status, 409);
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: '' })).status, 400);
  const cancel = await request(`/ar/receipt-vouchers/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Reverse payment' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.data)); assert.equal(state.invoices[0].outstandingAmount, 1000); assert.equal(state.bills[0].completedAt, null);
  assert.equal((await request(`/ar/receipt-vouchers/${doc.id}/cancel`, 'POST', { updatedAt: cancel.data.updatedAt, reason: 'Again' })).status, 409);
  // A partial BI closes only its billed portion; the remaining invoice can be re-billed.
  state.bills[0].invoices[0].billingAmount = 400; state.bills[0].totalAmount = 400;
  let partial = (await request(undefined, 'POST', { ...payload, paymentMethod: 'cash', allocations: [{ invoiceId: 'i1', receivedAmount: 150 }] })).data;
  partial = (await request(`/ar/receipt-vouchers/${partial.id}/confirm`, 'POST', { updatedAt: partial.updatedAt })).data;
  assert.equal(state.invoices[0].outstandingAmount, 850); assert.equal(state.bills[0].completedAt, null);
  assert.equal((await request('/ar/receipt-vouchers/sources?customerId=c')).data.billingNotes[0].invoices[0].limit, 250);
  assert.equal((await request(undefined, 'POST', { ...payload, allocations: [{ invoiceId: 'i1', receivedAmount: 251 }] })).status, 409);
  let closing = (await request(undefined, 'POST', { ...payload, paymentMethod: 'cash', allocations: [{ invoiceId: 'i1', receivedAmount: 250 }] })).data;
  closing = (await request(`/ar/receipt-vouchers/${closing.id}/confirm`, 'POST', { updatedAt: closing.updatedAt })).data;
  assert.ok(state.bills[0].completedAt); assert.equal(state.invoices[0].outstandingAmount, 600);
  assert.equal((await request('/ar/receipt-vouchers/sources?customerId=c')).data.invoices.find(row => row.id === 'i1').billingNoteId, null);
  result = await request('/ar/billing-notes', 'POST', { billingDate: '2026-10-25', customerId: 'c', invoices: [{ invoiceId: 'i1', billingAmount: 600 }] });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal((await request(`/ar/receipt-vouchers/${closing.id}/cancel`, 'POST', { updatedAt: closing.updatedAt, reason: 'New BI blocks' })).status, 409);
  assert.equal(state.invoices[0].outstandingAmount, 600);
  state.bills[1].status = 'cancelled';
  assert.equal((await request(`/ar/receipt-vouchers/${closing.id}/cancel`, 'POST', { updatedAt: closing.updatedAt, reason: 'Reopen' })).status, 200);
  assert.equal(state.bills[0].completedAt, null); assert.equal(state.invoices[0].outstandingAmount, 850);
  // A direct Draft must be reviewed if an active BI appeared before confirmation.
  let direct = (await request(undefined, 'POST', { ...payload, allocations: [{ invoiceId: 'i2', receivedAmount: 100 }] })).data;
  state.bills.push({ ...clone(bill), id: 'new-bi', status: 'approved', invoices: [{ invoiceId: 'i2', billingAmount: 200 }] });
  assert.equal((await request(`/ar/receipt-vouchers/${direct.id}/confirm`, 'POST', { updatedAt: direct.updatedAt })).status, 409);
  assert.equal((await request(`/ar/receipt-vouchers/${direct.id}/cancel`, 'POST', { updatedAt: direct.updatedAt, reason: 'Discard draft' })).status, 200);
  assert.equal(state.invoices[1].outstandingAmount, 1000);
  const rvA = (await request(undefined, 'POST', { ...payload, allocations: [{ invoiceId: 'i3', receivedAmount: 600 }] })).data;
  const rvB = (await request(undefined, 'POST', { ...payload, allocations: [{ invoiceId: 'i3', receivedAmount: 500 }] })).data;
  const competing = await Promise.all([rvA, rvB].map(row => request(`/ar/receipt-vouchers/${row.id}/confirm`, 'POST', { updatedAt: row.updatedAt })));
  assert.deepEqual(competing.map(row => row.status).sort(), [200, 400], 'Second RV revalidates current outstanding, not its saved snapshot');
  assert.equal(state.invoices[2].outstandingAmount, 400);
  const settledDoc = competing.find(row => row.status === 200).data;
  failAudit = true;
  assert.equal((await request(`/ar/receipt-vouchers/${settledDoc.id}/cancel`, 'POST', { updatedAt: settledDoc.updatedAt, reason: 'Rollback reversal' })).status, 500);
  assert.equal(state.invoices[2].outstandingAmount, 400);
  assert.equal(state.docs.find(row => row.id === settledDoc.id).status, 'approved');
  failAudit = false;
  state.docs.push({ ...clone(state.docs[0]), id: 'legacy-rv', lifecycleVersion: 0 });
  assert.equal((await request('/ar/receipt-vouchers/legacy-rv/confirm', 'POST', { updatedAt: state.docs.at(-1).updatedAt })).status, 409);
  assert.equal((await request('/ar/receipt-vouchers/missing')).status, 404);
  assert.equal((await request()).status, 200);
  for (const action of ['create', 'update', 'attach', 'detach', 'confirm', 'cancel', 'complete', 'reopen']) assert.ok(state.logs.some(row => row.action === action), action);
});

test('RV additive SQL preserves legacy balances/status and adds evidence and BI completion without enum changes', () => {
  const fs = require('fs');
  const sql = fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'sql', 'accounting-receipts.sql'), 'utf8');
  assert.match(sql, /lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  for (const column of ['completed_at', 'receipt_voucher_id', 'wht_certificate_no', 'outstanding_before', 'billing_note_id']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE FROM|TRUNCATE|DROP|ALTER TYPE)\b/im);
});

test('CN HTTP lifecycle: authoritative lines/VAT, cumulative limits, BI/RV guards, concurrent confirmation and reversal', async t => {
  const express = require('express'), jwt = require('jsonwebtoken');
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-credit-test';
  t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
  let seq = 0, queue = Promise.resolve(), failAudit = false;
  const rev = () => new Date(Date.now() + ++seq);
  const inv = (id, vatConfig = 'VAT7%') => ({ id, ivNo: `IV-${id}`, ivDate: new Date('2026-10-01'), lifecycleVersion: 1, status: 'approved',
    customerId: 'c', customerName: 'Snapshot customer', customerCode: 'C1', customerBranch: 'Main', address: 'Saved address', taxId: '123',
    vatConfig, netAmount: vatConfig === 'NO_VAT' ? 1000 : 1070, vat: vatConfig === 'NO_VAT' ? 0 : 70,
    outstandingAmount: vatConfig === 'NO_VAT' ? 1000 : 1070 });
  let state = { docs: [], invoices: [inv('i'), inv('no', 'NO_VAT'), inv('paid')], logs: [], activeBI: false, laterBI: false, laterRV: false };
  state.invoices[2].outstandingAmount = 500;
  const copy = value => value == null ? null : structuredClone(value);
  const include = doc => doc ? copy({ ...doc, invoice: state.invoices.find(row => row.id === doc.invoiceId) }) : null;
  const prisma = {
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({ role: { permissions: where.userId === 'writer' ? ['ar.view', 'ar.create'] : ['ar.view'] } }) },
    invoice: {
      findUnique: async ({ where }) => copy(state.invoices.find(row => row.id === where.id)),
      findMany: async () => copy(state.invoices.filter(row => row.status === 'approved' && row.lifecycleVersion === 1 && row.outstandingAmount > 0)),
      update: async ({ where, data }) => { const row = state.invoices.find(row => row.id === where.id); Object.assign(row, data); return copy(row); },
    },
    creditNote: {
      findMany: async ({ where }) => state.docs.filter(row => (!where.invoiceId || row.invoiceId === where.invoiceId)
        && (!where.status || row.status === where.status) && row.id !== where.id?.not).map(include),
      findUnique: async ({ where }) => include(state.docs.find(row => row.id === where.id)),
      create: async ({ data }) => { const row = { ...data, id: `cn-${++seq}`, updatedAt: rev(), createdAt: rev(), items: data.items.create }; state.docs.push(row); return include(row); },
      update: async ({ where, data }) => {
        const row = state.docs.find(row => row.id === where.id);
        Object.assign(row, data, { updatedAt: rev() }); if (data.items) row.items = data.items.create; return include(row);
      },
    },
    billingNoteInvoice: { count: async ({ where }) => {
      if (where.billingNote.completedAt === null) return Number(state.activeBI);
      assert.ok(where.billingNote.OR.some(filter => filter.updatedAt?.gte), 'Reused pre-existing BI Draft must also block reversal after adding the Invoice');
      return Number(state.laterBI);
    } },
    receiptAllocation: { count: async ({ where }) => {
      assert.equal(where.receiptVoucher.status, 'approved');
      assert.ok(where.receiptVoucher.OR[0].confirmedAt.gte);
      return Number(state.laterRV);
    } },
    auditLog: {
      create: async ({ data }) => { if (failAudit) throw new Error('Audit unavailable'); state.logs.push(data); return data; },
      findMany: async ({ where }) => copy(state.logs.filter(row => row.entityId === where.entityId)),
    },
    $transaction: callback => {
      const result = queue.then(async () => { const before = copy(state); try { return await callback(prisma); } catch (error) { state = before; throw error; } });
      queue = result.catch(() => {}); return result;
    },
  };
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
  require.cache[require.resolve('../src/lib/runningNumber')] = { exports: { generateNextRunningNumber: async () => `CN-${++seq}` }, loaded: true };
  delete require.cache[require.resolve('../src/routes/credit-notes')];
  const app = express(); app.use(express.json());
  app.use('/api/ar', require('../src/middleware/auth').authenticate, require('../src/middleware/accountingAccess').requireAccountingResource('ar'));
  app.use('/api/ar/credit-notes', require('../src/routes/credit-notes'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function request(path = '', method = 'GET', body, user = 'writer') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ar/credit-notes${path}`, { method, headers: {
      'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  const payload = { cnDate: '2026-10-25', invoiceId: 'i', reason: 'Price adjustment',
    items: [{ desc: 'Credit A', partNo: 'P1', unit: 'รายการ', qty: 2, unitPrice: '100.01' }, { desc: 'Credit B', unit: 'รายการ', qty: 1, unitPrice: '0.08' }] };
  assert.equal((await request('', 'GET', undefined, null)).status, 401);
  assert.equal((await request('', 'POST', payload, 'viewer')).status, 403);
  assert.equal((await request('/sources', 'GET', undefined, 'viewer')).status, 403);
  for (const change of [{ cnDate: '2026-02-30' }, { cnDate: '2026-09-30' }, { reason: '' }, { items: [] },
    { items: [{ ...payload.items[0], qty: 0.5 }] }, { items: [{ ...payload.items[0], qty: 0 }] },
    { items: [{ ...payload.items[0], unitPrice: -1 }] }, { items: [{ ...payload.items[0], unitPrice: '1.001' }] }]) {
    assert.equal((await request('', 'POST', { ...payload, ...change })).status, 400);
  }
  for (const [field, value] of [['lifecycleVersion', 0], ['status', 'draft'], ['status', 'cancelled']]) {
    state.invoices[0][field] = value; assert.equal((await request('', 'POST', payload)).status, 409);
    state.invoices[0] = inv('i');
  }
  let result = await request('', 'POST', { ...payload, netAmount: 1, vat: 999, customerId: 'forged', customerName: 'Forged' });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  let doc = result.data;
  assert.equal(doc.status, 'draft'); assert.equal(doc.netAmount, 214.11); assert.equal(doc.amountBeforeVat, 200.10); assert.equal(doc.vat, 14.01);
  assert.equal(doc.customerName, 'Snapshot customer'); assert.equal(doc.customerId, 'c');
  assert.equal(doc.items.reduce((sum, row) => sum + Math.round(row.vat * 100), 0), 1401);
  assert.equal(state.invoices[0].outstandingAmount, 1070);
  assert.equal((await request(`/sources/${doc.invoiceId}`)).data.capacity.before, 1000);
  assert.equal((await request('/sources')).status, 200);
  assert.equal((await request(`/${doc.id}`, 'GET', undefined, 'viewer')).status, 200);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt }, 'viewer')).status, 403);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: 'stale' })).status, 409);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, invoiceId: 'no', updatedAt: doc.updatedAt })).status, 409);
  doc = (await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt, remark: 'Updated' })).data;
  state.activeBI = true;
  assert.equal((await request(`/sources/i`)).data.activeBilling, true);
  assert.equal((await request(`/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })).status, 409);
  state.activeBI = false; failAudit = true;
  assert.equal((await request(`/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })).status, 500);
  assert.equal(state.invoices[0].outstandingAmount, 1070); failAudit = false;
  const confirmed = await Promise.all([1, 2].map(() => request(`/${doc.id}/confirm`, 'POST', { updatedAt: doc.updatedAt })));
  assert.deepEqual(confirmed.map(row => row.status).sort(), [200, 409]); doc = confirmed.find(row => row.status === 200).data;
  assert.equal(state.invoices[0].outstandingAmount, 855.89); assert.equal(doc.correctedBeforeVat, 799.90);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt })).status, 409);
  for (const key of ['laterBI', 'laterRV']) {
    state[key] = true; assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Blocked' })).status, 409);
    state[key] = false;
  }
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: '' })).status, 400);
  failAudit = true;
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Rollback' })).status, 500);
  assert.equal(state.invoices[0].outstandingAmount, 855.89); failAudit = false;
  const cancelled = await request(`/${doc.id}/cancel`, 'POST', { updatedAt: doc.updatedAt, reason: 'Correct' });
  assert.equal(cancelled.status, 200); assert.equal(state.invoices[0].outstandingAmount, 1070);
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { updatedAt: cancelled.data.updatedAt, reason: 'Again' })).status, 409);
  const amountPayload = (invoiceId, amount) => ({ ...payload, invoiceId, items: [{ desc: 'Credit', qty: 1, unit: 'รายการ', unitPrice: amount }] });
  let no = (await request('', 'POST', amountPayload('no', 100))).data;
  assert.equal(no.vat, 0); assert.equal(no.netAmount, 100);
  no = (await request(`/${no.id}/confirm`, 'POST', { updatedAt: no.updatedAt })).data;
  assert.equal(state.invoices[1].outstandingAmount, 900);
  const a = (await request('', 'POST', amountPayload('i', 600))).data, b = (await request('', 'POST', amountPayload('i', 500))).data;
  const competition = await Promise.all([a, b].map(row => request(`/${row.id}/confirm`, 'POST', { updatedAt: row.updatedAt })));
  assert.deepEqual(competition.map(row => row.status).sort(), [200, 409]);
  assert.equal(state.invoices[0].outstandingAmount, 428);
  assert.equal((await request('', 'POST', amountPayload('paid', 500))).status, 409, 'Partial receipt reduces CN capacity by outstanding');
  assert.equal((await request('', 'POST', amountPayload('paid', 100))).status, 201);
  state.invoices[2].outstandingAmount = 0;
  assert.equal((await request('', 'POST', amountPayload('paid', 1))).status, 409, 'Paid invoice cannot generate refunds');
  // Cumulative tax cap remains authoritative even if legacy balances are inconsistent.
  state.docs.push({ id: 'old', invoiceId: 'no', lifecycleVersion: 0, status: 'approved', amountBeforeVat: 850, vat: 0, netAmount: 850 });
  assert.equal((await request('', 'POST', amountPayload('no', 100))).status, 409);
  state.docs.push({ ...copy(doc), id: 'legacy', lifecycleVersion: 0 });
  assert.equal((await request('/legacy/confirm', 'POST', { updatedAt: doc.updatedAt })).status, 409);
  assert.equal((await request('/missing')).status, 404);
  assert.equal((await request()).status, 200);
  assert.ok(state.logs.some(row => row.action === 'update'));
});

test('CN SQL rollout is additive and preserves legacy balances and approval statuses', () => {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'sql', 'accounting-credit-notes.sql'), 'utf8');
  assert.match(sql, /lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /corrected_before_vat DECIMAL\(12,2\)/);
  assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE FROM|DROP|TRUNCATE|ALTER TYPE)\b/im);
});

test('CN VAT capacity enforces separate tax/before caps and allocates document-rounded tax to lines', async () => {
  const { creditData } = require('../src/lib/creditNote');
  const invoice = { id: 'i', ivNo: 'IV', lifecycleVersion: 1, status: 'approved', customerId: 'c', ivDate: new Date('2026-10-01'),
    vatConfig: 'VAT7%', netAmount: 1.07, vat: 0.07, outstandingAmount: 1.07 };
  let prior = [];
  const tx = { $queryRaw: async () => [], invoice: { findUnique: async () => invoice }, creditNote: { findMany: async () => prior } };
  const payload = { invoiceId: 'i', cnDate: '2026-10-25', reason: 'Adjustment', items: [
    { desc: 'A', qty: 1, unit: 'item', unitPrice: '0.08' }, { desc: 'B', qty: 1, unit: 'item', unitPrice: '0.08' },
  ] };
  const data = await creditData(tx, payload);
  assert.equal(data.vat, 0.01);
  assert.deepEqual(data.items.map(row => row.vat), [0.01, 0]);
  prior = [{ amountBeforeVat: '0.56', vat: '0.07', netAmount: '0.63' }];
  await assert.rejects(creditData(tx, payload), /สะสมเกิน Invoice/);
  prior = [{ amountBeforeVat: '0.99', vat: '0', netAmount: '0.99' }];
  await assert.rejects(creditData(tx, payload), /สะสมเกิน Invoice/);
});
