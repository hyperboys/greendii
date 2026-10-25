const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');

test('SO schema rollout is additive, transaction-wrapped and uses mapped column names', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sql', 'accounting-delivery-orders.sql'), 'utf8');
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE|UPDATE)\b/i);
  for (const column of ['customer_tel', 'customer_fax', 'delivery_date', 'credit_term', 'vat_config', 'sub_total', 'discount', 'vat', 'net_amount', 'part_no', 'unit_price', 'amount']) {
    assert.ok(sql.includes(`ADD COLUMN IF NOT EXISTS ${column} `), column);
  }
});

test('SO HTTP lifecycle validates Drafts, preserves lines, guards linked invoices and never posts stock', async t => {
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-so-tests';
  t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
  let state = { documents: [], audits: [], invoices: [] };
  let sequence = 0;
  let failAudit = false;
  const customer = { id: 'customer', name: 'Customer', active: true, creditTerm: 30, vatConfig: 'VAT7%', tel: '111', fax: '222', branches: [{ id: 'branch', name: 'Branch', addresses: [] }] };
  const include = doc => doc && structuredClone({ ...doc, customer, workOrder: null });
  const prisma = {
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, role: 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({
      role: { permissions: where.userId === 'writer' ? ['ar.view', 'ar.create'] : ['ar.view'] },
    }) },
    accountCustomer: { findUnique: async ({ where }) => where.id === customer.id ? customer : null },
    accountProduct: { findMany: async () => [{ id: 'product', code: 'P001', name: 'Product', unit: 'pcs', price: '10.50', active: true }] },
    workOrder: { findUnique: async ({ where }) => where.id === 'wo' ? { id: 'wo', active: true, status: 'draft' } : null, findMany: async () => [] },
    provisionalDeliveryOrder: {
      findMany: async () => state.documents.map(include),
      findUnique: async ({ where }) => include(state.documents.find(doc => doc.id === where.id)),
      updateMany: async ({ where, data }) => {
        const doc = state.documents.find(doc => doc.id === where.id && (!where.status || doc.status === where.status));
        if (!doc) return { count: 0 };
        Object.assign(doc, data);
        return { count: 1 };
      },
      create: async ({ data }) => {
        const doc = { ...data, id: `so-${++sequence}`, updatedAt: new Date(), items: data.items.create };
        state.documents.push(doc);
        return include(doc);
      },
      update: async ({ where, data }) => {
        const doc = state.documents.find(doc => doc.id === where.id);
        Object.assign(doc, data, { updatedAt: new Date(Date.now() + ++sequence) });
        if (data.items) doc.items = data.items.create;
        return include(doc);
      },
    },
    invoice: { count: async ({ where }) => state.invoices.filter(iv => iv.provisionalDeliveryOrderId === where.provisionalDeliveryOrderId && iv.status !== 'cancelled').length },
    auditLog: {
      create: async ({ data }) => {
        if (failAudit) throw new Error('Audit unavailable');
        state.audits.push(data);
        return data;
      },
      findMany: async ({ where }) => state.audits.filter(log => log.entityId === where.entityId).map(log => ({ ...log, createdAt: new Date() })),
    },
    $transaction: async callback => {
      const before = structuredClone(state);
      try { return await callback(prisma); } catch (error) { state = before; throw error; }
    },
  };
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
  require.cache[require.resolve('../src/lib/runningNumber')] = {
    exports: { generateNextRunningNumber: async () => `SO2610-${String(++sequence).padStart(5, '0')}` }, loaded: true,
  };
  const { authenticate } = require('../src/middleware/auth');
  const { requireAccountingResource } = require('../src/middleware/accountingAccess');
  const app = express();
  app.use(express.json());
  app.use('/api/accounting-access', require('../src/routes/accounting-access'));
  app.use('/api/ar', authenticate, requireAccountingResource('ar'), require('../src/routes/ar'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/ar/delivery-orders`;
  const request = (path = '', method = 'GET', body, user = 'writer') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = {
    docDate: '2026-10-25', customerId: 'customer', customerBranchId: 'branch', customerBranch: 'Branch',
    shippingAddress: 'Shipping', receiver: 'Receiver', remark: 'Notes', workOrderId: '',
    items: [{ productId: 'product', desc: 'One', qty: 2, unit: 'pcs', remark: 'Line note' }, { desc: 'Manual', qty: 1, unit: 'set' }],
  };
  assert.equal((await request('', 'GET', undefined, null)).status, 401);
  assert.equal((await request('', 'POST', payload, 'viewer')).status, 403);
  assert.equal((await request('/work-orders')).status, 200);
  assert.equal((await request('/work-orders', 'GET', undefined, 'viewer')).status, 403);
  const lookup = user => fetch(`${base.replace('/ar/delivery-orders', '')}/accounting-access/lookups/products`, {
    headers: { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` },
  });
  assert.equal((await lookup('viewer')).status, 403);
  assert.equal((await (await lookup('writer')).json())[0].unit, 'pcs');
  for (const change of [
    { docDate: '2026-02-31' }, { docDate: '' }, { customerId: 'missing' }, { customerBranchId: 'foreign' },
    { items: [] }, { items: [{ desc: 'Bad', qty: 1.5, unit: 'pcs' }] },
    { items: [{ desc: 'Bad', qty: 0, unit: 'pcs' }] }, { items: [{ desc: '', qty: 1, unit: 'pcs' }] },
    { items: [{ desc: 'Bad', qty: 1, unit: '' }] },
    { items: [{ desc: 'Bad', qty: true, unit: 'pcs' }] }, { items: [{ desc: 'Bad', qty: 1000000000, unit: 'pcs' }] },
    { items: [{ productId: 'missing', desc: 'Bad', qty: 1, unit: 'pcs' }] }, { workOrderId: 'missing' },
    { deliveryDate: '2026-02-31' }, { creditTerm: -1 }, { creditTerm: true },
    { vatConfig: 'VAT10%' }, { discount: -1 }, { discount: 1 },
    { items: [{ desc: 'Bad', qty: 1, unit: 'pcs', unitPrice: -1 }] },
    { items: [{ desc: 'Bad', qty: 1, unit: 'pcs', unitPrice: true }] },
    { items: [{ desc: 'Bad', qty: 1, unit: 'pcs', unitPrice: 10, discount: 11 }] },
    { items: [{ desc: 'Bad', qty: 1, unit: 'pcs', unitPrice: '1.234' }] },
    { items: [{ desc: 'Bad', qty: 999999999, unit: 'pcs', unitPrice: '9999999999.99' }] },
  ]) assert.equal((await request('', 'POST', { ...payload, ...change })).status, 400, JSON.stringify(change));
  const created = await request('', 'POST', payload);
  assert.equal(created.status, 201);
  let doc = await created.json();
  assert.equal(doc.docDate.slice(0, 10), payload.docDate);
  assert.equal(doc.status, 'draft');
  assert.equal(doc.items.length, 2);
  assert.equal(doc.items[0].productId, 'product');
  assert.equal(doc.creditTerm, 30);
  assert.equal(doc.customerTel, '111');
  assert.equal(doc.netAmount, 0);
  assert.equal((await (await request()).json()).length, 1);
  assert.equal((await request('/missing')).status, 404);
  assert.equal((await request(`/${doc.id}`, 'PUT', payload, 'viewer')).status, 403);
  const edited = await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt, receiver: 'Edited', items: [payload.items[1]] });
  assert.equal(edited.status, 200);
  doc = await edited.json();
  assert.equal(doc.receiver, 'Edited');
  assert.equal(doc.items.length, 1);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: '2000-01-01T00:00:00.000Z' })).status, 409);
  state.invoices.push({ provisionalDeliveryOrderId: doc.id, status: 'draft' });
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { reason: 'Mistake' })).status, 409);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt })).status, 409);
  state.invoices[0].status = 'cancelled';
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { reason: ' ' })).status, 400);
  failAudit = true;
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { reason: 'Rollback' })).status, 500);
  failAudit = false;
  assert.equal((await (await request(`/${doc.id}`)).json()).status, 'draft');
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { reason: 'Wrong document' }, 'viewer')).status, 403);
  const cancelled = await request(`/${doc.id}/cancel`, 'POST', { reason: 'Wrong document' });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).status, 'cancelled');
  assert.equal((await request(`/${doc.id}/cancel`, 'POST', { reason: 'Again' })).status, 409);
  assert.equal((await request(`/${doc.id}`, 'PUT', { ...payload, updatedAt: doc.updatedAt })).status, 409);
  const detail = await (await request(`/${doc.id}`)).json();
  assert.ok(detail.history.some(log => log.action === 'cancel' && log.reason === 'Wrong document'));
  const invoiceRequest = await fetch(`${base.replace('/delivery-orders', '')}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ sub: 'writer' }, process.env.JWT_SECRET)}` },
    body: JSON.stringify({ customerId: 'customer', provisionalDeliveryOrderId: doc.id }),
  });
  assert.equal(invoiceRequest.status, 409, 'Cancelled SO cannot be used even by a direct Invoice API request');
  assert.ok(state.audits.some(log => log.action === 'update'));
  assert.equal((await request(`/${doc.id}/confirm`, 'POST', {})).status, 404);
  const moneyPayload = {
    ...payload, deliveryDate: '2026-10-30', creditTerm: 0, vatConfig: 'VAT7%', discount: '5.00',
    customerTel: '333', customerFax: '444', netAmount: 1, subTotal: 1,
    items: [
      { productId: 'product', partNo: 'P-SNAPSHOT', desc: 'One', qty: 3, unit: 'pcs', unitPrice: '10.25', discount: '0.75' },
      { partNo: 'MANUAL-1', desc: 'Two', qty: 2, unit: 'set', unitPrice: '20', discount: 0 },
    ],
  };
  const pricedResponse = await request('', 'POST', moneyPayload);
  assert.equal(pricedResponse.status, 201);
  const priced = await pricedResponse.json();
  assert.equal(priced.items[0].amount, 30);
  assert.equal(priced.items[1].partNo, 'MANUAL-1');
  assert.equal(priced.subTotal, 70);
  assert.equal(priced.discount, 5);
  assert.equal(priced.vat, 4.55);
  assert.equal(priced.netAmount, 69.55, 'Server must ignore forged totals');
  assert.equal(priced.creditTerm, 0);
  assert.equal(priced.customerTel, '333');
  assert.equal(priced.customerFax, '444');
  assert.equal(priced.deliveryDate.slice(0, 10), '2026-10-30');
  const noVat = await (await request(`/${priced.id}`, 'PUT', { ...moneyPayload, updatedAt: priced.updatedAt, vatConfig: 'NO_VAT' })).json();
  assert.equal(noVat.vat, 0);
  assert.equal(noVat.netAmount, 65);
  assert.equal(noVat.items[0].partNo, 'P-SNAPSHOT');
  assert.equal((await request('', 'POST', { ...moneyPayload, discount: '70.01' })).status, 400);
  const rounding = await (await request('', 'POST', {
    ...payload, discount: 0, items: [{ desc: 'Round', qty: 3, unit: 'pcs', unitPrice: '0.05', discount: 0 }],
  })).json();
  assert.equal(rounding.subTotal, 0.15);
  assert.equal(rounding.vat, 0.01);
  assert.equal(rounding.netAmount, 0.16);
  // No stock model is provided: a stock posting attempt would fail this lifecycle test.
});
