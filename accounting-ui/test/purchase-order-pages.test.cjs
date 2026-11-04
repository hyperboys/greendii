const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, imports = {}) {
  imports["@/components/manual-submit-form"] = { ManualSubmitForm: "form" };
  imports["@/components/accounting-approval-panel"] = { AccountingApprovalPanel: () => null };
  imports["@/lib/accounting-approval"] = { hasApprovedActors: () => false, legacyApprovalControlVisible: () => true, ...(imports["@/lib/accounting-approval"] || {}) };
  imports["./accounting-approval-signatures"] = { AccountingApprovalSignatures: () => null };
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
    "@/components/purchase-order-information": {},
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

test("PO view shows read-only cards and a product table with actions first and no print template", () => {
  const doc = { id: "po-view", poNo: "PO-INFO", status: "draft", createdById: "maker",
    supplierId: "supplier", supplierSnapshot: { code: "SUP-SAVED", name: "Saved supplier" },
    supplier: { code: "SUP-NOW", name: "Changed supplier" }, poDate: "2026-10-29", paymentTerm: 30,
    subTotal: "2500", discount: "0", vat: "175", netAmount: "2675", vatConfig: "VAT7%",
    remarks: "Saved information", attachments: [], history: [],
    items: [{ id: "item", partNo: "P-002", desc: "Saved product", qty: 50, unit: "Box", unitPrice: 50, discount: 0, amount: "2500", remark: "Item note" }] };
  let nullState = 0;
  let writeAllowed = false;
  const dates = load(["lib", "accounting-date.ts"]);
  const { DateInput } = load(["components", "date-input.tsx"], { "@/lib/accounting-date": dates });
  const { PurchaseOrders } = load(["components", "purchase-orders.tsx"], {
    react: { ...React, useState: initial => {
      if (initial === null && ++nullState === 3) return [doc, () => {}];
      if (typeof initial === "function") return [{ ...initial(), supplierId: "supplier", remarks: "Saved information" }, () => {}];
      return [initial, () => {}];
    } },
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
    "@/components/purchase-order-information": load(["components", "purchase-order-information.tsx"], {
      "@/lib/accounting-date": dates,
      "@/lib/purchase-order": load(["lib", "purchase-order.ts"]),
    }),
    "@/components/purchase-order-document": { PurchaseOrderDocumentView: () => { throw new Error("Print template must not render"); } },
  });
  const html = renderToStaticMarkup(React.createElement(PurchaseOrders, { mode: "view", recordId: doc.id }));
  assert.match(html, /ใบสั่งซื้อ PO-INFO/);
  assert.doesNotMatch(html, /<fieldset|<form|<input|<select|<textarea/);
  assert.match(html, /Saved information/);
  assert.match(html, /Saved supplier/);
  assert.doesNotMatch(html, /Changed supplier/);
  assert.match(html, /Saved product/);
  assert.match(html, /Item note/);
  assert.match(html, /2,675.00/);
  assert.match(html, /aria-label="รายการสินค้า PO"/);
  assert.match(html, /ไม่มีเอกสารแนบ PO/);
  assert.doesNotMatch(html, /เพิ่มรายการ|ลบรายการ|ค้นหาเลข PR|แก้ไข PO/);
  assert.ok(html.indexOf("พิมพ์ / บันทึก PDF") < html.indexOf("ผู้ขาย / ผู้รับเหมา"));
  assert.match(html, /<details[^>]*>[\s\S]*?<summary[^>]*>ประวัติรายการ/);
  assert.doesNotMatch(html, /id="po-print-doc"|type="submit"/);
  assert.match(html, /พิมพ์ \/ บันทึก PDF/);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "purchase-orders.tsx"), "utf8");
  assert.match(source, /import\("@\/components\/purchase-order-document"\)/);
  assert.match(source, /image.loading = "eager"/);
  const loadData = source.slice(source.indexOf("const loadData ="), source.indexOf("void loadData();"));
  assert.doesNotMatch(loadData, /AccountingSettingsApi\.get/);
  writeAllowed = true;
  nullState = 0;
  const makerHtml = renderToStaticMarkup(React.createElement(PurchaseOrders, { mode: "view", recordId: doc.id }));
  assert.match(makerHtml, /แก้ไข PO/);
  assert.match(makerHtml, /ส่งอนุมัติ/);
  assert.match(makerHtml, /เพิ่มเอกสารแนบ/);
  assert.doesNotMatch(makerHtml, /เพิ่มรายการ|ลบรายการ/);
  doc.status = "approved";
  nullState = 0;
  const approvedHtml = renderToStaticMarkup(React.createElement(PurchaseOrders, { mode: "view", recordId: doc.id }));
  assert.doesNotMatch(approvedHtml, /แก้ไข PO|เพิ่มเอกสารแนบ|ส่งอนุมัติ/);
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

test("PO information preserves saved amounts and legacy PR references and handles empty data", () => {
  const { PurchaseOrderInformation } = load(["components", "purchase-order-information.tsx"], {
    "@/lib/accounting-date": load(["lib", "accounting-date.ts"]),
    "@/lib/purchase-order": load(["lib", "purchase-order.ts"]),
  });
  const doc = { id: "po", poDate: "2026-10-29", paymentTerm: 0, vatConfig: "NO_VAT",
    supplier: { code: "SUP", name: "Current supplier" }, pr: { id: "legacy-pr", prNo: "PR-LEGACY" },
    subTotal: 100, discount: 10, vat: 0, netAmount: 90,
    items: [{ partNo: "P", desc: "Saved amount", qty: 1, unitPrice: 100, discount: 10, amount: 87.65 }] };
  const render = document => renderToStaticMarkup(React.createElement(PurchaseOrderInformation, { document }));
  const html = render(doc);
  assert.match(html, /Current supplier/);
  assert.match(html, /PR-LEGACY/);
  assert.match(html, /87.65/);
  assert.match(html, /ไม่มี VAT/);
  assert.doesNotMatch(html, /<input|<select|<textarea/);
  const empty = render({ ...doc, items: [], pr: null, supplier: null });
  assert.match(empty, /ไม่มีรายการสินค้า/);
  assert.match(empty, /ไม่อ้างอิง PR/);
  assert.match(empty, /0 รายการ/);
});

test("PO print follows the reference structure and retains operational details", () => {
  const { PurchaseOrderDocumentView } = load(["components", "purchase-order-document.tsx"], {
    "next/image": { default: ({ unoptimized, ...props }) => React.createElement("img", props) },
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
  assert.match(html, /<img[^>]+src="\/logo\.jpg"/);
  assert.match(html, /class="po-no-print mt-2 grid grid-cols-2/);
  assert.match(html, /class="po-no-print mt-1 text-center/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "src", "components", "purchase-order-document.tsx"), "utf8"), /\.po-no-print \{ display: none !important; \}/);
  assert.match(html, /Sample item/);
  assert.equal((html.match(/class="po-print-empty-row"/g) || []).length, 17);
  const itemBody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal((itemBody.match(/<tr/g) || []).length, 18);
  assert.doesNotMatch(itemBody, /border-b\b/);
  assert.match(html, /po-print-items/);
  const manyItems = Array.from({ length: 25 }, (_, index) => ({ ...doc.items[0], id: `line-${index}`, desc: `Item ${index + 1}` }));
  const longHtml = render({ ...doc, items: manyItems });
  assert.equal((longHtml.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr/g) || []).length, 25);
  assert.doesNotMatch(longHtml, /class="po-print-empty-row"/);
  assert.match(html, /อนุมัติโดย Saved approver/);
  assert.doesNotMatch(html, /ยังไม่มีข้อมูลการอนุมัติ/);
  assert.match(render({ ...doc, status: "cancelled" }), /เคยอนุมัติโดย Saved approver/);
  assert.match(render({ ...doc, history: [] }), /อนุมัติเดิม \(ไม่มีประวัติผู้อนุมัติ\)/);
});

test("PO print reserves bottom space for the footer without horizontal item rules or clipping its width", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "purchase-order-document.tsx"), "utf8");
  assert.match(source, /min-height: 265mm !important/);
  assert.match(source, /tbody tr \{ height: 5mm; \}/);
  assert.match(source, /\.po-print-empty-row \{ height: 0; \}/);
  assert.match(source, /\.po-print-empty-row td \{\s*padding: 0 !important;\s*font-size: 0 !important;\s*line-height: 0;/);
  assert.match(source, /\.po-print-items \{ display: flex; flex-direction: column; flex-grow: 1; \}/);
  assert.match(source, /tbody td \{ border-top: 0; border-bottom: 0; \}/);
  assert.doesNotMatch(source, /width: 210mm !important/);
});
