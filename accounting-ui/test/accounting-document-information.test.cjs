const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", "src", "components", file);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, Error,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
    ...globals,
  }, { filename });
  return module.exports;
}

test("Accounting read-only information renders semantic fields, saved values, empty rows and print isolation", () => {
  const { AccountingDocumentInformation } = load("accounting-document-information.tsx");
  const render = props => renderToStaticMarkup(React.createElement(AccountingDocumentInformation, props));
  const props = {
    groups: [{ title: "Supplier", fields: [{ label: "Name", value: "Saved supplier" }, { label: "Missing", value: null }, { label: "Credit", value: 0 }] }],
    columns: [{ label: "Item" }, { label: "Amount", align: "right" }],
    rows: [{ key: "line", cells: ["Saved item", "1,234.56"] }],
    itemsTitle: "Saved items", summary: [{ label: "Net", value: "1,234.56" }], notes: "Saved notes",
  };
  const html = render(props);
  assert.match(html, /<dt[^>]*>Credit<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(html, /<dt[^>]*>Missing<\/dt><dd[^>]*>-<\/dd>/);
  assert.match(html, /aria-label="Saved items" tabindex="0"/);
  assert.match(html, /scope="col"/);
  assert.match(html, /1,234.56/);
  assert.match(html, /Saved notes/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /<input|<textarea|<select|<form/);
  assert.match(render({ ...props, rows: [] }), /colSpan="2"|colspan="2"/);
  assert.match(render({ ...props, rows: [] }), /ไม่มีรายการ/);
});

test("All typed document cards use saved snapshots, amounts, quantities and source links without form controls", () => {
  const dates = load(path.join("..", "lib", "accounting-date.ts"));
  const imports = {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "./accounting-document-information": load("accounting-document-information.tsx"),
    "@/lib/accounting-date": dates,
    "@/lib/payment-voucher": load(path.join("..", "lib", "payment-voucher.ts"), { "./api": {} }),
    "@/lib/supplier-bill": load(path.join("..", "lib", "supplier-bill.ts")),
  };
  const adapters = {
    ...load("ar-document-information.tsx", imports),
    ...load("ap-document-information.tsx", imports),
    ...load("inventory-document-information.tsx", imports),
  };
  const snapshot = { code: "SNAP", name: "Saved party", unit: "Pcs", productType: "stored", taxId: "TEST-TAX", address: "Saved address" };
  const row = { id: "line", desc: "Saved item", productId: "product", productSnapshot: { ...snapshot, name: "Saved item" }, seq: 0,
    qty: 2, unit: "Pcs", unitPrice: 3, discount: 0, lineDiscount: 0, amount: 987.65, amountBeforeVat: 987.65, vat: 0, netAmount: 987.65,
    currentReceiptQty: "0.125", orderedQty: 4, previouslyReceivedQty: 0, pendingQty: 0, remainingQty: 3.875,
    requestedQty: 2, issuedQty: "0.125", cancelledQty: 0, returnedQty: "0.125", previouslyReturnedQty: 0,
    bookQtyAtCutover: 1, countedQty: 1.125, deltaQty: "0.125", quantity: "0.125" };
  const doc = { id: "document", lifecycleVersion: 1, status: "approved", customerName: "Saved party", customerCode: "SNAP", supplierSnapshot: snapshot,
    items: [row], remark: "Saved notes", subTotal: 987.65, discount: 0, vat: 0, netAmount: 987.65, outstandingAmount: 0,
    totalAmount: 987.65, totalReceived: 987.65, whtAmount: 0, bankFee: 0, amountBeforeVat: 987.65,
    originalBeforeVat: 2000, correctedBeforeVat: 1012.35, invoiceId: "invoice", invoiceNo: "IV-SAVED",
    docDate: "2026-10-25", ivDate: "2026-10-25", deliveryDate: null, creditTerm: 0, dueDate: null,
    invoices: [{ invoiceId: "invoice", invoiceNo: "IV-SAVED", billingAmount: 987.65, outstandingAmount: 0 }],
    allocations: [{ invoiceId: "invoice", invoiceNo: "IV-SAVED", billingNoteId: "billing", biNo: "BI-SAVED", receivedAmount: 987.65, outstandingBefore: 0, whtAmount: 0, bankFee: 0 }],
    poId: "po", poNo: "PO-SAVED", sourceDocId: "source", sourceNo: "PS-SAVED", paymentVoucherId: "voucher", pvNo: "PV-SAVED",
    amount: 987.65, currentRequestAmount: 987.65, netPayment: 987.65, amountBeforeTax: 987.65, wht: 0, retention: 0, otherDeduction: 0, whtRate: 0, retentionRate: 0,
    voucherSnapshot: { supplier: snapshot }, billNo: "SB-SAVED", revision: 1, creditTermDays: 0, vatMode: "NO_VAT",
    warehouseSnapshot: snapshot, workOrderSnapshot: { woNo: "WO-SAVED", project: "Saved project" }, stockIssueId: "issue", issueSnapshot: { issueNo: "IS-SAVED" },
    openingNo: "OB-SAVED", transferNo: "TR-SAVED", snapshot: { source: snapshot, destination: { code: "DEST", name: "Destination" } },
  };
  const expectations = {
    DeliveryOrderInformation: ["Saved item", "987.65"],
    InvoiceInformation: ["Saved item", "987.65", "0.00"],
    BillingInformation: ["IV-SAVED", "/ar/invoices/invoice", "0.00", "987.65"],
    ReceiptInformation: ["BI-SAVED", "/ar/billing-notes/billing", "987.65"],
    CreditInformation: ["IV-SAVED", "987.65"],
    ContractorPaymentInformation: ["PO-SAVED", "/ap/vouchers/po", "987.65"],
    PaymentVoucherInformation: ["PS-SAVED", "/ap/vouchers/ps/source", "987.65"],
    ChequePaymentInformation: ["PV-SAVED", "/ap/vouchers/pv/voucher", "987.65"],
    SupplierBillInformation: ["SB-SAVED", "987.65", "0.00"],
    GoodsReceiptInformation: ["PO-SAVED", "Saved item", "0.125"],
    StockIssueInformation: ["WO-SAVED", "Saved item", "0.125"],
    StockReturnInformation: ["IS-SAVED", "/inventory/issues/issue", "0.125"],
    StockOpeningInformation: ["OB-SAVED", "+0.125", "1.125"],
    StockTransferInformation: ["Destination", "0.125", "Saved item"],
  };
  for (const [name, values] of Object.entries(expectations)) {
    const html = renderToStaticMarkup(React.createElement(adapters[name], { document: doc }));
    for (const value of [...values, "Saved notes"]) assert.ok(html.includes(value), `${name} must show saved value ${value}`);
    assert.doesNotMatch(html, /<input|<textarea|<select|<form/, name);
    assert.doesNotMatch(html, /NaN|undefined/, name);
  }
});

test("Document screens defer templates and settings to explicit print preparation", () => {
  const screens = ["delivery-orders", "invoices", "billing-notes", "receipt-vouchers", "credit-notes",
    "contractor-payments", "payment-vouchers", "cheque-payments", "goods-receipts", "stock-issues", "stock-returns", "stock-opening-balances"];
  for (const screen of screens) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", `${screen}.tsx`), "utf8");
    const tree = ts.createSourceFile(screen, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of tree.statements) {
      if (ts.isImportDeclaration(statement)) assert.doesNotMatch(statement.moduleSpecifier.text, /-document$/, `${screen} must not statically load print stationery`);
    }
    assert.match(source, /print\.requestPrint/);
    assert.match(source, /Information document=/);
    assert.doesNotMatch(source, /setPrintReady|setCompany|window\.print\(/);
    assert.match(source, /print\.printContent/);
  }
});

function printHarness() {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let frames = [];
  const timers = new Map();
  let timerId = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
  const image = { loading: "lazy", decode: async () => {} };
  let printCalls = 0;
  const { useAccountingDocumentPrint } = load("use-accounting-document-print.tsx", { react }, {
    document: { fonts: { ready: Promise.resolve() }, querySelectorAll: () => [image] },
    window: {
      requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
      cancelAnimationFrame: () => { frames = []; },
      setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout: id => timers.delete(id),
      print: () => { printCalls++; },
    },
  });
  return {
    render(record) {
      cursor = 0;
      const result = useAccountingDocumentPrint(record);
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach(effect => effect());
      return result;
    },
    async flushPrint() {
      const callbacks = frames;
      frames = [];
      callbacks.forEach(callback => callback());
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
    timeout() { [...timers.values()].forEach(callback => callback()); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    get printCalls() { return printCalls; },
    image,
  };
}

test("Printing loads only after request, prevents duplicates, waits readiness and eagerly decodes images", async () => {
  const harness = printHarness();
  let hook = harness.render();
  assert.equal(hook.printContent, null);
  let preparations = 0;
  let ready;
  const prepare = async onReady => { preparations++; ready = onReady; return React.createElement("article", null, "Printable"); };
  await Promise.all([hook.requestPrint(prepare), hook.requestPrint(prepare)]);
  hook = harness.render();
  assert.equal(preparations, 1);
  assert.equal(hook.printing, true);
  await harness.flushPrint();
  assert.equal(harness.printCalls, 0);
  ready(true);
  hook = harness.render();
  await harness.flushPrint();
  assert.equal(harness.printCalls, 1);
  assert.equal(harness.image.loading, "eager");
  hook = harness.render();
  assert.equal(hook.printContent, null);
  assert.equal(hook.printing, false);
  harness.unmount();
});

test("Image preparation failure prevents printing, surfaces an error and permits retry", async () => {
  const harness = printHarness();
  harness.image.decode = async () => { throw new Error("Image failed"); };
  let hook = harness.render();
  const prepare = async onReady => { onReady(true); return React.createElement("article", null, "Printable"); };
  await hook.requestPrint(prepare);
  harness.render();
  await harness.flushPrint();
  hook = harness.render();
  assert.equal(hook.error, "Image failed");
  assert.equal(hook.printing, false);
  assert.equal(harness.printCalls, 0);
  harness.image.decode = async () => {};
  await hook.requestPrint(prepare);
  harness.render();
  await harness.flushPrint();
  hook = harness.render();
  assert.equal(hook.error, "");
  assert.equal(harness.printCalls, 1);
  harness.unmount();
});

test("A document revision change cancels an outstanding print preparation", async () => {
  const harness = printHarness();
  let hook = harness.render({ id: "document", updatedAt: "revision-1" });
  let complete;
  const preparation = hook.requestPrint(() => new Promise(resolve => { complete = resolve; }));
  harness.render({ id: "document", updatedAt: "revision-2" });
  complete(React.createElement("article", null, "Old revision"));
  await preparation;
  hook = harness.render({ id: "document", updatedAt: "revision-2" });
  await harness.flushPrint();
  assert.equal(hook.printContent, null);
  assert.equal(hook.printing, false);
  assert.equal(harness.printCalls, 0);
  harness.unmount();
});

test("Printing reports preparation failures and timeout, and discards cancelled preparations", async () => {
  const harness = printHarness();
  let hook = harness.render();
  await hook.requestPrint(async () => { throw new Error("Settings failed"); });
  hook = harness.render();
  assert.equal(hook.error, "Settings failed");
  assert.equal(hook.printing, false);
  await hook.requestPrint(async () => React.createElement("article", null, "Waiting"));
  hook = harness.render();
  harness.timeout();
  hook = harness.render();
  assert.match(hook.error, /เวลาที่กำหนด/);
  assert.equal(hook.printing, false);
  let finish;
  const pending = hook.requestPrint(() => new Promise(resolve => { finish = resolve; }));
  hook = harness.render();
  hook.reset();
  finish(React.createElement("article", null, "Stale"));
  await pending;
  hook = harness.render();
  assert.equal(hook.printContent, null);
  assert.equal(harness.printCalls, 0);
  harness.unmount();
});
