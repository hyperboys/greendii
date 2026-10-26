import { apiFetch } from "./api";
import { exportMasterCsv } from "./master-data";
import type { StockCardProduct, StockCardWarehouse } from "./stock-card";

export type StockOpeningStatus = "draft" | "pending" | "approved" | "returned" | "rejected" | "cancelled";
export type StockOpeningItemInput = { productId: string; countedQty: string };
export type StockOpeningInput = { warehouseId: string; cutoverDate: string; remark: string; items: StockOpeningItemInput[]; updatedAt?: string; requestKey?: string };
export type StockOpeningLine = StockOpeningItemInput & {
  id: string; seq: number; bookQtyAtCutover: number | string; deltaQty: number | string;
  productSnapshot: Omit<StockCardProduct, "id" | "active"> & { productType: string };
};
export type StockOpeningBalance = Omit<StockOpeningInput, "items"> & {
  id: string; openingNo: string; status: StockOpeningStatus; lifecycleVersion: number; createdById: string | null;
  approvedById: string | null; approvedAt: string | null; cancelledAt: string | null; cancellationReason: string | null;
  warehouseSnapshot: Omit<StockCardWarehouse, "id" | "active">; items: StockOpeningLine[];
  updatedAt: string; createdAt: string;
  movements?: { id: string; sourceDocType: string; sourceDocNo: string | null; qtyIn: number | string; qtyOut: number | string; transactionDate: string }[];
  history?: { id: string; action: string; reason: string | null; createdAt: string; performedBy: { fullName: string } | null }[];
};
export type StockOpeningLookups = {
  products: (Omit<StockCardProduct, "unit"> & { unit: string | null; productType: string })[];
  warehouses: StockCardWarehouse[];
  cutoverDate: string | null;
};
export type StockOpeningPreviewLine = {
  productId: string; product: StockOpeningLookups["products"][number];
  bookQtyAtCutover: string; currentLedgerQty: string; onHand: string; reserved: string; available: string;
};
export type StockOpeningPreview = {
  warehouseId: string; cutoverDate: string; lines: StockOpeningPreviewLine[]; mismatches: string[];
  activeDocument: { id: string; openingNo: string } | null; canPost: boolean;
};
export type StockOpeningAction = "submit" | "approve" | "return" | "reject" | "cancel";

const root = "/api/inventory/opening-balances";
export const openingBase = "/inventory/opening-balances";
export const openingList = "/inventory?tab=opening-balances";
export const openingStatuses: Record<StockOpeningStatus, string> = {
  draft: "ร่าง", pending: "รออนุมัติ", approved: "อนุมัติแล้ว", returned: "ส่งกลับแก้ไข", rejected: "ปฏิเสธ", cancelled: "ยกเลิก",
};
export const openingActions: Record<StockOpeningAction, string> = {
  submit: "ส่งอนุมัติ", approve: "อนุมัติและปรับ Stock", return: "ส่งกลับแก้ไข", reject: "ปฏิเสธ", cancel: "ยกเลิก / กลับรายการ",
};

export const StockOpeningApi = {
  list: (params: { q?: string; status?: string } = {}) => apiFetch<StockOpeningBalance[]>(`${root}?${new URLSearchParams(params)}`),
  get: (id: string) => apiFetch<StockOpeningBalance>(`${root}/${encodeURIComponent(id)}`),
  lookups: () => apiFetch<StockOpeningLookups>(`${root}/lookups`),
  preview: (warehouseId: string, cutoverDate: string, excludeId?: string) => {
    const params = new URLSearchParams({ warehouseId, cutoverDate });
    if (excludeId) params.set("excludeId", excludeId);
    return apiFetch<StockOpeningPreview>(`${root}/preview?${params}`);
  },
  create: (body: StockOpeningInput) => apiFetch<StockOpeningBalance>(root, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: StockOpeningInput) => apiFetch<StockOpeningBalance>(`${root}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  action: (doc: StockOpeningBalance, action: StockOpeningAction, reason?: string, cancellationDate?: string) =>
    apiFetch<StockOpeningBalance>(`${root}/${encodeURIComponent(doc.id)}/${action}`, { method: "POST",
      body: JSON.stringify({ updatedAt: doc.updatedAt, reason, cancellationDate }) }),
};

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("ไฟล์ CSV มีเครื่องหมายอัญประกาศไม่ครบ");
  row.push(field.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

export function parseOpeningCsv(text: string, products: StockOpeningLookups["products"]): StockOpeningItemInput[] {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map(value => value.toLowerCase());
  if (!header || header.length !== 2 || header[0] !== "productcode" || header[1] !== "countedqty") {
    throw new Error("หัวตารางต้องเป็น productCode,countedQty");
  }
  const byCode = new Map(products.map(product => [product.code.toLowerCase(), product]));
  const seen = new Set<string>();
  if (!rows.length || rows.length > 2000) throw new Error("CSV ต้องมีรายการสินค้า 1-2,000 รายการ");
  return rows.map((values, index) => {
    if (values.length !== 2) throw new Error(`CSV แถว ${index + 2} ต้องมี 2 คอลัมน์`);
    const product = byCode.get(values[0].toLowerCase());
    if (!product || !["stored", "manufactured"].includes(product.productType)) throw new Error(`ไม่พบรหัสสินค้าในแถว ${index + 2}: ${values[0]}`);
    if (seen.has(product.id)) throw new Error(`รหัสสินค้า ${product.code} ซ้ำใน CSV`);
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(values[1])) throw new Error(`จำนวนในแถว ${index + 2} ต้องเป็นจำนวนไม่ติดลบ ทศนิยมไม่เกิน 3 หลัก`);
    seen.add(product.id);
    return { productId: product.id, countedQty: values[1] };
  });
}

export function openingCsvTemplate() {
  return "\ufeffproductCode,countedQty\r\n";
}

export function downloadOpeningTemplate() {
  const url = URL.createObjectURL(new Blob([openingCsvTemplate()], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "stock-opening-template.csv"; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportOpenings(rows: StockOpeningBalance[]) {
  exportMasterCsv("stock-opening-balances", rows.map(doc => ({
    เลขที่: doc.openingNo, วันเริ่มใช้: doc.cutoverDate.slice(0, 10), คลัง: doc.warehouseSnapshot?.name || "",
    สถานะ: openingStatuses[doc.status] || doc.status, จำนวนรายการ: doc.items.length,
    จำนวนปรับสุทธิ: doc.items.reduce((sum, line) => sum + Number(line.deltaQty), 0).toFixed(3),
  })));
}
