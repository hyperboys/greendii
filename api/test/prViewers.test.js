const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

function createFixture() {
  const users = [
    { id: 'admin', role: 'admin', active: true },
    { id: 'owner', role: 'sales', active: true },
    { id: 'viewer', role: 'observer', active: true },
    { id: 'other', role: 'observer', active: true },
    { id: 'approver', role: 'procurement', active: true },
    { id: 'inactive', role: 'observer', active: false },
  ];
  const types = [
    { id: 'type-a', name: 'Type A', approvalSteps: [3, 6], viewerIds: ['viewer'], active: true },
    { id: 'type-b', name: 'Type B', approvalSteps: [3, 6], viewerIds: [], active: true },
  ];
  const docs = ['draft', 'pending', 'approved', 'rejected', 'cancelled'].map((status, index) => ({
    id: status, prNo: `PR-${index}`, prTypeId: 'type-a', salesId: 'owner',
    status, approvalStep: status === 'pending' ? 3 : 0, active: true, approvalLogs: [],
    customer: 'Supplier A', projectRef: 'Project A', attachments: [], revisionNo: 0,
  }));
  docs.push(
    { ...docs[1], id: 'later-stage', approvalStep: 6 },
    { ...docs[2], id: 'old-revision', active: false },
    { ...docs[0], id: 'different-type', prTypeId: 'type-b' },
    { ...docs[0], id: 'no-type', prTypeId: null },
    { ...docs[2], id: 'past-approver', prTypeId: 'type-b', approvalLogs: [{ approverId: 'other', action: 'approve' }] },
  );
  const hydrate = doc => ({
    ...doc, sales: users.find(u => u.id === doc.salesId),
    prType: types.find(type => type.id === doc.prTypeId) || null, items: [],
  });
  function matches(value, where = {}) {
    return Object.entries(where).every(([key, filter]) => {
      if (key === 'AND') return filter.every(clause => matches(value, clause));
      if (key === 'OR') return filter.some(clause => matches(value, clause));
      if (filter && typeof filter === 'object') {
        if ('in' in filter) return filter.in.includes(value?.[key]);
        if ('has' in filter) return value?.[key]?.includes(filter.has) ?? false;
        if ('contains' in filter) return String(value?.[key] || '').toLowerCase().includes(filter.contains.toLowerCase());
        if ('some' in filter) return (value?.[key] || []).some(item => matches(item, filter.some));
        return value?.[key] != null && matches(value[key], filter);
      }
      return value?.[key] === filter;
    });
  }
  function project(value, select) {
    if (!select || value == null) return structuredClone(value);
    return Object.fromEntries(Object.entries(select).map(([key, config]) => {
      let result = value[key];
      if (config !== true && result != null) {
        result = Array.isArray(result)
          ? result.filter(item => matches(item, config.where)).map(item => project(item, config.select))
          : project(result, config.select);
      }
      return [key, structuredClone(result)];
    }));
  }
  const missing = () => { throw Object.assign(new Error('Not found'), { status: 404 }); };
  let writes = 0;
  let pdfRenders = 0;
  const prisma = {
    user: {
      findUnique: async ({ where }) => structuredClone(users.find(user => user.id === where.id)),
      findMany: async ({ where, select }) => users.filter(user => matches(user, where)).map(user => project(user, select)),
    },
    settings: { findUnique: async () => null },
    prType: {
      findMany: async ({ where }) => structuredClone(types.filter(type => matches(type, where))),
      create: async ({ data }) => {
        const item = { id: `type-${types.length}`, active: true, ...data };
        types.push(item);
        return structuredClone(item);
      },
      update: async ({ where, data }) => {
        const item = types.find(type => type.id === where.id) || missing();
        Object.assign(item, data);
        return structuredClone(item);
      },
    },
    purchaseRequest: {
      findUniqueOrThrow: async ({ where, select }) => project(hydrate(docs.find(doc => doc.id === where.id) || missing()), select),
      findMany: async ({ where, select, skip = 0, take }) =>
        docs.map(hydrate).filter(doc => matches(doc, where)).slice(skip, take === undefined ? undefined : skip + take)
          .map(doc => project(doc, select)),
      count: async ({ where }) => docs.map(hydrate).filter(doc => matches(doc, where)).length,
      update: async ({ where, data }) => {
        writes++;
        const doc = docs.find(doc => doc.id === where.id) || missing();
        Object.assign(doc, data);
        return structuredClone(doc);
      },
    },
    approvalLog: { create: async () => { writes++; return {}; } },
  };
  require.cache[require.resolve('../src/lib/prisma')] = { exports: prisma, loaded: true };
  require.cache[require.resolve('../src/lib/pdf')] = {
    exports: {
      getUiBaseUrl: () => 'http://ui.test',
      renderUrlToPdf: async () => { pdfRenders++; return Buffer.from('%PDF-test'); },
    }, loaded: true,
  };
  require.cache[require.resolve('../src/lib/notify')] = {
    exports: { notifyByRole: async () => {}, notifyUser: async () => {} }, loaded: true,
  };
  const app = express();
  app.use(express.json());
  app.use('/pr-types', require('../src/routes/prTypes'));
  app.use('/pr', require('../src/routes/pr'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  return { app, types, docs, writes: () => writes, pdfRenders: () => pdfRenders };
}

test('PR Type viewers have per-person, read-only access across the approval flow', async t => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'pr-viewer-isolated-tests';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const fixture = createFixture();
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, user = 'viewer', method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = async response => {
    assert.equal(response.status, 200);
    return response.json();
  };

  await t.test('lists only granted types across every status, with filters and accurate pagination', async () => {
    const list = await json(await request('/pr'));
    assert.deepEqual(list.map(doc => doc.id), ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'later-stage']);
    const page = await json(await request('/pr?page=2&pageSize=2'));
    assert.equal(page.total, 6);
    assert.deepEqual(page.data.map(doc => doc.id), ['approved', 'rejected']);
    const pending = await json(await request('/pr?status=pending'));
    assert.deepEqual(pending.map(doc => doc.id), ['pending', 'later-stage']);
    assert.deepEqual((await json(await request('/pr?active=false'))).map(doc => doc.id), ['old-revision']);
    assert.equal((await json(await request('/pr?q=Type%20A'))).length, 6);
    assert.equal((await json(await request('/pr?q=Type%20B'))).length, 0);
    assert.equal((await request('/pr', null)).status, 401);
    assert.equal((await request('/pr', 'inactive')).status, 401);
  });

  await t.test('detail and PDF allow the named viewer only, not another user with the same role', async () => {
    for (const id of ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'later-stage', 'old-revision']) {
      assert.equal((await request(`/pr/${id}`)).status, 200);
      const pdf = await request(`/pr/${id}/pdf`);
      assert.equal(pdf.status, 200);
      assert.equal(pdf.headers.get('content-type'), 'application/pdf');
      assert.equal(await pdf.text(), '%PDF-test');
      assert.equal((await request(`/pr/${id}`, 'other')).status, 403);
      assert.equal((await request(`/pr/${id}/pdf`, 'other')).status, 403);
    }
    assert.equal(fixture.pdfRenders(), 7);
    for (const id of ['different-type', 'no-type']) {
      assert.equal((await request(`/pr/${id}`)).status, 403);
      assert.equal((await request(`/pr/${id}/pdf`)).status, 403);
    }
  });

  await t.test('viewing grants no write or approval rights', async () => {
    for (const action of ['approve', 'reject']) {
      assert.equal((await request(`/pr/pending/${action}`, 'viewer', 'POST', {})).status, 403);
      assert.equal((await request(`/pr/later-stage/${action}`, 'viewer', 'POST', {})).status, 403);
    }
    assert.equal((await request('/pr/draft', 'viewer', 'PUT', { prTypeId: 'type-a', customer: 'Changed' })).status, 403);
    assert.equal((await request('/pr/draft', 'viewer', 'DELETE')).status, 403);
    assert.equal((await request('/pr/approved/revise', 'viewer', 'POST', { revisionReason: 'No access' })).status, 403);
    assert.equal((await request('/pr/draft/submit', 'viewer', 'POST', {})).status, 403);
    assert.equal((await request('/pr-types/type-a', 'viewer', 'PUT', { viewerIds: ['other'] })).status, 403);
    assert.equal((await request('/pr-types', 'viewer', 'POST', { name: 'No access' })).status, 403);
    assert.equal((await request('/pr-types/type-a', 'viewer', 'DELETE')).status, 403);
    assert.equal(fixture.writes(), 0);
  });

  await t.test('existing owner, prior approver, current approver and bypass visibility stays intact', async () => {
    assert.equal((await request('/pr/different-type', 'owner')).status, 200);
    assert.equal((await request('/pr/past-approver', 'other')).status, 200);
    assert.equal((await request('/pr/later-stage', 'approver')).status, 200);
    assert.equal((await request('/pr/pending', 'approver')).status, 403);
    assert.equal((await request('/pr/no-type', 'admin')).status, 200);
    assert.deepEqual((await json(await request('/pr', 'other'))).map(doc => doc.id), ['past-approver']);
    assert.deepEqual((await json(await request('/pr', 'approver'))).map(doc => doc.id), ['later-stage']);
  });

  await t.test('admin can create, replace and remove viewers; omitted fields preserve assignments', async () => {
    const created = await request('/pr-types', 'admin', 'POST', {
      name: 'New type', approvalSteps: [3, 6], viewerIds: ['viewer', 'viewer', 'other'],
    });
    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).viewerIds, ['viewer', 'other']);
    for (const value of [null, 'viewer', [null], [''], ['missing-user'], [123]]) {
      assert.equal((await request('/pr-types/type-a', 'admin', 'PUT', { viewerIds: value })).status, 400);
      assert.equal((await request('/pr-types', 'admin', 'POST', { name: 'Invalid', viewerIds: value })).status, 400);
    }
    assert.deepEqual(fixture.types[0].viewerIds, ['viewer']);
    await json(await request('/pr-types/type-a', 'admin', 'PUT', { sortOrder: 5, active: false }));
    assert.deepEqual(fixture.types[0].viewerIds, ['viewer']);
    assert.equal((await request('/pr/draft')).status, 200);
    const typeList = await json(await request('/pr-types'));
    assert.deepEqual(typeList.find(type => type.id === 'type-a').viewerIds, ['viewer']);
    await json(await request('/pr-types/type-a', 'admin', 'PUT', { viewerIds: ['other'] }));
    assert.equal((await request('/pr/draft')).status, 403);
    assert.equal((await request('/pr/draft/pdf')).status, 403);
    assert.deepEqual(await json(await request('/pr')), []);
    assert.equal((await request('/pr/draft', 'other')).status, 200);
    fixture.docs[0].prTypeId = 'type-b';
    assert.equal((await request('/pr/draft', 'other')).status, 403);
    await json(await request('/pr-types/type-a', 'admin', 'PUT', { viewerIds: [] }));
    assert.equal((await request('/pr/pending', 'other')).status, 403);
    assert.equal((await request('/pr/past-approver', 'other')).status, 200);
    assert.equal((await request('/pr/pending', 'owner')).status, 200);
  });
});
