const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');
const { DOCUMENTS, ROLLOUT_READY, normalizeSteps, validateConfiguration, validateTargets,
  planApproval, currentCycle, eligibleForCycle } = require('../src/lib/accountingApproval');
const { createContractorPaymentApp } = require('./helpers/contractorPaymentApp');

function actors(tx) {
  const permissions = ['ap.view', 'ap.approve', 'inventory.view', 'inventory.approve', 'ar.view', 'ar.approve'];
  const users = Object.fromEntries(['maker', 'approver', 'other', 'final', 'admin', 'inactive', 'viewer'].map(id => [id, {
    id, fullName: `${id} name`, role: id === 'admin' ? 'admin' : 'sales', active: id !== 'inactive',
    signatureText: `${id} signature`, signatureUrl: null,
    accountingAssignment: { roleId: id === 'final' ? 'final-role' : 'review',
      role: { permissions: id === 'viewer' ? ['ap.view', 'ar.view', 'inventory.view'] : id === 'maker'
        ? [...permissions, 'ap.create', 'ap.update', 'ap.cancel', 'inventory.create', 'inventory.update', 'inventory.cancel'] : permissions } },
  }]));
  tx.user.findUnique = async ({ where }) => structuredClone(users[where.id] || null);
  tx.accountingUserRole = { findUnique: async ({ where }) => structuredClone(users[where.userId]?.accountingAssignment || null) };
  tx.accountingRole = { findUnique: async ({ where }) => ['review', 'final-role'].includes(where.id)
    ? { id: where.id, name: where.id, permissions,
      assignments: Object.values(users).filter(user => user.accountingAssignment.roleId === where.id).map(user => ({ user })) } : null };
  return users;
}
function snapshot(steps = [{ kind: 'role', targetId: 'review', label: 'Review' },
  { kind: 'user', targetId: 'final', label: 'Final actor' }]) {
  return { version: 1, cycles: [{ cycle: 1, state: 'pending', configRevision: 1,
    submittedAt: '2026-10-01T00:00:00.000Z', submittedById: 'maker', steps, approvals: [] }] };
}
function txFixture() {
  const tx = { user: {}, $queryRaw: async () => [], accountingApprovalConfig: { findUnique: async () => null },
    accountingApprovalSignature: { upsert: async () => ({}) } };
  return { tx, users: actors(tx) };
}

test('Accounting approval configuration shape rejects unknown types, malformed/empty enabled chains and unavailable rollout', async () => {
  const { tx } = txFixture();
  assert.equal(ROLLOUT_READY, false);
  for (const value of [null, {}, 'role', [{ kind: 'sales', targetId: 'review' }],
    [{ kind: 'role', targetId: '' }], [{ kind: 'user', targetId: 'final', skipCreator: true }],
    Array.from({ length: 21 }, () => ({ kind: 'role', targetId: 'review' }))]) {
    assert.throws(() => normalizeSteps(value, true), { status: 400 });
  }
  await assert.rejects(validateConfiguration(tx, '__proto__', { enabled: false, steps: [] }), { status: 400 });
  await assert.rejects(validateConfiguration(tx, 'po', { enabled: 'false', steps: [] }), { status: 400 });
  await assert.rejects(validateConfiguration(tx, 'po', { enabled: true, steps: [] }), { status: 400 });
  await assert.rejects(validateConfiguration(tx, 'po', { enabled: true, steps: [{ kind: 'role', targetId: 'review' }] }), { status: 409 });
  assert.deepEqual(await validateConfiguration(tx, 'po', { enabled: false, steps: [] }), { enabled: false, steps: [] });
});

for (const docType of ['gr', 'is', 'sr', 'ps', 'pv', 'opening']) {
  test(`${docType} actual HTTP adapter: intermediate holds pending/reservations, final posts once, audit rollback and stale retries`, async t => {
    process.env.JWT_SECRET = 'isolated-seven-approval-adapter-test';
    const f = createContractorPaymentApp(); actors(f.prisma);
    const product = { id: 'mat', code: 'MAT', name: 'Material', active: true, unit: 'Pcs', productType: 'stored' };
    const state = () => f.state();
    state().accountProduct.push(product);
    state().warehouse.push({ id: 'main', code: 'MAIN', name: 'Main', active: true });
    state().stockBalance.push({ id: 'balance', warehouseId: 'main', productId: 'mat', onHand: 10, reserved: 2, available: 8 });
    state().stockMovement.push({ id: 'initial', warehouseId: 'main', productId: 'mat', sourceDocType: 'goods_receipt',
      transactionDate: new Date('2026-10-18T12:00:00Z'), createdAt: new Date('2026-10-18T12:00:00Z'), qtyIn: 10, qtyOut: 0 });
    Object.assign(state().purchaseOrder[0], { status: 'approved', updatedAt: new Date('2026-10-01'),
      items: [{ id: 'po-line', seq: 0, desc: 'Material', qty: 100, unit: 'Pcs', unitPrice: 100, discount: 0, productId: 'mat' }] });
    state().stockIssue.push({ id: 'source-is', issueNo: 'IS-SOURCE', lifecycleVersion: 1, status: 'approved',
      createdById: 'maker', issueDate: new Date('2026-10-19'), updatedAt: new Date('2026-10-19'),
      warehouseId: 'main', warehouseSnapshot: { code: 'MAIN', name: 'Main' }, workOrderId: null, requester: 'Requester', receiver: 'Receiver',
      items: [{ id: 'issue-line', seq: 0, productId: 'mat', requestedQty: 5, issuedQty: 5, cancelledQty: 0, productSnapshot: product }] });
    const roots = { gr: '/api/ap/goods-receipts', is: '/api/inventory/issues', sr: '/api/inventory/returns',
      ps: '/api/ap/contractor-payments', pv: '/api/ap/payment-vouchers', opening: '/api/inventory/opening-balances' };
    const root = roots[docType];
    const server = f.app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path, { user = 'maker', method = 'GET', body, status = 200 } = {}) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
        Authorization: `Bearer ${f.token(user)}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
    }
    const requestKey = require('crypto').randomUUID();
    const inputs = {
      gr: { requestKey, poId: 'po', receiptDate: '2026-10-20', warehouseId: 'main', sender: 'Sender', receiver: 'Receiver',
        items: [{ poLineId: 'po-line', productId: 'mat', currentReceiptQty: 2 }] },
      is: { requestKey, issueDate: '2026-10-20', warehouseId: 'main', requester: 'Requester', receiver: 'Receiver',
        items: [{ productId: 'mat', requestedQty: 2, issuedQty: 2 }] },
      sr: { requestKey, stockIssueId: 'source-is', returnDate: '2026-10-20', sender: 'Sender', receiver: 'Receiver',
        returnReason: 'Unused material', items: [{ stockIssueLineId: 'issue-line', returnedQty: 2 }] },
      ps: { requestKey, poId: 'po', docDate: '2026-10-20', paymentRound: 1, items: [{ desc: 'Work', amount: 100 }] },
      opening: { requestKey, warehouseId: 'main', cutoverDate: '2026-10-20', items: [{ productId: 'mat', countedQty: 12 }] },
    };
    if (docType === 'pv') {
      let ps = await call(roots.ps, { method: 'POST', body: inputs.ps, status: 201 });
      ps = await call(`${roots.ps}/${ps.id}/submit`, { method: 'POST', body: { updatedAt: ps.updatedAt } });
      ps = await call(`${roots.ps}/${ps.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: ps.updatedAt } });
      inputs.pv = { requestKey: require('crypto').randomUUID(), sourceDocId: ps.id, pvDate: '2026-10-20', paymentMethod: 'cash' };
    }
    let doc = await call(root, { method: 'POST', body: inputs[docType], status: 201 });
    if (docType === 'gr') state().attachment.push({ id: 'proof', goodsReceiptId: doc.id, category: 'gr-receipt' });
    doc = await call(`${root}/${doc.id}/submit`, { method: 'POST', body: { updatedAt: doc.updatedAt } });
    const stored = state()[DOCUMENTS[docType].model].find(row => row.id === doc.id);
    stored.accountingApproval = snapshot();
    const baselineBalance = structuredClone(state().stockBalance), baselineMoves = state().stockMovement.length;
    const first = await call(`${root}/${doc.id}/approve`, { method: 'POST', user: 'approver', body: { updatedAt: doc.updatedAt } });
    assert.equal(first.status, 'pending'); assert.equal(first.approvedAt == null, true);
    assert.deepEqual(state().stockBalance, baselineBalance); assert.equal(state().stockMovement.length, baselineMoves);
    const entity = { gr: 'goods_receipt', is: 'stock_issue', sr: 'stock_return', ps: 'contractor_payment_request',
      pv: 'payment_voucher', opening: 'stock_opening_balance' }[docType];
    f.failAudit(entity);
    await call(`${root}/${doc.id}/approve`, { method: 'POST', user: 'final', body: { updatedAt: first.updatedAt }, status: 500 });
    assert.equal(state()[DOCUMENTS[docType].model].find(row => row.id === doc.id).status, 'pending');
    assert.deepEqual(state().stockBalance, baselineBalance); assert.equal(state().stockMovement.length, baselineMoves);
    f.failAudit(false);
    const final = await call(`${root}/${doc.id}/approve`, { method: 'POST', user: 'final', body: { updatedAt: first.updatedAt } });
    assert.equal(final.status, 'approved');
    const stockDoc = ['gr', 'is', 'sr', 'opening'].includes(docType);
    assert.equal(state().stockMovement.length, baselineMoves + (stockDoc ? 1 : 0));
    assert.equal(state().stockBalance[0].onHand, docType === 'is' ? 8 : stockDoc ? 12 : 10);
    assert.equal(final.approvedById, 'final');
    await call(`${root}/${doc.id}/approve`, { method: 'POST', user: 'final', body: { updatedAt: first.updatedAt }, status: 409 });
    assert.equal(state().stockMovement.length, baselineMoves + (stockDoc ? 1 : 0));
    if (docType === 'pv') assert.equal(final.paidAt, null);
  });
}

for (const docType of Object.keys(DOCUMENTS)) {
  test(`${docType}: role then specific user, creator/admin prohibition, final-only decision and immutable actor signatures`, async () => {
    const { tx, users } = txFixture();
    const doc = { createdById: 'maker', status: 'pending', accountingApproval: snapshot() };
    const original = structuredClone(doc);
    for (const actor of ['maker', 'viewer', 'inactive', 'missing', 'final']) {
      assert.equal(await eligibleForCycle(tx, docType, doc, actor), false);
      await assert.rejects(planApproval(tx, docType, doc, 'approve', actor), { status: 403 });
    }
    await assert.rejects(planApproval(tx, docType, { ...doc, createdById: 'admin' }, 'approve', 'admin'), { status: 403 });
    // Admin cannot bypass a role-targeted step either.
    users.admin.accountingAssignment = null;
    await assert.rejects(planApproval(tx, docType, doc, 'approve', 'admin'), { status: 403 });
    users.approver.signatureUrl = 'https://signature.invalid/immutable-original.png';
    const references = [];
    tx.accountingApprovalSignature.upsert = async request => { references.push(request.create.url); };
    const first = await planApproval(tx, docType, doc, 'approve', 'approver');
    assert.equal(first.finalApproval, false);
    assert.equal(first.changes.approvalStep, 2);
    assert.deepEqual(doc, original);
    const intermediate = { ...doc, ...first.changes };
    users.approver.fullName = 'Changed later';
    users.approver.signatureText = 'Changed later';
    users.approver.signatureUrl = 'https://signature.invalid/new.png';
    assert.equal(currentCycle(intermediate).approvals[0].fullName, 'approver name');
    assert.equal(currentCycle(intermediate).approvals[0].signatureText, 'approver signature');
    assert.equal(currentCycle(intermediate).approvals[0].signatureUrl, references[0]);
    await assert.rejects(planApproval(tx, docType, intermediate, 'approve', 'other'), { status: 403 });
    const final = await planApproval(tx, docType, intermediate, 'approve', 'final');
    assert.equal(final.finalApproval, true);
    assert.equal(currentCycle({ ...intermediate, ...final.changes }).state, 'approved');
    assert.equal(currentCycle({ ...intermediate, ...final.changes }).approvals.length, 2);
    await assert.rejects(planApproval(tx, docType, { ...intermediate, ...final.changes, status: 'approved' }, 'approve', 'final'), { status: 403 });
  });
}

test('Accounting configuration target validation distinguishes Accounting roles, active users and noncreator membership', async () => {
  const { tx, users } = txFixture();
  for (const targetId of ['inactive', 'viewer', 'missing']) {
    await assert.rejects(validateTargets(tx, 'po', [{ kind: 'user', targetId }]), { status: 400 });
  }
  await assert.rejects(validateTargets(tx, 'po', [{ kind: 'user', targetId: 'maker' }], 'maker'), { status: 400 });
  await assert.rejects(validateTargets(tx, 'po', [{ kind: 'role', targetId: 'sales' }]), { status: 400 });
  users.final.active = false;
  await assert.rejects(validateTargets(tx, 'po', [{ kind: 'role', targetId: 'final-role' }]), { status: 400 });
  users.final.active = true;
  await assert.rejects(validateTargets(tx, 'po', [{ kind: 'role', targetId: 'final-role' }], 'final'), { status: 400 });
  assert.equal((await validateTargets(tx, 'po', [{ kind: 'role', targetId: 'review' }], 'maker'))[0].label, 'review');
});

test('Accounting return/reject/cancel preserve approved actor snapshots; resubmit disabled records an empty legacy round', async () => {
  const { tx } = txFixture();
  const pending = { createdById: 'maker', status: 'pending', accountingApproval: snapshot() };
  const approvedOne = await planApproval(tx, 'po', pending, 'approve', 'approver');
  const doc = { ...pending, ...approvedOne.changes };
  for (const [action, actor] of [['return', 'final'], ['reject', 'final'], ['cancel', 'maker']]) {
    await assert.rejects(planApproval(tx, 'po', doc, action, actor, ''), { status: 400 });
    const result = await planApproval(tx, 'po', doc, action, actor, 'Needs correction');
    assert.equal(result.finalApproval, false);
    assert.deepEqual(currentCycle({ ...doc, ...result.changes }).approvals, currentCycle(doc).approvals);
  }
  const returned = await planApproval(tx, 'po', doc, 'return', 'final', 'Correction');
  const resubmit = await planApproval(tx, 'po', { ...doc, ...returned.changes, status: 'returned' }, 'submit', 'maker');
  const submitted = { ...doc, ...resubmit.changes };
  assert.equal(currentCycle(submitted).state, 'legacy');
  assert.equal(currentCycle(submitted).approvals.length, 0);
  assert.equal(submitted.accountingApproval.cycles[0].approvals.length, 1);
  assert.equal((await planApproval(tx, 'po', { ...submitted, status: 'pending' }, 'approve', 'approver')).finalApproval, true);
});

test('Accounting pending old flow ignores new configuration; enabled unverified configuration cannot submit', async () => {
  const { tx } = txFixture();
  tx.accountingApprovalConfig.findUnique = async () => ({ enabled: true, revision: 2, steps: [{ kind: 'user', targetId: 'final' }] });
  const old = { createdById: 'maker', status: 'pending' };
  assert.equal((await planApproval(tx, 'po', old, 'approve', 'approver')).finalApproval, true);
  await assert.rejects(planApproval(tx, 'po', { ...old, status: 'draft' }, 'submit', 'maker'), { status: 409 });
  await assert.rejects(planApproval(tx, 'po', old, 'approve', 'maker'), { status: 403 });
  assert.throws(() => currentCycle({ accountingApproval: { version: 1, cycles: [] } }), { status: 409 });
});

test('Accounting retains immutable image references on profile signature clearing, without duplicating or deleting referenced files', async t => {
  process.env.JWT_SECRET = 'isolated-accounting-signature-retention-test';
  const f = createContractorPaymentApp(), users = actors(f.prisma);
  users.approver.signatureUrl = 'https://evidence.invalid/signatures/original.png';
  const pending = { createdById: 'maker', status: 'pending', accountingApproval: snapshot() };
  await f.prisma.$transaction(tx => planApproval(tx, 'po', pending, 'approve', 'approver'));
  assert.equal(f.state().accountingApprovalSignature.length, 1);
  f.prisma.user.findUniqueOrThrow = async ({ where }) => structuredClone(users[where.id]);
  f.prisma.user.update = async ({ where, data }) => { Object.assign(users[where.id], data); return structuredClone(users[where.id]); };
  delete require.cache[require.resolve('../src/routes/users')];
  const express = require('express'), app = express();
  app.use(express.json());
  app.use('/api/users', require('../src/routes/users'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const root = `http://127.0.0.1:${server.address().port}/api/users`;
  const remove = async id => {
    const response = await fetch(`${root}/${id}/signature`, { method: 'DELETE', headers: { Authorization: `Bearer ${f.token('admin')}` } });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  };
  assert.equal((await remove('approver')).signatureUrl, null);
  assert.equal(f.storageOperations.length, 0);
  assert.equal(f.state().accountingApprovalSignature[0].url, 'https://evidence.invalid/signatures/original.png');
  users.other.signatureUrl = 'https://evidence.invalid/signatures/unreferenced.png';
  await remove('other');
  assert.deepEqual(f.storageOperations, [{ action: 'delete', key: 'signatures/unreferenced.png' }]);
  assert.equal(f.locks.some(lock => lock.sql.includes('FROM users') && lock.sql.includes('FOR UPDATE')), true);
});

test('Accounting approval HTTP: admin configuration, invalid chains, revisions, atomic audit, eligible inbox and role/user PO progression', async t => {
  process.env.JWT_SECRET = 'isolated-accounting-approval-test';
  const f = createContractorPaymentApp();
  actors(f.prisma);
  // The existing fixture owns a serial, rollback-capable substitute transaction.
  delete require.cache[require.resolve('../src/routes/accounting-approvals')];
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/accounting-approvals', require('../src/routes/accounting-approvals'));
  app.use(f.app);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { user = 'admin', method = 'GET', body, status = 200 } = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${f.token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const config = '/api/accounting-approvals/configuration';
  await call(config, { user: null, status: 401 });
  await call(config, { user: 'approver', status: 403 });
  assert.equal((await call(config)).configurations.length, 11);
  const body = { enabled: false, steps: [{ kind: 'role', targetId: 'review' }], revision: 0 };
  await call(`${config}/po`, { method: 'PUT', user: 'maker', body, status: 403 });
  await call(`${config}/po`, { method: 'PUT', body: { ...body, steps: [{ kind: 'user', targetId: 'inactive' }] }, status: 400 });
  await call(`${config}/po`, { method: 'PUT', body: { ...body, enabled: true }, status: 409 });
  let saved = await call(`${config}/po`, { method: 'PUT', body });
  assert.equal(saved.enabled, false); assert.equal(saved.revision, 1);
  await call(`${config}/po`, { method: 'PUT', body, status: 409 });
  f.failAudit('accounting_approval_config');
  await call(`${config}/po`, { method: 'PUT', body: { ...body, revision: 1 }, status: 500 });
  assert.equal(f.state().accountingApprovalConfig[0].revision, 1);
  f.failAudit(false);
  saved = await call(`${config}/po`, { method: 'PUT', body: { ...body, revision: 1 } });
  assert.equal(saved.revision, 2);
  const po = f.state().purchaseOrder[0];
  Object.assign(po, { createdById: 'maker', purchaseType: 'domestic', updatedAt: new Date('2026-10-01'),
    status: 'pending', accountingApproval: snapshot(), items: [
      { id: 'line', desc: 'Materials', qty: 100, unit: 'Pcs', unitPrice: 100, discount: 0 },
    ] });
  // AR adapters are intentionally not mounted. Empty sources suffice for inbox tests.
  for (const model of ['invoice', 'billingNote', 'receiptVoucher', 'creditNote']) f.prisma[model] = { findMany: async () => [] };
  const inbox = await call('/api/accounting-approvals/pending', { user: 'approver' });
  assert.equal(inbox.length, 1); assert.equal(inbox[0].docType, 'po'); assert.equal(inbox[0].step, 1);
  assert.equal((await call('/api/accounting-approvals/pending', { user: 'maker' })).length, 0);
  assert.equal((await call('/api/accounting-approvals/po/po', { user: 'approver' })).canApprove, true);
  assert.equal((await call('/api/accounting-approvals/po/po', { user: 'final' })).canApprove, false);
  await call('/api/accounting-approvals/po/missing', { user: 'approver', status: 404 });
  const act = (user, updatedAt, status = 200) => call('/api/ap/purchase-orders/po/approve', { method: 'POST', user, body: { updatedAt }, status });
  const revision = po.updatedAt.toISOString();
  await act('final', revision, 403);
  f.failAudit('purchase_order');
  await act('approver', revision, 500);
  assert.equal(currentCycle(f.state().purchaseOrder[0]).approvals.length, 0);
  f.failAudit(false);
  const intermediate = await act('approver', revision);
  assert.equal(intermediate.status, 'pending'); assert.equal(intermediate.approvalStep, 2);
  await act('final', revision, 409);
  const results = await Promise.all([
    fetch(base + '/api/ap/purchase-orders/po/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.token('final')}` }, body: JSON.stringify({ updatedAt: intermediate.updatedAt }) }),
    fetch(base + '/api/ap/purchase-orders/po/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.token('final')}` }, body: JSON.stringify({ updatedAt: intermediate.updatedAt }) }),
  ]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  assert.equal(currentCycle(f.state().purchaseOrder[0]).approvals.length, 2);
  assert.equal(f.state().stockMovement.length, 0);
});
