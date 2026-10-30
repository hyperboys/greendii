const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

function load(relative, dependencies = {}) {
  const filename = path.join(__dirname, "..", "src", relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: name => dependencies[name] || require(name),
    Date,
    Node: TestNode,
    document: dependencies.document,
  }, { filename });
  return module.exports;
}

class TestNode {}

function nodes(tree, type) {
  if (!React.isValidElement(tree)) return [];
  return [...(tree.type === type ? [tree] : []),
    ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, type))];
}

function fixture(overrides = {}) {
  const states = [], refs = [], effects = [], pending = [], selected = [];
  const listeners = new Map();
  let stateCursor = 0, refCursor = 0, effectCursor = 0, tree, focused = false, validity = "";
  const inputElement = new TestNode();
  inputElement.setCustomValidity = message => { validity = message; };
  inputElement.matches = () => Boolean(props.disabled || props.fieldsetDisabled);
  inputElement.focus = () => {
    if (!focused) { focused = true; input().props.onFocus({ defaultPrevented: false }); }
  };
  const wrapper = { contains: node => node === inputElement };
  const dates = load(path.join("lib", "accounting-date.ts"));
  const { DateInput } = load(path.join("components", "date-input.tsx"), {
    "@/lib/accounting-date": dates,
    document: {
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: type => listeners.delete(type),
    },
    react: {
      ...React,
      useId: () => "calendar-test",
      useRef() {
        const index = refCursor++;
        if (!(index in refs)) refs[index] = { current: index === 0 ? inputElement : wrapper };
        return refs[index];
      },
      useState(initial) {
        const index = stateCursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect(callback, deps) {
        const index = effectCursor++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
          pending.push(() => {
            previous?.cleanup?.();
            effects[index] = { deps, cleanup: callback() };
          });
        }
      },
    },
  });
  const props = {
    value: "2026-10-29", required: true, className: "w-full border",
    onChange(value) { props.value = value; selected.push(value); },
    ...overrides,
  };
  function render() {
    stateCursor = 0; refCursor = 0; effectCursor = 0;
    tree = DateInput(props);
    pending.splice(0).forEach(effect => effect());
    return tree;
  }
  const input = () => nodes(render(), "input")[0];
  const buttons = () => nodes(render(), "button");
  function click(label) {
    const button = buttons().find(button => button.props["aria-label"] === label || button.props.children === label);
    assert.ok(button, `Button ${label} must exist`);
    assert.equal(button.props.type, "button");
    if (!button.props.disabled) button.props.onClick();
    render();
  }
  function type(value) {
    inputElement.value = value;
    input().props.onChange({ target: inputElement });
    render();
  }
  function key(key) {
    let prevented = false;
    input().props.onKeyDown({ key, preventDefault() { prevented = true; } });
    render();
    return prevented;
  }
  return { render, input, click, type, key, props, selected, listeners,
    focus: () => { inputElement.focus(); render(); },
    validity: () => validity, inputElement,
  };
}

test("Calendar opens on focus, selects ISO dates and preserves display/form attributes", () => {
  const f = fixture({ id: "doc-date", name: "docDate" });
  assert.equal(f.input().props.value, "29/10/2026");
  assert.equal(f.input().props.required, true);
  assert.equal(f.input().props.id, "doc-date");
  assert.equal(f.input().props.name, "docDate");
  assert.equal(f.input().props.className, "w-full border");
  f.focus();
  assert.equal(f.input().props["aria-expanded"], true);
  f.click("30/10/2026");
  assert.deepEqual(f.selected, ["2026-10-30"]);
  assert.equal(f.input().props.value, "30/10/2026");
  assert.equal(f.input().props["aria-expanded"], false);
});

test("Calendar navigates year boundaries and includes only valid leap-month days", () => {
  const f = fixture({ value: "2024-01-31" });
  f.click("เปิดปฏิทิน");
  f.click("เดือนก่อนหน้า");
  f.click("31/12/2023");
  assert.equal(f.props.value, "2023-12-31");
  f.click("เปิดปฏิทิน");
  f.click("เดือนถัดไป");
  f.click("เดือนถัดไป");
  f.click("29/02/2024");
  assert.equal(f.props.value, "2024-02-29");
  f.props.value = "2025-02-01";
  f.render();
  f.click("เปิดปฏิทิน");
  const days = nodes(f.render(), "button").filter(button => /^\d{2}\//.test(button.props["aria-label"] || ""));
  assert.equal(days.length, 28);
});

test("Manual invalid dates block validation; picking the saved day clears the error", () => {
  const f = fixture();
  f.focus();
  f.type("31/02/2026");
  assert.notEqual(f.validity(), "");
  assert.deepEqual(f.selected, []);
  f.click("29/10/2026");
  assert.equal(f.validity(), "");
  assert.equal(f.input().props.value, "29/10/2026");
  f.type("29/02/2024");
  assert.equal(f.validity(), "");
  assert.equal(f.props.value, "2024-02-29");
  f.type("");
  assert.equal(f.props.value, "");
  assert.equal(f.validity(), "");
});

test("Today, clear, Escape, outside click and focus leaving the picker work without form submission", () => {
  const f = fixture();
  f.focus();
  f.click("วันนี้");
  const today = new Date();
  const pad = number => String(number).padStart(2, "0");
  assert.equal(f.props.value, `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  f.click("เปิดปฏิทิน");
  f.click("ล้าง");
  assert.equal(f.props.value, "");
  assert.equal(f.input().props.value, "");
  assert.equal(f.input().props.required, true);
  assert.equal(f.key("ArrowDown"), true);
  assert.equal(f.key("Escape"), true);
  assert.equal(f.input().props["aria-expanded"], false);
  f.click("เปิดปฏิทิน");
  f.listeners.get("pointerdown")({ target: new TestNode() });
  assert.equal(f.input().props["aria-expanded"], false);
  f.click("เปิดปฏิทิน");
  f.render().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(f.input().props["aria-expanded"], false);
});

test("Disabled, read-only and disabled-fieldset inputs cannot open the calendar", () => {
  for (const props of [{ disabled: true }, { readOnly: true }, { fieldsetDisabled: true }]) {
    const f = fixture(props);
    f.focus();
    f.click("เปิดปฏิทิน");
    assert.equal(f.input().props["aria-expanded"], false);
    assert.deepEqual(f.selected, []);
  }
});

test("External values reset validation and update the displayed calendar month", () => {
  const f = fixture();
  f.type("31/02/2026");
  f.props.value = "2027-01-15";
  f.render();
  assert.equal(f.validity(), "");
  assert.equal(f.input().props.value, "15/01/2027");
  f.click("เปิดปฏิทิน");
  f.click("16/01/2027");
  assert.equal(f.props.value, "2027-01-16");
});
