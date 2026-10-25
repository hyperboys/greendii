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
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const delivery = load(["lib", "delivery-order.ts"]);
const dates = load(["lib", "accounting-date.ts"]);
const invoices = load(["lib", "invoice.ts"], { "./delivery-order": delivery });
const documentItems = load(["components", "document-items.tsx"], { "@/lib/delivery-order": delivery });

test("Invoice routes support full-page new/view/edit and reject invalid URLs", () => {
  const Page = load(["app", "ar", "invoices", "[...record]", "page.tsx"], {
    "next/navigation": { notFound: () => { throw new Error("Not found"); } }, "@/components/invoices": { Invoices: () => null },
  }).default;
  for (const [record, mode] of [[["new"], "new"], [["iv"], "view"], [["iv", "edit"], "edit"]]) assert.equal(Page({ params: { record } }).props.mode, mode);
  for (const record of [["new", "edit"], ["iv", "confirm"], ["iv", "edit", "extra"]]) assert.throws(() => Page({ params: { record } }), /Not found/);
});

test("Invoice Draft form uses shared compact items, searchable customer/SO, no Popup and read-only permissions", () => {
  let canWrite = true;
  const { Invoices } = load(["components", "invoices.tsx"], {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/api": {},
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => canWrite },
    "@/lib/account-customers": load(["lib", "account-customers.ts"]), "@/lib/delivery-order": delivery,
    "@/lib/invoice": invoices, "@/lib/accounting-date": dates,
    "@/components/date-input": load(["components", "date-input.tsx"], { "@/lib/accounting-date": dates }),
    "@/components/searchable-select": load(["components", "searchable-select.tsx"]),
    "@/components/document-items": documentItems,
    "@/components/invoice-document": { InvoicePrintStyles: () => null },
  });
  const render = () => renderToStaticMarkup(React.createElement(Invoices, { mode: "new" }));
  // Initial loading deliberately prevents entering an incomplete form before masters load.
  assert.match(render(), /กำลังโหลด/);
  assert.doesNotMatch(render(), /role="dialog"|aria-modal/);
  canWrite = false;
  assert.match(render(), /ไม่มีสิทธิ์สร้างหรือแก้ไข Invoice/);
  assert.doesNotMatch(render(), /<form/);
});

test("Shared item editor keeps description below the numeric row and locks all SO-sourced items", () => {
  const props = { items: [{ ...delivery.newDeliveryOrderLine(), desc: "Line", unit: "pcs" }], products: [], onChange() {} };
  const render = readOnly => renderToStaticMarkup(React.createElement(documentItems.DocumentItems, { ...props, readOnly }));
  assert.match(render(false), /colSpan="8"/);
  assert.match(render(false), /aria-label="ลบรายการ 1" disabled=""/);
  assert.match(render(false), /step="1"/);
  assert.match(render(true), /<fieldset disabled=""/);
  assert.doesNotMatch(render(true), /เพิ่มรายการ|aria-label="ลบรายการ/);
});

test("Invoice hydration preserves snapshots, line discounts and Legacy nullable fields", () => {
  const form = invoices.invoiceForm({
    ...invoices.newInvoice(), ivDate: "2026-10-25T00:00:00Z", updatedAt: "revision",
    items: [{ desc: "Saved", qty: "3", unitPrice: "10.25", lineDiscount: "0.75", partNo: "P1", unit: "pcs", remark: null }],
  });
  assert.equal(form.ivDate, "2026-10-25");
  assert.equal(form.items[0].discount, "0.75");
  assert.equal(form.items[0].remark, "");
  assert.equal(form.updatedAt, "revision");
  assert.match(invoices.invoiceStatus({ status: "draft", lifecycleVersion: 0 }), /Legacy/);
});

test("Invoice overlay prints data only, omits preprinted labels/payment/signatures and paginates without repeating totals", () => {
  const { InvoiceDocument } = load(["components", "invoice-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/invoice": invoices,
    "@/components/delivery-order-document": load(["components", "delivery-order-document.tsx"], { "@/lib/accounting-date": dates, "@/lib/delivery-order": delivery }),
  });
  const doc = {
    ...invoices.newInvoice(), id: "iv", ivNo: "IV-TEST", status: "approved", lifecycleVersion: 1,
    customerName: "Snapshot Customer", customerCode: "C001", address: "Snapshot Billing", taxId: "123",
    creditTerm: 0, dueDate: "2026-10-25", subTotal: 123.45, discount: 0, vat: 8.64, netAmount: 132.09,
    items: Array.from({ length: 80 }, (_, i) => ({ partNo: `P${i}`, desc: `Line ${i}`, unit: "pcs", qty: 1, unitPrice: 1, lineDiscount: 0, amount: 1 })),
  };
  const html = renderToStaticMarkup(React.createElement(InvoiceDocument, { document: doc }));
  assert.ok((html.match(/class="iv-overlay/g) || []).length > 1);
  assert.equal((html.match(/132\.09/g) || []).length, 1);
  assert.match(html, /Snapshot Customer/);
  assert.match(html, /IV-TEST/);
  assert.doesNotMatch(html, /<table|<img|<svg|RECEIPT|ผู้รับเงิน|Paid by|<h1|ใบเสร็จ/);
  assert.match(html, /top-\[82mm\]/);
});
