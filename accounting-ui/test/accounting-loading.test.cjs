const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

const flush = () => new Promise(setImmediate);

function mount(component, props, api) {
  const states = [], effects = [];
  const emptyComponent = () => null;
  const imports = {
    react: {
      ...React,
      useState(initial) {
        const index = states.length;
        states.push(typeof initial === "function" ? initial() : initial);
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect: callback => { effects.push(callback); },
      useCallback: callback => callback,
      useMemo: callback => callback(),
      useRef: current => ({ current }),
    },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "next/link": { default: emptyComponent },
    "@/lib/api": api,
    "@/lib/auth": { getStoredUser: () => ({ id: "maker" }) },
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => true },
    "@/lib/accounting-approval": {
      isEditableArDocument: doc => doc?.status === "draft",
      legacyApprovalControlVisible: () => true,
    },
    "@/components/accounting-approval-panel": { AccountingApprovalPanel: emptyComponent },
    "@/components/purchase-order-document": { PurchaseOrderPrintStyles: emptyComponent },
    "@/components/invoice-document": { InvoicePrintStyles: emptyComponent },
    "@/components/date-input": { DateInput: emptyComponent },
    "@/components/searchable-select": { SearchableSelect: emptyComponent },
    "@/components/document-items": { DocumentItems: emptyComponent },
  };
  function load(filename) {
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    }).outputText;
    vm.runInNewContext(source, {
      module, exports: module.exports, Error,
      require(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        if (name.startsWith("@/")) return load(path.join(__dirname, "..", "src", `${name.slice(2)}.ts`));
        if (name.startsWith(".")) return load(path.join(path.dirname(filename), `${name}.ts`));
        return require(name);
      },
    }, { filename });
    return module.exports;
  }
  const filename = component === "PurchaseOrders" ? "purchase-orders.tsx" : "invoices.tsx";
  load(path.join(__dirname, "..", "src", "components", filename))[component](props);
  const cleanup = effects[0]();
  return { states, cleanup };
}

function requests() {
  const calls = [], pending = {};
  function request(name) {
    calls.push(name);
    return new Promise((resolve, reject) => { pending[name] = { resolve, reject }; });
  }
  return {
    calls, pending,
    api: {
      ApApi: { getPurchaseOrder: () => request("po"), getPurchaseOrders: () => request("po-list") },
      ArApi: { getInvoice: () => request("invoice"), getInvoices: () => request("invoice-list") },
      AccountingLookupApi: {
        getSuppliers: () => request("suppliers"), getCustomers: () => request("customers"),
        getProducts: () => request("products"),
      },
      AccountingSettingsApi: { get: () => request("settings") },
    },
  };
}

test("PO edit/view start independent requests before any response and wait for all required data", async () => {
  for (const mode of ["edit", "view"]) {
    const { calls, pending, api } = requests();
    const { states } = mount("PurchaseOrders", { mode, recordId: "po-1" }, api);
    assert.deepEqual(calls, mode === "edit" ? ["suppliers", "po"] : ["po", "settings"]);
    const doc = { id: "po-1", status: "draft", items: [], poDate: "2026-11-08" };
    pending.po.resolve(doc);
    await flush();
    assert.equal(states.includes(doc), false, "partial data must not be applied");
    if (mode === "edit") pending.suppliers.resolve([]);
    else pending.settings.resolve({ companyName: "Test Company" });
    await flush();
    assert.equal(states.includes(doc), true);
    assert.equal(states[1], false, "loading completes after both responses");
  }
});

test("Invoice edit starts document/customers/products together and ignores results after unmount", async () => {
  for (const cancelled of [false, true]) {
    const { calls, pending, api } = requests();
    const { states, cleanup } = mount("Invoices", { mode: "edit", recordId: "iv-1" }, api);
    assert.deepEqual(calls, ["invoice", "customers", "products"]);
    const doc = { id: "iv-1", status: "draft", items: [], ivDate: "2026-11-08" };
    pending.invoice.resolve(doc);
    await flush();
    assert.equal(states.includes(doc), false);
    if (cancelled) cleanup();
    pending.customers.resolve([]);
    pending.products.resolve([]);
    await flush();
    assert.equal(states.includes(doc), !cancelled);
    assert.equal(states[14], cancelled, "only mounted pages finish their loading state");
  }
});

test("Parallel document loads still report failed requests and PO edit rejects non-editable documents", async () => {
  for (const component of ["PurchaseOrders", "Invoices"]) {
    const { pending, api } = requests();
    const { states } = mount(component, { mode: "edit", recordId: "doc-1" }, api);
    const documentRequest = component === "PurchaseOrders" ? "po" : "invoice";
    pending[documentRequest].reject(new Error("Document unavailable"));
    for (const [name, request] of Object.entries(pending)) {
      if (name !== documentRequest) request.resolve([]);
    }
    await flush();
    assert.ok(states.includes("Document unavailable"));
    assert.equal(states[component === "PurchaseOrders" ? 1 : 14], false);
  }
  const { pending, api } = requests();
  const { states } = mount("PurchaseOrders", { mode: "edit", recordId: "po-1" }, api);
  pending.po.resolve({ id: "po-1", status: "approved", items: [] });
  pending.suppliers.resolve([]);
  await flush();
  assert.ok(states.some(value => typeof value === "string" && value.includes("Draft")));
});

test("List/new/view modes do not fetch unrelated document or reference data", async () => {
  for (const [component, mode, expected] of [
    ["PurchaseOrders", "list", ["po-list"]],
    ["PurchaseOrders", "new", ["suppliers"]],
    ["Invoices", "list", ["invoice-list"]],
    ["Invoices", "new", ["customers", "products"]],
    ["Invoices", "view", ["invoice"]],
  ]) {
    const { calls, pending, api } = requests();
    mount(component, { mode, recordId: ["list", "new"].includes(mode) ? undefined : "doc-1" }, api);
    await flush();
    assert.deepEqual(calls, expected, `${component} ${mode}`);
    for (const request of Object.values(pending)) request.resolve([]);
    await flush();
  }
});

test("Invoice form loads SO/WO sources once instead of refetching when the page finishes loading", async () => {
  for (const mode of ["new", "edit"]) {
    const counts = {};
    const call = (name, value) => { counts[name] = (counts[name] || 0) + 1; return Promise.resolve(value); };
    const states = [], effects = [], timers = [];
    let cursor = 0, effectCursor = 0, pending = [];
    const api = {
      ArApi: {
        getInvoice: () => call("invoice", { id: "iv-1", status: "draft", items: [], ivDate: "2026-11-08" }),
        getInvoiceSources: () => call("sources", []), getDeliveryWorkOrders: () => call("workOrders", []),
        getReusableInvoiceNumbers: () => call("reusable", []),
      },
      AccountingLookupApi: { getCustomers: () => call("customers", []), getProducts: () => call("products", []) },
    };
    const reactMock = {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect(callback, deps) {
        const index = effectCursor++;
        const previous = effects[index];
        if (!previous || !deps || deps.some((value, i) => value !== previous.deps[i])) {
          pending.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; });
        }
      },
      useRef: current => ({ current }),
    };
    const imports = {
      react: reactMock, "next/navigation": { useRouter: () => ({ push() {} }) }, "next/link": { default: () => null },
      "@/lib/api": api, "@/lib/auth": { getStoredUser: () => ({ id: "maker" }) },
      "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
      "@/lib/accounting-access": { canUseAccounting: () => true },
      "@/lib/accounting-approval": { isEditableArDocument: doc => doc?.status === "draft", legacyApprovalControlVisible: () => true },
      "@/components/accounting-approval-panel": { AccountingApprovalPanel: () => null },
      "@/components/invoice-document": { InvoicePrintStyles: () => null },
      "@/components/date-input": { DateInput: () => null }, "@/components/searchable-select": { SearchableSelect: () => null },
      "@/components/document-items": { DocumentItems: () => null },
    };
    const load = filename => {
      const module = { exports: {} };
      const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
      }).outputText;
      vm.runInNewContext(source, {
        module, exports: module.exports, Error,
        setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: id => { timers[id - 1] = null; },
        require(name) {
          if (Object.hasOwn(imports, name)) return imports[name];
          if (name.startsWith("@/")) return load(path.join(__dirname, "..", "src", `${name.slice(2)}.ts`));
          if (name.startsWith(".")) return load(path.join(path.dirname(filename), `${name}.ts`));
          return require(name);
        },
      }, { filename });
      return module.exports;
    };
    const { Invoices } = load(path.join(__dirname, "..", "src", "components", "invoices.tsx"));
    for (let round = 0; round < 8; round++) {
      cursor = 0; effectCursor = 0;
      Invoices({ mode, recordId: mode === "edit" ? "iv-1" : undefined });
      pending.splice(0).forEach(run => run());
      await flush();
      timers.splice(0).forEach(run => run?.());
      await flush();
    }
    assert.equal(counts.sources, 1, `${mode}: SO sources requested once`);
    assert.equal(counts.workOrders, 1, `${mode}: WO references requested once`);
  }
});
