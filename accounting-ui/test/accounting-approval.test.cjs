const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");

function load(relative, imports = {}) {
  const filename = path.join(__dirname, "..", "src", ...relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const requests = [];
const approval = load(["lib", "accounting-approval.ts"], { "./api": { apiFetch: async (...args) => { requests.push(args); return {}; } } });
const dates = load(["lib", "accounting-date.ts"]);
const actor = { step: 1, actorId: "a", fullName: "Somchai Example", signatureText: null, signatureUrl: null, approvedAt: "2026-10-01T00:00:00.000Z" };
const cycle = { cycle: 1, state: "pending", submittedAt: "2026-10-01T00:00:00.000Z", submittedById: "maker",
  steps: [{ kind: "role", targetId: "role", label: "Reviewer" }, { kind: "user", targetId: "final", label: "Final approver" }], approvals: [actor] };
const doc = { accountingApproval: { version: 1, cycles: [cycle] } };
const signatureModule = load(["components", "accounting-approval-signatures.tsx"], {
  "next/image": { default: ({ unoptimized, ...props }) => React.createElement("img", props) },
  "@/lib/accounting-date": dates, "@/lib/accounting-approval": approval,
});
const historyModule = load(["components", "accounting-approval-history.tsx"], { "@/lib/accounting-date": dates });

test("Accounting signatures display only actual actors from the latest submitted cycle", () => {
  const render = document => renderToStaticMarkup(React.createElement(signatureModule.AccountingApprovalSignatures, { document }));
  const html = render(doc);
  assert.ok(html.includes("Somchai E."));
  assert.ok(html.includes("Somchai Example"));
  assert.equal(html.includes("ลายเซ็น Final approver"), false);
  assert.ok(html.includes("ยังไม่อนุมัติ"));
  const next = { ...cycle, cycle: 2, approvals: [] };
  const resubmitted = render({ accountingApproval: { version: 1, cycles: [cycle, next] } });
  assert.equal(resubmitted.includes("Somchai Example"), false);
  assert.equal(render({}), "");
  assert.equal(render({ accountingApproval: { version: 1, cycles: [{ ...next, state: "legacy", steps: [] }] } }), "");
});

test("Accounting signatures prefer signature text and retain exact immutable image references", () => {
  assert.equal(approval.signatureText({ ...actor, signatureText: "  Custom signature  " }), "Custom signature");
  assert.equal(approval.signatureText({ ...actor, fullName: "สมชาย ตัวอย่าง" }), "สมชาย ต.");
  const url = "https://images.invalid/signatures/original-immutable-key.png";
  const imageDoc = { accountingApproval: { version: 1, cycles: [{ ...cycle, approvals: [{ ...actor, signatureUrl: url }] }] } };
  const html = renderToStaticMarkup(React.createElement(signatureModule.AccountingApprovalSignatures, { document: imageDoc }));
  assert.ok(html.includes(`src="${url}"`));
  assert.equal(html.includes("data:image"), false);
  assert.equal(html.includes("Somchai E."), false);
  assert.ok(html.includes("cursive") || !html.includes("font-family"));
});

test("Original print signatures render approved actors compactly and never render pending steps", () => {
  const image = "https://images.invalid/signatures/original-immutable-key.png";
  const source = { accountingApproval: { version: 1, cycles: [{ ...cycle,
    approvals: [{ ...actor, signatureUrl: image }] }] } };
  const html = renderToStaticMarkup(React.createElement(signatureModule.AccountingApprovalSignatures, { document: source, compact: true }));
  assert.ok(html.includes(`src="${image}"`));
  assert.ok(html.includes("Somchai Example"));
  assert.equal(html.includes("Final approver"), false);
  assert.equal(renderToStaticMarkup(React.createElement(signatureModule.AccountingApprovalSignatures, {
    document: { accountingApproval: { version: 1, cycles: [{ ...cycle, approvals: [] }] } }, compact: true,
  })), "");

  const layouts = ["purchase-order-document.tsx", "goods-receipt-document.tsx", "stock-issue-document.tsx",
    "stock-return-document.tsx", "contractor-payment-document.tsx", "payment-voucher-document.tsx",
    "stock-opening-document.tsx", "billing-note-document.tsx", "receipt-voucher-document.tsx", "credit-note-document.tsx"];
  for (const filename of layouts) {
    const layout = fs.readFileSync(path.join(__dirname, "..", "src", "components", filename), "utf8");
    assert.ok(layout.includes("AccountingApprovalSignatures"), `${filename} must render approval signatures`);
  }
  const invoice = fs.readFileSync(path.join(__dirname, "..", "src", "components", "invoice-document.tsx"), "utf8");
  assert.equal(invoice.includes("AccountingApprovalSignatures"), false);
});

test("Chain-managed controls replace legacy approval actions while legacy documents keep them", () => {
  for (const action of ["submit", "confirm", "approve", "return", "reject"]) {
    assert.equal(approval.legacyApprovalControlVisible(action, true), false);
    assert.equal(approval.legacyApprovalControlVisible(action, false), true);
  }
  assert.equal(approval.legacyApprovalControlVisible("cancel", true), true);
  assert.equal(approval.legacyApprovalControlVisible("pay", true), true);
  assert.equal(approval.hasManagedApprovalCycle(doc), true);
  assert.equal(approval.hasManagedApprovalCycle({}), false);
});

test("Accounting history preserves prior approved actors, identifies cycles and does not print as document stationery", () => {
  const data = { accountingApproval: { version: 1, cycles: [cycle, { ...cycle, cycle: 2, state: "returned", reason: "Correction", approvals: [] }] } };
  const html = renderToStaticMarkup(React.createElement(historyModule.AccountingApprovalHistory, { document: data }));
  assert.ok(html.includes("รอบ 1")); assert.ok(html.includes("รอบ 2"));
  assert.ok(html.includes("Somchai Example")); assert.ok(html.includes("Correction"));
  assert.ok(html.includes("display:none!important"));
  const invoicePrint = fs.readFileSync(path.join(__dirname, "..", "src", "components", "invoice-document.tsx"), "utf8");
  assert.equal(invoicePrint.includes("AccountingApprovalSignatures"), false);
  assert.equal(invoicePrint.includes("AccountingApprovalHistory"), false);
});

test("Typed approval client uses revisioned settings and all eleven business action routes", async () => {
  requests.length = 0;
  await approval.AccountingApprovalApi.saveConfiguration({ docType: "po", enabled: false, steps: [{ kind: "role", targetId: "r" }], revision: 3 });
  assert.equal(requests[0][0], "/api/accounting-approvals/configuration/po");
  assert.equal(JSON.parse(requests[0][1].body).revision, 3);
  await approval.AccountingApprovalApi.detail("po", "doc id");
  assert.equal(requests[1][0], "/api/accounting-approvals/po/doc%20id");
  const routes = { po: "ap/purchase-orders", gr: "ap/goods-receipts", ps: "ap/contractor-payments", pv: "ap/payment-vouchers",
    is: "inventory/issues", sr: "inventory/returns", opening: "inventory/opening-balances",
    invoice: "ar/invoices", bi: "ar/billing-notes", rv: "ar/receipt-vouchers", cn: "ar/credit-notes" };
  for (const [type, route] of Object.entries(routes)) {
    for (const action of ["submit", "approve", "return", "reject"]) {
      await approval.AccountingApprovalApi.act(type, "doc id", action, "revision", "Reason");
      const [endpoint, options] = requests.at(-1);
      assert.equal(endpoint, `/api/${route}/doc%20id/${action}`);
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).updatedAt, "revision");
      assert.equal(JSON.parse(options.body).reason, "Reason");
    }
  }
  await approval.AccountingApprovalApi.pendingPage(2);
  assert.equal(requests.at(-1)[0], "/api/accounting-approvals/pending?page=2&pageSize=25");
});

test("Admin chain editor includes all eleven types, active Accounting role/user choices, ordered controls, and disables incomplete rollout", () => {
  const roles = [{ id: "r", name: "AP Reviewer", permissions: ["ap.view", "ap.approve"] },
    { id: "v", name: "Viewer only", permissions: ["ap.view"] }];
  const users = [{ id: "eligible", username: "eligible", fullName: "Eligible Actor", role: "sales", active: true, accountingAssignment: { roleId: "r" } },
    { id: "inactive", username: "inactive", fullName: "Inactive Actor", role: "sales", active: false, accountingAssignment: { roleId: "r" } },
    { id: "viewer", username: "viewer", fullName: "Viewer Actor", role: "sales", active: true, accountingAssignment: { roleId: "v" } }];
  const configs = approval.approvalDocumentTypes.map(docType => ({ docType, enabled: false, revision: 0,
    steps: docType === "po" ? [{ kind: "user", targetId: "eligible" }, { kind: "role", targetId: "r" }] : [] }));
  let stateIndex = 0;
  const values = [configs, roles, users, false, false, "", ""];
  const Page = load(["app", "settings", "approvals", "page.tsx"], {
    react: { ...React, useState: initial => [stateIndex < values.length ? values[stateIndex++] : initial, () => {}] },
    "@/lib/accounting-access": {}, "@/lib/accounting-approval": approval,
  }).default;
  const html = renderToStaticMarkup(React.createElement(Page));
  for (const type of approval.approvalDocumentTypes) assert.ok(html.includes(`${type.toUpperCase()} · revision`));
  assert.ok(html.includes("ยังไม่เปิด rollout"));
  assert.ok(html.includes('type="checkbox" disabled=""'));
  assert.ok(html.includes("Eligible Actor"));
  assert.equal(html.includes("Inactive Actor"), false);
  assert.equal(html.includes("Viewer Actor"), false);
  assert.ok(html.includes('aria-label="เลื่อนขึ้น"'));
  assert.ok(html.includes('aria-label="เลื่อนลง"'));
});

test("AR correction eligibility requires an explicitly returned cycle and all document detail screens integrate approval panels", () => {
  assert.equal(approval.isEditableArDocument({ status: "draft", lifecycleVersion: 1 }), true);
  assert.equal(approval.isEditableArDocument({ ...doc, status: "returned", lifecycleVersion: 1 }), false);
  assert.equal(approval.isEditableArDocument({ accountingApproval: { version: 1, cycles: [{ ...cycle, state: "returned" }] }, status: "returned", lifecycleVersion: 1 }), true);
  for (const status of ["pending", "approved", "rejected", "cancelled"]) {
    assert.equal(approval.isEditableArDocument({ ...doc, status, lifecycleVersion: 1 }), false);
  }
  assert.equal(approval.isEditableArDocument({ status: "draft", lifecycleVersion: 0 }), false);
  const components = { po: "purchase-orders", gr: "goods-receipts", is: "stock-issues", sr: "stock-returns",
    ps: "contractor-payments", pv: "payment-vouchers", opening: "stock-opening-balances", invoice: "invoices",
    bi: "billing-notes", rv: "receipt-vouchers", cn: "credit-notes" };
  for (const [type, name] of Object.entries(components)) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", `${name}.tsx`), "utf8");
    assert.ok(source.includes(`<AccountingApprovalPanel docType="${type}"`), `${type} integrates revisioned detail/history/review`);
    assert.ok(source.includes("onModeChange={setChainManaged}"), `${type} switches controls to configured chains`);
    assert.ok(source.includes("legacyApprovalControlVisible"), `${type} retains only non-approval legacy actions`);
  }
});

test("Approval panel shows only eligible review actions, offers configured submission and hides from document printing", () => {
  const render = (canApprove, chainEnabled, status = "pending") => {
    let index = 0;
    const detail = { ...doc, canApprove, chainEnabled, status, updatedAt: "revision" };
    const state = [detail, chainEnabled, "", false];
    const Panel = load(["components", "accounting-approval-panel.tsx"], {
      react: { ...React, useState: initial => [state[index++] ?? initial, () => {}], useEffect: () => {} },
      "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
      "@/lib/accounting-approval": approval, "./accounting-approval-history": { AccountingApprovalHistory: () => null },
    }).AccountingApprovalPanel;
    return renderToStaticMarkup(React.createElement(Panel, { docType: "invoice",
      document: { ...doc, id: "iv", status, updatedAt: "revision" }, canSubmit: true, onChanged() {} }));
  };
  assert.ok(render(true, true).includes('href="/approvals/invoice/iv"'));
  assert.equal(render(false, true).includes("ตรวจสอบและอนุมัติขั้นนี้"), false);
  assert.ok(render(false, true, "draft").includes("ส่งตามสายอนุมัติ"));
  assert.equal(render(false, false, "draft").includes("ส่งตามสายอนุมัติ"), false);
  assert.ok(render(true, true).includes("display:none!important"));
});

test("PO can hide an empty approval panel without hiding errors or changing other callers", () => {
  const render = (hideWhenEmpty, error = "") => {
    let index = 0;
    const state = [null, false, error, false, ""];
    const Panel = load(["components", "accounting-approval-panel.tsx"], {
      react: { ...React, useState: initial => [state[index++] ?? initial, () => {}], useEffect: () => {} },
      "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
      "@/lib/accounting-approval": approval, "./accounting-approval-history": { AccountingApprovalHistory: () => null },
    }).AccountingApprovalPanel;
    return renderToStaticMarkup(React.createElement(Panel, { docType: "po", hideWhenEmpty,
      document: { id: "po", status: "draft", updatedAt: "revision" }, canSubmit: false, onChanged() {} }));
  };
  assert.equal(render(true), "");
  assert.match(render(false), /accounting-approval-panel/);
  assert.match(render(true, "Approval request failed"), /role="alert"[^>]*>Approval request failed/);
});
