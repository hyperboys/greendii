const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(parts, imports = {}) {
  const filename = path.join(__dirname, '..', 'src', ...parts), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const calls = [], model = load(['lib', 'payment-voucher.ts'], { './api': { apiFetch: (...args) => { calls.push(args); return Promise.resolve({}); } } });
const dates = load(['lib', 'accounting-date.ts']);
test('PV separate routes reject extra actions; list dispatch and data-only API payloads', () => {
  const Component = () => null;
  const Page = load(['app', 'ap', 'vouchers', 'pv', '[...record]', 'page.tsx'], {
    'next/navigation': { notFound() { throw new Error('Not found'); } }, '@/components/payment-vouchers': { PaymentVouchers: Component },
  }).default;
  for (const [record, mode] of [[['new'], 'new'], [['pv'], 'view'], [['pv', 'edit'], 'edit']]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [['new', 'edit'], ['pv', 'pay'], ['pv', 'edit', 'extra']]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const List = load(['app', 'ap', 'vouchers', 'page.tsx'], {
    '@/components/payment-vouchers': { PaymentVouchers: Component }, '@/components/contractor-payments': {}, '@/components/purchase-orders': {},
    '@/components/cheque-payments': {},
  }).default;
  assert.equal(List({ searchParams: { tab: 'pv' } }).type, Component);
  const form = model.voucherForm({ ...model.newVoucher(), sourceDocId: 'ps', pvDate: '2026-10-26T00:00:00Z', updatedAt: 'revision', taxpayerType: null });
  assert.equal(form.pvDate, '2026-10-26'); assert.equal(form.updatedAt, 'revision'); assert.equal(form.taxpayerType, '');
  assert.equal('netPayment' in form, false);
  model.PaymentVouchersApi.action('a/b', 'pay', 'revision', { recipient: 'Receiver' });
  assert.equal(calls.at(-1)[0], '/api/ap/payment-vouchers/a%2Fb/pay');
  assert.equal(JSON.parse(calls.at(-1)[1].body).updatedAt, 'revision');
});
test('PV payment states and evidence categories cannot imply approval paid cash', () => {
  const doc = { lifecycleVersion: 1, status: 'approved', paidAt: null, reversedAt: null };
  assert.equal(model.voucherPaymentLabel(doc), 'อนุมัติแล้วรอจ่าย');
  assert.equal(model.voucherPaymentLabel({ ...doc, paidAt: 'date' }), 'จ่ายแล้ว');
  assert.equal(model.voucherPaymentLabel({ ...doc, paidAt: 'date', reversedAt: 'date' }), 'กลับรายการจ่ายแล้ว');
  const all = { create: true, update: true, pay: true, cancel: true };
  assert.deepEqual(Array.from(model.evidenceCategories(doc, all)), ['pv-payment']);
  assert.deepEqual(Array.from(model.evidenceCategories({ ...doc, paidAt: 'date' }, all)), ['pv-reversal']);
  assert.equal(model.evidenceCategories({ ...doc, paidAt: 'date' }, { ...all, cancel: false }).length, 0);
  for (const status of ['pending', 'cancelled', 'rejected']) assert.equal(model.evidenceCategories({ ...doc, status }, all).length, 0);
  assert.equal(model.evidenceCategories({ ...doc, lifecycleVersion: 0 }, all).length, 0);
  assert.equal(model.evidenceCategories({ ...doc, status: 'returned' }, { update: true }).length, 2);
});
test('PV form gates independent permissions and never creates popup route', () => {
  let create = false, update = false;
  const { PaymentVouchers } = load(['components', 'payment-vouchers.tsx'], {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) }, 'next/navigation': { useRouter: () => ({}) }, '@/lib/api': {}, '@/lib/auth': {},
    '@/lib/payment-voucher': model, '@/lib/accounting-date': dates, '@/components/accounting-access-provider': { useAccountingAccess: () => ({}) },
    '@/lib/accounting-access': { canUseAccounting: (_access, _module, action) => action === 'create' ? create : action === 'update' ? update : false },
    '@/components/date-input': {}, '@/components/searchable-select': {}, '@/components/payment-voucher-document': { PaymentVoucherPrintStyles: () => null },
  });
  const render = mode => renderToStaticMarkup(React.createElement(PaymentVouchers, { mode }));
  assert.match(render('new'), /ไม่มีสิทธิ์/); assert.match(render('edit'), /ไม่มีสิทธิ์/);
  create = true; assert.match(render('new'), /กำลังโหลด/); assert.match(render('edit'), /ไม่มีสิทธิ์/);
  update = true; assert.doesNotMatch(render('edit'), /aria-modal|role="dialog"|ไม่มีสิทธิ์/);
});
test('PV reference print includes exact rows once, balanced gross totals, tax/retention and blank codes/signatures', () => {
  const { PaymentVoucherDocument, voucherPrintPages } = load(['components', 'payment-voucher-document.tsx'], {
    '@/lib/accounting-date': dates, '@/lib/payment-voucher': model,
  });
  const doc = { ...model.newVoucher(), pvNo: 'PV26100001', sourceNo: 'PS2610001-R1', poNo: 'PO2610001', sourceDate: '2026-10-26',
    status: 'approved', paidAt: null, reversedAt: null, supplierSnapshot: { name: 'Saved contractor', address: 'Saved address', taxId: '1234567890123' },
    amountBeforeTax: 1000, vat: 70, wht: 30, otherDeduction: 50, netPayment: 990, chequePayments: [],
    items: Array.from({ length: 20 }, (_, i) => ({ desc: `UNIQUE-${i}-END`, amount: 50 })) };
  assert.equal(voucherPrintPages(doc.items).length, 3);
  const html = renderToStaticMarkup(React.createElement(PaymentVoucherDocument, { document: doc, company: { companyName: 'Company' } }));
  assert.equal((html.match(/class="pv-paper"/g) || []).length, 3);
  for (let i = 0; i < 20; i++) assert.equal((html.match(new RegExp(`UNIQUE-${i}-END`, 'g')) || []).length, 1);
  assert.equal((html.match(/1,070\.00/g) || []).length, 2); assert.equal((html.match(/990\.00/g) || []).length, 2);
  for (const text of ['PV26100001', 'PS2610001-R1', 'Saved contractor', 'Saved address', '26/10/2026', 'เงินประกันผลงาน', 'อนุมัติแล้วรอจ่าย', 'ไม่ลง GL', 'Prepared by', 'Posted by']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<img|คงเหลือจ่าย/);
});
