const express = require('express');
const jwt = require('jsonwebtoken');

function createContractorPaymentApp() {
  const supplier = { id: 'supplier', name: 'Test contractor', code: 'SUP001', taxId: '1234567890123', active: true };
  const po = { id: 'po', poNo: 'PO2610001', poDate: new Date('2026-10-01'), subTotal: 10000, discount: 0,
    vat: 700, netAmount: 10700, vatConfig: 'VAT7%', status: 'draft', supplierId: supplier.id, supplier,
    supplierBranch: 'Head office', address: 'Saved address', contactPerson: 'Contact', supplierSnapshot: { name: supplier.name, code: supplier.code } };
  let state = { purchaseOrder: [po], goodsReceipt: [], accountProduct: [], warehouse: [], stockBalance: [], stockMovement: [],
    stockIssue: [], stockReturn: [], workOrder: [],
    contractorPaymentRequest: [], paymentVoucher: [], chequePayment: [], attachment: [], auditLog: [], sequence: 0 };
  let failAudit = false, queue = Promise.resolve();
  const locks = [], storageOperations = [];
  const permissions = {
    maker: ['ap.view', 'ap.create', 'ap.update', 'ap.cancel', 'ap.approve', 'ap.pay', 'inventory.view', 'inventory.create', 'inventory.update', 'inventory.approve', 'inventory.cancel'],
    approver: ['ap.view', 'ap.approve', 'inventory.view', 'inventory.approve'], viewer: ['ap.view', 'inventory.view'], editor: ['ap.view', 'ap.update', 'inventory.view', 'inventory.update'],
    payer: ['ap.view', 'ap.pay'], canceller: ['ap.view', 'ap.cancel', 'inventory.view', 'inventory.cancel'],
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (key === 'warehouseId_productId') return matches(row, value);
    if (key === 'goodsReceipts') return !state.goodsReceipt.some(doc => doc.poId === row.id && matches(doc, value.none));
    if (value && typeof value === 'object') {
      if ('not' in value) return (row[key] ?? null) !== value.not;
      if ('in' in value) return value.in.includes(row[key]);
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('contains' in value) return String(row[key] || '').toLowerCase().includes(value.contains.toLowerCase());
      if ('equals' in value) return String(row[key] || '').toLowerCase() === value.equals.toLowerCase();
      if ('path' in value) return String(row[key]?.[value.path[0]] || '').includes(value.string_contains);
      return matches(row[key] || {}, value);
    }
    return (row[key] ?? null) === value;
  });
  const hydrate = value => {
    if (!value) return null;
    const row = structuredClone(value);
    if (row.items?.create) row.items = row.items.create.map((item, i) => ({ ...item, id: `${row.id}-item-${i}` }));
    if (row.pvNo && !row.cqNo) {
      row.attachments = structuredClone(state.attachment.filter(file => file.paymentVoucherId === row.id));
      row.chequePayments = structuredClone(state.chequePayment.filter(file => file.paymentVoucherId === row.id));
    }
    if (row.cqNo) row.attachments = structuredClone(state.attachment.filter(file => file.chequePaymentId === row.id));
    if (row.grNo) row.attachments = structuredClone(state.attachment.filter(file => file.goodsReceiptId === row.id));
    if (row.issueNo) row.attachments = structuredClone(state.attachment.filter(file => file.stockIssueId === row.id));
    if (row.poNo && !row.psNo && !row.pvNo && !row.cqNo && !row.grNo) {
      row.attachments = structuredClone(state.attachment.filter(file => file.purchaseOrderId === row.id));
      row.supplier = row.supplier || structuredClone(supplier);
      if (row.purchaseRequestReferences?.create) row.purchaseRequestReferences = row.purchaseRequestReferences.create;
    }
    return row;
  };
  const prisma = {
    $queryRaw: async (strings, ...values) => { locks.push({ sql: strings.join('?'), values }); return []; },
    user: { findUnique: async ({ where }) => ({ id: where.id, username: where.id, fullName: where.id, role: where.id === 'admin' ? 'admin' : 'sales', active: true }) },
    accountingUserRole: { findUnique: async ({ where }) => ({ role: { id: where.userId, name: where.userId, permissions: permissions[where.userId] || [] } }) },
    documentSequence: {
      upsert: async () => ({}),
      update: async () => ({ lastSeq: ++state.sequence }),
    },
    $transaction: operation => {
      if (Array.isArray(operation)) return Promise.all(operation);
      const run = queue.then(async () => {
        const before = structuredClone(state);
        try { return await operation(prisma); }
        catch (error) { state = before; throw error; }
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  for (const model of ['purchaseOrder', 'goodsReceipt', 'accountProduct', 'warehouse', 'stockBalance', 'stockMovement', 'stockIssue', 'stockReturn', 'workOrder',
    'contractorPaymentRequest', 'paymentVoucher', 'chequePayment', 'attachment', 'auditLog']) prisma[model] = {
    findMany: async ({ where, skip = 0, take, orderBy } = {}) => {
      const rows = state[model].filter(row => matches(row, where));
      if (orderBy) rows.sort((a, b) => Number(b.createdAt || b.docDate || 0) - Number(a.createdAt || a.docDate || 0) || b.id.localeCompare(a.id));
      return rows.slice(skip, take == null ? undefined : skip + take).map(hydrate);
    },
    count: async ({ where } = {}) => state[model].filter(row => matches(row, where)).length,
    findUnique: async ({ where }) => hydrate(state[model].find(row => matches(row, where))),
    findUniqueOrThrow: async ({ where }) => {
      const row = state[model].find(row => matches(row, where));
      if (!row) throw Object.assign(new Error('Not found'), { status: 404 });
      return hydrate(row);
    },
    findFirst: async ({ where }) => hydrate(state[model].find(row => matches(row, where))),
    create: async ({ data }) => {
      if (model === 'auditLog' && (failAudit === true || failAudit === data.entityType)) throw new Error('Audit unavailable');
      if (model === 'contractorPaymentRequest' && state[model].some(row => row.psNo === data.psNo || row.requestKey === data.requestKey ||
        (row.poId === data.poId && row.paymentRound === data.paymentRound))) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
      if (model === 'paymentVoucher' && state[model].some(row => row.pvNo === data.pvNo || row.requestKey === data.requestKey ||
        (row.lifecycleVersion === 1 && !['cancelled', 'rejected'].includes(row.status) && row.sourceDocId === data.sourceDocId))) {
        throw Object.assign(new Error('Duplicate PV'), { code: 'P2002' });
      }
      if (model === 'chequePayment' && state[model].some(row => row.cqNo === data.cqNo || row.requestKey === data.requestKey ||
        (row.bankAccount === data.bankAccount && row.chequeNo === data.chequeNo) ||
        (row.lifecycleVersion === 1 && row.status !== 'Cancelled' && row.paymentVoucherId === data.paymentVoucherId))) {
        throw Object.assign(new Error('Duplicate CQ'), { code: 'P2002' });
      }
      const now = new Date(Date.now() + ++state.sequence);
      const row = hydrate({ ...(model === 'paymentVoucher' ? { paidAt: null, reversedAt: null, taxpayerType: null, taxDescription: null } : {}),
        ...data, id: `${model}-${state.sequence}`, updatedAt: now, createdAt: now, uploadedAt: now });
      if (model === 'auditLog') row.performedBy = { fullName: data.performedById };
      state[model].push(row);
      return hydrate(row);
    },
    upsert: async ({ where, create, update }) => {
      const row = state[model].find(row => matches(row, where));
      return row ? prisma[model].update({ where, data: update }) : prisma[model].create({ data: create });
    },
    delete: async ({ where }) => {
      const row = state[model].find(row => matches(row, where));
      if (!row) throw Object.assign(new Error('Not found'), { code: 'P2025' });
      state[model] = state[model].filter(item => item !== row);
      return hydrate(row);
    },
    update: async ({ where, data }) => {
      const previous = state[model].find(row => matches(row, where));
      if (!previous) throw new Error('Not found');
      const row = hydrate({ ...previous, ...data, updatedAt: new Date(Date.now() + ++state.sequence) });
      state[model][state[model].indexOf(previous)] = row;
      return hydrate(row);
    },
  };
  prisma.supplier = { findUnique: async () => supplier };
  prisma.purchaseOrderLine = { deleteMany: async () => ({ count: 0 }) };
  prisma.purchaseOrderPurchaseRequest = { deleteMany: async () => ({ count: 0 }) };
  require.cache[require.resolve('../../src/lib/prisma')] = { exports: prisma, loaded: true };
  for (const file of ['../../src/lib/accountingAccess', '../../src/middleware/auth', '../../src/middleware/accountingAccess',
    '../../src/lib/runningNumber', '../../src/lib/auditTrail', '../../src/lib/accountingMaster', '../../src/lib/paymentVoucher',
    '../../src/lib/chequePayment', '../../src/routes/cheque-payments', '../../src/lib/purchaseOrderApproval', '../../src/lib/goodsReceipt', '../../src/routes/goods-receipts',
    '../../src/lib/stockIssue', '../../src/routes/stock-issues', '../../src/routes/inventory',
    '../../src/routes/ap', '../../src/routes/contractor-payments', '../../src/routes/payment-vouchers', '../../src/routes/upload']) {
    delete require.cache[require.resolve(file)];
  }
  const { authenticate } = require('../../src/middleware/auth');
  const { requireAccountingResource } = require('../../src/middleware/accountingAccess');
  const { getAccountingAccess } = require('../../src/lib/accountingAccess');
  const app = express();
  app.use(express.json());
  app.get('/api/accounting-access/me', authenticate, async (req, res, next) => {
    try { res.json(await getAccountingAccess(req.user)); } catch (error) { next(error); }
  });
  app.get('/api/settings', (_req, res) => res.json({ companyName: 'GreenDii Test Company', address: 'Company test address', taxId: '1234567890123' }));
  app.use('/api/ap', authenticate, requireAccountingResource('ap'), require('../../src/routes/ap'));
  app.use('/api/inventory', authenticate, requireAccountingResource('inventory'), require('../../src/routes/inventory'));
  require.cache[require.resolve('../../src/lib/r2')] = { loaded: true, exports: {
    isR2Enabled: true,
    uploadToR2: async key => { storageOperations.push({ action: 'upload', key }); return `https://evidence.invalid/${key}`; },
    deleteFromR2: async key => { storageOperations.push({ action: 'delete', key }); },
  } };
  app.use('/api/upload', require('../../src/routes/upload'));
  app.use((error, _req, res, _next) => res.status(error.status || (error.code === 'P2002' ? 409 : 500)).json({ message: error.message }));
  return { app, prisma, locks, storageOperations, state: () => state, failAudit: value => { failAudit = value; },
    token: (id = 'maker') => jwt.sign({ sub: id }, process.env.JWT_SECRET) };
}
module.exports = { createContractorPaymentApp };
