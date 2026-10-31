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

test("Typed approval client uses revisioned admin settings and existing seven business action routes; AR fails explicitly", async () => {
  requests.length = 0;
  await approval.AccountingApprovalApi.saveConfiguration({ docType: "po", enabled: false, steps: [{ kind: "role", targetId: "r" }], revision: 3 });
  assert.equal(requests[0][0], "/api/accounting-approvals/configuration/po");
  assert.equal(JSON.parse(requests[0][1].body).revision, 3);
  await approval.AccountingApprovalApi.detail("po", "doc id");
  assert.equal(requests[1][0], "/api/accounting-approvals/po/doc%20id");
  const routes = { po: "ap/purchase-orders", gr: "ap/goods-receipts", ps: "ap/contractor-payments", pv: "ap/payment-vouchers",
    is: "inventory/issues", sr: "inventory/returns", opening: "inventory/opening-balances" };
  for (const [type, route] of Object.entries(routes)) {
    for (const action of ["approve", "return", "reject"]) {
      await approval.AccountingApprovalApi.act(type, "doc id", action, "revision", "Reason");
      const [endpoint, options] = requests.at(-1);
      assert.equal(endpoint, `/api/${route}/doc%20id/${action}`);
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).updatedAt, "revision");
      assert.equal(JSON.parse(options.body).reason, "Reason");
    }
  }
  for (const type of ["invoice", "bi", "rv", "cn"]) await assert.rejects(approval.AccountingApprovalApi.act(type, "id", "approve", "revision"), /AR/);
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
