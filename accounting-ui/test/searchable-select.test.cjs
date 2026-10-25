const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function fixture(overrides = {}) {
  const states = [];
  let cursor = 0;
  const selected = [];
  const queries = [];
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "components", "searchable-select.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name === "react" ? {
    ...React, useId: () => "select-test", useEffect() {}, useRef: () => ({ current: null }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
  } : require(name) });
  const props = {
    label: "ลูกค้า", value: "a", required: true, placeholder: "เลือก", searchPlaceholder: "ค้นหา",
    options: [{ value: "a", label: "A001 — Alpha" }, { value: "b", label: "B002 — Beta" }],
    onChange: value => { props.value = value; selected.push(value); },
    ...overrides,
  };
  function render() { cursor = 0; return module.exports.SearchableSelect(props); }
  function nodes(tree, type) {
    if (!React.isValidElement(tree)) return [];
    return [...(tree.type === type ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, type))];
  }
  const input = () => nodes(render(), "input")[0];
  const key = value => {
    let prevented = false;
    input().props.onKeyDown({ key: value, nativeEvent: {}, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { render, input, key, props, selected, queries, nodes };
}

test("Searchable dropdown filters locally and keyboard Enter selects without submitting the form", () => {
  const f = fixture();
  assert.equal(f.input().props.value, "A001 — Alpha");
  assert.equal(f.input().props.required, false, "Existing selection remains valid while search text is empty");
  f.input().props.onFocus();
  assert.equal(f.input().props["aria-expanded"], true);
  f.input().props.onChange({ target: { value: "b002" } });
  const options = f.nodes(f.render(), "button");
  assert.equal(options.length, 1);
  assert.equal(options[0].props.children, "B002 — Beta");
  assert.equal(f.key("ArrowDown"), true);
  assert.equal(f.input().props["aria-activedescendant"], "select-test-option-0");
  assert.equal(f.key("Enter"), true);
  assert.deepEqual(f.selected, ["b"]);
  assert.equal(f.input().props.value, "B002 — Beta");
  assert.equal(f.input().props["aria-expanded"], false);
});

test("Unselected query is discarded on Escape/outside blur without replacing saved selection", () => {
  const f = fixture();
  f.input().props.onFocus();
  f.input().props.onChange({ target: { value: "missing" } });
  assert.match(renderToStaticMarkup(f.render()), /ไม่พบรายการ/);
  f.key("Escape");
  assert.equal(f.input().props.value, "A001 — Alpha");
  assert.deepEqual(f.selected, []);
  f.input().props.onFocus();
  f.render().props.onBlur({ relatedTarget: null, currentTarget: { contains: () => false } });
  assert.equal(f.input().props["aria-expanded"], false);
  assert.equal(f.input().props.value, "A001 — Alpha");
});

test("Remote dropdown searches without filtering server results; preserves selected label outside result page", () => {
  const queries = [];
  const f = fixture({
    value: "old-wo", selectedLabel: "WO-OLD — Saved project", required: false,
    options: [{ value: "", label: "ไม่อ้างอิง WO" }, { value: "new-wo", label: "WO-NEW" }],
    onSearch: query => queries.push(query),
  });
  f.input().props.onFocus();
  f.input().props.onChange({ target: { value: "project search" } });
  assert.deepEqual(queries, ["", "project search"]);
  assert.equal(f.nodes(f.render(), "button").length, 2);
  f.nodes(f.render(), "button")[0].props.onClick();
  assert.deepEqual(f.selected, [""]);
});

test("Loading/error states do not allow keyboard selection of stale remote results", () => {
  for (const state of [{ loading: true }, { error: "ค้นหาไม่สำเร็จ" }]) {
    const f = fixture(state);
    f.input().props.onFocus();
    assert.equal(f.nodes(f.render(), "button").length, 0);
    f.key("Enter");
    assert.deepEqual(f.selected, []);
    const html = renderToStaticMarkup(f.render());
    assert.match(html, state.loading ? /กำลังค้นหา/ : /role="alert"/);
  }
});

test("ArrowUp starts at the last option and a missing customer remains required", () => {
  const f = fixture({ value: "" });
  assert.equal(f.input().props.required, true);
  f.input().props.onFocus();
  f.key("ArrowUp");
  f.key("Enter");
  assert.deepEqual(f.selected, ["b"]);
});

test("Optional reference can still be cleared when remote lookup fails", () => {
  const f = fixture({
    required: false, error: "Lookup failed",
    options: [{ value: "", label: "ไม่อ้างอิง WO" }, { value: "stale", label: "Stale WO" }],
  });
  f.input().props.onFocus();
  assert.equal(f.nodes(f.render(), "button").length, 1);
  f.nodes(f.render(), "button")[0].props.onClick();
  assert.deepEqual(f.selected, [""]);
});
