const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file, imports = {}) {
  const filename = path.join(__dirname, "..", "src", ...file);
  const result = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module: result, exports: result.exports,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return result.exports;
}
const model = load(["lib", "master-data.ts"]);
test("Master hydration preserves zero prices, disabled records, revision and all fields", () => {
  const form = model.masterForm({ code: "P", name: "Part", price: 0, cost: "12.30", active: false,
    unit: "PCS", category: "Tools", productType: "manufactured", vatConfig: "NO_VAT", updatedAt: "revision" });
  assert.equal(form.price, "0");
  assert.equal(form.cost, "12.30");
  assert.equal(form.active, false);
  assert.equal(form.updatedAt, "revision");
  assert.equal(form.productType, "manufactured");
});
test("CSV exports all filtered rows and nested branches safely, with UTF-8 BOM and escaped formulas/quotes", () => {
  const csv = model.masterCsv([{ code: "00001", name: '=HYPERLINK("example")', branches: [{ name: "Branch", bank: "001" }] },
    { code: "00002", name: "Two\nlines", other: "@formula" }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes(`"'=HYPERLINK(""example"")"`));
  assert.ok(csv.includes('"00001"'));
  assert.ok(csv.includes('""bank"":""001""'));
  assert.ok(csv.includes('"Two\nlines"'));
  assert.equal(model.csvCell("  +formula"), `"'  +formula"`);
  const full = model.masterCsv(Array.from({ length: 26 }, (_, index) => ({ code: `P-${index}` })));
  assert.equal(full.split("\r\n").length, 27);
  assert.ok(full.includes('"P-25"'));
});
test("Four master direct routes select full-page modes and reject unknown domains/actions", () => {
  const Page = load(["app", "master", "[kind]", "[...record]", "page.tsx"], {
    "next/navigation": { notFound: () => { throw new Error("Not found"); } },
    "@/components/simple-master": { SimpleMaster: () => null },
  }).default;
  for (const kind of ["sales", "products", "warehouses", "coa"]) {
    for (const [record, mode] of [[["new"], "new"], [["id"], "view"], [["id", "edit"], "edit"]]) {
      const element = Page({ params: { kind, record } });
      assert.equal(element.props.mode, mode);
      assert.equal(element.props.kind, kind);
    }
  }
  for (const [kind, record] of [["unknown", ["new"]], ["coa", ["new", "edit"]], ["products", ["id", "delete"]], ["sales", []]]) {
    assert.throws(() => Page({ params: { kind, record } }), /Not found/);
  }
});
test("All simple master forms render complete editable fields while viewers remain read-only", () => {
  let index = 0;
  let allowed = true;
  const row = { id: "p", code: "P", name: "Part", active: true };
  const { SimpleMaster } = load(["components", "simple-master.tsx"], {
    react: { ...React, useState: initial => {
      const states = [[], row, model.masterForm(row), "", "all", "", 1, false, false, ""];
      return [states[index++] ?? initial, () => {}];
    }, useEffect: () => {}, useCallback: fn => fn, useRef: value => ({ current: value }) },
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/lib/api": {}, "@/lib/master-data": model,
    "@/lib/accounting-access": { canUseAccounting: () => allowed },
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/components/master-record-tools": { MasterPagination: () => null, MasterRecordTools: () => null },
  });
  for (const [kind, labels] of [["products", ["ประเภทสินค้า", "หน่วย", "หมวดหมู่", "VAT", "ราคาขาย", "ต้นทุนอ้างอิง", "รายละเอียด"]],
    ["warehouses", ["ที่ตั้ง", "รายละเอียด"]], ["sales", ["โทรศัพท์", "อีเมล"]], ["coa", ["หมวดบัญชี", "ชนิดบัญชี", "Mapping"]]]) {
    index = 0; allowed = true;
    const editor = renderToStaticMarkup(React.createElement(SimpleMaster, { kind, mode: "edit", recordId: "p" }));
    for (const label of labels) assert.ok(editor.includes(label), `${kind}: ${label}`);
    assert.equal(editor.includes("<fieldset disabled="), false);
    assert.equal(editor.includes('role="dialog"'), false);
    index = 0; allowed = false;
    const viewer = renderToStaticMarkup(React.createElement(SimpleMaster, { kind, mode: "view", recordId: "p" }));
    assert.ok(viewer.includes("<fieldset disabled="));
    assert.equal(viewer.includes('type="submit"'), false);
  }
});
