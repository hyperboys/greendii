import { apiFetch, getAuthHeaders } from "./api";
import { exportMasterCsv } from "./master-data";
import { formatAccountingDate } from "./accounting-date";
export type ReceiptStatus = "draft" | "pending" | "approved" | "returned" | "rejected" | "cancelled";
export type ReceiptAction = "submit" | "approve" | "return" | "reject" | "cancel";
export type ReceiptProduct = { id: string; code: string; name: string; unit: string | null; productType: string };
export type ReceiptWarehouse = { id: string; code: string; name: string };
export type ReceiptLineInput = { poLineId: string; productId: string; currentReceiptQty: string | number };
export type ReceiptInput = { receiptDate: string; poId: string; warehouseId: string; sender: string; receiver: string; remark: string;
  items: ReceiptLineInput[]; updatedAt?: string; requestKey?: string };
export type ReceiptSourceLine = { id: string; seq: number; desc: string; unit: string | null; productId: string | null;
  orderedQty: number | string; previouslyReceivedQty: number | string; pendingQty: number | string; remainingQty: number | string };
export type ReceiptSource = { id: string; poNo: string; poDate: string; supplier: { name?: string }; lines: ReceiptSourceLine[] };
export type ReceiptSourceOption = Pick<ReceiptSource, "id" | "poNo" | "poDate" | "supplier">;
export type GoodsReceipt = Omit<ReceiptInput, "items" | "warehouseId"> & {
  accountingApproval?: import("./accounting-approval").ApprovalSnapshot | null;
  id: string; grNo: string; poNo: string | null; warehouseId: string | null; lifecycleVersion: number; status: ReceiptStatus;
  createdById: string | null; updatedAt: string; approvedAt: string | null; cancelledAt: string | null; cancellationReason: string | null;
  supplierSnapshot: { code?: string; name?: string; taxId?: string } | null; warehouseSnapshot: { code: string; name: string } | null;
  items: (ReceiptLineInput & { id: string; seq: number; desc: string | null; unit: string | null;
    productSnapshot: Omit<ReceiptProduct, "id"> | null; orderedQty: number | string; previouslyReceivedQty: number | string;
    pendingQty: number | string; remainingQty: number | string })[];
  attachments: { id: string; originalName: string; fileUrl: string; category: string }[];
  history?: { id: string; action: string; reason: string | null; createdAt: string; performedBy?: { fullName: string } | null }[];
  movements?: { id: string; productId: string; warehouseId: string; qtyIn: number | string; qtyOut: number | string;
    transactionDate: string; reversalRefId: string | null }[];
};
export const receiptBase = "/ap/vouchers/gr", receiptList = "/ap/vouchers?tab=gr";
export const receiptStatuses: Record<ReceiptStatus, string> = { draft: "ร่าง", pending: "รอตรวจรับ", approved: "อนุมัติรับแล้ว",
  returned: "ส่งกลับแก้ไข", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
export const receiptActions: Record<ReceiptAction, string> = { submit: "ส่งตรวจรับ", approve: "อนุมัติรับสินค้า", return: "ส่งกลับแก้ไข", reject: "ปฏิเสธ", cancel: "ยกเลิก / กลับ Stock" };
export const receiptHistory: Record<string, string> = { ...receiptActions, create: "สร้าง", update: "แก้ไข", attach: "แนบหลักฐาน", detach: "ลบหลักฐาน" };
export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
export function newReceipt(): ReceiptInput {
  return { receiptDate: today(), poId: "", warehouseId: "", sender: "", receiver: "", remark: "", items: [] };
}
export function receiptForm(doc: GoodsReceipt): ReceiptInput {
  return { receiptDate: doc.receiptDate.slice(0, 10), poId: doc.poId, warehouseId: doc.warehouseId || "", sender: doc.sender || "",
    receiver: doc.receiver || "", remark: doc.remark || "", updatedAt: doc.updatedAt,
    items: doc.items.map(item => ({ poLineId: item.poLineId, productId: item.productId, currentReceiptQty: String(item.currentReceiptQty) })) };
}
export function availableReceiptActions(doc: GoodsReceipt, can: { create: boolean; approve: boolean; cancel: boolean }, userId?: string): ReceiptAction[] {
  if (doc.lifecycleVersion !== 1) return [];
  const result: ReceiptAction[] = [];
  if (can.create && ["draft", "returned"].includes(doc.status)) result.push("submit");
  if (can.approve && doc.status === "pending") {
    if (userId && doc.createdById && userId !== doc.createdById) result.push("approve");
    result.push("return", "reject");
  }
  if (can.cancel && ["draft", "pending", "returned", "approved"].includes(doc.status)) result.push("cancel");
  return result;
}
const endpoint = "/api/ap/goods-receipts";
export const GoodsReceiptsApi = {
  list: (query: Record<string, string>) => apiFetch<{ data: GoodsReceipt[]; total: number; totalPages: number }>(`${endpoint}?${new URLSearchParams(query)}`),
  all: (query: { q?: string; status?: string }) => apiFetch<GoodsReceipt[]>(`${endpoint}?${new URLSearchParams(query)}`),
  get: (id: string) => apiFetch<GoodsReceipt>(`${endpoint}/${encodeURIComponent(id)}`),
  sources: (q: string) => apiFetch<ReceiptSourceOption[]>(`${endpoint}/sources?q=${encodeURIComponent(q)}`),
  source: (id: string, excludeId?: string) => apiFetch<ReceiptSource>(`${endpoint}/sources/${encodeURIComponent(id)}${excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : ""}`),
  lookups: () => apiFetch<{ products: ReceiptProduct[]; warehouses: ReceiptWarehouse[] }>(`${endpoint}/lookups`),
  create: (input: ReceiptInput) => apiFetch<GoodsReceipt>(endpoint, { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: ReceiptInput) => apiFetch<GoodsReceipt>(`${endpoint}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  action: (doc: GoodsReceipt, action: ReceiptAction, reason: string, cancellationDate: string) => apiFetch<GoodsReceipt>(
    `${endpoint}/${encodeURIComponent(doc.id)}/${action}`, { method: "POST", body: JSON.stringify({ updatedAt: doc.updatedAt, reason, cancellationDate }) }),
  upload: async (doc: GoodsReceipt, files: File[]) => {
    const body = new FormData(); body.set("goodsReceiptId", doc.id); body.set("category", "gr-receipt"); body.set("updatedAt", doc.updatedAt);
    files.forEach(file => body.append("files", file));
    const headers = new Headers(getAuthHeaders()); headers.delete("Content-Type");
    const response = await fetch("/api/upload", { method: "POST", headers, body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `อัปโหลดไม่สำเร็จ (${response.status})`);
  },
  deleteFile: (doc: GoodsReceipt, id: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt: doc.updatedAt }) }),
};
export function exportReceipts(rows: GoodsReceipt[]) {
  exportMasterCsv("goods-receipts", rows.map(doc => ({ GR: doc.grNo, วันที่: formatAccountingDate(doc.receiptDate), PO: doc.poNo,
    ผู้ขาย: doc.supplierSnapshot?.name, คลัง: doc.warehouseSnapshot?.name, สถานะ: receiptStatuses[doc.status] || doc.status,
    จำนวนรายการ: doc.items.length, วันที่ยกเลิก: formatAccountingDate(doc.cancelledAt), เหตุผล: doc.cancellationReason })));
}
