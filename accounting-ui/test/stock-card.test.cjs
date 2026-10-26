const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), test = require("node:test");
const vm = require("node:vm"), ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
function load(parts, imports = {}, globals = {}) {
  const filename = path.join(__dirname, "..", "src", ...parts), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, ...globals,
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) }, { filename });
  return module.exports;
}
const calls = [];
const lib = load(["lib", "stock-card.ts"], {
  "@/lib/api": { InventoryApi: {
    getStockCard: params => { calls.push(["report", params]); return Promise.resolve({ from: params.from, to: params.to, rows: [], summaries: [] }); },
    getStockCardLookups: () => { calls.push(["lookups"]); return Promise.resolve({ products: [], warehouses: [] }); },
  } },
  "@/lib/master-data": { csvCell: value => {
    const raw = value == null ? "" : String(value), safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  } },
  "@/lib/accounting-date": { formatAccountingDateTime: value => value },
});

test("Stock Card date defaults use Bangkok and report CSV carries balances", async () => {
  assert.equal(lib.localAccountingDate(new Date("2026-10-25T17:00:00.000Z")), "2026-10-26");
  assert.deepEqual(JSON.parse(JSON.stringify(lib.stockCardDefaults("2026-10-26"))), {
    from: "2026-10-01", to: "2026-10-26", productId: "", warehouseId: "",
  });
  const row = { transactionDate: "2026-10-26T00:00:00.000Z", movementType: "in", sourceDocType: "goods_receipt",
    sourceDocNo: "=FORMULA", warehouse: { name: "Main" }, product: { code: "MAT", name: "Material", unit: "Pcs" },
    openingQty: "2.000", qtyIn: "1.250", qtyOut: 0, runningQty: "3.250" };
  const csv = lib.stockCardCsv([row]);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /ยอดก่อนรายการ/);
  assert.match(csv, /"'=FORMULA"/);
  assert.match(csv, /"2\.000","1\.250","0","3\.250"/);
  await lib.StockCardApi.report({ from: "2026-10-01", to: "2026-10-26", productId: "p", warehouseId: "w" });
  await lib.StockCardApi.lookups();
  assert.equal(calls[0][0], "report");
  assert.equal(calls[1][0], "lookups");
});

test("Stock Card screen exposes date/product/warehouse filters and report actions", () => {
  const { InventoryData } = load(["components", "inventory-data.tsx"], {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/api": { InventoryApi: { getBalances: () => Promise.resolve([]) } },
    "lucide-react": { ArrowDownLeft: () => null, ArrowUpRight: () => null },
    "@/components/accounting-access-provider": { useAccountingAccess: () => ({}) },
    "@/lib/accounting-access": { canUseAccounting: () => false },
    "@/lib/accounting-navigation": { inventoryTabs: [{ id: "movements", label: "Stock Card" }] },
    "@/lib/accounting-date": { formatAccountingDateTime: () => "26/10/2026 00:00:00" },
    "@/components/date-input": { DateInput: props => React.createElement("input", { value: props.value, readOnly: true }) },
    "@/lib/stock-card": { StockCardApi: {}, exportStockCard: () => {}, stockCardDefaults: () => ({
      from: "2026-10-01", to: "2026-10-26", productId: "", warehouseId: "",
    }) },
  });
  const html = renderToStaticMarkup(React.createElement(InventoryData, { activeTab: "movements" }));
  assert.match(html, /ตั้งแต่วันที่/);
  assert.match(html, /ถึงวันที่/);
  assert.match(html, /ทุกสินค้า/);
  assert.match(html, /ทุกคลัง/);
  assert.match(html, /CSV ตามตัวกรองทั้งหมด/);
  assert.match(html, /พิมพ์ \/ PDF/);
});
