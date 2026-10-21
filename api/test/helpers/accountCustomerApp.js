const express = require('express');
const jwt = require('jsonwebtoken');

function createCustomerApp() {
  let state = { customers: [], sales: [], invoices: [], audits: [] };
  let sequence = 0;
  let failAudit = false;
  const missing = () => { throw Object.assign(new Error('Not found'), { code: 'P2025' }); };
  const find = (list, where) => list.find(item => item.id === where.id) || null;
  const now = () => new Date(Date.now() + sequence++);
  const save = (list, data, previous) => {
    if (data.code && list.some(item => item.id !== previous?.id && item.code === data.code)) {
      throw Object.assign(new Error('Duplicate code'), { code: 'P2002', meta: { target: ['code'] } });
    }
    const value = { ...previous, ...data, id: previous?.id || `id-${sequence++}`, updatedAt: now() };
    if (previous) list.splice(list.indexOf(previous), 1, value);
    else list.push(value);
    return value;
  };
  const hydrate = value => value && structuredClone({
    ...value, responsibleSale: state.sales.find(s => s.id === value.responsibleSaleId) || null,
    secondarySales: (value.secondarySales || []).map(link => ({ ...link, sale: state.sales.find(s => s.id === link.saleId) || null })),
  });
  const customerData = (data, previous) => ({
    ...data,
    secondarySales: data.secondarySales?.create ? data.secondarySales.create.map(link => ({ ...link }))
      : previous?.secondarySales || [],
    branches: data.branches?.create ? data.branches.create.map(branch => ({
      ...branch, id: branch.id || `branch-${sequence++}`,
      addresses: branch.addresses.create.map(address => ({ ...address, id: address.id || `address-${sequence++}` })),
    })) : previous?.branches || [],
  });
  const prisma = {
    user: { findUnique: async ({ where }) => ({ id: where.id, role: where.id === 'admin' ? 'admin' : 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({
      role: { id: 'role', name: 'Test', permissions: where.userId === 'viewer' ? ['master.view'] : ['ar.view', 'ar.create'] },
    }) },
    accountSale: {
      findMany: async ({ where = {} } = {}) => structuredClone(state.sales.filter(s => where.active === undefined || s.active === where.active)),
      findUnique: async ({ where }) => structuredClone(find(state.sales, where)),
      findUniqueOrThrow: async ({ where }) => structuredClone(find(state.sales, where) || missing()),
      create: async ({ data }) => structuredClone(save(state.sales, data)),
      update: async ({ where, data }) => structuredClone(save(state.sales, data, find(state.sales, where) || missing())),
    },
    accountCustomer: {
      findMany: async ({ where = {} } = {}) => state.customers.filter(c => where.active === undefined || c.active === where.active).map(hydrate),
      findUnique: async ({ where }) => hydrate(find(state.customers, where)),
      findUniqueOrThrow: async ({ where }) => hydrate(find(state.customers, where) || missing()),
      create: async ({ data }) => hydrate(save(state.customers, customerData(data))),
      update: async ({ where, data }) => {
        const previous = find(state.customers, where) || missing();
        return hydrate(save(state.customers, customerData(data, previous), previous));
      },
    },
    accountCustomerBranch: {
      deleteMany: async ({ where }) => { const customer = find(state.customers, { id: where.customerId }); customer.branches = []; },
    },
    accountCustomerSecondarySale: {
      deleteMany: async ({ where }) => { const customer = find(state.customers, { id: where.customerId }); customer.secondarySales = []; },
    },
    invoice: {
      create: async ({ data }) => {
        const invoice = { ...data, id: `invoice-${sequence++}`, items: data.items.create };
        state.invoices.push(invoice);
        return structuredClone(invoice);
      },
      findMany: async () => structuredClone(state.invoices),
    },
    auditLog: {
      create: async ({ data }) => {
        if (failAudit) throw new Error('Audit unavailable');
        state.audits.push(data); return data;
      },
    },
    $transaction: async callback => {
      const before = structuredClone(state);
      try { return await callback(prisma); }
      catch (error) { state = before; throw error; }
    },
  };
  require.cache[require.resolve('../../src/lib/prisma')] = { exports: prisma, loaded: true };
  require.cache[require.resolve('../../src/lib/runningNumber')] = {
    exports: { generateNextRunningNumber: async () => `IV-TEST-${sequence++}` }, loaded: true,
  };
  const { authenticate } = require('../../src/middleware/auth');
  const { ACCOUNTING_RESOURCES, requireAccountingResource } = require('../../src/middleware/accountingAccess');
  const app = express();
  app.use(express.json());
  app.use('/api/accounting-access', require('../../src/routes/accounting-access'));
  for (const [route, module] of ACCOUNTING_RESOURCES) app.use(route, authenticate, requireAccountingResource(module));
  app.use('/api/account-customers', require('../../src/routes/account-customers'));
  app.use('/api/account-sales', require('../../src/routes/account-sales'));
  app.use('/api/ar', require('../../src/routes/ar'));
  app.use((error, _req, res, _next) => res.status(error.status || (error.code === 'P2002' ? 409 : error.code === 'P2025' ? 404 : 500)).json({ message: error.message }));
  return {
    app, prisma, state: () => state,
    token: user => jwt.sign({ sub: user }, process.env.JWT_SECRET),
    failAudit: value => { failAudit = value; },
  };
}
module.exports = { createCustomerApp };
