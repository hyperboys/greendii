const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
function load(relative, imports = {}) {
  const filename = path.join(__dirname, "..", "src", relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
test("Accounting notification client uses paged owner API and explicit read actions", async () => {
  const calls = [];
  const { AccountingNotificationsApi } = load("lib\\accounting-notifications.ts", { "@/lib/api": { apiFetch: (url, options) => { calls.push([url, options]); return Promise.resolve({}); } } });
  await AccountingNotificationsApi.list(3); await AccountingNotificationsApi.read("a/b"); await AccountingNotificationsApi.readAll();
  assert.equal(calls[0][0], "/api/accounting-notifications?page=3&pageSize=25");
  assert.equal(calls[1][0], "/api/accounting-notifications/a%2Fb/read");
  assert.equal(calls[1][1].method, "PATCH");
  assert.equal(calls[2][0], "/api/accounting-notifications/read-all");
});
test("Notification page explicitly surfaces errors, separates unread state and refreshes without stale responses", () => {
  const { default: Page } = load("app\\notifications\\page.tsx", {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/accounting-notifications": { AccountingNotificationsApi: {} },
    "@/lib/accounting-date": { formatAccountingDateTime: value => value },
  });
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /ไม่ส่งอีเมลหรือ LINE/);
  assert.match(html, /อ่านทั้งหมด/);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "app", "notifications", "page.tsx"), "utf8");
  assert.match(source, /current === request/);
  assert.match(source, /60000/);
  assert.match(source, /role="alert"/);
  assert.match(source, /result\?\.page === page/);
});
