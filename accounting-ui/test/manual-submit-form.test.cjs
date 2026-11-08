const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

class HTMLElement {
  constructor() { this.isContentEditable = false; }
}
class HTMLInputElement extends HTMLElement {
  constructor(type) { super(); this.type = type; }
}
class HTMLButtonElement extends HTMLElement {
  constructor(type) { super(); this.type = type; }
}
class HTMLTextAreaElement extends HTMLElement {}

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "components", "manual-submit-form.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(source, {
  module: compiledModule, exports: compiledModule.exports, require,
  HTMLElement, HTMLInputElement, HTMLButtonElement, HTMLTextAreaElement,
});

function form(onKeyDown) {
  return compiledModule.exports.ManualSubmitForm({ onKeyDown, onSubmit() {} });
}

function keyEvent(target, overrides = {}) {
  let prevented = false;
  return {
    event: {
      key: "Enter", target, nativeEvent: {},
      defaultPrevented: false,
      preventDefault() { prevented = true; },
      ...overrides,
    },
    wasPrevented: () => prevented,
  };
}

test("Enter in a form field or submit button does not submit the form", () => {
  for (const target of [new HTMLInputElement("text"), new HTMLInputElement("number"), new HTMLButtonElement("submit")]) {
    const key = keyEvent(target);
    form().props.onKeyDown(key.event);
    assert.equal(key.wasPrevented(), true);
  }
});

test("Enter remains available for textareas and non-submit buttons", () => {
  for (const target of [new HTMLTextAreaElement(), new HTMLButtonElement("button")]) {
    const key = keyEvent(target);
    form().props.onKeyDown(key.event);
    assert.equal(key.wasPrevented(), false);
  }
});

test("An already handled Enter key and IME composition are preserved", () => {
  for (const overrides of [{ defaultPrevented: true }, { nativeEvent: { isComposing: true } }]) {
    const key = keyEvent(new HTMLInputElement("text"), overrides);
    form().props.onKeyDown(key.event);
    assert.equal(key.wasPrevented(), false);
  }
});

test("The form submit handler is retained for explicit save button clicks", () => {
  const onSubmit = () => {};
  const element = compiledModule.exports.ManualSubmitForm({ onSubmit });
  assert.equal(element.type, "form");
  assert.equal(element.props.onSubmit, onSubmit);
});
