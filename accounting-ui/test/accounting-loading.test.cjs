const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

const flush = () => new Promise(setImmediate);
const resolveSource = base => fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
// Index of the `loading` useState slot, derived from source order so new state fields don't break the harness.
const loadingIndex = file => {
  const declarations = fs.readFileSync(path.join(__dirname, "..", "src", "components", file), "utf8").match(/const \[\w+, set\w+\] = useState/g);
  return declarations.findIndex(line => line.startsWith("const [loading,"));
};
const INVOICE_LOADING = loadingIndex("invoices.tsx");
const PO_LOADING = loadingIndex("purchase-orders.tsx");

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
    ...require("./helpers/document-ui-mocks.cjs"),
    "@/components/manual-submit-form": { ManualSubmitForm: emptyComponent },
    "@/components/purchase-order-information": { PurchaseOrderInformation: emptyComponent },
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
        if (name.startsWith("@/")) return load(resolveSource(path.join(__dirname, "..", "src", name.slice(2))));
        if (name.startsWith(".")) return load(resolveSource(path.join(path.dirname(filename), name)));
        return require(name);
      },
    }, { filename });
    return module.exports;
  }
  const filename = { PurchaseOrders: "purchase-orders.tsx", Invoices: "invoices.tsx",
    BillingNotes: "billing-notes.tsx", ReceiptVouchers: "receipt-vouchers.tsx" }[component];
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
      ArApi: { getInvoice: () => request("invoice"), getInvoices: () => request("invoice-list"),
        getBillingNote: () => request("billing"), getBillingNotes: () => request("billing-list"),
        getReceiptVoucher: () => request("receipt"), getReceiptVouchers: () => request("receipt-list") },
      AccountingLookupApi: {
        getSuppliers: () => request("suppliers"), getCustomers: () => request("customers"),
        getProducts: () => request("products"),
      },
      AccountingSettingsApi: { get: () => request("settings") },
    },
  };
}

test("PO edit starts supplier/document requests together and waits for both; view loads only the document", async () => {
  {
    const { calls, pending, api } = requests();
    const { states } = mount("PurchaseOrders", { mode: "edit", recordId: "po-1" }, api);
    assert.deepEqual(calls, ["suppliers", "po"]);
    const doc = { id: "po-1", status: "draft", items: [], poDate: "2026-11-08" };
    pending.po.resolve(doc);
    await flush();
    assert.equal(states.includes(doc), false, "partial data must not be applied");
    pending.suppliers.resolve([]);
    await flush();
    assert.equal(states.includes(doc), true);
    assert.equal(states[PO_LOADING], false, "loading completes after both responses");
  }
  const { calls, pending, api } = requests();
  const { states } = mount("PurchaseOrders", { mode: "view", recordId: "po-1" }, api);
  assert.deepEqual(calls, ["po"], "view has no print template, so company settings are not fetched");
  const doc = { id: "po-1", status: "approved", items: [], poDate: "2026-11-08" };
  pending.po.resolve(doc);
  await flush();
  assert.equal(states.includes(doc), true);
  assert.equal(states[PO_LOADING], false);
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
    assert.equal(states[INVOICE_LOADING], cancelled, "only mounted pages finish their loading state");
  }
});

test("BI/RV edit loads document and customers concurrently without applying partial or unmounted data", async () => {
  for (const [component, requestName] of [["BillingNotes", "billing"], ["ReceiptVouchers", "receipt"]]) {
    for (const cancelled of [false, true]) {
      const { calls, pending, api } = requests();
      const { states, cleanup } = mount(component, { mode: "edit", recordId: "doc-1" }, api);
      assert.deepEqual(calls, [requestName, "customers"]);
      const doc = { id: "doc-1", status: "draft", invoices: [], allocations: [],
        billingDate: "2026-11-10", receiptDate: "2026-11-10" };
      pending[requestName].resolve(doc);
      await flush();
      assert.equal(states.includes(doc), false);
      if (cancelled) cleanup();
      pending.customers.resolve([]);
      await flush();
      assert.equal(states.includes(doc), !cancelled);
    }
    const { calls, pending, api } = requests();
    const { states } = mount(component, { mode: "view", recordId: "doc-1" }, api);
    assert.deepEqual(calls, [requestName]);
    pending[requestName].reject(new Error("Document unavailable"));
    await flush();
    assert.ok(states.includes("Document unavailable"));
    for (const mode of ["new", "list"]) {
      const { calls, pending, api } = requests();
      mount(component, { mode }, api);
      assert.deepEqual(calls, mode === "new" ? ["customers"] : [`${requestName}-list`]);
      Object.values(pending).forEach(request => request.resolve([]));
      await flush();
    }
    {
      const { pending, api } = requests();
      const { states } = mount(component, { mode: "edit", recordId: "doc-1" }, api);
      pending.customers.reject(new Error("Customers unavailable"));
      pending[requestName].resolve({});
      await flush();
      assert.ok(states.includes("Customers unavailable"));
    }
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
    assert.equal(states[component === "PurchaseOrders" ? PO_LOADING : INVOICE_LOADING], false);
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
        getReusableInvoiceNumbers: () => call("reusable", []), getNextInvoiceNumber: () => call("next", { ivNo: "" }),
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
      ...require("./helpers/document-ui-mocks.cjs"), "@/components/manual-submit-form": { ManualSubmitForm: () => null },
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
          if (name.startsWith("@/")) return load(resolveSource(path.join(__dirname, "..", "src", name.slice(2))));
          if (name.startsWith(".")) return load(resolveSource(path.join(path.dirname(filename), name)));
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
