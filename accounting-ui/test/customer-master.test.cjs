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
const model = load(["lib", "account-customers.ts"]);
const customer = {
  id: "c1", code: "C001", name: "Customer A", taxId: "123", type: "นิติบุคคล",
  contactPerson: "Contact", tel: "456", email: "customer@example.test",
  active: false, creditTerm: 0, vatConfig: "NO_VAT", updatedAt: "2026-10-21T00:00:00Z",
  responsibleSaleId: "s1", responsibleSale: { id: "s1", code: "S001", name: "Sale A", active: true },
  branches: [{ id: "b1", code: "00000", name: "Main", addresses: [
    { id: "a1", label: "Billing", kind: "billing", address: "Billing A" },
    { id: "a2", label: "Shipping", kind: "shipping", address: "Shipping A" },
  ] }, { id: "b2", code: "00001", name: "Branch B", addresses: [
    { id: "a3", label: "Both", kind: "both", address: "Address B" },
  ] }],
};

test("Editing customer preserves all fields and copies nested data without changing the list", () => {
  const form = model.customerForm(customer);
  assert.equal(form.code, "C001");
  assert.equal(form.responsibleSaleId, "s1");
  assert.equal(form.creditTerm, 0);
  assert.equal(form.active, false);
  assert.equal(form.updatedAt, customer.updatedAt);
  form.branches[0].addresses[0].address = "Edited";
  assert.equal(customer.branches[0].addresses[0].address, "Billing A");
  assert.equal(model.customerForm().branches.length, 1);
  const legacy = model.customerForm({ ...customer, code: null, branches: [], address: "Legacy A", billingAddress: "Legacy B", shippingAddress: "Legacy C" });
  assert.equal(legacy.branches[0].addresses.length, 3);
  assert.equal(legacy.code, "");
});

test("Invoice defaults reset on customer/branch switch and use selected branch addresses", () => {
  const first = model.invoiceDefaults(customer);
  assert.equal(first.creditTerm, 0);
  assert.equal(first.vatConfig, "NO_VAT");
  assert.equal(first.billingAddressId, "a1");
  assert.equal(first.shippingAddressId, "a2");
  const second = model.branchDefaults(customer, "b2");
  assert.equal(second.address, "Address B");
  assert.equal(second.shippingAddress, "Address B");
  assert.equal(second.billingAddressId, "a3");
  const shippingOnly = model.branchDefaults({ ...customer, branches: [{
    id: "shipping", name: "Shipping only", code: "1", addresses: [{ id: "s", kind: "shipping", label: "Ship", address: "Ship only" }],
  }], billingAddress: "Do not use main branch" }, "shipping");
  assert.equal(shippingOnly.address, "");
});

test("Invoice VAT and due date respect no-VAT and immediate payment including month boundaries", () => {
  const noVat = model.invoiceAmounts([{ qty: 2, unitPrice: 100 }], "NO_VAT");
  assert.equal(noVat.vat, 0);
  assert.equal(noVat.netAmount, 200);
  const vat = model.invoiceAmounts([{ qty: 2, unitPrice: 100 }], "VAT7%");
  assert.equal(vat.vat, 14);
  assert.equal(vat.netAmount, 214);
  assert.equal(model.invoiceDueDate("2026-10-21", 0), "2026-10-21");
  assert.equal(model.invoiceDueDate("2026-10-21", 15), "2026-11-05");
});

test("Customer pages render full forms, save existing fields and navigate back to the customer list", async () => {
  let permissions = ["master.view", "master.update", "master.create"];
  let readOnly = false;
  let index = 0;
  const paths = [];
  let savedInput;
  const { CustomerMaster } = load(["components", "customer-master.tsx"], {
    react: { ...React, useState: initial => {
      const states = [
        [customer], [customer.responsibleSale], false, "", "", "all",
        { customer, readOnly }, model.customerForm(customer), false, "",
      ];
      return [states[index++] ?? (typeof initial === "function" ? initial() : initial), () => {}];
    }, useRef: value => ({ current: value }), useEffect: () => {}, useCallback: callback => callback },
    "@/lib/api": { MasterApi: { updateCustomer: async (id, input) => {
      assert.equal(id, customer.id);
      savedInput = input;
      return customer;
    } } },
    "next/navigation": { useRouter: () => ({ push: path => paths.push(path) }) },
    "@/lib/account-customers": model,
    "@/lib/master-data": load(["lib", "master-data.ts"]),
    "@/components/master-record-tools": { MasterPagination: () => null, MasterRecordTools: () => null },
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({ allowed: true, permissions }) },
    "@/lib/accounting-access": { canUseAccounting: (access, module, action) => access.permissions.includes(`${module}.${action}`) },
  });
  const html = renderToStaticMarkup(React.createElement(CustomerMaster, { mode: "edit", recordId: customer.id }));
  for (const text of ["รหัสลูกค้า", "ชื่อลูกค้า", "Tax ID", "ผู้ติดต่อ", "โทรศัพท์", "อีเมล", "Sale หลัก", "Credit Term", "การตั้งค่า VAT", "เปิดใช้งานลูกค้า", "เพิ่มสาขา", "เพิ่มที่อยู่", "บันทึกข้อมูลลูกค้า"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('value="C001"'));
  assert.ok(html.includes("Billing A"));
  assert.ok(html.includes("Shipping A"));
  assert.equal(html.includes('role="dialog"'), false);
  assert.equal(html.includes("fixed inset-0"), false);
  assert.ok(html.includes('href="/master?tab=customers"'));
  permissions = ["master.view"];
  readOnly = true;
  index = 0;
  const viewerHtml = renderToStaticMarkup(React.createElement(CustomerMaster, { mode: "view", recordId: customer.id }));
  assert.ok(viewerHtml.includes("<fieldset disabled="));
  assert.equal(viewerHtml.includes("บันทึกข้อมูลลูกค้า"), false);
  index = 0;
  const listHtml = renderToStaticMarkup(React.createElement(CustomerMaster));
  assert.ok(listHtml.includes("ดูข้อมูล"));
  assert.ok(listHtml.includes("แก้ไข"));
  assert.equal(listHtml.includes("<form"), false);
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    return React.Children.toArray(node.props?.children).map(child => find(child, predicate)).find(Boolean);
  };
  index = 0;
  const list = CustomerMaster({});
  find(list, node => node.type === "button" && node.props.children === "ดูข้อมูล").props.onClick();
  assert.equal(paths.pop(), `/master/customers/${customer.id}`);
  permissions = ["master.view", "master.update", "master.create"];
  index = 0;
  find(CustomerMaster({}), node => node.type === "button" && node.props.children === "เพิ่มลูกค้า").props.onClick();
  assert.equal(paths.pop(), "/master/customers/new");
  index = 0;
  find(CustomerMaster({}), node => node.type === "button" && node.props.children === "แก้ไข").props.onClick();
  assert.equal(paths.pop(), `/master/customers/${customer.id}/edit`);
  readOnly = false;
  index = 0;
  const editor = CustomerMaster({ mode: "edit", recordId: customer.id });
  await find(editor, node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(savedInput.branches[0].addresses[0].address, "Billing A");
  assert.equal(savedInput.creditTerm, 0);
  assert.equal(savedInput.updatedAt, customer.updatedAt);
  assert.equal(paths.pop(), "/master?tab=customers");
});
