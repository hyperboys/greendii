const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(parts, imports = {}, globals = {}) {
  imports["next/image"] = { default: ({ unoptimized, ...props }) => React.createElement("img", props) };
  Object.assign(imports, require("./helpers/document-ui-mocks.cjs"));
  imports["@/components/manual-submit-form"] = { ManualSubmitForm: "form" };
  imports["@/components/accounting-approval-panel"] = { AccountingApprovalPanel: () => null };
  imports["@/lib/accounting-approval"] = { hasApprovedActors: () => false,
    isEditableArDocument: doc => doc?.lifecycleVersion === 1 && doc.status === "draft", ...(imports["@/lib/accounting-approval"] || {}) };
  imports["./accounting-approval-signatures"] = { AccountingApprovalSignatures: () => null };
  const filename = path.join(__dirname, "..", "src", ...parts);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name), ...globals }, { filename });
  return module.exports;
}
const model = load(["lib", "billing-note.ts"]);
const dates = load(["lib", "accounting-date.ts"]);
test("BI Thai amount words use baht thuan for whole amounts and standard satang for fractions", () => {
  for (const [amount, expected] of [
    [0, "ศูนย์บาทถ้วน"], [1, "หนึ่งบาทถ้วน"], [11, "สิบเอ็ดบาทถ้วน"],
    [21, "ยี่สิบเอ็ดบาทถ้วน"], [101, "หนึ่งร้อยเอ็ดบาทถ้วน"],
    [1000, "หนึ่งพันบาทถ้วน"], ["85600.00", "แปดหมื่นห้าพันหกร้อยบาทถ้วน"],
    ["1000.50", "หนึ่งพันบาทห้าสิบสตางค์"], ["0.01", "ศูนย์บาทหนึ่งสตางค์"],
    ["0.21", "ศูนย์บาทยี่สิบเอ็ดสตางค์"], ["999.999", "หนึ่งพันบาทถ้วน"],
    [1000000, "หนึ่งล้านบาทถ้วน"], [1000001, "หนึ่งล้านเอ็ดบาทถ้วน"],
    [1000000000000, "หนึ่งล้านล้านบาทถ้วน"],
  ]) assert.equal(model.billingAmountText(amount), expected, String(amount));
  for (const invalid of ["", "abc", -1, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => model.billingAmountText(invalid), /จำนวนเงินไม่ถูกต้อง/);
  }
});
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
test("BI payment date follows customer credit and billing date, remains editable and saves overrides", async () => {
  const customers = [
    { id: "c30", name: "Credit 30", creditTerm: 30, branches: [] },
    { id: "c0", name: "Cash", creditTerm: 0, branches: [] },
    { id: "c15", name: "Credit 15", creditTerm: 15, branches: [] },
  ];
  const DateField = () => null;
  const Select = () => null;
  let form = { ...model.newBillingNote(), billingDate: "2026-11-04" };
  let cursor = 0;
  let saved;
  let destination;
  let document = null;
  const { BillingNotes } = load(["components", "billing-notes.tsx"], {
    react: { ...React, useEffect() {}, useRef: value => ({ current: value }), useState: initial => {
      const index = cursor++;
      if (index === 3) return [form, update => { form = typeof update === "function" ? update(form) : update; }];
      if (index === 1) return [document, () => {}];
      if (index === 4) return [customers, () => {}];
      if (index === 9) return [false, () => {}];
      return [typeof initial === "function" ? initial() : initial, () => {}];
    } },
    "next/link": { default: () => null },
    "next/navigation": { useRouter: () => ({ push: value => { destination = value; } }) },
    "@/lib/api": { ArApi: {
      createBillingNote: async input => { saved = input; return { id: "created" }; },
      updateBillingNote: async (id, input) => { saved = input; return { id }; },
    } },
    "@/lib/account-customers": load(["lib", "account-customers.ts"]),
    "@/lib/billing-note": model, "@/lib/accounting-date": dates,
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => true },
    "@/components/date-input": { DateInput: DateField },
    "@/components/searchable-select": { SearchableSelect: Select },
  });
  function elements(node) {
    if (!React.isValidElement(node)) return [];
    return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
  }
  function render(mode = "new") {
    cursor = 0;
    return elements(BillingNotes({ mode, recordId: mode === "edit" ? "existing" : undefined }));
  }
  function choose(id) {
    render().find(node => node.type === Select && node.props.label === "ลูกค้า").props.onChange(id);
  }
  function changeBillingDate(value) {
    render().find(node => node.type === DateField && node.props.required).props.onChange(value);
  }
  function paymentField(mode) {
    return render(mode).find(node => node.type === DateField && !node.props.required);
  }
  assert.equal(paymentField().props.value, "");
  choose("c30");
  assert.equal(paymentField().props.value, "2026-12-04");
  changeBillingDate("2026-10-29");
  assert.equal(paymentField().props.value, "2026-11-28", "Saturday is not moved to a working day");
  changeBillingDate("2026-12-02");
  assert.equal(paymentField().props.value, "2027-01-01", "New Year's Day is not skipped");
  choose("c0");
  assert.equal(paymentField().props.value, "2026-12-02", "Zero credit means same-day payment");
  choose("c15");
  assert.equal(paymentField().props.value, "2026-12-17");
  changeBillingDate("2028-02-20");
  assert.equal(paymentField().props.value, "2028-03-06", "Leap day counts as a calendar day");
  changeBillingDate("");
  assert.equal(paymentField().props.value, "");
  changeBillingDate("2026-11-04");
  const manual = paymentField();
  assert.ok(!manual.props.disabled && !manual.props.readOnly);
  manual.props.onChange("2026-12-10");
  assert.equal(paymentField().props.value, "2026-12-10");
  form = { ...form, invoices: [{ invoiceId: "i1", billingAmount: 100 }] };
  await render().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(saved.expectedPaymentDate, "2026-12-10");
  assert.equal(destination, "/ar/billing-notes/created");

  document = { ...form, id: "existing", lifecycleVersion: 1, status: "draft", updatedAt: "revision" };
  form = model.billingForm(document);
  assert.equal(paymentField("edit").props.value, "2026-12-10", "Saved manual dates are not recalculated on edit");
  paymentField("edit").props.onChange("");
  assert.equal(paymentField("edit").props.value, "", "The optional date can still be cleared");
  paymentField("edit").props.onChange("2026-12-20");
  await render("edit").find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(saved.expectedPaymentDate, "2026-12-20");
  assert.equal(saved.updatedAt, "revision");
  assert.equal(destination, "/ar/billing-notes/existing");
});
test("BI print recreates sample grid and two signature boxes; all rows print once and total only on final page", () => {
  const { BillingNoteDocument, billingPrintPages } = load(["components", "billing-note-document.tsx"], { "@/lib/accounting-date": dates, "@/lib/billing-note": model });
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
  assert.equal((html.match(/หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทหกสิบเจ็ดสตางค์/g) || []).length, 1);
  assert.match(html, /<td colSpan="3"><div data-bi-fit="true">หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทหกสิบเจ็ดสตางค์<\/div><\/td>/);
  assert.equal((html.match(/ยอดรวมแสดงหน้าสุดท้าย/g) || []).length, 2);
  for (let i = 0; i < 40; i++) assert.equal((html.match(new RegExp(`UNIQUE-${i}-END`, "g")) || []).length, 1);
  assert.match(html, /25\/10\/2569/);
  assert.match(html, /01\/10\/2569/);
  assert.match(html, /31\/10\/2569/);
  assert.match(html, /Snapshot customer/);
  assert.equal((html.match(/class="bi-tax-id" data-bi-fit="true"/g) || []).length, 3);
  assert.equal((html.match(/0123456789012/g) || []).length, 3);
  assert.match(html, /เลขประจำตัวผู้เสียภาษี/);
  assert.doesNotMatch(html, /ผู้รับเงิน|RECEIPT/);
  assert.equal((html.match(/alt="โลโก้บริษัท"/g) || []).length, pages.length);
  assert.equal((html.match(/src="\/logo.jpg"/g) || []).length, pages.length);
});
test("BI customer tax ID uses the saved document value and explicitly shows missing values", () => {
  const { BillingNoteDocument } = load(["components", "billing-note-document.tsx"], { "@/lib/accounting-date": dates, "@/lib/billing-note": model });
  const render = taxId => renderToStaticMarkup(React.createElement(BillingNoteDocument, {
    document: { ...model.newBillingNote(), taxId, invoices: [], totalAmount: 0 },
    company: { taxId: "9999999999999" },
  }));
  assert.match(render("0123456789012"), /class="bi-tax-id" data-bi-fit="true"><strong>เลขประจำตัวผู้เสียภาษี<\/strong>　0123456789012<\/p>/);
  assert.match(render(null), /class="bi-tax-id" data-bi-fit="true"><strong>เลขประจำตัวผู้เสียภาษี<\/strong>　-<\/p>/);
});
test("BI print shows whole-baht Thai words beside the final numeric total", () => {
  const { BillingNoteDocument } = load(["components", "billing-note-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/billing-note": model,
  });
  const html = renderToStaticMarkup(React.createElement(BillingNoteDocument, {
    document: { ...model.newBillingNote(), invoices: [], totalAmount: "85600.00" }, company: {},
  }));
  assert.match(html, /<td colSpan="3"><div data-bi-fit="true">แปดหมื่นห้าพันหกร้อยบาทถ้วน<\/div><\/td><td class="bi-money"><div data-bi-fit="true">85,600\.00<\/div><\/td>/);
});

test("BI fit starts at the displayed font size, shrinks only long fields and blocks overflow", async () => {
  const field = (preferred, maximum) => ({
    preferred, style: { fontSize: "" }, clientHeight: 20, clientWidth: 100,
    get scrollHeight() { return parseFloat(this.style.fontSize) > maximum ? 40 : 20; },
    scrollWidth: 100,
  });
  for (const overflow of [false, true]) {
    const fields = [field(18, 18), field(12, 12), field(12, 10), field(12, overflow ? 8 : 9)];
    let effect;
    let error;
    const ready = [];
    const { BillingNoteDocument } = load(["components", "billing-note-document.tsx"], {
      "@/lib/accounting-date": dates, "@/lib/billing-note": model,
      react: { ...React, useEffect: callback => { effect = callback; },
        useRef: () => ({ current: { querySelectorAll: () => fields } }),
        useState: () => ["", value => { error = value; }] },
    }, { document: { fonts: { ready: Promise.resolve() } },
      getComputedStyle: element => ({ fontSize: `${element.preferred * 96 / 72}px` }) });
    BillingNoteDocument({ document: { ...model.newBillingNote(), invoices: [], totalAmount: 0 }, company: {}, onReady: value => ready.push(value) });
    effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fields.map(item => item.style.fontSize), ["18pt", "12pt", "10pt", "9pt"]);
    assert.deepEqual(ready, [false, !overflow]);
    assert.equal(Boolean(error), overflow);
  }
});

test("BI print enlarges text while keeping the A4 page and 17-row layout", () => {
  const { BillingPrintStyles } = load(["components", "billing-note-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/billing-note": model,
  });
  const css = BillingPrintStyles({ allowed: true }).props.children;
  assert.match(css, /#bi-print-doc \{[^}]*font-size: 12pt; line-height: 1\.2;/);
  assert.match(css, /table\.bi-lines \{[^}]*font-size: 12pt;/);
  assert.match(css, /\.bi-company h1 \{[^}]*font-size: 18pt;/);
  assert.doesNotMatch(css, /font-size: 18pt !important/);
  assert.match(css, /\.bi-paper \{ width: 210mm; height: 296mm;/);
  assert.match(css, /\.bi-company \{[^}]*padding: 0 40mm;/);
  assert.match(css, /\.bi-company-logo \{ position: absolute; left: 9mm; top: 14mm; width: 38mm; height: 24mm; object-fit: contain;/);
});

test("BI centers invoice numbers, dates and footer text while amounts stay right-aligned", () => {
  const { BillingPrintStyles } = load(["components", "billing-note-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/billing-note": model,
  });
  for (const allowed of [false, true]) {
    const css = BillingPrintStyles({ allowed }).props.children;
    const centerRule = css.match(/([^{}]+)\{\s*text-align: center;\s*\}/g)
      .find(rule => rule.includes("tbody td:nth-child(2)"));
    assert.ok(centerRule);
    for (const column of [2, 3, 5]) assert.ok(centerRule.includes(`.bi-lines tbody td:nth-child(${column})`));
    for (const column of [1, 4, 6, 7]) assert.ok(!centerRule.includes(`tbody td:nth-child(${column})`));
    assert.ok(centerRule.includes(".bi-lines tfoot td:not(.bi-money)"));
    assert.match(css, /\.bi-money \{ text-align: right; \}/);
  }
});

test("BI repeats the Sale Thai company address and requested phone without changing customer snapshots", () => {
  const { BillingNoteDocument } = load(["components", "billing-note-document.tsx"], {
    "@/lib/accounting-date": dates, "@/lib/billing-note": model,
  });
  const html = renderToStaticMarkup(React.createElement(BillingNoteDocument, {
    document: { ...model.newBillingNote(), address: "Saved customer address", totalAmount: 0,
      invoices: Array.from({ length: 18 }, (_, i) => ({ invoiceId: `i${i}`, billingAmount: 0 })) },
    company: { companyName: "Configured company", address: "English company address", tel: "Old phone", taxId: "0135549009942" },
  }));
  assert.equal((html.match(/98 หมู่ที่ 6 ต.คลองสี่ อ.คลองหลวง จ.ปทุมธานี 12120/g) || []).length, 2);
  assert.equal((html.match(/โทร\. 02-1507694-5/g) || []).length, 2);
  assert.equal((html.match(/Saved customer address/g) || []).length, 2);
  assert.equal((html.match(/เลขประจำตัวผู้เสียภาษีอากร 0135549009942/g) || []).length, 2);
  assert.match(html, /Configured company/);
  assert.doesNotMatch(html, /English company address|Old phone/);
});
