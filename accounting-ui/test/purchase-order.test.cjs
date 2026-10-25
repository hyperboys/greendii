const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const filename = path.join(__dirname, "..", "src", "lib", "purchase-order.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
  fileName: filename,
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(source, { exports: loaded.exports, module: loaded }, { filename });

test("Purchase Order totals match the provided PO sample and line discounts", () => {
  const lines = [
    { partNo: "A-001", desc: "Line one", qty: 1000, unit: "Pcs", unitPrice: 2.6, discount: 0, remark: "" },
    { partNo: "A-001", desc: "Line two", qty: 1000, unit: "Pcs", unitPrice: 0.2, discount: 0, remark: "" },
    { partNo: "A-001", desc: "Line three", qty: 10, unit: "Kg.", unitPrice: 80, discount: 0, remark: "" },
    { partNo: "A-001", desc: "Line four", qty: 1000, unit: "Pcs", unitPrice: 0.82, discount: 0, remark: "" },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(loaded.exports.purchaseOrderTotals(lines, "VAT7%"))),
    { subTotal: 4420, discount: 0, taxableAmount: 4420, vat: 309.4, netAmount: 4729.4 },
  );
  assert.equal(loaded.exports.purchaseOrderLineAmount({ ...lines[0], qty: 2, unitPrice: 100, discount: 10 }), 190);
  assert.equal(loaded.exports.purchaseOrderTotals(lines, "NO_VAT").vat, 0);
});
