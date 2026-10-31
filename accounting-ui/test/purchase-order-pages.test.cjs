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
    "@/lib/auth": { getStoredUser: () => ({ id: "maker" }) },
    "@/lib/accounting-purchase-orders": load(["lib", "accounting-purchase-orders.ts"]),
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
  assert.match(html, /list="accounting-unit-options"/);
  assert.match(html, /href="\/ap\/vouchers\?tab=po"/);
  writeAllowed = false;
  for (const mode of ["new", "edit"]) {
    assert.match(render(mode), /ไม่มีสิทธิ์สร้างหรือแก้ไขใบสั่งซื้อ/);
    assert.doesNotMatch(render(mode), /<form/);
  }
});

test("PO actions honor independent permissions, creator restriction and terminal states", () => {
  const { purchaseOrderActions: actions, poStatusLabels } = load(["lib", "accounting-purchase-orders.ts"]);
  const doc = { status: "draft", createdById: "maker" };
  const maker = { create: true, approve: true, cancel: true };
  const approver = { create: false, approve: true, cancel: false };
  const viewer = { create: false, approve: false, cancel: false };
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(actions(doc, maker, "maker")), ["submit", "cancel"]);
  assert.deepEqual(plain(actions({ ...doc, status: "returned" }, maker, "maker")), ["submit", "cancel"]);
  assert.deepEqual(plain(actions({ ...doc, status: "pending" }, approver, "reviewer")), ["approve", "return", "reject"]);
  assert.deepEqual(plain(actions({ ...doc, status: "pending" }, approver, "maker")), ["return", "reject"]);
  assert.deepEqual(plain(actions({ ...doc, createdById: null }, maker, "maker")), ["cancel"]);
  for (const status of Object.keys(poStatusLabels)) assert.deepEqual(plain(actions({ ...doc, status }, viewer, "viewer")), []);
  for (const status of ["rejected", "cancelled"]) assert.deepEqual(plain(actions({ ...doc, status }, maker, "maker")), []);
  assert.deepEqual(plain(actions({ ...doc, status: "approved" }, maker, "maker")), ["cancel"]);
});

test("PO actions revisions files history and print status are wired through typed API", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "purchase-orders.tsx"), "utf8");
  const api = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "api.ts"), "utf8");
  const print = fs.readFileSync(path.join(__dirname, "..", "src", "components", "purchase-order-document.tsx"), "utf8");
  assert.match(source, /updatedAt: editing.updatedAt/);
  assert.match(source, /uploadPurchaseOrderFiles\(saved.id, pendingFiles, saved.updatedAt\)/);
  assert.match(source, /purchaseOrderAction\(doc.id, action, doc.updatedAt, reason\)/);
  assert.match(source, /deletePurchaseOrderFile\(file.id, doc.updatedAt\)/);
  assert.match(source, /selectedDocument.history\?\.map/);
  assert.match(source, /productId: item.productId/);
  assert.match(source, /aria-label="กรองสถานะ PO"/);
  assert.match(api, /form.set\("updatedAt", updatedAt\)/);
  assert.match(print, /poStatusLabels\[document.status\]/);
});

test("PO print follows the reference structure and retains operational details", () => {
  const { PurchaseOrderDocumentView } = load(["components", "purchase-order-document.tsx"], {
    "next/image": { default: () => null },
    "@/lib/accounting-date": load(["lib", "accounting-date.ts"]),
    "@/lib/accounting-purchase-orders": load(["lib", "accounting-purchase-orders.ts"]),
  });
  const doc = { id: "po", poNo: "PO2610001", poDate: "2026-10-26", purchaseType: "domestic", status: "approved",
    supplier: { id: "supplier", code: "SUP-01", name: "Sample Supplier", tel: "02-000-0000", taxId: "1234567890123" },
    contactPerson: "Buyer", paymentTerm: 30, deliveryLocation: "Warehouse", deliveryDate: "2026-11-01",
    items: [{ id: "line", partNo: "P-01", desc: "Sample item", qty: 1, unit: "Pcs", unitPrice: 100, discount: 0, amount: 100 }],
    subTotal: 100, discount: 0, vat: 7, netAmount: 107, vatConfig: "VAT7%",
    purchaseRequestReferences: [{ purchaseRequest: { id: "pr", prNo: "PR2610001", attachments: [{ id: "pr-file", originalName: "PR.pdf", mimeType: "application/pdf" }] } }],
    attachments: [{ id: "po-file", originalName: "Quote.pdf", mimeType: "application/pdf" }],
    createdBy: { fullName: "Saved creator" },
    history: [{ id: "audit", action: "approve", createdAt: "2026-10-26", performedBy: { fullName: "Saved approver" } }] };
  const render = (document, company = {}) => renderToStaticMarkup(React.createElement(PurchaseOrderDocumentView, { document, company }));
  const html = render(doc, { companyName: "Sample Company" });
  const sectionOrder = ["ใบสั่งซื้อ", "รหัสผู้ขาย", "อ้างอิง PR:", "รหัสสินค้า", "หมายเหตุ", "เงื่อนไขอื่น ๆ", "ผู้จัดทำ"]
    .map(label => html.indexOf(label));
  assert.ok(sectionOrder.every(index => index >= 0));
  assert.deepEqual(sectionOrder, [...sectionOrder].sort((a, b) => a - b));
  assert.match(html, /วันที่เอกสาร/);
  assert.match(html, /จำนวนวันเครดิต/);
  assert.match(html, /เงื่อนไขอื่น ๆ/);
  assert.match(html, /การวางบิลและการรับเช็ค/);
  assert.match(html, /ในนาม/);
  assert.match(html, /ผู้มีอำนาจลงนาม/);
  assert.match(html, /data-po-signature-role="reviewer"/);
  assert.match(html, /data-po-signature-role="signatory"/);
  assert.equal((html.match(/data-po-signature-role=/g) || []).length, 3);
  assert.match(html, /ที่อยู่จัดส่ง/);
  assert.doesNotMatch(html, /aria-hidden="true"/);
  assert.match(html, /02-150-7694/);
  assert.match(html, /เลขประจำตัวผู้เสียภาษีอากร/);
  assert.match(html, /grid-cols-2 items-stretch gap-1/);
  assert.match(html, /min-h-16 border-r border-blue-700 p-2/);
  assert.match(html, /เอกสารแนบจาก PR/);
  assert.match(html, /เอกสารแนบประกอบ PO/);
  assert.match(html, /Sample item/);
  assert.match(html, /อนุมัติโดย Saved approver/);
  assert.doesNotMatch(html, /ยังไม่มีข้อมูลการอนุมัติ/);
  assert.match(render({ ...doc, status: "cancelled" }), /เคยอนุมัติโดย Saved approver/);
  assert.match(render({ ...doc, history: [] }), /อนุมัติเดิม \(ไม่มีประวัติผู้อนุมัติ\)/);
});
