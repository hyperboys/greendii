const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
function load(relative, imports = {}) {
  Object.assign(imports, require("./helpers/document-ui-mocks.cjs"));
  imports["@/components/manual-submit-form"] = { ManualSubmitForm: "form" };
  const filename = path.join(__dirname, "..", "src", relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const calls = [];
const lib = load("lib\\inventory-controls.ts", {
  "./api": { apiFetch: (url, options) => { calls.push({ url, options }); return Promise.resolve({}); } },
});
test("Transfer actions preserve independent permissions, creator prohibition and terminal states", () => {
  const permissions = { create: true, approve: true, cancel: true };
  const actions = (status, user = "reviewer", can = permissions) =>
    Array.from(lib.transferActions({ status, createdById: "creator" }, can, user));
  assert.deepEqual(actions("draft"), ["submit", "cancel"]);
  assert.deepEqual(actions("returned"), ["submit", "cancel"]);
  assert.deepEqual(actions("pending"), ["approve", "return", "reject", "cancel"]);
  assert.deepEqual(actions("pending", "creator"), ["return", "reject", "cancel"]);
  assert.deepEqual(actions("pending", ""), ["return", "reject", "cancel"]);
  for (const status of ["draft", "pending", "approved", "returned"]) {
    assert.deepEqual(actions(status, "viewer", { create: false, approve: false, cancel: false }), []);
  }
  assert.deepEqual(actions("cancelled"), []);
  assert.deepEqual(actions("rejected"), []);
});
test("Inventory requests send exact decimal strings, revisions and explicit cost evidence", async () => {
  await lib.InventoryControlsApi.initialize({
    requestKey: "test-request-key", warehouseId: "main", productId: "mat", quantity: "10.125",
    totalValue: "100.123456789012", evidence: "Reviewed original cost", asOf: "2026-10-31", updatedAt: "revision-time",
  });
  await lib.InventoryControlsApi.transferAction({ id: "a/b", revision: 3 }, "cancel", "Returned physically", "2026-11-01", true);
  const initialization = JSON.parse(calls[0].options.body);
  assert.equal(initialization.quantity, "10.125");
  assert.equal(initialization.totalValue, "100.123456789012");
  assert.equal(initialization.evidence, "Reviewed original cost");
  assert.equal(calls[1].url, "/api/inventory/transfers/a%2Fb/cancel");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    revision: 3, reason: "Returned physically", cancellationDate: "2026-11-01", physicalReturnConfirmed: true,
  });
});
test("Inventory screens deny viewer writes and explicitly explain unvalued history and guarded reversal", () => {
  let write = false;
  const imports = {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "./accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => write },
    "@/lib/auth": { getStoredUser: () => ({ id: "creator" }) },
    "./date-input": { DateInput: props => React.createElement("input", { value: props.value, readOnly: true }) },
    "@/lib/goods-receipt": { today: () => "2026-11-01" },
    "@/lib/inventory-controls": lib,
  };
  const { StockTransfers } = load("components\\stock-transfers.tsx", imports);
  const { InventoryControls } = load("components\\inventory-controls.tsx", imports);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(StockTransfers)), /สร้างใบโอน<\/button>/);
  write = true;
  assert.match(renderToStaticMarkup(React.createElement(StockTransfers)), /สร้างใบโอน<\/button>/);
  const costs = renderToStaticMarkup(React.createElement(InventoryControls));
  assert.match(costs, /ยังไม่ตีมูลค่า ไม่ใช่ศูนย์หรือราคาหลัก/);
  assert.match(costs, /ระบบปฏิเสธเพื่อไม่ทำให้ค่าเฉลี่ยผิด/);
  assert.match(costs, /ไม่รวม VAT/);
  assert.match(costs, /ไม่มี GL อัตโนมัติ/);
});
