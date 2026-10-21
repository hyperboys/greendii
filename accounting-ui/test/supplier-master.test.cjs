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
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(source, {
    exports: result.exports, module: result,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  }, { filename });
  return result.exports;
}

const model = load(["lib", "account-suppliers.ts"]);
const supplier = {
  id: "s1", code: "V001", name: "Supplier A", taxId: "123", branch: "สำนักงานใหญ่",
  address: "Address", billingAddress: "Billing", contactPerson: "Contact",
  tel: "456", fax: "789", groupCode: "G1", groupName: "Group A", creditLimit: "0.00",
  email: "supplier@example.test", vatConfig: "NO_VAT", paymentTerm: 0,
  supplierType: "contractor", bankName: "Bank", bankBranch: "Main",
  bankAccountNo: "001", bankAccountName: "Supplier A", active: false,
  createdAt: "2026-10-21T00:00:00Z",
};

test("Supplier form preserves zero values and defaults new suppliers", () => {
  const form = model.supplierForm(supplier);
  assert.equal(form.creditLimit, 0);
  assert.equal(form.paymentTerm, 0);
  assert.equal(form.supplierType, "contractor");
  assert.equal(form.bankAccountNo, "001");
  const empty = model.supplierForm();
  assert.equal(empty.code, "");
  assert.equal(empty.paymentTerm, 30);
  assert.equal(empty.branch, "สำนักงานใหญ่");
  assert.equal(empty.supplierType, "domestic");
});

test("Supplier master exposes complete details and protects changes by permission", () => {
  let index = 0;
  const states = [
    [supplier], false, "", "", "all", { supplier, readOnly: true },
    model.supplierForm(supplier), false, "", "", "",
  ];
  const { SupplierMaster } = load(["components", "supplier-master.tsx"], {
    react: {
      ...React,
      useState: initial => [states[index++] ?? (typeof initial === "function" ? initial() : initial), () => {}],
      useCallback: callback => callback,
      useEffect: () => {},
      useRef: value => ({ current: value }),
    },
    "@/lib/api": { MasterApi: {} },
    "@/lib/account-suppliers": model,
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({ allowed: true, permissions: ["master.view"] }) },
    "@/lib/accounting-access": {
      canUseAccounting: (access, module, action) => access.permissions.includes(`${module}.${action}`),
    },
  });
  const html = renderToStaticMarkup(React.createElement(SupplierMaster));
  for (const text of ["Tax ID", "ประเภทผู้ขาย", "วงเงินเครดิต", "เงื่อนไขชำระเงิน", "ที่อยู่วางบิล", "ธนาคาร", "เลขที่บัญชี", "ดูข้อมูล", "แก้ไข"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('value="V001"'));
  assert.ok(html.includes("<fieldset disabled="));
  assert.ok(html.includes('disabled=""'));
  assert.ok(html.includes("เพิ่มผู้จำหน่าย"));
});
