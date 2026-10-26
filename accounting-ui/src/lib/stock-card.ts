import { InventoryApi } from "@/lib/api";
import { csvCell } from "@/lib/master-data";
import { formatAccountingDateTime } from "@/lib/accounting-date";

export type StockCardProduct = { id: string; code: string; name: string; unit: string; active: boolean };
export type StockCardWarehouse = { id: string; code: string; name: string; active: boolean };
export type StockCardSummary = {
  productId: string; warehouseId: string; product: StockCardProduct; warehouse: StockCardWarehouse;
  openingQty: string; qtyIn: string; qtyOut: string; closingQty: string;
};
export type StockCardMovement = {
  id: string; transactionDate: string; movementType: string; sourceDocType: string; sourceDocId: string; sourceDocNo: string | null;
  reversalRefId?: string | null; warehouseId: string; warehouse: StockCardWarehouse; productId: string; product: StockCardProduct;
  qtyIn: string | number; qtyOut: string | number; openingQty: string; runningQty: string;
};
export type StockCardReport = { from: string; to: string; rows: StockCardMovement[]; summaries: StockCardSummary[] };
export type StockCardLookups = { products: StockCardProduct[]; warehouses: StockCardWarehouse[] };
export type StockCardFilters = { from: string; to: string; productId: string; warehouseId: string };

export function localAccountingDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function stockCardDefaults(date = localAccountingDate()): StockCardFilters {
  return { from: `${date.slice(0, 7)}-01`, to: date, productId: "", warehouseId: "" };
}

export function stockCardCsv(rows: StockCardMovement[]) {
  const headers = ["วันที่เวลา", "ประเภท", "เลขที่เอกสาร", "คลัง", "รหัสสินค้า", "สินค้า", "หน่วย", "ยอดก่อนรายการ", "รับเข้า", "จ่ายออก", "ยอดสะสม"];
  const lines = rows.map(row => [
    formatAccountingDateTime(row.transactionDate), row.movementType === "reversal" ? "กลับรายการ" : Number(row.qtyIn) > 0 ? "รับเข้า" : "จ่ายออก",
    row.sourceDocNo || row.sourceDocType, row.warehouse.name, row.product.code, row.product.name, row.product.unit,
    row.openingQty, row.qtyIn, row.qtyOut, row.runningQty,
  ]);
  return "\ufeff" + [headers, ...lines].map(line => line.map(csvCell).join(",")).join("\r\n");
}

export function exportStockCard(rows: StockCardMovement[], from: string, to: string) {
  const url = URL.createObjectURL(new Blob([stockCardCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stock-card-${from}-${to}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const StockCardApi = {
  report: (filters: StockCardFilters) => InventoryApi.getStockCard(filters),
  lookups: () => InventoryApi.getStockCardLookups(),
};
