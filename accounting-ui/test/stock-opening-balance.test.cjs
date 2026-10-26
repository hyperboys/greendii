const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), test = require("node:test");
const vm = require("node:vm"), ts = require("typescript");
function load() {
  const filename = path.join(__dirname, "..", "src", "lib", "stock-opening-balance.ts"), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, URL, Blob, window: { setTimeout },
    require: name => name === "./api" ? { apiFetch: async (...args) => args } :
      name === "./master-data" ? { csvCell: value => `"${String(value ?? "").replaceAll('"', '""')}"`, exportMasterCsv: () => {} } :
        name === "./accounting-date" ? { formatAccountingDate: value => value } : require(name) }, { filename });
  return module.exports;
}
const lib = load();
const products = [
  { id: "mat", code: "MAT-01", name: "Material", unit: "Pcs", productType: "stored", active: true },
  { id: "assembly", code: "ASSY", name: "Assembly", unit: "Unit", productType: "manufactured", active: true },
  { id: "service", code: "SVC", name: "Service", unit: "Job", productType: "service", active: true },
];

test("Opening balance CSV accepts quoted codes and exact 3-decimal counts", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(lib.parseOpeningCsv(
    "\uFEFFproductCode,countedQty\r\nMAT-01,1.250\r\nASSY,0", products,
  ))), [{ productId: "mat", countedQty: "1.250" }, { productId: "assembly", countedQty: "0" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(lib.parseOpeningCsv(
    'productCode,countedQty\n"A,1",2.5', [{ ...products[0], code: "A,1" }],
  ))), [{ productId: "mat", countedQty: "2.5" }]);
  assert.match(lib.openingCsvTemplate(), /^\uFEFFproductCode,countedQty/);
});

test("Opening balance CSV rejects invalid columns, duplicates, services and invalid quantities", () => {
  for (const csv of [
    "productCode,qty\nMAT-01,2",
    "productCode,countedQty\nMAT-01,\n",
    "productCode,countedQty\nMAT-01,-1",
    "productCode,countedQty\nMAT-01,1.0001",
    "productCode,countedQty\nMAT-01,1\nMAT-01,2",
    "productCode,countedQty\nSVC,1",
    'productCode,countedQty\n"MAT-01,1',
  ]) assert.throws(() => lib.parseOpeningCsv(csv, products));
});

test("Opening balance API encodes filters and action revision", async () => {
  const listArgs = await lib.StockOpeningApi.list({ q: "OB 1", status: "pending" });
  assert.equal(listArgs[0], "/api/inventory/opening-balances?q=OB+1&status=pending");
  const actionArgs = await lib.StockOpeningApi.action({ id: "a/b", updatedAt: "rev" }, "approve");
  assert.equal(actionArgs[0], "/api/inventory/opening-balances/a%2Fb/approve");
  assert.deepEqual(JSON.parse(actionArgs[1].body), { updatedAt: "rev" });
});
