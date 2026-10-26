const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(parts, imports = {}) {
  const filename = path.join(__dirname, '..', 'src', ...parts), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, URLSearchParams, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const dates = load(['lib', 'accounting-date.ts']), csv = load(['lib', 'master-data.ts']);
const calls = [], csvExports = [];
const model = load(['lib', 'cheque-payment.ts'], { './api': { apiFetch: (...args) => { calls.push(args); return Promise.resolve({}); } },
  './master-data': { exportMasterCsv: (...args) => csvExports.push(args) }, './accounting-date': dates });
test('CQ strict full-page routes list dispatch and typed hydration', () => {
  const Component = () => null;
  const Page = load(['app', 'ap', 'vouchers', 'cq', '[...record]', 'page.tsx'], {
    'next/navigation': { notFound() { throw new Error('Not found'); } }, '@/components/cheque-payments': { ChequePayments: Component },
  }).default;
  for (const [record, mode] of [[['new'], 'new'], [['cq'], 'view'], [['cq', 'edit'], 'edit']]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [['new', 'edit'], ['cq', 'pay'], ['cq', 'edit', 'extra']]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const List = load(['app', 'ap', 'vouchers', 'page.tsx'], {
    '@/components/cheque-payments': { ChequePayments: Component }, '@/components/payment-vouchers': {}, '@/components/contractor-payments': {}, '@/components/purchase-orders': {},
    '@/components/goods-receipts': {},
  }).default;
  assert.equal(List({ searchParams: { tab: 'cq' } }).type, Component);
  const form = model.chequeForm({ ...model.newCheque(), docDate: '2026-10-26T00:00:00Z', chequeDate: '2026-11-01T00:00:00Z', updatedAt: 'revision', remark: null });
  assert.equal(form.docDate, '2026-10-26'); assert.equal(form.chequeDate, '2026-11-01'); assert.equal(form.updatedAt, 'revision'); assert.equal('amount' in form, false);
  model.ChequePaymentsApi.status({ id: 'a/b', updatedAt: 'revision' }, 'Released', { recipient: 'Receiver' });
  assert.equal(calls.at(-1)[0], '/api/ap/cheque-payments/a%2Fb/status');
  assert.equal(JSON.parse(calls.at(-1)[1].body).updatedAt, 'revision');
});
test('CQ next actions and evidence follow lifecycle and independent permissions', () => {
  const doc = { lifecycleVersion: 1, status: 'Prepared', releaseDate: null }, all = { create: true, update: true, approve: true, pay: true, cancel: true };
  assert.deepEqual(Array.from(model.chequeActions(doc, all)), ['Printed', 'Cancelled']);
  assert.deepEqual(Array.from(model.chequeActions({ ...doc, status: 'Printed' }, { approve: true })), ['Signed']);
  assert.deepEqual(Array.from(model.chequeActions({ ...doc, status: 'Signed' }, { pay: true })), ['Released']);
  assert.equal(model.chequeActions({ ...doc, status: 'Released', releaseDate: 'date' }, { cancel: true }).length, 0);
  assert.deepEqual(Array.from(model.chequeEvidence({ ...doc, status: 'Released', releaseDate: 'date' }, all)), ['cq-clear', 'cq-reversal']);
  for (const state of [{ ...doc, status: 'Cancelled' }, { ...doc, lifecycleVersion: 0 }]) {
    assert.equal(model.chequeActions(state, all).length, 0); assert.equal(model.chequeEvidence(state, all).length, 0);
  }
});
test('CQ create edit permissions independent and no popup UI', () => {
  let create = false, update = false;
  const { ChequePayments } = load(['components', 'cheque-payments.tsx'], {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) }, 'next/navigation': { useRouter: () => ({}) }, '@/lib/api': {},
    '@/lib/cheque-payment': model, '@/lib/accounting-date': dates, './accounting-access-provider': { useAccountingAccess: () => ({}) },
    '@/lib/accounting-access': { canUseAccounting: (_access, _module, action) => action === 'create' ? create : action === 'update' ? update : false },
    './date-input': {}, './searchable-select': {}, './cheque-payment-document': { ChequePaymentPrintStyles: () => null },
  });
  const render = mode => renderToStaticMarkup(React.createElement(ChequePayments, { mode }));
  assert.match(render('new'), /ไม่มีสิทธิ์/); assert.match(render('edit'), /ไม่มีสิทธิ์/);
  create = true; assert.match(render('new'), /กำลังโหลด/); assert.match(render('edit'), /ไม่มีสิทธิ์/);
  update = true; assert.doesNotMatch(render('edit'), /aria-modal|role="dialog"|ไม่มีสิทธิ์/);
});
test('CQ A4 details not bank overprint include saved identity stages cancellation and blank signatures', () => {
  const { ChequePaymentDocument } = load(['components', 'cheque-payment-document.tsx'], {
    '@/lib/accounting-date': dates, '@/lib/cheque-payment': model,
  });
  const doc = { ...model.newCheque(), cqNo: 'CQ26100001', pvNo: 'PV26100001', docDate: '2026-10-26', chequeDate: '2026-11-01', chequeNo: '000001',
    bankName: 'Company bank', bankBranch: 'Main branch', bankAccountNo: '001234567', payee: 'Saved payee', status: 'Cancelled', amount: '990.01',
    signedAt: '2026-10-26', releaseDate: '2026-10-26', clearedAt: '2026-11-01', cancelledAt: '2026-11-02', cancellationReason: 'Funds returned', reversalReference: 'RET',
    voucherSnapshot: { sourceNo: 'PS1', poNo: 'PO1', supplier: { name: 'Saved supplier' } } };
  const html = renderToStaticMarkup(React.createElement(ChequePaymentDocument, { document: doc, company: { companyName: 'Company' } }));
  for (const text of ['CQ26100001', 'PV26100001', 'Saved payee', 'Saved supplier', '26/10/2026', '01/11/2026', 'Funds returned', 'RET', 'ไม่ใช่เช็คธนาคาร', 'ไม่ลง GL', 'ผู้รับเช็ค']) assert.ok(html.includes(text), text);
  assert.equal((html.match(/990\.01/g) || []).length, 1); assert.doesNotMatch(html, /<img/);
  model.exportCheques([{ ...doc, payee: '=DANGER', remark: '@formula' }]);
  const output = csv.masterCsv(csvExports.at(-1)[1]);
  assert.ok(output.startsWith('\ufeff')); assert.ok(output.includes("'=DANGER")); assert.ok(output.includes("'@formula"));
  assert.ok(output.includes('000001')); assert.ok(output.includes('001234567'));
  model.ChequePaymentsApi.all({ q: 'find', status: 'Cancelled', page: '3' });
  assert.equal(calls.at(-1)[0], '/api/ap/cheque-payments?q=find&status=Cancelled');
});
