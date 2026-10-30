const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", "src", ...file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, ...globals,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  }, { filename });
  return module.exports;
}

function nodes(tree, type) {
  if (!React.isValidElement(tree)) return [];
  return [...(tree.type === type ? [tree] : []),
    ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, type))];
}

test("Shared unit suggestions load database values, refresh, report errors and skip unauthorized users", async () => {
  const states = [], effects = [];
  let cursor = 0, allowed = true, fail = false, focus, pending, requests = 0;
  const { UnitOptions } = load(["components", "unit-options.tsx"], {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect(callback) { effects.push(callback); },
    },
    "next/navigation": { usePathname: () => "/master/products/new" },
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => allowed },
    "@/lib/api": { apiFetch: endpoint => {
      requests++;
      assert.equal(endpoint, "/api/accounting-access/lookups/units");
      pending = fail ? Promise.reject(new Error("Database unavailable")) : Promise.resolve([{ id: "unit", name: "Custom DB unit" }]);
      return pending;
    } },
  }, { window: { addEventListener: (_type, callback) => { focus = callback; }, removeEventListener() {} } });
  const render = () => { cursor = 0; return UnitOptions(); };
  let tree = render();
  const cleanup = effects.shift()();
  await pending;
  await new Promise(setImmediate);
  tree = render();
  assert.equal(nodes(tree, "datalist")[0].props.id, "accounting-unit-options");
  assert.deepEqual(nodes(tree, "option").map(option => option.props.value), ["Custom DB unit"]);
  fail = true;
  await focus();
  tree = render();
  assert.equal(nodes(tree, "option").length, 0);
  assert.match(renderToStaticMarkup(tree), /role="alert".*Database unavailable/);
  const retry = nodes(tree, "button")[0];
  retry.props.onClick();
  assert.equal(states[2], 1);
  fail = false;
  await focus();
  assert.equal(nodes(render(), "option").length, 1);
  cleanup();
  allowed = false;
  effects.length = 0;
  tree = render();
  effects.shift()();
  assert.equal(nodes(tree, "option").length, 0);
  assert.equal(requests, 3);
  const layout = fs.readFileSync(path.join(__dirname, "..", "src", "app", "layout.tsx"), "utf8");
  assert.equal((layout.match(/<UnitOptions \/>/g) || []).length, 1);
});

test("SO/Invoice units accept suggestions, custom text and legacy spelling without normalization", () => {
  const model = load(["lib", "delivery-order.ts"]);
  const { DocumentItems } = load(["components", "document-items.tsx"], {
    react: { ...React, useState: initial => [initial, () => {}] },
    "@/lib/delivery-order": model,
  });
  let items = [{ ...model.newDeliveryOrderLine(), unit: "PCS", desc: "Saved", unitPrice: 12 }];
  const render = readOnly => DocumentItems({ items, products: [], readOnly, onChange: value => { items = value; } });
  const unitInput = () => nodes(render(false), "input").find(input => input.props.list === "accounting-unit-options");
  assert.equal(unitInput().props.value, "PCS");
  assert.equal(unitInput().props.required, true);
  assert.equal(unitInput().props.pattern, undefined);
  for (const unit of ["Lot", "ม้วนพิเศษ", "pcs", ""]) {
    unitInput().props.onChange({ target: { value: unit } });
    assert.equal(items[0].unit, unit);
    assert.equal(unitInput().props.value, unit);
    assert.equal(items[0].unitPrice, 12);
  }
  assert.match(renderToStaticMarkup(render(true)), /<fieldset disabled=""/);
});

test("Every free-entry unit surface points to the shared suggestions", () => {
  for (const file of ["document-items.tsx", "purchase-orders.tsx", "credit-notes.tsx"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", file), "utf8");
    assert.match(source, /<input[^>]*list="accounting-unit-options"[^>]*value=\{(?:item|row)\.unit\}/, file);
  }
});
