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
const model = load(["lib", "billing-note.ts"]);
const dates = load(["lib", "accounting-date.ts"]);
test("BI routes and old billingNotes tab use full-page create/view/edit", () => {
  const BI = () => null;
  const Page = load(["app", "ar", "billing-notes", "[...record]", "page.tsx"], {
    "next/navigation": { notFound() { throw new Error("Not found"); } }, "@/components/billing-notes": { BillingNotes: BI },
  }).default;
  for (const [record, mode] of [[["new"], "new"], [["bi"], "view"], [["bi", "edit"], "edit"]]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [["new", "edit"], ["bi", "confirm"], ["bi", "edit", "extra"]]) assert.throws(() => Page({ params: { record } }), /Not found/);
  const OldPage = load(["app", "ar", "invoices", "page.tsx"], {
    "next/navigation": { useSearchParams: () => new URLSearchParams("tab=billingNotes") },
    "@/lib/accounting-navigation": load(["lib", "accounting-navigation.ts"]),
    "@/components/billing-notes": { BillingNotes: BI }, "@/components/invoices": {}, "@/components/delivery-orders": {},
  }).default;
  assert.equal(OldPage({}).type, BI);
});
test("BI hydration and satang totals preserve saved partial amounts and revision", () => {
  const form = model.billingForm({ ...model.newBillingNote(), updatedAt: "revision", expectedPaymentDate: null,
    billingDate: "2026-10-25T00:00:00Z", invoices: [{ invoiceId: "i1", billingAmount: "10.01" }, { invoiceId: "i2", billingAmount: "20.02" }] });
  assert.equal(form.billingDate, "2026-10-25");
  assert.equal(form.expectedPaymentDate, "");
  assert.equal(form.updatedAt, "revision");
  assert.equal(model.billingTotal(form.invoices), 30.03);
  const changed = model.billingForm({ ...form, invoices: [{ invoiceId: "i1", billingAmount: "10.01", outstandingAmount: 80, invoice: { outstandingAmount: 0 } }] });
  assert.equal(changed.invoices[0].outstandingAmount, 0, "Editing shows the live balance, including fully settled invoices");
  assert.match(model.billingStatus({ status: "draft", lifecycleVersion: 0 }), /Legacy/);
});
test("BI create is full-page and viewers cannot open an editable form", () => {
  let write = true;
  const { BillingNotes } = load(["components", "billing-notes.tsx"], {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/api": {},
    "@/lib/account-customers": {}, "@/lib/billing-note": model, "@/lib/accounting-date": dates,
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) }, "@/lib/accounting-access": { canUseAccounting: () => write },
    "@/components/date-input": {}, "@/components/searchable-select": {}, "@/components/billing-note-document": { BillingPrintStyles: () => null },
  });
  const render = () => renderToStaticMarkup(React.createElement(BillingNotes, { mode: "new" }));
  assert.match(render(), /กำลังโหลด/);
  assert.doesNotMatch(render(), /aria-modal|role="dialog"/);
  write = false;
  assert.match(render(), /ไม่มีสิทธิ์สร้างหรือแก้ไขใบวางบิล/);
  assert.doesNotMatch(render(), /<form/);
});
test("BI print recreates sample grid and two signature boxes; all rows print once and total only on final page", () => {
  const { BillingNoteDocument, billingPrintPages } = load(["components", "billing-note-document.tsx"], { "@/lib/accounting-date": dates });
  const doc = { ...model.newBillingNote(), billingDate: "2026-10-25", biNo: "BI-TEST", status: "approved", lifecycleVersion: 1,
    customerName: "Snapshot customer", customerCode: "C1", address: "Saved address", taxId: "0123456789012", totalAmount: "12345.67",
    invoices: Array.from({ length: 40 }, (_, i) => ({ invoiceId: `i${i}`, invoiceNo: `UNIQUE-${i}-END`,
      invoiceDate: "2026-10-01", invoiceDueDate: "2026-10-31", invoiceNetAmount: 100, outstandingAmount: 80, billingAmount: 20 })) };
  const pages = billingPrintPages(doc.invoices);
  assert.equal(pages.length, 3);
  assert.equal(pages.flat().length, 40);
  const html = renderToStaticMarkup(React.createElement(BillingNoteDocument, { document: doc, company: { companyName: "Company" } }));
  for (const text of ["ใบวางบิล", "วันที่นัดชำระ", "เงื่อนไขการจ่ายชำระ", "ลำดับที่", "เลขที่เอกสาร", "วันที่เอกสาร", "ประเภทรายการ", "วันครบกำหนด", "จำนวนเงินตามใบกำกับ", "จำนวนเงินวางบิล", "ผู้วางบิล", "ผู้รับวางบิล"]) assert.match(html, new RegExp(text));
  assert.equal((html.match(/class="bi-paper"/g) || []).length, 3);
  assert.equal((html.match(/12,345\.67/g) || []).length, 1);
  for (let i = 0; i < 40; i++) assert.equal((html.match(new RegExp(`UNIQUE-${i}-END`, "g")) || []).length, 1);
  assert.match(html, /25\/10\/2026/);
  assert.match(html, /Snapshot customer/);
  assert.equal((html.match(/class="bi-tax-id" data-bi-fit="true"/g) || []).length, 3);
  assert.equal((html.match(/0123456789012/g) || []).length, 3);
  assert.match(html, /เลขประจำตัวผู้เสียภาษี/);
  assert.doesNotMatch(html, /ผู้รับเงิน|RECEIPT|<img/);
});
test("BI customer tax ID uses the saved document value and explicitly shows missing values", () => {
  const { BillingNoteDocument } = load(["components", "billing-note-document.tsx"], { "@/lib/accounting-date": dates });
  const render = taxId => renderToStaticMarkup(React.createElement(BillingNoteDocument, {
    document: { ...model.newBillingNote(), taxId, invoices: [], totalAmount: 0 },
    company: { taxId: "9999999999999" },
  }));
  assert.match(render("0123456789012"), /class="bi-tax-id" data-bi-fit="true"><strong>เลขประจำตัวผู้เสียภาษี<\/strong>　0123456789012<\/p>/);
  assert.match(render(null), /class="bi-tax-id" data-bi-fit="true"><strong>เลขประจำตัวผู้เสียภาษี<\/strong>　-<\/p>/);
});
