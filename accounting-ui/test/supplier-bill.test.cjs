const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs");
const path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
function load(relative) {
  const filename = path.join(__dirname, "..", "src", relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require }, { filename });
  return module.exports;
}
const lib = load(path.join("lib", "supplier-bill.ts"));

test("Supplier bill preview uses exact satang amounts and server VAT rounding", () => {
  assert.equal(lib.moneyCents("1,000.07"), 100007);
  assert.equal(lib.moneyCents("0.5"), 50);
  for (const bad of ["", "-1", "1.001", "abc", "1e3"]) assert.equal(lib.moneyCents(bad), null);
  assert.equal(lib.vatCents(50, "VAT7"), 4);
  assert.equal(lib.vatCents(100054, "VAT7"), 7004);
  assert.equal(lib.vatCents(100054, "NO_VAT"), 0);
  const preview = lib.billPreview([{ amount: "1000.07" }, { amount: "0.47" }], "VAT7");
  assert.deepEqual({ ...preview }, { valid: true, subTotal: 100054, vat: 7004, net: 107058 });
  assert.equal(lib.billPreview([{ amount: "0" }], "VAT7").valid, false);
  assert.equal(lib.centsText(107058), "1,070.58");
});

test("Due date defaults to supplier invoice date plus credit term and manual dates are sent only when chosen", () => {
  assert.equal(lib.addDaysIso("2026-10-01", 30), "2026-10-31");
  assert.equal(lib.addDaysIso("2026-12-15", 30), "2027-01-14");
  assert.equal(lib.computedDueDate({ supplierInvoiceDate: "2026-10-01", creditTermDays: "x" }), "");
  const form = { ...lib.newSupplierBillForm("2026-10-01"), supplierId: "sup", supplierInvoiceNo: " INV-1 ", taxInvoiceNo: "TX-1",
    creditTermDays: "30", dueDate: "2026-12-01", items: [{ desc: " Goods ", amount: "1,000.00" }] };
  assert.equal(lib.computedDueDate(form), "2026-10-31");
  const auto = lib.supplierBillPayload(form);
  assert.equal(auto.dueDate, null);
  assert.equal(auto.creditTermDays, 30);
  assert.equal(auto.supplierInvoiceNo, "INV-1");
  assert.deepEqual({ ...auto.items[0] }, { desc: "Goods", amount: "1000.00" });
  assert.equal(lib.supplierBillPayload({ ...form, manualDueDate: true }).dueDate, "2026-12-01");
  assert.equal(lib.supplierBillPayload({ ...form, creditTermDays: "" }).creditTermDays, null);
  assert.equal(lib.supplierBillPayload({ ...form, taxInvoiceNo: " " }).taxInvoiceDate, null);
});

test("Form validation and settlement defaults never exceed bill outstanding or PV availability", () => {
  const form = { ...lib.newSupplierBillForm("2026-10-01"), supplierId: "sup", supplierInvoiceNo: "INV", taxInvoiceNo: "TX",
    items: [{ desc: "Goods", amount: "10.00" }] };
  assert.equal(lib.supplierBillFormError(form), "");
  assert.ok(lib.supplierBillFormError({ ...form, taxInvoiceNo: "" }));
  assert.equal(lib.supplierBillFormError({ ...form, taxInvoiceNo: "", vatMode: "NO_VAT" }), "");
  assert.ok(lib.supplierBillFormError({ ...form, creditTermDays: "366" }));
  assert.ok(lib.supplierBillFormError({ ...form, manualDueDate: true, dueDate: "2026-09-30" }));
  assert.ok(lib.supplierBillFormError({ ...form, items: [{ desc: "Goods", amount: "1.001" }] }));
  assert.equal(lib.defaultSettlementAmount({ outstandingAmount: 70.58 }, { availableAmount: 1030 }), "70.58");
  assert.equal(lib.defaultSettlementAmount({ outstandingAmount: 1070.58 }, { availableAmount: 30 }), "30.00");
  assert.equal(lib.defaultSettlementAmount({ outstandingAmount: 1 }), "");
  const bill = { supplierId: "sup", supplierInvoiceNo: "INV", supplierInvoiceDate: "2026-10-01T00:00:00.000Z", taxInvoiceNo: null,
    taxInvoiceDate: null, vatMode: "NO_VAT", creditTermDays: 0, dueDateManual: false, dueDate: "2026-10-01T00:00:00.000Z",
    items: [{ desc: "A", amount: 5 }], reference: null, remark: null };
  const edit = lib.supplierBillForm(bill);
  assert.equal(edit.supplierInvoiceDate, "2026-10-01");
  assert.equal(edit.items[0].amount, "5.00");
  assert.equal(edit.creditTermDays, "0");
});