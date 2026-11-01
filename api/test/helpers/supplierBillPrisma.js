// In-memory Prisma substitute: concurrent interactive transactions, FOR UPDATE row locks (held until commit/rollback),
// undo-log rollback, and the partial unique indexes from migration 20261101020000_supplier_bills.
function createSupplierBillPrisma() {
  const db = {
    supplier: [], paymentVoucher: [], supplierBill: [], supplierBillLine: [], supplierBillSettlement: [], auditLog: [],
    documentSequence: [], purchaseOrder: [],
  };
  const permissions = {
    maker: ['ap.view', 'ap.create', 'ap.update'], approver: ['ap.view', 'ap.approve'], payer: ['ap.view', 'ap.pay'],
    voider: ['ap.view', 'ap.pay', 'ap.cancel'], canceller: ['ap.view', 'ap.cancel', 'ap.update'], viewer: ['ap.view'],
    reports: ['reports.view'], nobody: [],
  };
  let sequence = 0, txSequence = 0, failAudit = false;
  const lockTails = new Map(), lockLog = [];
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const clone = value => structuredClone(value);
  const nextId = model => `${model}-${++sequence}`;
  const time = () => new Date(Date.UTC(2026, 9, 31) + ++sequence);

  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(condition => matches(row, condition));
      if (value instanceof Date) return row[key] instanceof Date && row[key].getTime() === value.getTime();
      if (value && typeof value === 'object') {
        if ('not' in value) return value.not === null ? row[key] != null : (row[key] ?? null) !== value.not;
        if ('in' in value) return value.in.includes(row[key]);
        if ('notIn' in value) return !value.notIn.includes(row[key]);
        if ('lt' in value) return row[key] != null && new Date(row[key]).getTime() < new Date(value.lt).getTime();
        if ('contains' in value) return String(row[key] || '').toLowerCase().includes(value.contains.toLowerCase());
        if ('path' in value) return String(row[key]?.[value.path[0]] || '').includes(value.string_contains);
        return false;
      }
      return (row[key] ?? null) === value;
    });
  }
  function hydrate(model, row) {
    if (!row) return null;
    const result = clone(row);
    if (model === 'supplierBill') {
      result.items = clone(db.supplierBillLine.filter(line => line.billId === row.id).sort((a, b) => a.seq - b.seq));
      result.settlements = db.supplierBillSettlement.filter(item => item.billId === row.id).map(item => ({ ...clone(item),
        paymentVoucher: clone(db.paymentVoucher.find(pv => pv.id === item.paymentVoucherId)) }));
    }
    if (model === 'paymentVoucher') {
      result.supplierBillSettlements = clone(db.supplierBillSettlement.filter(item => item.paymentVoucherId === row.id && item.status === 'active'));
    }
    if (model === 'auditLog') result.performedBy = { fullName: row.performedById };
    return result;
  }
  function assertUnique(model, row) {
    const others = db[model].filter(item => item.id !== row.id);
    const duplicate = model === 'supplierBill' ? others.some(item => item.billNo === row.billNo || item.requestKey === row.requestKey ||
      (row.status !== 'cancelled' && item.status !== 'cancelled' && item.supplierId === row.supplierId &&
        (item.supplierInvoiceNoKey === row.supplierInvoiceNoKey || (row.taxInvoiceNoKey && item.taxInvoiceNoKey === row.taxInvoiceNoKey))))
      : model === 'supplierBillSettlement' ? row.status === 'active' && others.some(item => item.status === 'active' &&
        item.billId === row.billId && item.paymentVoucherId === row.paymentVoucherId) : false;
    if (duplicate) throw Object.assign(new Error(`Unique constraint failed on ${model}`), { code: 'P2002' });
  }
  async function acquire(tx, key) {
    if (!tx || tx.held.has(key)) return;
    const previous = lockTails.get(key) || Promise.resolve();
    let release; const mine = new Promise(resolve => { release = resolve; });
    lockTails.set(key, previous.then(() => mine));
    tx.held.set(key, release);
    await previous;
  }
  function client(tx) {
    const undo = fn => { if (tx) tx.undo.push(fn); };
    const api = {
      $queryRaw: async (strings, ...values) => {
        if (!tx) throw new Error('FOR UPDATE outside a transaction');
        const key = `${strings.join('?').match(/FROM (\w+)/)[1]}:${values[0]}`;
        lockLog.push({ tx: tx.id, key });
        await acquire(tx, key);
        return [];
      },
      user: { findUnique: async ({ where }) => ({ id: where.id, username: where.id, fullName: where.id,
        role: where.id === 'admin' ? 'admin' : 'sales', active: true }) },
      accountingUserRole: { findUnique: async ({ where }) => ({ role: { id: where.userId, name: where.userId, permissions: permissions[where.userId] || [] } }) },
      documentSequence: {
        upsert: async ({ where }) => {
          const key = where.docType_periodKey_prefix;
          await acquire(tx, `document_sequences:${JSON.stringify(key)}`);
          let row = db.documentSequence.find(item => matches(item, key));
          if (!row) { row = { ...key, lastSeq: 0 }; db.documentSequence.push(row); undo(() => { db.documentSequence.splice(db.documentSequence.indexOf(row), 1); }); }
          return clone(row);
        },
        update: async ({ where }) => {
          const row = db.documentSequence.find(item => matches(item, where.docType_periodKey_prefix));
          const before = row.lastSeq; row.lastSeq += 1; undo(() => { row.lastSeq = before; });
          return { lastSeq: row.lastSeq };
        },
      },
    };
    for (const model of ['supplier', 'paymentVoucher', 'supplierBill', 'supplierBillSettlement', 'auditLog', 'purchaseOrder']) {
      api[model] = {
        findMany: async ({ where, orderBy, skip = 0, take } = {}) => {
          await tick();
          const rows = db[model].filter(row => matches(row, where));
          for (const clause of [...(orderBy || [])].reverse()) {
            const [field, direction] = Object.entries(clause)[0];
            rows.sort((a, b) => {
              const left = a[field] instanceof Date ? a[field].getTime() : a[field], right = b[field] instanceof Date ? b[field].getTime() : b[field];
              return left === right ? 0 : (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
            });
          }
          return rows.slice(skip, take == null ? undefined : skip + take).map(row => hydrate(model, row));
        },
        count: async ({ where } = {}) => db[model].filter(row => matches(row, where)).length,
        findUnique: async ({ where }) => { await tick(); return hydrate(model, db[model].find(row => matches(row, where))); },
        findFirst: async ({ where }) => { await tick(); return hydrate(model, db[model].find(row => matches(row, where))); },
        create: async ({ data }) => {
          await tick();
          if (model === 'auditLog' && failAudit) throw new Error('Audit unavailable');
          const { items, ...fields } = data, now = time();
          const row = { ...fields, id: nextId(model), createdAt: now, updatedAt: now };
          assertUnique(model, row);
          db[model].push(row);
          undo(() => { db[model].splice(db[model].indexOf(row), 1); });
          for (const [seq, item] of (items?.create || []).entries()) {
            const line = { ...item, seq: item.seq ?? seq, id: nextId('line'), billId: row.id };
            db.supplierBillLine.push(line);
            undo(() => { db.supplierBillLine.splice(db.supplierBillLine.indexOf(line), 1); });
          }
          return hydrate(model, row);
        },
        update: async ({ where, data }) => {
          await tick();
          const index = db[model].findIndex(row => matches(row, where));
          if (index < 0) throw Object.assign(new Error('Not found'), { code: 'P2025' });
          const previous = db[model][index], { items, revision, ...fields } = data;
          const row = { ...previous, ...fields, ...(revision?.increment ? { revision: previous.revision + revision.increment } : {}), updatedAt: time() };
          assertUnique(model, row);
          db[model][index] = row;
          undo(() => { db[model][db[model].indexOf(row)] = previous; });
          if (items) {
            const lines = db.supplierBillLine;
            db.supplierBillLine = lines.filter(line => line.billId !== row.id)
              .concat(items.create.map((item, seq) => ({ ...item, seq: item.seq ?? seq, id: nextId('line'), billId: row.id })));
            undo(() => { db.supplierBillLine = lines; });
          }
          return hydrate(model, row);
        },
      };
    }
    api.$transaction = async operation => {
      if (Array.isArray(operation)) return Promise.all(operation);
      const state = { id: ++txSequence, undo: [], held: new Map() };
      try { return await operation(client(state)); }
      catch (error) { for (const fn of state.undo.reverse()) fn(); throw error; }
      finally { for (const release of state.held.values()) release(); }
    };
    return api;
  }
  return { prisma: client(null), db, lockLog, failAudit: value => { failAudit = value; } };
}
module.exports = { createSupplierBillPrisma };