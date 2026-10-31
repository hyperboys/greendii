const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(parts, imports = {}) {
  const filename = path.join(__dirname, "..", "src", ...parts);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const model = load(["lib", "receipt-voucher.ts"]);
const dates = load(["lib", "accounting-date.ts"]);
test("RV full-page direct routes support new/view/edit and reject invalid routes", () => {
  const Component = () => null;
  const Page = load(["app", "ar", "receipts", "[...record]", "page.tsx"], {
    "next/navigation": { notFound() { throw new Error("Not found"); } }, "@/components/receipt-vouchers": { ReceiptVouchers: Component },
  }).default;
  for (const [record, mode] of [[["new"], "new"], [["rv"], "view"], [["rv", "edit"], "edit"]]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [["new", "edit"], ["rv", "confirm"], ["rv", "edit", "extra"]]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const List = load(["app", "ar", "receipts", "page.tsx"], { "@/components/receipt-vouchers": { ReceiptVouchers: Component } }).default;
  assert.equal(List().type, Component);
});
test("RV satang settlement includes WHT and company fee; hydration preserves saved allocations/revision", () => {
  const totals = model.receiptTotals([{ receivedAmount: "960", whtAmount: "30", bankFee: "10" }]);
  assert.equal(totals.settled, 1000);
  assert.equal(model.receiptTotals([{ receivedAmount: "0.10", whtAmount: "0.20", bankFee: "0.01" }]).settled, 0.31);
  const form = model.receiptForm({ ...model.newReceipt(), updatedAt: "revision", receiptDate: "2026-10-25T00:00:00Z",
    bankName: null, allocations: [{ invoiceId: "i", receivedAmount: "10.01", whtAmount: "0", bankFee: "0.02", billingNote: { biNo: "BI1" } }] });
  assert.equal(form.receiptDate, "2026-10-25"); assert.equal(form.updatedAt, "revision"); assert.equal(form.bankName, "");
  assert.equal(form.allocations[0].biNo, "BI1"); assert.equal(form.allocations[0].receivedAmount, "10.01");
  assert.match(model.receiptStatus({ status: "approved", lifecycleVersion: 0 }), /Legacy/);
  const bi = load(["lib", "billing-note.ts"]);
  assert.match(bi.billingStatus({ status: "approved", lifecycleVersion: 1, completedAt: "now" }), /รับชำระครบ/);
});
test("RV creation is full page and cannot render editable form for viewers", () => {
  let write = true;
  const { ReceiptVouchers } = load(["components", "receipt-vouchers.tsx"], {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/api": {}, "@/lib/account-customers": {},
    "@/lib/receipt-voucher": model, "@/lib/accounting-date": dates,
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) }, "@/lib/accounting-access": { canUseAccounting: () => write },
    "@/components/date-input": {}, "@/components/searchable-select": {}, "@/components/receipt-voucher-document": { ReceiptPrintStyles: () => null },
  });
  const render = () => renderToStaticMarkup(React.createElement(ReceiptVouchers, { mode: "new" }));
  assert.match(render(), /กำลังโหลด/); assert.doesNotMatch(render(), /aria-modal|role="dialog"/);
  write = false; assert.match(render(), /ไม่มีสิทธิ์สร้างหรือแก้ไขใบสำคัญรับ/); assert.doesNotMatch(render(), /<form/);
});
test("RV print matches journal grid without fabricated account codes, balances debit/credit and paginates every invoice once", () => {
  const { ReceiptVoucherDocument, receiptPrintPages } = load(["components", "receipt-voucher-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/receipt-voucher": model,
  });
  const doc = { ...model.newReceipt(), rvNo: "RV-TEST", status: "approved", lifecycleVersion: 1,
    bankName: "Bank", customerName: "Snapshot customer", totalReceived: 960, whtAmount: 30, bankFee: 10,
    allocations: Array.from({ length: 14 }, (_, i) => ({ invoiceId: `i${i}`, invoiceNo: `UNIQUE-${i}-END`,
      invoiceDate: "2026-10-25", receivedAmount: 960, whtAmount: 30, bankFee: 10 })) };
  assert.equal(receiptPrintPages(doc.allocations).length, 3);
  const html = renderToStaticMarkup(React.createElement(ReceiptVoucherDocument, { document: doc, company: { companyName: "Company" } }));
  for (const text of ["Receipt Voucher", "เลขที่บัญชี", "แผนก", "เดบิต", "เครดิต", "โครงการ", "ผู้ลงบัญชี", "ค่าธรรมเนียมธนาคาร", "ภาษีเงินได้ถูกหัก ณ ที่จ่าย"]) assert.match(html, new RegExp(text));
  assert.equal((html.match(/class="rv-paper"/g) || []).length, 3);
  for (let i = 0; i < 14; i++) assert.equal((html.match(new RegExp(`UNIQUE-${i}-END`, "g")) || []).length, 1);
  assert.equal((html.match(/14,000\.00/g) || []).length, 3, "credit line plus final debit/credit totals, not repeated on previous pages");
  assert.match(html, /25\/10\/2026/); assert.match(html, /Snapshot customer/);
  assert.doesNotMatch(html, /11130-02|11600-05|11300-01|<img/);
});
test("RV cheque hydration and print retain bank, leading-zero cheque number and cheque date", () => {
  const doc = { ...model.newReceipt(), paymentMethod: "cheque", bankName: "ธนาคารกรุงเทพ",
    chequeNo: "000123", chequeDate: "2026-11-02T00:00:00Z", rvNo: "RV-CHEQUE",
    allocations: [{ invoiceId: "i1", receivedAmount: 100, whtAmount: 0, bankFee: 0 }] };
  const form = model.receiptForm(doc);
  assert.equal(form.chequeNo, "000123");
  assert.equal(form.chequeDate, "2026-11-02");
  assert.equal(form.paymentMethod, "cheque");
  assert.equal(model.receiptForm({ ...doc, chequeDate: null, chequeNo: null }).chequeDate, "");
  const { ReceiptVoucherDocument } = load(["components", "receipt-voucher-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/receipt-voucher": model,
  });
  const html = renderToStaticMarkup(React.createElement(ReceiptVoucherDocument, { document: doc, company: {} }));
  assert.match(html, /เช็ครับ ธนาคารกรุงเทพ/);
  assert.match(html, /000123/);
  assert.match(html, /02\/11\/2026/);
  assert.doesNotMatch(html, /เงินฝากธนาคาร/);
  assert.equal(new Set(model.receiptBanks).size, model.receiptBanks.length);
  for (const bank of ["ธนาคารกรุงเทพ", "ธนาคารกสิกรไทย", "ธนาคารออมสิน", "ธนาคารซิตี้แบงก์"]) {
    assert.ok(model.receiptBanks.includes(bank));
  }
});
test("RV form offers cheque and bank dropdown while preserving a saved bank outside the list", () => {
    let cursor = 0;
    const saved = { ...model.newReceipt(), paymentMethod: "cheque", bankName: "Saved bank",
      chequeNo: "000123", chequeDate: "2026-11-02", lifecycleVersion: 1, status: "draft" };
    const { ReceiptVouchers } = load(["components", "receipt-vouchers.tsx"], {
      react: { ...React, useState(initial) {
        const index = cursor++;
        return React.useState(index === 1 ? saved : index === 2 ? saved : initial === true ? false : initial);
      } },
      "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
      "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/api": {}, "@/lib/account-customers": {},
      "@/lib/receipt-voucher": model, "@/lib/accounting-date": dates,
      "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
      "@/lib/accounting-access": { canUseAccounting: () => true },
      "@/components/date-input": { DateInput: ({ onChange, ...props }) => React.createElement("input", { ...props, onChange: event => onChange(event.target.value) }) },
      "@/components/searchable-select": { SearchableSelect: () => null },
      "@/components/receipt-voucher-document": { ReceiptPrintStyles: () => null },
    });
    const html = renderToStaticMarkup(React.createElement(ReceiptVouchers, { mode: "edit", recordId: "rv" }));
    assert.match(html, /<option value="cheque" selected="">เช็ค<\/option>/);
    assert.match(html, /<option value="Saved bank" selected="">Saved bank \(ข้อมูลเดิม\)<\/option>/);
    for (const bank of model.receiptBanks) assert.ok(html.includes(`<option value="${bank}">${bank}</option>`));
    assert.match(html, /เลขที่เช็ค<input required=""/);
    assert.match(html, /วันที่บนเช็ค<input required=""/);
    assert.doesNotMatch(html, /ธนาคารที่รับเงิน<input/);
});
