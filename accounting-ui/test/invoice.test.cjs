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

test("Shared item editor keeps description below the numeric row and supports explicit read-only mode", () => {
  const props = { items: [{ ...delivery.newDeliveryOrderLine(), desc: "Line", unit: "pcs" }], products: [], onChange() {} };
  const render = readOnly => renderToStaticMarkup(React.createElement(documentItems.DocumentItems, { ...props, readOnly }));
  assert.match(render(false), /colSpan="8"/);
  assert.match(render(false), /aria-label="ลบรายการ 1" disabled=""/);
  assert.match(render(false), /step="1"/);
  assert.match(render(true), /<fieldset disabled=""/);
  assert.doesNotMatch(render(true), /เพิ่มรายการ|aria-label="ลบรายการ/);
});

test("SO-linked Invoice Drafts allow editing copied fields, customer and saved SO", () => {
  const saved = {
    ...invoices.newInvoice(), id: "iv", provisionalDeliveryOrderId: "so", customerId: "customer",
    provisionalDeliveryOrder: { id: "so", soNo: "SO-TEST" }, status: "draft", lifecycleVersion: 1,
    workOrderId: "wo1", workOrder: { id: "wo1", woNo: "WO-1" },
    updatedAt: "revision", customerBranch: "Branch", address: "Edited billing", shippingAddress: "Edited shipping",
    creditTerm: 15, vatConfig: "NO_VAT", discount: 2,
    items: [{ desc: "Edited line", qty: 4, unit: "box", unitPrice: 25.5, lineDiscount: 1.5 }],
  };
  let cursor = 0;
  let currentForm;
  let selectors = [];
  const searchable = load(["components", "searchable-select.tsx"]);
  const { Invoices } = load(["components", "invoices.tsx"], {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        const value = index === 1 ? saved : index === 2 ? invoices.invoiceForm(saved)
          : index === 3 ? [{ id: "customer", code: "C1", name: "Customer", branches: [{ id: "branch", name: "Branch" }] }]
          : initial === true ? false : initial;
        const [state] = React.useState(value);
        if (index === 2) currentForm = state;
        return [state, update => {
          if (index === 2) currentForm = typeof update === "function" ? update(currentForm) : update;
        }];
      },
    },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/api": {},
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => true },
    "@/lib/account-customers": load(["lib", "account-customers.ts"]), "@/lib/delivery-order": delivery,
    "@/lib/invoice": invoices, "@/lib/accounting-date": dates,
    "@/components/date-input": load(["components", "date-input.tsx"], { "@/lib/accounting-date": dates }),
    "@/components/searchable-select": { SearchableSelect: props => {
      selectors.push(props);
      return React.createElement(searchable.SearchableSelect, props);
    } },
    "@/components/document-items": documentItems,
    "@/components/invoice-document": { InvoicePrintStyles: () => null },
  });
  for (const mode of ["new", "edit"]) {
    cursor = 0;
    selectors = [];
    const html = renderToStaticMarkup(React.createElement(Invoices, { mode, recordId: mode === "edit" ? "iv" : undefined }));
    assert.match(html, /บันทึก Draft/);
    assert.match(html, /เพิ่มรายการ/);
    assert.match(html, /Edited line/);
    assert.match(html, /Edited billing/);
    assert.match(html, /Edited shipping/);
    assert.match(html, /<dt>ยอดก่อน VAT<\/dt><dd>98\.50<\/dd>/);
    assert.doesNotMatch(html, /readonly=""/);
    assert.equal((html.match(/<fieldset disabled=""/g) || []).length, 0, "SO-linked customer and items are editable");
    assert.doesNotMatch(html, /<select disabled=""/);
    assert.match(html, /ไม่เปลี่ยนข้อมูล SO ต้นฉบับ/);
    assert.match(html, /คัดลอกจาก SO \(ไม่บังคับ\)/);
    assert.match(html, /ชื่อสาขาบนเอกสาร<input/);
    assert.match(html, /อ้างอิง Work Order \(ไม่บังคับ\)/);
    assert.doesNotMatch(html, /ไม่สามารถเปลี่ยนหลังบันทึก/);
    const beforeClear = currentForm;
    selectors.find(item => item.label === "คัดลอกจาก SO (ไม่บังคับ)").onChange("");
    assert.equal(currentForm.provisionalDeliveryOrderId, null);
    for (const [field, value] of Object.entries(beforeClear)) {
      if (field !== "provisionalDeliveryOrderId") assert.equal(currentForm[field], value, `Removing SO preserves ${field}`);
    }
    selectors.find(item => item.label === "อ้างอิง Work Order (ไม่บังคับ)").onChange("");
    assert.equal(currentForm.workOrderId, null);
    assert.equal(currentForm.updatedAt, "revision");
    assert.equal(currentForm.items, beforeClear.items);
  }
  saved.items = [{ desc: "Edited line", qty: 1, unit: "box", unitPrice: 85000, lineDiscount: 0 }];
  for (const [vatConfig, discount, beforeVat, vat, net] of [
    ["VAT7%", 5000, "80,000.00", "5,600.00", "85,600.00"],
    ["NO_VAT", 5000, "80,000.00", "0.00", "80,000.00"],
    ["VAT7%", 0, "85,000.00", "5,950.00", "90,950.00"],
    ["VAT7%", 85000, "0.00", "0.00", "0.00"],
  ]) {
    saved.vatConfig = vatConfig;
    saved.discount = discount;
    for (const mode of ["new", "edit"]) {
      cursor = 0;
      const html = renderToStaticMarkup(React.createElement(Invoices, { mode, recordId: mode === "edit" ? "iv" : undefined }));
      const summary = html.match(/<dl class="space-y-2">.*?<\/dl>/)?.[0];
      assert.ok(summary);
      for (const [label, amount] of [["ยอดก่อน VAT", beforeVat], ["VAT", vat], ["ยอดสุทธิ", net]]) {
        assert.ok(summary.includes(`<dt>${label}</dt><dd>${amount}</dd>`), `${mode}: ${label} = ${amount}`);
      }
      assert.ok(summary.indexOf("<dt>ส่วนลดท้ายเอกสาร</dt>") < summary.indexOf("<dt>ยอดก่อน VAT</dt>"));
      assert.ok(summary.indexOf("<dt>ยอดก่อน VAT</dt>") < summary.indexOf("<dt>VAT</dt>"));
    }
  }
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
