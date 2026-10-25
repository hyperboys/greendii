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
  let state = { invoices: [], audits: [], bi: [], rv: [], cn: [] };
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
      findMany: async () => state.invoices.map(included),
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
    billingNoteInvoice: { count: async ({ where }) => state.bi.filter(id => id === where.invoiceId).length },
    receiptAllocation: { count: async ({ where }) => state.rv.filter(id => id === where.invoiceId).length },
    creditNote: { count: async ({ where }) => state.cn.filter(id => id === where.invoiceId).length },
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
    const response = await fetch(`${base}${route}`, { method, headers: {
      'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  const payload = { ivDate: '2026-10-25', customerId: 'c', creditTerm: 0, discount: 5, items: source.items, subTotal: 1, netAmount: 1 };
  assert.equal((await request('/invoices', 'POST', payload, null)).status, 401);
  assert.equal((await request('/invoices', 'POST', payload, 'viewer')).status, 403);
  for (const patch of [{ ivDate: '2026-02-31' }, { items: [] }, { discount: 71 }, { creditTerm: 2147483647 },
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
    ['/billing-notes', { customerId: 'c', invoiceIds: [id] }],
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
  const fromSource = { ...payload, provisionalDeliveryOrderId: 'so', items: [{ desc: 'Forged' }], discount: 999 };
  const attempts = await Promise.all([request('/invoices', 'POST', fromSource), request('/invoices', 'POST', fromSource)]);
  assert.deepEqual(attempts.map(row => row.status).sort(), [201, 409]);
  const linked = attempts.find(row => row.status === 201).data;
  assert.equal(linked.netAmount, 69.55);
  assert.equal(linked.items.length, 2);
  assert.equal(linked.items[0].desc, 'Source line');
  assert.equal((await request('/invoices', 'POST', { ...fromSource, customerId: 'foreign' })).status, 400);
  assert.equal((await request(`/invoices/${linked.id}`, 'PUT', { ...payload, updatedAt: linked.updatedAt })).status, 409);
  await request(`/invoices/${linked.id}/cancel`, 'POST', { updatedAt: linked.updatedAt, reason: 'Replace' });
  assert.equal((await request('/invoices', 'POST', fromSource)).status, 201);
  source.status = 'cancelled';
  assert.equal((await request('/invoices', 'POST', fromSource)).status, 409);
  state.invoices.push({ id: 'legacy', lifecycleVersion: 0, status: 'draft', outstandingAmount: 100, updatedAt: new Date() });
  assert.equal((await request('/invoices/legacy/confirm', 'POST', { updatedAt: new Date().toISOString() })).status, 409);
  assert.equal(state.invoices.find(row => row.id === 'legacy').outstandingAmount, 100);
  assert.equal((await request('/invoices/missing')).status, 404);
  assert.ok((await request(`/invoices/${id}`)).data.history.some(log => log.action === 'confirm'));
});
