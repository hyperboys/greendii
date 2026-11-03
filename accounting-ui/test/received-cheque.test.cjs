const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file, imports = {}) {
  imports["@/components/manual-submit-form"] = { ManualSubmitForm: "form" };
  const filename = path.join(__dirname, "..", "src", ...file);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => imports[name] || require(name) }, { filename });
  return module.exports;
}
const model = load(["lib", "received-cheque.ts"]);
const doc = { id: "rv", rvNo: "RV1", paymentMethod: "cheque", lifecycleVersion: 1, status: "approved",
  receivedChequeState: "received", confirmedAt: "2026-10-27", updatedAt: "revision",
  allocations: [{ receivedAmount: "960", whtAmount: "30", bankFee: "10" }] };
test("received cheque UI state gates use final RV confirmation and preserve mixed tax/fee dishonour policy", () => {
  assert.deepEqual(Array.from(model.receivedChequeActions(doc)), ["deposit", "dishonour"]);
  assert.deepEqual(Array.from(model.receivedChequeActions({ ...doc, receivedChequeState: "deposited" })), ["clear", "dishonour"]);
  for (const change of [{ status: "pending" }, { status: "cancelled" }, { lifecycleVersion: 0 }, { confirmedAt: null },
    { paymentMethod: "cash" }, { receivedChequeState: null }, { receivedChequeState: "dishonoured" },
    { receivedChequeState: "cleared" }, { chequeDishonouredAt: "2026-10-28" }]) {
    assert.equal(model.receivedChequeActions({ ...doc, ...change }).length, 0);
  }
});
test("received cheque controls show policy/history, hide actions for viewer and render separate received-register page", () => {
  let writer = true;
  const components = load(["components", "received-cheques.tsx"], {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/api": {}, "@/lib/received-cheque": model,
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => writer },
    "@/components/date-input": { DateInput: () => null },
    "@/lib/accounting-date": { formatAccountingDate: value => value },
  });
  const render = value => renderToStaticMarkup(React.createElement(components.ReceivedChequeControls, { doc: value, onChange() {} }));
  assert.match(render(doc), /เช็คคืนและกลับหนี้/);
  assert.match(render(doc), /WHT\/ค่าธรรมเนียม/);
  assert.doesNotMatch(render({ ...doc, status: "pending" }), /<button/);
  writer = false; assert.doesNotMatch(render(doc), /<button/);
  const bounced = render({ ...doc, receivedChequeState: "dishonoured", chequeDishonouredAt: "2026-10-28", chequeDishonourReason: "Bank returned" });
  assert.match(bounced, /Bank returned/); assert.doesNotMatch(bounced, /<button/);
  const register = renderToStaticMarkup(React.createElement(components.ReceivedCheques));
  assert.match(register, /ไม่ใช่เช็คจ่าย CQ/);
  const Page = load(["app", "ar", "receipts", "cheques", "page.tsx"], { "@/components/received-cheques": components }).default;
  assert.equal(Page().type, components.ReceivedCheques);
});
