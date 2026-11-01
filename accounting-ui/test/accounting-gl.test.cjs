const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
function load(relative, imports) {
  const file = path.join(__dirname, "..", "src", relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename: file });
  return module.exports;
}
test("GL configuration client sends only explicit mappings and revision; no automatic posting API exists", async () => {
  const calls = [];
  const lib = load("lib\\accounting-gl.ts", { "@/lib/api": { apiFetch: (url, options) => { calls.push({ url, options }); return Promise.resolve({}); } } });
  await lib.AccountingGlApi.get();
  await lib.AccountingGlApi.save({ revision: 1, fiscalYearStartMonth: 4, policyNotes: "Review VAT", mappings: [{ role: "AR", accountId: "ar" }] });
  assert.equal(calls[0].url, "/api/accounting-gl");
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.revision, 1);
  assert.equal(payload.fiscalYearStartMonth, 4);
  assert.equal(Object.hasOwn(payload, "postingEnabled"), false);
});
test("GL settings deny nonadmins and clearly keep posting/closing disabled", () => {
  let admin = false;
  const { default: Page } = load("app\\settings\\gl\\page.tsx", {
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({ isAdmin: admin }) },
    "@/lib/accounting-gl": { AccountingGlApi: {} },
  });
  assert.match(renderToStaticMarkup(React.createElement(Page)), /เฉพาะ admin/);
  admin = true;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /การลงบัญชีอัตโนมัติและการปิดงวดยังปิดอยู่/);
  assert.match(html, /ไม่สร้าง Journal/);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "app", "settings", "gl", "page.tsx"), "utf8");
  assert.match(source, /mappings\.map\(\(\{ role, accountId \}\) => \(\{ role, accountId \}\)\)/);
  assert.match(source, /ปิดใช้งาน \/ ต้องเลือกใหม่/);
});
