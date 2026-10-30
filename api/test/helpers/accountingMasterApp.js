const express = require('express');
const jwt = require('jsonwebtoken');

function createMasterApp({ units = false } = {}) {
  const kinds = {
    customers: ['accountCustomer', 'account-customers'], sales: ['accountSale', 'account-sales'],
    suppliers: ['supplier', 'suppliers'], products: ['accountProduct', 'account-products'],
    warehouses: ['warehouse', 'warehouses'], coa: ['chartOfAccount', 'chart-of-accounts'],
  };
  if (units) kinds.units = ['accountUnit', 'account-units'];
  let sequence = 0;
  let state = Object.fromEntries([...Object.values(kinds).map(([model]) => [model, []]), ['auditLog', []], ['purchaseOrder', []]]);
  let failAudit = false;
  const references = new Set();
  const missing = () => { throw Object.assign(new Error('Not found'), { code: 'P2025' }); };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => key === 'OR'
    ? value.some(condition => matches(row, condition))
    : value && typeof value === 'object' && 'contains' in value
      ? String(row[key] ?? '').toLowerCase().includes(value.contains.toLowerCase())
      : row[key] === value);
  const hydrate = data => {
    if (!data) return null;
    const value = structuredClone(data);
    if (value.branches?.create) value.branches = value.branches.create.map(branch => ({
      ...branch, id: branch.id || `b-${sequence++}`,
      ...(branch.banks ? { banks: branch.banks.create.map(bank => ({ ...bank, id: `bank-${sequence++}` })) } : {}),
      ...(branch.addresses ? { addresses: branch.addresses.create.map(address => ({ ...address, id: address.id || `a-${sequence++}` })) } : {}),
    }));
    if (value.secondarySales?.create) value.secondarySales = value.secondarySales.create;
    return value;
  };
  const prisma = {
    $queryRawUnsafe: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, role: where.id === 'admin' ? 'admin' : 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({ role: { id: 'test', name: 'Test',
      permissions: where.userId === 'viewer' ? ['master.view'] : ['ar', 'ap', 'inventory'].includes(where.userId)
        ? [`${where.userId}.view`, `${where.userId}.create`] : [] } }) },
    supplierBranch: { deleteMany: async () => ({ count: 0 }) },
    accountCustomerBranch: { deleteMany: async () => ({ count: 0 }) },
    accountCustomerSecondarySale: { deleteMany: async () => ({ count: 0 }) },
    $transaction: async operation => {
      if (Array.isArray(operation)) return Promise.all(operation);
      const before = structuredClone(state);
      try { return await operation(prisma); }
      catch (error) { state = before; throw error; }
    },
  };
  for (const model of [...Object.values(kinds).map(([model]) => model), 'auditLog', 'purchaseOrder']) {
    prisma[model] = {
      findMany: async ({ where, skip = 0, take } = {}) => structuredClone(state[model].filter(row => matches(row, where))
        .sort((a, b) => model === 'auditLog' ? String(b.id).localeCompare(String(a.id)) : String(a.code).localeCompare(String(b.code)))
        .slice(skip, take == null ? undefined : skip + take)),
      count: async ({ where } = {}) => state[model].filter(row => matches(row, where)).length,
      findUnique: async ({ where }) => hydrate(state[model].find(row => row.id === where.id)),
      findUniqueOrThrow: async ({ where, select }) => {
        const value = state[model].find(row => row.id === where.id) || missing();
        if (select?._count) return { _count: Object.fromEntries(Object.keys(select._count.select).map(key => [key, references.has(value.id) ? 1 : 0])) };
        return hydrate(value);
      },
      create: async ({ data }) => {
        if (model === 'auditLog' && failAudit) throw new Error('Audit unavailable');
        if (data.code && state[model].some(row => row.code === data.code)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
        if (model === 'accountUnit' && state[model].some(row => row.name === data.name)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
        const value = { ...hydrate(data), id: `id-${String(sequence++).padStart(5, '0')}`,
          createdAt: new Date(), updatedAt: new Date(Date.now() + sequence), active: data.active ?? true };
        state[model].push(value);
        if (model === 'purchaseOrder' && value.supplierId) references.add(value.supplierId);
        return hydrate(value);
      },
      update: async ({ where, data }) => {
        const previous = state[model].find(row => row.id === where.id) || missing();
        if (data.code && state[model].some(row => row.id !== previous.id && row.code === data.code)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
        if (model === 'accountUnit' && state[model].some(row => row.id !== previous.id && row.name === data.name)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
        const value = { ...previous, ...hydrate(data), updatedAt: new Date(Date.now() + ++sequence) };
        state[model][state[model].indexOf(previous)] = value;
        return hydrate(value);
      },
      delete: async ({ where }) => {
        const value = state[model].find(row => row.id === where.id) || missing();
        state[model] = state[model].filter(row => row.id !== where.id);
        return hydrate(value);
      },
    };
  }
  prisma.purchaseOrderLine = { deleteMany: async () => ({ count: 0 }) };
  prisma.purchaseOrderPurchaseRequest = { deleteMany: async () => ({ count: 0 }) };
  require.cache[require.resolve('../../src/lib/prisma')] = { exports: prisma, loaded: true };
  const app = express();
  app.use(express.json());
  const { authenticate } = require('../../src/middleware/auth');
  const { requireAccountingResource } = require('../../src/middleware/accountingAccess');
  for (const [, route] of Object.values(kinds)) {
    delete require.cache[require.resolve(`../../src/routes/${route}`)];
    app.use(`/api/${route}`, authenticate, requireAccountingResource('master'), require(`../../src/routes/${route}`));
  }
  app.use('/api/accounting-access', require('../../src/routes/accounting-access'));
  require.cache[require.resolve('../../src/lib/runningNumber')] = {
    exports: { generateNextRunningNumber: async () => `PO-TEST-${sequence++}` }, loaded: true,
  };
  delete require.cache[require.resolve('../../src/routes/ap')];
  app.use('/api/ap', authenticate, requireAccountingResource('ap'), require('../../src/routes/ap'));
  app.use((error, _req, res, _next) => res.status(error.status || (error.code === 'P2025' ? 404 : 500)).json({ message: error.message }));
  return { app, prisma, kinds, state: () => state, failAudit: value => { failAudit = value; },
    markUsed: id => references.add(id), token: (id = 'admin') => jwt.sign({ sub: id }, process.env.JWT_SECRET) };
}
module.exports = { createMasterApp };
