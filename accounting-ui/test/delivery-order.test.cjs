const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, imports = {}) {
  Object.assign(imports, require("./helpers/document-ui-mocks.cjs"));
  imports["next/image"] = { default: ({ unoptimized, ...props }) => React.createElement("img", props) };
  imports["@/components/manual-submit-form"] = { ManualSubmitForm: "form" };
  const filename = path.join(__dirname, "..", "src", ...relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  }, { filename });
  return module.exports;
}

test("SO routes support direct new/view/edit and reject invalid actions", () => {
  const Page = load(["app", "ar", "delivery-orders", "[...record]", "page.tsx"], {
    "next/navigation": { notFound: () => { throw new Error("Not found"); } },
    "@/components/delivery-orders": { DeliveryOrders: () => null },
  }).default;
  for (const [record, mode] of [[["new"], "new"], [["so-1"], "view"], [["so-1", "edit"], "edit"]]) {
    assert.equal(Page({ params: { record } }).props.mode, mode);
  }
  for (const record of [["new", "edit"], ["so-1", "confirm"], ["so-1", "edit", "extra"]]) {
    assert.throws(() => Page({ params: { record } }), /Not found/);
  }
});

test("Existing SO menu reads the live URL query rather than stale static page props", () => {
  let tab = "so";
  const SO = () => null;
  const Page = load(["app", "ar", "invoices", "page.tsx"], {
    "next/navigation": { useSearchParams: () => new URLSearchParams({ tab }) },
    "@/lib/api": {},
    "@/lib/account-customers": {},
    "@/lib/accounting-date": {},
    "@/lib/accounting-navigation": load(["lib", "accounting-navigation.ts"]),
    "@/components/date-input": {},
    "@/components/delivery-orders": { DeliveryOrders: SO },
    "@/components/invoices": { Invoices: () => null },
    "@/components/billing-notes": { BillingNotes: () => null },
    "@/components/accounting-access-provider": {},
    "@/lib/accounting-access": {},
  }).default;
  assert.equal(Page({ searchParams: { tab: "invoices" } }).type, SO);
  tab = "invoices";
  assert.notEqual(Page({ searchParams: { tab: "so" } }).type, SO);
});

test("SO is a full-page Draft form with integer quantities and PDF monetary fields; viewers cannot write", () => {
  let writable = true;
  const dates = load(["lib", "accounting-date.ts"]);
  const { DeliveryOrders } = load(["components", "delivery-orders.tsx"], {
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/api": {},
    "@/lib/delivery-order": load(["lib", "delivery-order.ts"]),
    "@/lib/account-customers": load(["lib", "account-customers.ts"]),
    "@/lib/accounting-date": dates,
    "@/components/date-input": load(["components", "date-input.tsx"], { "@/lib/accounting-date": dates }),
    "@/components/searchable-select": load(["components", "searchable-select.tsx"]),
    "@/components/document-items": load(["components", "document-items.tsx"], { "@/lib/delivery-order": load(["lib", "delivery-order.ts"]) }),
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => writable },
    "@/components/delivery-order-document": { DeliveryOrderPrintStyles: () => null },
  });
  const render = mode => renderToStaticMarkup(React.createElement(DeliveryOrders, { mode }));
  const html = render("new");
  assert.doesNotMatch(html, /role="dialog"|aria-modal|fixed inset-0|ยืนยัน SO/);
  assert.match(html, /placeholder="dd\/mm\/yyyy"/);
  assert.match(html, /type="number" min="1" max="999999999" step="1"/);
  assert.match(html, /เพิ่มรายการ/);
  assert.match(html, /<table aria-label="รายการส่งสินค้า/);
  assert.match(html, /role="region" aria-labelledby="so-items-heading"/);
  assert.match(html, /data-so-item="1"/);
  assert.match(html, /colSpan="8"/);
  assert.doesNotMatch(html, /min-w-\[1240px\]|จอเล็กเลื่อนตาราง/);
  assert.match(html, /<textarea required="" rows="2"/);
  assert.match(html, /aria-label="ลบรายการ 1" disabled=""/);
  assert.match(html, /aria-label="จำนวนเงินรายการ 1"/);
  assert.match(html, /aria-label="รวมเงินรายการ"/);
  assert.match(html, /ยังไม่ตัด Stock/);
  assert.equal((html.match(/role="combobox" aria-autocomplete="list"/g) || []).length, 2);
  assert.equal((html.match(/aria-label="เปิดปฏิทิน"/g) || []).length, 2);
  assert.doesNotMatch(html, /ค้นหาลูกค้า|ค้นหา WO \(ไม่บังคับ\)/);
  for (const field of ["ราคา/หน่วย", "ส่วนลดรายการ (บาท)", "ส่วนลดท้ายเอกสาร (บาท)", "VAT 7%", "No VAT", "วันที่กำหนดส่ง", "จำนวนวันเครดิต", "โทรสารลูกค้า"]) assert.ok(html.includes(field), field);
  writable = false;
  for (const mode of ["new", "edit"]) {
    assert.match(render(mode), /ไม่มีสิทธิ์สร้างหรือแก้ไขใบส่งของ/);
    assert.doesNotMatch(render(mode), /<form/);
  }
});

test("SO preview/print shows four delivery columns without prices or totals, preserving headers and signatures", () => {
  const { DeliveryOrderDocument } = load(["components", "delivery-order-document.tsx"], {
    "@/lib/accounting-date": load(["lib", "accounting-date.ts"]),
    "@/lib/delivery-order": load(["lib", "delivery-order.ts"]),
  });
  const html = renderToStaticMarkup(React.createElement(DeliveryOrderDocument, {
    document: {
      id: "so", soNo: "SO2610-00001", docDate: "2026-10-25", status: "draft",
      customer: { name: "Customer" }, customerBranch: "Branch", shippingAddress: "Customer address", workOrder: { woNo: "WO-001" },
      customerTel: "111", customerFax: "222", creditTerm: 0, deliveryDate: "2026-10-30", vatConfig: "VAT7%",
      createdBy: { fullName: "Sender Name" }, subTotal: 70, discount: 5, vat: 4.55, netAmount: 69.55,
      items: [{ partNo: "P001", desc: "First", qty: 3, unit: "pcs", unitPrice: "10.25", discount: "0.75", amount: 30 }, { desc: "Second", qty: 2, unit: "set", unitPrice: 20, discount: 0, amount: 40 }],
    }, company: { companyName: "Company", address: "Old English address", tel: "Old company phone" },
  }));
  for (const text of ["First", "Second", "25/10/2569", "Draft", "WO-001", "Company", "TEMPORARY INVOICE", "Sender Name"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /ใบสั่งจอง|ลงวันที่|วันที่กำหนดส่ง|จำนวนวันเครดิต|เงื่อนไขการวางบิล|30\/10\/2569/);
  assert.match(html, /98 หมู่ที่ 6 ต\.คลองสี่ อ\.คลองหลวง จ\.ปทุมธานี 12120/);
  assert.match(html, /โทร\. 02-1507694-5/);
  assert.match(html, /โทร\.　111/);
  assert.doesNotMatch(html, /Old English address|Old company phone/);
  assert.match(html, /class="so-customer-row"><strong>ชื่อลูกค้า<\/strong><span>Customer \(Branch\)<\/span>/);
  assert.match(html, /class="so-address so-customer-row"><strong>ที่อยู่<\/strong><span>Customer address<\/span>/);
  assert.match(html, /<div class="so-document-info"><dl class="so-number"><div><dt>เลขที่<\/dt><dd>SO2610-00001<\/dd><\/div><div><dt>วันที่<\/dt><dd>25\/10\/2569<\/dd>/);
  assert.equal((html.match(/class="so-number"/g) || []).length, 1);
  assert.doesNotMatch(html.match(/<div class="so-title-row">([\s\S]*?)<p class="so-customer-code">/)[1], /so-number/);
  assert.equal((html.match(/<th>/g) || []).length, 4);
  assert.match(html, /<th>รหัสสินค้า<\/th><th>รายการ<\/th><th>จำนวน<\/th><th>หน่วย<\/th>/);
  assert.doesNotMatch(html, /ราคา\/หน่วย|ส่วนลด|จำนวนเงิน|รวมเงิน|ภาษีมูลค่าเพิ่ม|so-totals|10\.25|0\.75|69\.55|4\.55|30\.00|40\.00/);
  for (const role of ["ผู้รับสินค้า", "ผู้ส่งสินค้า", "ผู้มีอำนาจ"]) assert.ok(html.includes(role));
  assert.doesNotMatch(html, /PROVISIONAL DELIVERY ORDER/);
  assert.match(html, /<img[^>]*src="\/logo\.jpg"[^>]*alt="โลโก้บริษัท"[^>]*class="so-company-logo"/);
  assert.match(html, /หน้า 1 \/ 1/);
});

test("SO monetary preview agrees with server cents calculation for discounts, VAT, zero and rounding", () => {
  const { deliveryOrderAmounts } = load(["lib", "delivery-order.ts"]);
  const items = [{ qty: 3, unitPrice: "10.25", discount: "0.75" }, { qty: 2, unitPrice: 20, discount: 0 }];
  const taxed = deliveryOrderAmounts(items, "5", "VAT7%");
  assert.equal(taxed.subTotal, 70);
  assert.equal(taxed.taxableAmount, 65);
  assert.equal(taxed.vat, 4.55);
  assert.equal(taxed.netAmount, 69.55);
  assert.equal(deliveryOrderAmounts(items, 5, "NO_VAT").netAmount, 65);
  assert.equal(deliveryOrderAmounts([{ qty: 3, unitPrice: "0.05", discount: 0 }], 0, "VAT7%").netAmount, 0.16);
  assert.equal(deliveryOrderAmounts(items, 70, "VAT7%").netAmount, 0);
});

test("SO PDF pages preserve every row and omit monetary values on every page", () => {
  const print = load(["components", "delivery-order-document.tsx"], {
    "@/lib/accounting-date": load(["lib", "accounting-date.ts"]),
    "@/lib/delivery-order": load(["lib", "delivery-order.ts"]),
  });
  const items = Array.from({ length: 80 }, (_, index) => ({ partNo: `P${index}`, desc: `Line ${index}`, qty: 1, unit: "pcs", unitPrice: 1, discount: 0, remark: "" }));
  const pages = print.deliveryOrderPrintPages(items, 27, 21, 430, 8, 5);
  assert.equal(pages.reduce((count, rows) => count + rows.length, 0), 80);
  assert.ok(pages.length > 1);
  const html = renderToStaticMarkup(React.createElement(print.DeliveryOrderDocument, { company: {}, document: {
    items, status: "draft", soNo: "SO", docDate: "2026-10-25", subTotal: 80, discount: 0, vat: 5.6, netAmount: 85.6, vatConfig: "VAT7%",
  } }));
  assert.doesNotMatch(html, /85\.60|5\.60|80\.00|1\.00|ราคา\/หน่วย|ส่วนลด|จำนวนเงิน|so-totals|ยอดรวมแสดงหน้าสุดท้าย/);
  for (let index = 0; index < items.length; index++) {
    assert.equal((html.match(new RegExp(`>P${index}<`, "g")) || []).length, 1);
  }
  assert.ok(html.includes(`หน้า ${pages.length} / ${pages.length}`));
  assert.equal((html.match(/class="so-document-info"/g) || []).length, pages.length);
  assert.equal((html.match(/class="so-number"/g) || []).length, pages.length);
  assert.equal((html.match(/class="so-company-logo"/g) || []).length, pages.length);
  const longItem = { ...items[0], desc: "LongDescription".repeat(200), remark: "Note" };
  const continued = print.deliveryOrderPrintPages([longItem], 27, 21, 430, 8, 5).flat();
  assert.ok(continued.length > 1);
  assert.equal(continued.filter(row => !row.continuation).length, 1);
  assert.equal(continued.map(row => row.item.desc).join("").replace(/\n/g, ""), `${longItem.desc}Note`);
  assert.ok(continued.every(row => row.height <= 430));
});

test("SO print uses readable text, aligned customer details and a border around unruled document fields", () => {
  const { DeliveryOrderPrintStyles } = load(["components", "delivery-order-document.tsx"], {
    "@/lib/accounting-date": load(["lib", "accounting-date.ts"]),
    "@/lib/delivery-order": load(["lib", "delivery-order.ts"]),
  });
  const css = DeliveryOrderPrintStyles().props.children;
  assert.match(css, /#so-print-doc \{[^}]*font-size: 14px; line-height: 1\.4;/);
  assert.match(css, /\.so-company \{ position: relative;[^}]*padding: 0 40mm; min-height: 24mm;/);
  assert.match(css, /\.so-company-logo \{ position: absolute; left: 0; top: 0; width: 38mm; height: 24mm; object-fit: contain;/);
  assert.match(css, /\.so-customer-row \{ display: grid; grid-template-columns: 18mm minmax\(0, 1fr\); gap: 1mm;/);
  assert.match(css, /\.so-number > div \{ display: grid; grid-template-columns: 20mm minmax\(0, 1fr\); gap: 2mm;/);
  assert.doesNotMatch(css, /\.so-number (?:th|td)/);
  assert.match(css, /\.so-customer, #so-print-doc \.so-document-info \{ border: 1px solid black; border-radius: 4px;/);
  assert.doesNotMatch(css, /\.so-number > div \{[^}]*border:/);
});
