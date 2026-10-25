const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const test = require("node:test"), ts = require("typescript"), React = require("react");
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
const model = load(["lib", "credit-note.ts"]);
const dates = load(["lib", "accounting-date.ts"]);
test("CN routes expose full-page register/new/view/edit and reject invalid actions", () => {
  const Component = () => null;
  const Page = load(["app", "ar", "credit-notes", "[...record]", "page.tsx"], {
    "next/navigation": { notFound() { throw new Error("Not found"); } }, "@/components/credit-notes": { CreditNotes: Component },
  }).default;
  for (const [record, mode] of [[["new"], "new"], [["cn"], "view"], [["cn", "edit"], "edit"]]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [["new", "edit"], ["cn", "confirm"], ["cn", "edit", "extra"]]) assert.throws(() => Page({ params: { record } }), /Not found/);
  assert.equal(load(["app", "ar", "credit-notes", "page.tsx"], { "@/components/credit-notes": { CreditNotes: Component } }).default().type, Component);
});
test("CN satang preview agrees with document-rounded VAT and preserves snapshots on edit", () => {
  const items = [{ ...model.newCreditLine(), qty: 2, unitPrice: "100.01" }, { ...model.newCreditLine(), qty: 1, unitPrice: "0.08" }];
  const amounts = model.creditAmounts(items, "VAT7%");
  assert.equal(amounts.before, 200.10); assert.equal(amounts.vat, 14.01); assert.equal(amounts.net, 214.11);
  assert.equal(model.creditAmounts(items, "NO_VAT").net, 200.10);
  const form = model.creditForm({ ...model.newCredit(), cnDate: "2026-10-25T00:00:00Z", updatedAt: "revision", contactPerson: null,
    items: [{ desc: "Saved", qty: "2", unitPrice: "10.01", partNo: null, unit: "set" }] });
  assert.equal(form.cnDate, "2026-10-25"); assert.equal(form.updatedAt, "revision"); assert.equal(form.contactPerson, "");
  assert.equal(form.items[0].partNo, ""); assert.equal(form.items[0].unitPrice, "10.01");
  assert.match(model.creditStatus({ status: "approved", lifecycleVersion: 0 }), /Legacy/);
});
test("CN form is full-page, read-only users cannot edit, and quantity steps are integers", () => {
  let write = true;
  const { CreditNotes } = load(["components", "credit-notes.tsx"], {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/api": {},
    "@/lib/credit-note": model, "@/lib/accounting-date": dates,
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) }, "@/lib/accounting-access": { canUseAccounting: () => write },
    "@/components/date-input": {}, "@/components/searchable-select": {}, "@/components/credit-note-document": { CreditPrintStyles: () => null },
  });
  const render = () => renderToStaticMarkup(React.createElement(CreditNotes, { mode: "new" }));
  assert.match(render(), /กำลังโหลด/); assert.doesNotMatch(render(), /aria-modal|role="dialog"/);
  write = false; assert.match(render(), /ไม่มีสิทธิ์สร้างหรือแก้ไขใบลดหนี้/); assert.doesNotMatch(render(), /<form/);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "credit-notes.tsx"), "utf8");
  assert.match(source, /step="1"/); assert.match(source, /lg:grid-cols-4/);
});
test("CN sample-based print paginates each line once and final totals once without delivery/ownership assertions", () => {
  const { CreditNoteDocument, creditPrintPages } = load(["components", "credit-note-document.tsx"], { "@/lib/accounting-date": dates });
  const doc = { ...model.newCredit(), cnNo: "CN-TEST", status: "approved", lifecycleVersion: 1, cnDate: "2026-10-25",
    customerName: "Snapshot customer", address: "Saved address", invoiceNo: "IV-SOURCE", invoiceDate: "2026-10-01", vatConfig: "VAT7%",
    originalBeforeVat: 99999, correctedBeforeVat: 87653.33, amountBeforeVat: 12345.67, vat: 864.20, netAmount: 13209.87,
    items: Array.from({ length: 25 }, (_, i) => ({ desc: `UNIQUE-${i}-END`, qty: 1, unit: "set", partNo: `P${i}`, unitPrice: 10, amountBeforeVat: 10 })) };
  assert.equal(creditPrintPages(doc.items).length, 3);
  const html = renderToStaticMarkup(React.createElement(CreditNoteDocument, { document: doc, company: { companyName: "Company" } }));
  assert.equal((html.match(/class="cn-paper"/g) || []).length, 3);
  for (let i = 0; i < 25; i++) assert.equal((html.match(new RegExp(`UNIQUE-${i}-END`, "g")) || []).length, 1);
  assert.equal((html.match(/13,209\.87/g) || []).length, 1);
  for (const text of ["เลขที่ใบกำกับเดิม", "มูลค่าตามเอกสารเดิม", "มูลค่าที่ถูกต้อง", "ภาษีมูลค่าเพิ่ม 7%", "ผู้มีอำนาจลงนาม", "Snapshot customer", "25/10/2026"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /ยังคงเป็นทรัพย์สินของผู้ขาย|ได้รับสินค้าตามรายการ|ผู้จ่ายของ|<img/);
  const centsDoc = { ...doc, originalBeforeVat: 100000, correctedBeforeVat: 99799.90, amountBeforeVat: 200.10 };
  const centsHtml = renderToStaticMarkup(React.createElement(CreditNoteDocument, { document: centsDoc, company: {} }));
  assert.doesNotMatch(centsHtml, /ยอดลดก่อน VAT ที่ยืนยันก่อนใบนี้ 0.00/);
});
