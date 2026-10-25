const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, imports = {}) {
  const filename = path.join(__dirname, "..", "src", ...relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  }, { filename });
  return loaded.exports;
}

test("PO direct routes select new, view and edit modes and reject invalid URLs", () => {
  const Page = load(["app", "ap", "vouchers", "[...record]", "page.tsx"], {
    "next/navigation": { notFound: () => { throw new Error("Not found"); } },
    "@/components/purchase-orders": { PurchaseOrders: () => null },
  }).default;
  for (const [record, mode, id] of [
    [["new"], "new", undefined], [["po-1"], "view", "po-1"], [["po-1", "edit"], "edit", "po-1"],
  ]) {
    const page = Page({ params: { record }, searchParams: {} });
    assert.equal(page.props.mode, mode);
    assert.equal(page.props.recordId, id);
  }
  for (const record of [["new", "edit"], ["po-1", "delete"], ["po-1", "edit", "extra"]]) {
    assert.throws(() => Page({ params: { record }, searchParams: {} }), /Not found/);
  }
});

test("PO creation is a full page with date fields and quantity step; viewers cannot create or edit", () => {
  let writeAllowed = true;
  const dates = load(["lib", "accounting-date.ts"]);
  const { DateInput } = load(["components", "date-input.tsx"], { "@/lib/accounting-date": dates });
  const { PurchaseOrders } = load(["components", "purchase-orders.tsx"], {
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/api": {},
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => writeAllowed },
    "@/lib/accounting-navigation": load(["lib", "accounting-navigation.ts"]),
    "@/lib/purchase-order": load(["lib", "purchase-order.ts"]),
    "@/lib/accounting-date": dates,
    "@/components/date-input": { DateInput },
    "@/components/purchase-order-document": { PurchaseOrderPrintStyles: () => null },
  });
  const render = mode => renderToStaticMarkup(React.createElement(PurchaseOrders, { mode }));
  const html = render("new");
  assert.doesNotMatch(html, /role="dialog"|aria-modal|fixed inset-0/);
  assert.match(html, /placeholder="dd\/mm\/yyyy"/);
  assert.match(html, /type="number" min="1" step="1"/);
  assert.match(html, /href="\/ap\/vouchers\?tab=po"/);
  writeAllowed = false;
  for (const mode of ["new", "edit"]) {
    assert.match(render(mode), /ไม่มีสิทธิ์สร้างหรือแก้ไขใบสั่งซื้อ/);
    assert.doesNotMatch(render(mode), /<form/);
  }
});
