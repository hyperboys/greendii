const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(parts, imports = {}) {
  const filename = path.join(__dirname, '..', 'src', ...parts);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const model = load(['lib', 'contractor-payment.ts'], { './api': {} });
const dates = load(['lib', 'accounting-date.ts']);
test('PS routes select full pages and reject invalid action URLs', () => {
  const Component = () => null;
  const Page = load(['app', 'ap', 'vouchers', 'ps', '[...record]', 'page.tsx'], {
    'next/navigation': { notFound() { throw new Error('Not found'); } }, '@/components/contractor-payments': { ContractorPayments: Component },
  }).default;
  for (const [record, mode] of [[['new'], 'new'], [['ps'], 'view'], [['ps', 'edit'], 'edit']]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [['new', 'edit'], ['ps', 'approve'], ['ps', 'edit', 'extra']]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const List = load(['app', 'ap', 'vouchers', 'page.tsx'], {
    '@/components/contractor-payments': { ContractorPayments: Component }, '@/components/purchase-orders': { PurchaseOrders: () => null },
    '@/components/payment-vouchers': { PaymentVouchers: () => null },
    '@/components/cheque-payments': { ChequePayments: () => null },
    '@/components/goods-receipts': { GoodsReceipts: () => null },
  }).default;
  assert.equal(List({ searchParams: { tab: 'ps' } }).type, Component);
});
test('PS preview rounds identically to API and edit hydration preserves revision/rates/lines', () => {
  const form = { ...model.newPayment(), whtRate: 3, retentionRate: 5, items: [{ desc: 'Work', amount: '1000.01' }] };
  const totals = model.paymentPreview(form, 'VAT7%');
  assert.equal(totals.before, 1000.01); assert.equal(totals.vat, 70); assert.equal(totals.wht, 30); assert.equal(totals.retention, 50); assert.equal(totals.net, 990.01);
  assert.equal(model.paymentPreview(form, 'NO_VAT').net, 920.01);
  const doc = model.paymentForm({ ...form, docDate: '2026-10-26T00:00:00Z', updatedAt: 'revision', remark: null });
  assert.equal(doc.docDate, '2026-10-26'); assert.equal(doc.updatedAt, 'revision'); assert.equal(doc.items[0].amount, '1000.01');
});
test('PS form denies create/update independently and never uses a popup', () => {
  let create = false, update = false;
  const { ContractorPayments } = load(['components', 'contractor-payments.tsx'], {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/navigation': { useRouter: () => ({}) }, '@/lib/api': {}, '@/lib/auth': { getStoredUser: () => ({ id: 'maker' }) },
    '@/lib/contractor-payment': model, '@/lib/accounting-date': dates,
    '@/components/accounting-access-provider': { useAccountingAccess: () => ({}) },
    '@/lib/accounting-access': { canUseAccounting: (_access, _module, action) => action === 'create' ? create : action === 'update' ? update : false },
    '@/components/date-input': {}, '@/components/searchable-select': {},
    '@/components/contractor-payment-document': { ContractorPaymentPrintStyles: () => null },
  });
  const render = mode => renderToStaticMarkup(React.createElement(ContractorPayments, { mode }));
  assert.match(render('new'), /ไม่มีสิทธิ์/); assert.match(render('edit'), /ไม่มีสิทธิ์/);
  create = true; assert.match(render('new'), /กำลังโหลด/); assert.match(render('edit'), /ไม่มีสิทธิ์/);
  update = true; assert.doesNotMatch(render('edit'), /aria-modal|role="dialog"|ไม่มีสิทธิ์/);
});
test('PS plain-paper print includes saved identity, all rows once, final totals once and blank signatures', () => {
  const { ContractorPaymentDocument, paymentPrintPages } = load(['components', 'contractor-payment-document.tsx'], {
    '@/lib/accounting-date': dates, '@/lib/contractor-payment': model,
  });
  const doc = { ...model.newPayment(), docDate: '2026-10-26', psNo: 'PS2610001-R1', poNo: 'PO2610001', status: 'approved',
    vatConfig: 'VAT7%', supplierSnapshot: { name: 'Saved contractor', address: 'Saved address' },
    poAmount: 99999, previouslyRequestedAmount: 1000, remainingAmount: 90000, currentRequestAmount: 1000.01, vat: 70,
    wht: 30, retention: 50, whtRate: 3, retentionRate: 5, previouslyRetainedAmount: 100, netAmount: 990.01,
    items: Array.from({ length: 20 }, (_, i) => ({ desc: `UNIQUE-${i}-END`, amount: 50, remark: '' })) };
  assert.equal(paymentPrintPages(doc.items).length, 3);
  const html = renderToStaticMarkup(React.createElement(ContractorPaymentDocument, { document: doc, company: { companyName: 'Test company' } }));
  assert.equal((html.match(/class="ps-paper"/g) || []).length, 3);
  for (let i = 0; i < 20; i++) assert.equal((html.match(new RegExp(`UNIQUE-${i}-END`, 'g')) || []).length, 1);
  assert.equal((html.match(/990\.01/g) || []).length, 1);
  for (const text of ['Saved contractor', 'Saved address', 'PO2610001', '26/10/2026', 'หัก ณ ที่จ่าย', 'ประกันรวมถึงใบนี้', 'ผู้อนุมัติ']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<img|ยังใช้จ่ายเงินไม่ได้/);
  const draft = renderToStaticMarkup(React.createElement(ContractorPaymentDocument, { document: { ...doc, status: 'draft' }, company: {} }));
  assert.match(draft, /ยังใช้จ่ายเงินไม่ได้/);
});
