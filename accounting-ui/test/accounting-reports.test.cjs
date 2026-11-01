const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs");
const path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
function load(relative, imports = {}) {
  const filename = path.join(__dirname, "..", "src", relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const date = load("lib\\accounting-date.ts");
const lib = load("lib\\accounting-reports.ts", {
  "@/lib/master-data": load("lib\\master-data.ts"),
  "@/lib/accounting-date": date,
});
const row = {
  documentNo: "PO1", documentDate: "2026-10-31", partnerName: '=Supplier "A"',
  status: "approved", receiptState: "partial", linkedDocuments: ["GR1"], pendingDocuments: ["GR2"],
  cancelledDocuments: ["GR3"], reviewReasons: [],
  lines: [{ poLineId: "line", desc: "Item", unit: "pcs", orderedQty: 2, receivedQty: 1, pendingQty: 0.25, remainingQty: 1 }],
};
test("Report filters and CSV export preserve partial/pending/cancelled states and per-line units", () => {
  assert.equal(lib.filterReportRows([row], "gr2", "partial").length, 1);
  assert.equal(lib.filterReportRows([row], "supplier", "complete").length, 0);
  assert.equal(lib.filterReportRows([row], " PO1 ", "").length, 1);
  const report = { basis: "current_document_state", from: "2026-10-01", to: "2026-10-31",
    warnings: ["Current document state"], rows: [row] };
  const csv = lib.accountingReportCsv(report, [row], "reconPo");
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"'=Supplier ""A"""/);
  assert.match(csv, /รับบางส่วน/);
  assert.match(csv, /"GR1","GR2","GR3"/);
  assert.match(csv, /"PO1","Item","pcs","2","1","0.25","1"/);
  assert.match(csv, /Current document state/);
  assert.doesNotMatch(lib.accountingReportCsv(report, [], "reconPo"), /GR1/);
});
test("Aging CSV includes all five distinct buckets and does not describe PO commitment as outstanding debt", () => {
  const aging = { ...row, dueDate: "2026-10-31", outstandingAmount: 107.01,
    netAmount: 107.01, current: 0, days1To30: 107.01, days31To60: 0, days61To90: 0, over90Days: 0 };
  const report = { basis: "po_commitment", asOfDate: "2026-10-31", warnings: ["Not AP Aging"], rows: [aging] };
  const csv = lib.accountingReportCsv(report, [aging], "apPoCommitment");
  assert.match(csv, /Not AP Aging/);
  assert.match(csv, /ยอด PO \(ไม่หักจ่าย\)/);
  assert.match(csv, /61–90 วัน/);
  assert.match(csv, /มากกว่า 90 วัน/);
  assert.doesNotMatch(csv, /ยอดคงค้างปัจจุบัน/);
  assert.match(lib.accountingReportCsv(report, [aging], "arAging"), /ยอดคงค้างปัจจุบัน/);
});
test("Actual AP Aging columns show supplier-bill outstanding, settlements and invoice numbers", () => {
  const bill = { documentNo: "SB26110001", documentDate: "2026-11-01", partnerName: "Supplier", dueDate: "2026-11-11",
    supplierInvoiceNo: "INV-77", taxInvoiceNo: "TX-77", netAmount: 2140, settledAmount: 1030, outstandingAmount: 1110,
    current: 0, days1To30: 1110, days31To60: 0, days61To90: 0, over90Days: 0 };
  const report = { basis: "supplier_bill_outstanding", asOfDate: "2026-11-30", warnings: ["Supplier bill basis"], rows: [bill] };
  const csv = lib.accountingReportCsv(report, [bill], "apAging");
  assert.match(csv, /supplier_bill_outstanding/);
  assert.match(csv, /ยอดตามบิล/);
  assert.match(csv, /ตัดชำระแล้ว/);
  assert.match(csv, /"INV-77","TX-77"/);
  assert.match(csv, /"2,140.00","1,030.00","1,110.00","0.00","1,110.00"/);
  assert.doesNotMatch(csv, /ยอด PO/);
  assert.equal(lib.filterReportRows([bill], "inv-77", "").length, 1);
  assert.equal(lib.filterReportRows([bill], "tx-77", "").length, 1);
  assert.equal(lib.filterReportRows([{ ...bill, taxInvoiceNo: null }], "zzz", "").length, 0);
  assert.deepEqual([...lib.agingReportTabs], ["arAging", "apAging", "apPoCommitment"]);
});
test("Report page exposes shared dates, filters, CSV/PDF, and cannot export stale/error responses", () => {
  const { default: Page } = load("app\\reports\\page.tsx", {
    "@/lib/api": { ReportsApi: {} },
    "@/lib/accounting-navigation": { reportTabs: [{ id: "reconPo", label: "PO / GR" }], selectedTab: () => "reconPo" },
    "@/components/date-input": { DateInput: props => React.createElement("input", { value: props.value, readOnly: true }) },
    "@/lib/stock-card": { localAccountingDate: () => "2026-10-31" },
    "@/lib/accounting-date": date,
    "@/lib/accounting-reports": lib,
    "lucide-react": { RefreshCw: () => null, FileSpreadsheet: () => null, Printer: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(Page));
  for (const label of ["ตั้งแต่วันที่เอกสารต้นทาง", "ถึงวันที่เอกสารต้นทาง", "ค้นหาเลขที่เอกสาร", "ทุกสถานะ",
    "รับบางส่วน", "CSV ตามตัวกรอง", "พิมพ์ / PDF"]) assert.ok(html.includes(label), label);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "app", "reports", "page.tsx"), "utf8");
  assert.match(source, /return \(\) => \{ cancelled = true; \}/);
  assert.match(source, /result\?\.tab === tab/);
  assert.match(source, /const ready = !loading && !error && report !== null/);
  assert.match(source, /exportAccountingReport\(report, rows, tab\)/);
  assert.match(source, /font-family: var\(--font-body\)/);
  assert.match(source, /thead \{ display: table-header-group/);
});
