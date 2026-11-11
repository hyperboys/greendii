const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(parts, imports = {}, globals = {}) {
  Object.assign(imports, require("./helpers/document-ui-mocks.cjs"));
  imports["next/image"] = { default: ({ unoptimized, ...props }) => React.createElement("img", props) };
  imports["@/components/manual-submit-form"] = { ManualSubmitForm: "form" };
  imports["@/components/accounting-approval-panel"] = { AccountingApprovalPanel: () => null };
  imports["@/lib/accounting-approval"] = {
    isEditableArDocument: doc => doc?.lifecycleVersion === 1 && doc.status === "draft",
    legacyApprovalControlVisible: (_action, chainManaged) => !chainManaged,
  };
  const filename = path.join(__dirname, "..", "src", ...parts);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, ...globals, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const delivery = load(["lib", "delivery-order.ts"]);
const dates = load(["lib", "accounting-date.ts"]);
const invoices = load(["lib", "invoice.ts"], { "./delivery-order": delivery });
const documentItems = load(["components", "document-items.tsx"], { "@/lib/delivery-order": delivery });
const deliveryPrint = load(["components", "delivery-order-document.tsx"], { "@/lib/accounting-date": dates, "@/lib/delivery-order": delivery });
const invoicePrint = load(["components", "invoice-document.tsx"], {
  "@/lib/accounting-date": dates, "@/lib/invoice": invoices,
  "@/lib/billing-note": load(["lib", "billing-note.ts"]),
  "@/components/delivery-order-document": deliveryPrint,
});

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

test("Invoice places editable description under product selection and preserves saved codes", () => {
  const item = { ...delivery.newDeliveryOrderLine(), partNo: "SAVED-CODE", desc: "Saved description" };
  let changed;
  const props = { items: [item], products: [], descriptionInProductCell: true, onChange: value => { changed = value; } };
  const html = renderToStaticMarkup(React.createElement(documentItems.DocumentItems, props));
  const firstRow = html.match(/<tbody[^>]*><tr[^>]*>([\s\S]*?)<\/tr>/)[1];
  assert.match(firstRow, /<\/select><\/label><div><label[^>]*><span>รายละเอียด รายการ 1<\/span><textarea[^>]*required/);
  assert.match(firstRow, /ตัวอย่างบรรทัดเมื่อพิมพ์/);
  assert.equal((html.match(/<textarea/g) || []).length, 1);
  assert.doesNotMatch(html, /รหัสสินค้าบนเอกสาร/);
  assert.match(html, /หมายเหตุรายการ 1/);
  const standard = renderToStaticMarkup(React.createElement(documentItems.DocumentItems, { ...props, descriptionInProductCell: false }));
  assert.doesNotMatch(standard, /รหัสสินค้าบนเอกสาร|สินค้า \/ รหัสสินค้า/);
  assert.match(standard, /<th[^>]*>สินค้า<\/th>/);
  assert.equal((standard.match(/<textarea/g) || []).length, 1);
  const editor = load(["components", "document-items.tsx"], {
    "@/lib/delivery-order": delivery, react: { ...React, useState: initial => [initial, () => {}] },
  });
  const tree = editor.DocumentItems(props);
  const elements = node => React.isValidElement(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
  elements(tree).find(node => node.type === "textarea").props.onChange({ target: { value: "Changed description" } });
  assert.equal(changed[0].desc, "Changed description");
  assert.equal(changed[0].partNo, "SAVED-CODE");
  assert.equal(item.desc, "Saved description");
  const standardTree = editor.DocumentItems({ ...props, descriptionInProductCell: false });
  elements(standardTree).find(node => node.type === "textarea").props.onChange({ target: { value: "Changed delivery description" } });
  assert.equal(changed[0].desc, "Changed delivery description");
  assert.equal(changed[0].partNo, "SAVED-CODE");
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
        const value = index === 1 ? saved : index === 2 ? false : index === 3 ? invoices.invoiceForm(saved)
          : index === 4 ? [{ id: "customer", code: "C1", name: "Customer", branches: [{ id: "branch", name: "Branch" }] }]
          : initial === true ? false : initial;
        const [state] = React.useState(value);
        if (index === 3) currentForm = state;
        return [state, update => {
          if (index === 3) currentForm = typeof update === "function" ? update(currentForm) : update;
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
    assert.match(html, /สินค้า \/ รายละเอียด/);
    assert.doesNotMatch(html, /รหัสสินค้าบนเอกสาร/);
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
  const { InvoiceDocument } = invoicePrint;
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
  assert.match(html, /TAX ID: 123/);
  assert.match(html, /0　วัน/);
  assert.match(html, /class="iv-items"/);
  assert.match(html, /text-\[12pt\]/);
  assert.match(html, /TAX ID: 123/);
  assert.doesNotMatch(html, /<table|<img|<svg|RECEIPT|ผู้รับเงิน|Paid by|<h1|ใบเสร็จ/);
  assert.match(html, /หนึ่งร้อยสามสิบสองบาทเก้าสตางค์/);
  assert.equal((html.match(/7%/g) || []).length, 1);
  assert.equal((html.match(/>pcs<\/div>/g) || []).length, 80);
  assert.doesNotMatch(html, /\(pcs\)/);
});

test("Invoice data-only coordinates follow the reference PDF header, seven item columns and final totals", () => {
  const doc = {
    ...invoices.newInvoice(), ivDate: "2026-11-10", ivNo: "IV-REFERENCE",
    customerCode: "T027", customerName: "Reference Customer", customerBranch: "สำนักงานใหญ่",
    taxId: "1234567890123", address: "Address line one\nAddress line two", customerPoNo: "PO-REFERENCE",
    responsibleSaleName: "Salesperson", creditTerm: 30, dueDate: "2026-12-10",
    subTotal: 54500, vat: 3815, netAmount: 58315,
    items: [
      { partNo: "P-002", desc: "Certify cleanroom performance\nParticle count test\nAirflow velocity test\nTemperature test\nRelative test\nDifferential pressure test\nScan leak test hepa", qty: 1, unit: "Lot", unitPrice: 49000, lineDiscount: 0, amount: 49000 },
      { partNo: "P-002", desc: "Before Certification, Cleanroom system\nshould be operating for about 12-24 hrs.", qty: 1, unit: "Lot", unitPrice: 5500, lineDiscount: 0, amount: 5500 },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(invoicePrint.InvoiceDocument, { document: doc }));
  for (const [left, top, value] of [
    ["27.5", "24.5", "T027"], ["27.5", "30", "Reference Customer"],
    ["53", "24.5", "TAX ID: 1234567890123"], ["93", "24.5", "สาขา สำนักงานใหญ่"],
    ["29.5", "48", "PO-REFERENCE"], ["153", "24.5", "10/11/2569"],
    ["153", "30", "IV-REFERENCE"], ["153", "35.5", "Salesperson"],
    ["153", "41", "30　วัน"], ["153", "46.5", "10/12/2569"],
    ["170.5", "202.5", "54,500.00"], ["160.5", "210", "7%"],
    ["170.5", "210", "3,815.00"], ["170.5", "220.5", "58,315.00"],
  ]) {
    assert.ok(html.includes(`style="left:${left}mm;top:${top}mm;`) && html.includes(`>${value}</div>`), `${value} at ${left},${top}mm`);
    assert.ok(new RegExp(`style="left:${left}mm;top:${top}mm;[^"]*">${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</div>`).test(html));
  }
  assert.equal((html.match(/class="iv-overlay/g) || []).length, 1);
  assert.equal((html.match(/>1\.00<\/div>/g) || []).length, 2);
  assert.equal((html.match(/>Lot<\/div>/g) || []).length, 2);
  assert.match(html, /ห้าหมื่นแปดพันสามร้อยสิบห้าบาทถ้วน/);
  assert.doesNotMatch(html, /Reference Customer สำนักงานใหญ่|\(Lot\)|>0\.00<\/div>|1\/1/);
  const styles = invoicePrint.InvoicePrintStyles({ allowed: true }).props.children;
  assert.match(html, /data-print-size="10\.5" class="iv-value iv-single-line" style="left:27\.5mm;top:30mm;width:105mm;height:5\.5mm;font-size:10\.5pt"/);
  assert.match(html, /data-print-size="10\.5" class="iv-value" style="left:27\.5mm;top:35\.5mm;width:105mm;height:12mm;font-size:10\.5pt"/);
  assert.match(html, /data-print-size="10\.5" class="iv-value iv-single-line" style="left:53mm;top:24\.5mm;width:39mm;height:5\.5mm;font-size:10\.5pt"/);
  assert.match(html, /data-print-size="10\.5" class="iv-value iv-single-line" style="left:93mm;top:24\.5mm;width:39\.5mm;height:5\.5mm;font-size:10\.5pt"/);
  assert.match(styles, /\.iv-value\.iv-single-line \{ white-space: nowrap; \}/);
  assert.match(styles, /left: 8\.5mm; top: 68\.5mm; width: 185mm/);
  assert.match(styles, /grid-template-columns: 22mm 74\.5mm 7mm 11\.5mm 25mm 22mm 23mm/);
  assert.match(styles, /\.iv-number \{ white-space: nowrap; \}/);
  assert.match(styles, /\.iv-unit \{ padding-left: 3\.5mm; \}/);
  assert.match(styles, /@page \{ size: A4 portrait; margin: 0; \}/);
});

test("Invoice pagination reserves footer space and prints long descriptions, units and amounts once", () => {
  const desc = Array.from({ length: 60 }, (_, i) => `Description ${i + 1}`).join("\n");
  const items = [{ ...delivery.newDeliveryOrderLine(), partNo: "LONG", desc, unit: "Lot", qty: 1, unitPrice: 1234.56, discount: 0, amount: 1234.56 }];
  const pages = deliveryPrint.deliveryOrderPrintPages(items, 40, 24, 450);
  assert.ok(pages.length > 1);
  for (const page of pages) assert.ok(page.reduce((sum, row) => sum + row.height, 0) <= 450);
  assert.equal(pages.flat().map(row => row.item.desc).join("\n"), desc);
  assert.equal(pages.flat().filter(row => !row.continuation).length, 1);
  const doc = {
    ...invoices.newInvoice(), ivNo: "IV-LONG", dueDate: "2026-11-10",
    subTotal: 1234.56, discount: 34.56, vatConfig: "NO_VAT", vat: 0, netAmount: 1200,
    items: items.map(item => ({ ...item, lineDiscount: item.discount })),
  };
  const html = renderToStaticMarkup(React.createElement(invoicePrint.InvoiceDocument, { document: doc }));
  assert.equal((html.match(/1,234\.56/g) || []).length, 2, "one unit price and one amount, not repeated on continuation pages");
  assert.equal((html.match(/>Lot<\/div>/g) || []).length, 1);
  assert.equal((html.match(/>หักส่วนลด<\/div>/g) || []).length, 1);
  assert.match(html, /style="left:170\.5mm;top:193\.5mm;width:23mm;height:5\.5mm">34\.56<\/div>/);
  assert.match(html, /style="left:37mm;top:201mm;width:110mm;height:6mm">\(หนึ่งพันสองร้อยบาทถ้วน\)<\/div>/);
  assert.doesNotMatch(html, /ส่วนลดท้ายเอกสาร 34\.56 บาท/);
  assert.equal((html.match(/>1,200\.00<\/div>/g) || []).length, 2, "final subtotal and net only");
  assert.doesNotMatch(html, />7%<\/div>/);
});

test("Invoice fit starts customer fields smaller, shrinks long values and blocks overflow", async () => {
  const field = (preferred, maximum) => ({
    dataset: preferred ? { printSize: String(preferred) } : {},
    style: { fontSize: "" }, clientHeight: 20, clientWidth: 100,
    get scrollHeight() { return parseFloat(this.style.fontSize) > maximum ? 40 : 20; },
    scrollWidth: 100,
  });
  for (const overflow of [false, true]) {
    const fields = [field(10.5, 10.5), field(10.5, 8), field(null, 12), field(10.5, overflow ? 5 : 6)];
    let effect, fitError;
    const ready = [];
    const { InvoiceDocument } = load(["components", "invoice-document.tsx"], {
      react: { ...React, useEffect: callback => { effect = callback; },
        useRef: () => ({ current: { querySelectorAll: () => fields } }),
        useState: () => [false, value => { fitError = value; }] },
      "@/lib/accounting-date": dates, "@/lib/invoice": invoices,
      "@/lib/billing-note": load(["lib", "billing-note.ts"]), "@/components/delivery-order-document": deliveryPrint,
    }, { document: { fonts: { ready: Promise.resolve() } } });
    InvoiceDocument({ document: { ...invoices.newInvoice(), netAmount: 0 }, onReady: value => ready.push(value) });
    effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fields.map(item => item.style.fontSize), ["10.5pt", "8pt", "12pt", "6pt"]);
    assert.equal(fitError, overflow);
    assert.deepEqual(ready, [false, !overflow]);
  }
});

test("Invoice description wraps at word boundaries without losing input and previews the same lines", () => {
  const { invoiceDescriptionLines } = require("./helpers/document-ui-mocks.cjs")["@/lib/invoice-description"];
  const description = "Cost of material and labor fo repair and\nimprove Air shower at FFS;2 and material";
  const lines = invoiceDescriptionLines(description);
  assert.equal(lines.join("").replace(/\n/g, ""), description.replace(/\n/g, ""));
  assert.ok(lines.every(line => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)).length <= 32));
  assert.ok(lines.includes("material"));
  const thai = "กิ".repeat(40);
  assert.equal(invoiceDescriptionLines(thai).join(""), thai);
  const doc = { ...invoices.newInvoice(), subTotal: 1, vat: 0, netAmount: 1,
    items: [{ desc: description, qty: 1, unit: "Lot", unitPrice: 1, lineDiscount: 0, amount: 1 }] };
  const html = renderToStaticMarkup(React.createElement(invoicePrint.InvoiceDocument, { document: doc }));
  assert.ok(html.includes(lines.join("\n")));
  const editor = renderToStaticMarkup(React.createElement(documentItems.DocumentItems, {
    items: [{ ...delivery.newDeliveryOrderLine(), desc: description }], products: [], descriptionInProductCell: true, onChange() {},
  }));
  assert.ok(editor.includes(lines.join("\n")));
  const withRemark = { ...delivery.newDeliveryOrderLine(), desc: "Long text ".repeat(120), remark: "Remark preserved", unit: "Lot" };
  const pages = deliveryPrint.deliveryOrderPrintPages([withRemark], 40, 24, 450, 12, 6, invoiceDescriptionLines);
  assert.ok(pages.length > 1);
  assert.equal(pages.flat().map(row => row.item.desc).join("\n").split("Remark preserved").length - 1, 1);
});
