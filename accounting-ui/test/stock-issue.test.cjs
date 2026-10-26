const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test');
const vm = require('node:vm'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function load(parts, imports = {}, globals = {}) {
  const filename = path.join(__dirname, '..', 'src', ...parts), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, ...globals,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const calls = [], csv = [], dates = load(['lib', 'accounting-date.ts']);
const lib = load(['lib', 'stock-issue.ts'], { './api': { apiFetch: (...args) => { calls.push(args); return Promise.resolve(); } },
  './master-data': { exportMasterCsv: (...args) => csv.push(args) }, './accounting-date': dates });
const plain = value => JSON.parse(JSON.stringify(value));
test('IS full-page strict new/view/edit URLs and inventory issue tab replace immediate-posting popup', () => {
  const Component = () => null;
  const Page = load(['app', 'inventory', 'issues', '[...record]', 'page.tsx'], { 'next/navigation': { notFound() { throw Error('Not found'); } }, '@/components/stock-issues': { StockIssues: Component } }).default;
  assert.equal(Page({ params: { record: ['new'] } }).props.mode, 'new');
  assert.equal(Page({ params: { record: ['is', 'edit'] } }).props.recordId, 'is');
  for (const record of [['new', 'edit'], ['is', 'delete'], ['is', 'edit', 'extra']]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const nav = load(['lib', 'accounting-navigation.ts']);
  const List = load(['app', 'inventory', 'page.tsx'], { '@/components/inventory-data': { InventoryData: Component },
    '@/lib/accounting-navigation': nav, '@/components/stock-issues': { StockIssues: Component }, '@/components/stock-returns': { StockReturns: Component } }).default;
  assert.equal(List({ searchParams: { tab: 'issues' } }).type, Component);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'inventory', 'page.tsx'), 'utf8');
  assert.doesNotMatch(source, /showIssueModal|createIssue|accounting-modal/);
});
test('IS quantity preview and hydration preserve requested issued cancelled and zero planned issues', async () => {
  assert.equal(lib.cancelledIssueQty({ requestedQty: '10', issuedQty: '5' }), 5);
  assert.equal(lib.cancelledIssueQty({ requestedQty: '0.3', issuedQty: '0.1' }), 0.2);
  assert.equal(lib.cancelledIssueQty({ requestedQty: '2', issuedQty: '0' }), 2);
  for (const issuedQty of ['-1', '11', '', 'oops']) assert.equal(lib.cancelledIssueQty({ requestedQty: '10', issuedQty }), null);
  const doc = { id: 'is', issueDate: '2026-10-26T00:00:00Z', warehouseId: 'main', workOrderId: null, updatedAt: 'revision',
    items: [{ productId: 'mat', requestedQty: '10', issuedQty: '0' }] };
  assert.equal(lib.issueForm(doc).items[0].issuedQty, '0'); assert.equal(lib.issueForm(doc).updatedAt, 'revision');
  await lib.StockIssuesApi.action(doc, 'cancel', 'Reason', '2026-10-27', true);
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { updatedAt: 'revision', reason: 'Reason', cancellationDate: '2026-10-27', physicalReturnConfirmed: true });
  await lib.StockIssuesApi.all({ q: 'WO', status: 'approved' }); assert.equal(calls.at(-1)[0], '/api/inventory/issues?q=WO&status=approved');
});
test('IS independent permissions prohibit creator admin and legacy actions; viewer cannot render form', () => {
  const doc = { status: 'pending', lifecycleVersion: 1, createdById: 'maker' }, can = { create: false, approve: true, cancel: false };
  assert.deepEqual(plain(lib.availableIssueActions(doc, can, 'reviewer')), ['approve', 'return', 'reject']);
  assert.deepEqual(plain(lib.availableIssueActions(doc, can, 'maker')), ['return', 'reject']);
  assert.deepEqual(plain(lib.availableIssueActions({ ...doc, lifecycleVersion: 0 }, can, 'admin')), []);
  assert.deepEqual(plain(lib.availableIssueActions({ ...doc, status: 'approved' }, { ...can, cancel: true }, 'canceller')), ['cancel']);
  const { StockIssues } = load(['components', 'stock-issues.tsx'], {
    'next/link': { default: () => null }, 'next/navigation': { useRouter: () => ({}) }, '@/lib/api': {}, '@/lib/auth': {},
    '@/lib/accounting-access': { canUseAccounting: () => false }, '@/components/accounting-access-provider': { useAccountingAccess: () => ({}) },
    '@/components/searchable-select': {}, '@/components/date-input': {}, '@/lib/accounting-date': dates,
    '@/components/stock-issue-document': {}, '@/lib/stock-issue': lib,
  });
  const html = renderToStaticMarkup(React.createElement(StockIssues, { mode: 'new' }));
  assert.match(html, /ไม่มีสิทธิ์สร้าง\/แก้ใบเบิก/); assert.doesNotMatch(html, /<form/);
});
test('IS A4 snapshots every row once blank signatures correct quantities and CSV uses shared serializer', () => {
  const { StockIssueDocument } = load(['components', 'stock-issue-document.tsx'], { '@/lib/accounting-date': dates, '@/lib/stock-issue': lib });
  const doc = { id: 'is', issueNo: 'IS26100001', issueDate: '2026-10-26', status: 'approved', warehouseSnapshot: { name: 'Saved Warehouse' }, workOrderSnapshot: { woNo: 'WO-1', project: 'Saved Site' },
    requester: 'Requester', receiver: 'Receiver', items: Array.from({ length: 17 }, (_, seq) => ({ id: `row-${seq}`, seq, productId: `p-${seq}`,
      productSnapshot: { code: 'MAT', name: `ITEM-${seq}-END`, unit: 'Pcs' }, requestedQty: 10, issuedQty: 5, cancelledQty: 5 })) };
  const html = renderToStaticMarkup(React.createElement(StockIssueDocument, { document: doc, company: { companyName: 'Company' } }));
  assert.equal((html.match(/class="is-paper"/g) || []).length, 3);
  for (let i = 0; i < 17; i++) assert.equal(html.split(`ITEM-${i}-END`).length - 1, 1);
  assert.match(html, /Saved Warehouse/); assert.match(html, /ลงชื่อ __________________/); assert.match(html, /ไม่มีค้างส่ง/);
  lib.exportIssues([doc]); assert.equal(csv[0][1][0].IS, 'IS26100001');
});
test('IS multipart upload omits JSON Content-Type and preserves issue binding revision and category', async () => {
  let request;
  const api = load(['lib', 'stock-issue.ts'], { './api': { getAuthHeaders: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test' }) },
    './master-data': {}, './accounting-date': {} }, { Headers, FormData, fetch: async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => [] }; } }).StockIssuesApi;
  await api.upload({ id: 'is', updatedAt: 'revision' }, []);
  assert.equal(request.headers.get('content-type'), null); assert.equal(request.headers.get('authorization'), 'Bearer test');
  assert.equal(request.body.get('stockIssueId'), 'is'); assert.equal(request.body.get('updatedAt'), 'revision'); assert.equal(request.body.get('category'), 'stock-issue');
});
