const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test');
const vm = require('node:vm'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function load(parts, imports = {}) {
  const filename = path.join(__dirname, '..', 'src', ...parts);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const calls = [], csv = [];
const dates = load(['lib', 'accounting-date.ts']);
const lib = load(['lib', 'goods-receipt.ts'], { '@/lib/api': { apiFetch: (...args) => { calls.push(args); return Promise.resolve(); } },
  './api': { apiFetch: (...args) => { calls.push(args); return Promise.resolve(); } },
  './master-data': { exportMasterCsv: (...args) => csv.push(args) }, './accounting-date': dates });
const plain = value => JSON.parse(JSON.stringify(value));
test('GR routes list dispatch and strict new/view/edit URL shape', () => {
  const Component = () => null;
  const Page = load(['app', 'ap', 'vouchers', 'gr', '[...record]', 'page.tsx'], {
    'next/navigation': { notFound() { throw Error('Not found'); } }, '@/components/goods-receipts': { GoodsReceipts: Component },
  }).default;
  assert.equal(Page({ params: { record: ['new'] } }).props.mode, 'new');
  assert.equal(Page({ params: { record: ['gr', 'edit'] } }).props.recordId, 'gr');
  for (const record of [['new', 'edit'], ['gr', 'delete'], ['gr', 'edit', 'extra']]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const List = load(['app', 'ap', 'vouchers', 'page.tsx'], {
    '@/components/goods-receipts': { GoodsReceipts: Component }, '@/components/purchase-orders': {}, '@/components/contractor-payments': {},
    '@/components/payment-vouchers': {}, '@/components/cheque-payments': {},
  }).default;
  assert.equal(List({ searchParams: { tab: 'gr' } }).type, Component);
});
test('GR typed hydration independent permissions self-approval legacy and revision API', async () => {
  const doc = { id: 'gr', status: 'pending', lifecycleVersion: 1, createdById: 'maker', updatedAt: 'revision',
    receiptDate: '2026-10-26T00:00:00Z', poId: 'po', warehouseId: null, items: [{ poLineId: 'line', productId: 'p', currentReceiptQty: '0.125' }] };
  assert.equal(lib.receiptForm(doc).items[0].currentReceiptQty, '0.125');
  assert.equal(lib.receiptForm(doc).warehouseId, '');
  const can = { create: false, approve: true, cancel: false };
  assert.deepEqual(plain(lib.availableReceiptActions(doc, can, 'reviewer')), ['approve', 'return', 'reject']);
  assert.deepEqual(plain(lib.availableReceiptActions(doc, can, 'maker')), ['return', 'reject']);
  assert.deepEqual(plain(lib.availableReceiptActions({ ...doc, lifecycleVersion: 0 }, can, 'reviewer')), []);
  await lib.GoodsReceiptsApi.action(doc, 'cancel', 'Reason', '2026-10-27');
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { updatedAt: 'revision', reason: 'Reason', cancellationDate: '2026-10-27' });
  await lib.GoodsReceiptsApi.all({ q: 'PO', status: 'approved' });
  assert.equal(calls.at(-1)[0], '/api/ap/goods-receipts?q=PO&status=approved');
});
test('GR full pages hide forms from viewers and have evidence source and posting guards wired', () => {
  const { GoodsReceipts } = load(['components', 'goods-receipts.tsx'], {
    'next/link': { default: () => null }, 'next/navigation': { useRouter: () => ({}) }, '@/lib/api': {},
    '@/lib/auth': {}, '@/lib/accounting-access': { canUseAccounting: () => false },
    '@/components/accounting-access-provider': { useAccountingAccess: () => ({}) }, '@/components/searchable-select': {},
    '@/components/date-input': {}, '@/lib/accounting-date': dates, '@/lib/goods-receipt': lib, '@/components/goods-receipt-document': {},
  });
  const html = renderToStaticMarkup(React.createElement(GoodsReceipts, { mode: 'new' }));
  assert.match(html, /ไม่มีสิทธิ์สร้าง\/แก้ GR/); assert.doesNotMatch(html, /<form/);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'goods-receipts.tsx'), 'utf8');
  assert.match(source, /api\.all\(\{ q: query.q, status: query.status \}\)/);
  assert.match(source, /min="0.001" step="0.001"/);
  assert.match(source, /api\.update\(doc.id, \{ \.\.\.form, updatedAt: doc.updatedAt \}\)/);
  assert.match(source, /product\.unit\?\.trim\(\) === line.unit\?\.trim\(\)/);
});
test('GR A4 pages retain every line snapshot and clear signatures; CSV uses protected shared serializer', () => {
  const { GoodsReceiptDocument } = load(['components', 'goods-receipt-document.tsx'], {
    '@/lib/accounting-date': dates, '@/lib/goods-receipt': lib,
  });
  const doc = { id: 'gr', grNo: 'GR26100001', poNo: 'PO2610001', receiptDate: '2026-10-26', status: 'approved',
    supplierSnapshot: { name: 'Saved supplier' }, warehouseSnapshot: { name: 'Main' },
    items: Array.from({ length: 17 }, (_, seq) => ({ id: `line-${seq}`, seq, desc: `ITEM-${seq}-END`, unit: 'Pcs',
      productSnapshot: { code: 'MAT', name: 'Material', productType: 'stored' }, orderedQty: 10, previouslyReceivedQty: 0, pendingQty: 0, currentReceiptQty: 6, remainingQty: 4 })) };
  const html = renderToStaticMarkup(React.createElement(GoodsReceiptDocument, { document: doc, company: { companyName: 'Company' } }));
  assert.equal((html.match(/class="gr-paper"/g) || []).length, 3);
  for (let i = 0; i < 17; i++) assert.equal(html.split(`ITEM-${i}-END`).length - 1, 1);
  assert.match(html, /ลงชื่อ __________________/); assert.match(html, /Saved supplier/);
  lib.exportReceipts([doc]); assert.equal(csv[0][1][0].GR, 'GR26100001');
  const csvLib = load(['lib', 'master-data.ts']);
  assert.match(csvLib.masterCsv([{ name: '=FORMULA' }]), /'=FORMULA/);
});
