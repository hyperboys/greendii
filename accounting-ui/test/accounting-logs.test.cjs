const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
function load(relative, imports = {}) {
  const filename = path.join(__dirname, "..", "src", relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, Intl, Date,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
test("Accounting log client preserves filters and separates audit and activity endpoints; dates use Bangkok", async () => {
  const calls = [];
  const lib = load("lib\\accounting-logs.ts", { "./api": { apiFetch: url => { calls.push(url); return Promise.resolve({}); } } });
  const filters = { page: "2", limit: "50", search: "INV & 1", user: "สมชาย", from: "2026-11-01", to: "", entityType: "invoice", action: "approve", method: "", status: "" };
  await lib.AccountingLogsApi.audit(filters); await lib.AccountingLogsApi.activity(filters);
  assert.equal(calls[0].startsWith("/api/accounting-logs?"), true);
  assert.equal(calls[1].startsWith("/api/accounting-logs/activity?"), true);
  const params = new URLSearchParams(calls[0].split("?")[1]);
  assert.equal(params.get("search"), filters.search); assert.equal(params.get("user"), filters.user);
  assert.equal(params.get("page"), "2");
  assert.match(lib.logDateTime("2026-10-31T17:00:00Z"), /1\/11\/69.*00:00:00/);
  const meta = lib.activityPath("/api/ar/invoices [rid:r1] [act:approve] [err:Conflict]");
  assert.equal(meta.path, "/api/ar/invoices"); assert.equal(meta.requestId, "r1");
  assert.equal(meta.error, "Conflict");
});
test("Admin log screens are read-only, render both log types and hide stale rows on errors", () => {
  let admin = false, cursor = 0;
  const values = [];
  const lib = load("lib\\accounting-logs.ts", { "./api": {} });
  const { default: Page } = load("app\\settings\\logs\\page.tsx", {
    react: { ...React, useEffect: () => {}, useState: initial => {
      const index = cursor++;
      return [index in values ? values[index] : initial, value => { values[index] = value; }];
    } },
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({ isAdmin: admin }) },
    "@/components/date-input": { DateInput: ({ value }) => React.createElement("input", { value, readOnly: true }) },
    "@/lib/accounting-logs": lib,
  });
  const render = () => { cursor = 0; return renderToStaticMarkup(React.createElement(Page)); };
  assert.match(render(), /เฉพาะ admin/);
  admin = true;
  values[3] = [{ id: "audit", createdAt: "2026-11-01T00:00:00Z", entityType: "invoice", entityId: "invoice1", docNo: "INV001",
    action: "approve", performedBy: { fullName: "Reviewer", role: "sales" }, reason: "<script>unsafe</script>",
    oldValue: { total: "90" }, newValue: { total: "100" }, changedFields: ["total"], requestId: "r1" }];
  values[5] = { invoice: "ใบแจ้งหนี้" }; values[6] = 51; values[7] = false;
  let html = render();
  assert.match(html, /INV001/); assert.match(html, /ข้อมูลก่อน\/หลัง/);
  assert.match(html, /Reviewer/); assert.match(html, /&lt;script&gt;unsafe/);
  assert.doesNotMatch(html, /<script>unsafe/);
  assert.match(html, /หน้า 1\/2/); assert.match(html, /อ่านอย่างเดียว/);
  values[8] = "Log storage unavailable"; html = render();
  assert.match(html, /role="alert"/); assert.doesNotMatch(html, /INV001/);
  values[8] = ""; values[0] = "activity";
  values[4] = [{ id: "activity", createdAt: "2026-11-01T00:00:00Z", path: "/api/ar/invoices [rid:request1] [err:conflict]",
    method: "POST", statusCode: 409, durationMs: 21, username: "Reviewer" }];
  html = render();
  assert.match(html, /409/); assert.match(html, /request1/); assert.match(html, /21 ms/);
  assert.doesNotMatch(html, /ข้อมูลก่อน\/หลัง/);
});
