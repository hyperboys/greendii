const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test');
const vm = require('node:vm'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function load(parts, imports = {}, globals = {}) {
  const filename = path.join(__dirname, '..', 'src', ...parts), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, ...globals,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const dates = load(['lib', 'accounting-date.ts']), calls = [], csv = [];
const issues = load(['lib', 'stock-issue.ts'], { './api': {}, './master-data': {}, './accounting-date': dates });
const lib = load(['lib', 'stock-return.ts'], { './api': { apiFetch: (...args) => { calls.push(args); return Promise.resolve(); } },
  './stock-issue': issues, './accounting-date': dates, './master-data': { exportMasterCsv: (...args) => csv.push(args) } });
test('SR strict separate routes and server query dispatch; returns retain default balance tab', () => {
  const Component = () => null, Other = () => null;
  const Page = load(['app', 'inventory', 'returns', '[...record]', 'page.tsx'], { 'next/navigation': { notFound() { throw Error('Not found'); } },
    '@/components/stock-returns': { StockReturns: Component } }).default;
  assert.equal(Page({ params: { record: ['new'] } }).props.mode, 'new');
  assert.equal(Page({ params: { record: ['sr', 'edit'] } }).props.recordId, 'sr');
  assert.equal(Page({ params: { record: ['sr'] } }).props.mode, 'view');
  for (const record of [['new', 'edit'], ['sr', 'delete'], ['sr', 'edit', 'extra']]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const nav = load(['lib', 'accounting-navigation.ts']);
  const List = load(['app', 'inventory', 'page.tsx'], { '@/components/inventory-data': { InventoryData: Other },
    '@/components/stock-issues': { StockIssues: Other }, '@/components/stock-returns': { StockReturns: Component }, '@/lib/accounting-navigation': nav }).default;
  assert.equal(List({ searchParams: { tab: 'returns' } }).type, Component);
  assert.equal(List({ searchParams: {} }).props.activeTab, 'balances');
});
test('SR source capacity hydration typed action physical removal revision and all-filtered CSV endpoint', async () => {
  const doc = { id: 'sr', stockIssueId: 'is', returnDate: '2026-10-26', sender: 'Sender', receiver: 'Receiver', returnReason: 'Unused',
    updatedAt: 'revision', items: [{ stockIssueLineId: 'line', returnedQty: '0.125' }] };
  assert.equal(lib.returnForm(doc).items[0].returnedQty, '0.125');
  await lib.StockReturnsApi.action(doc, 'cancel', 'Reason', '2026-10-27', true);
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { updatedAt: 'revision', reason: 'Reason', cancellationDate: '2026-10-27', physicalRemovalConfirmed: true });
  await lib.StockReturnsApi.source('is', 'sr'); assert.equal(calls.at(-1)[0], '/api/inventory/returns/sources/is?excludeId=sr');
  await lib.StockReturnsApi.all({ q: 'IS', status: 'approved' }); assert.equal(calls.at(-1)[0], '/api/inventory/returns?q=IS&status=approved');
  assert.equal(lib.returnStatuses.approved, 'อนุมัติ / รับคืนแล้ว');
});
test('SR independent action policy forbids own approval admin legacy and viewer form', () => {
  const doc = { status: 'pending', lifecycleVersion: 1, createdById: 'maker' }, can = { create: false, approve: true, cancel: false };
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(lib.availableReturnActions(doc, can, 'reviewer')), ['approve', 'return', 'reject']);
  assert.deepEqual(plain(lib.availableReturnActions(doc, can, 'maker')), ['return', 'reject']);
  assert.deepEqual(plain(lib.availableReturnActions({ ...doc, lifecycleVersion: 0 }, can, 'admin')), []);
  const { StockReturns } = load(['components', 'stock-returns.tsx'], {
    'next/link': { default: () => null }, 'next/navigation': { useRouter: () => ({}) }, '@/lib/api': {}, '@/lib/auth': {},
    '@/lib/accounting-access': { canUseAccounting: () => false }, '@/components/accounting-access-provider': { useAccountingAccess: () => ({}) },
    '@/components/searchable-select': {}, '@/components/date-input': {}, '@/lib/accounting-date': dates,
    '@/components/stock-return-document': {}, '@/lib/stock-return': lib,
  });
  const html = renderToStaticMarkup(React.createElement(StockReturns, { mode: 'new' }));
  assert.match(html, /ไม่มีสิทธิ์สร้าง\/แก้ใบคืน/); assert.doesNotMatch(html, /<form/);
});
test('SR A4 repeats headers every row once saved source quantities good-only and blank signatures; CSV snapshots', () => {
  const { StockReturnDocument } = load(['components', 'stock-return-document.tsx'], {
    '@/lib/accounting-date': dates, '@/lib/stock-return': lib, './stock-issue-document': {},
  });
  const doc = { id: 'sr', returnNo: 'SR26100001', returnDate: '2026-10-26', status: 'approved', warehouseSnapshot: { name: 'Saved Warehouse' },
    issueSnapshot: { issueNo: 'Saved IS' }, sender: 'Sender', receiver: 'Receiver', returnReason: 'Unused',
    items: Array.from({ length: 17 }, (_, seq) => ({ id: `row-${seq}`, seq, productId: `p-${seq}`,
      productSnapshot: { code: 'MAT', name: `ITEM-${seq}-END`, unit: 'Pcs' }, issuedQty: 5, returnedQty: 3, remainingQty: 2 })) };
  const html = renderToStaticMarkup(React.createElement(StockReturnDocument, { document: doc, company: { companyName: 'Company' } }));
  assert.equal((html.match(/class="is-paper"/g) || []).length, 3);
  for (let i = 0; i < 17; i++) assert.equal(html.split(`ITEM-${i}-END`).length - 1, 1);
  assert.match(html, /Saved Warehouse/); assert.match(html, /Saved IS/); assert.match(html, /ลงชื่อ __________________/); assert.match(html, /ไม่รับของชำรุด/);
  lib.exportReturns([doc]); assert.equal(csv[0][1][0].SR, 'SR26100001'); assert.equal(csv[0][1][0].IS, 'Saved IS');
});
test('SR multipart no JSON content type and binds exact return revision category', async () => {
  let request;
  const api = load(['lib', 'stock-return.ts'], { './api': { getAuthHeaders: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test' }) },
    './stock-issue': issues, './master-data': {}, './accounting-date': {} }, { Headers, FormData,
    fetch: async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => [] }; } }).StockReturnsApi;
  await api.upload({ id: 'sr', updatedAt: 'revision' }, []);
  assert.equal(request.headers.get('content-type'), null); assert.equal(request.headers.get('authorization'), 'Bearer test');
  assert.equal(request.body.get('stockReturnId'), 'sr'); assert.equal(request.body.get('updatedAt'), 'revision'); assert.equal(request.body.get('category'), 'stock-return');
});
