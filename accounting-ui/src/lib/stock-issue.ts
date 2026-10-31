import { apiFetch, getAuthHeaders } from "./api";
import { exportMasterCsv } from "./master-data";
import { formatAccountingDate } from "./accounting-date";
import type { ReceiptAction, ReceiptStatus, ReceiptProduct, ReceiptWarehouse } from "./goods-receipt";
export type IssueAction = ReceiptAction;
export type IssueStatus = ReceiptStatus;
export type IssueProduct = ReceiptProduct;
export type IssueWarehouse = ReceiptWarehouse;
export type IssueWorkOrder = { id: string; woNo: string; project: string | null };
export type IssueBalance = { productId: string; onHand: number | string; reserved: number | string; available: number | string };
export type IssueLineInput = { productId: string; requestedQty: number | string; issuedQty: number | string };
export type IssueInput = { issueDate: string; warehouseId: string; workOrderId: string; requester: string; receiver: string; remark: string;
  items: IssueLineInput[]; updatedAt?: string; requestKey?: string };
export type StockIssue = Omit<IssueInput, "items" | "workOrderId" | "warehouseId"> & {
  accountingApproval?: import("./accounting-approval").ApprovalSnapshot | null;
  id: string; issueNo: string; warehouseId: string | null; workOrderId: string | null; lifecycleVersion: number; status: IssueStatus;
  updatedAt: string; createdById: string | null; approvedAt: string | null; cancelledAt: string | null; cancellationReason: string | null;
  warehouseSnapshot: Omit<IssueWarehouse, "id"> | null; workOrderSnapshot: Omit<IssueWorkOrder, "id"> | null;
  items: (IssueLineInput & { id: string; seq: number; cancelledQty: number | string; productSnapshot: Omit<IssueProduct, "id"> | null })[];
  attachments: { id: string; originalName: string; fileUrl: string; category: string }[];
  history?: { id: string; action: string; reason: string | null; createdAt: string; performedBy: { fullName: string } | null }[];
  movements?: { id: string; productId: string; warehouseId: string; qtyIn: number | string; qtyOut: number | string; transactionDate: string; reversalRefId: string | null }[];
};
export const issueBase = "/inventory/issues", issueList = "/inventory?tab=issues";
export const issueStatuses: Record<IssueStatus, string> = { draft: "ร่าง", pending: "รออนุมัติ", approved: "อนุมัติ / จ่ายแล้ว", returned: "ส่งกลับแก้ไข", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
export const issueActions: Record<IssueAction, string> = { submit: "ส่งอนุมัติ", approve: "อนุมัติ / จ่ายสินค้า", return: "ส่งกลับแก้ไข", reject: "ปฏิเสธ", cancel: "ยกเลิก / กลับ Stock" };
export const issueHistory: Record<string, string> = { ...issueActions, create: "สร้าง", update: "แก้ไข", attach: "แนบหลักฐาน", detach: "ลบหลักฐาน" };
export const issueToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
export function newIssue(): IssueInput {
  return { issueDate: issueToday(), warehouseId: "", workOrderId: "", requester: "", receiver: "", remark: "", items: [{ productId: "", requestedQty: "1", issuedQty: "1" }] };
}
export function issueForm(doc: StockIssue): IssueInput {
  return { issueDate: doc.issueDate.slice(0, 10), warehouseId: doc.warehouseId || "", workOrderId: doc.workOrderId || "",
    requester: doc.requester || "", receiver: doc.receiver || "", remark: doc.remark || "", updatedAt: doc.updatedAt,
    items: doc.items.map(item => ({ productId: item.productId, requestedQty: String(item.requestedQty), issuedQty: String(item.issuedQty) })) };
}
export function cancelledIssueQty(line: IssueLineInput) {
  const requested = Number(line.requestedQty), issued = Number(line.issuedQty);
  if (line.requestedQty === "" || line.issuedQty === "" || !Number.isFinite(requested) || !Number.isFinite(issued) || requested <= 0 || issued < 0 || issued > requested) return null;
  return (Math.round(requested * 1000) - Math.round(issued * 1000)) / 1000;
}
export function availableIssueActions(doc: Pick<StockIssue, "lifecycleVersion" | "status" | "createdById">, can: { create: boolean; approve: boolean; cancel: boolean }, userId?: string): IssueAction[] {
  if (doc.lifecycleVersion !== 1) return [];
  const actions: IssueAction[] = [];
  if (can.create && ["draft", "returned"].includes(doc.status)) actions.push("submit");
  if (can.approve && doc.status === "pending") {
    if (userId && doc.createdById && userId !== doc.createdById) actions.push("approve");
    actions.push("return", "reject");
  }
  if (can.cancel && ["draft", "pending", "returned", "approved"].includes(doc.status)) actions.push("cancel");
  return actions;
}
const root = "/api/inventory/issues";
export const StockIssuesApi = {
  list: (query: Record<string, string>) => apiFetch<{ data: StockIssue[]; total: number; totalPages: number }>(`${root}?${new URLSearchParams(query)}`),
  all: (query: { q: string; status: string }) => apiFetch<StockIssue[]>(`${root}?${new URLSearchParams(query)}`),
  get: (id: string) => apiFetch<StockIssue>(`${root}/${encodeURIComponent(id)}`),
  lookups: () => apiFetch<{ products: IssueProduct[]; warehouses: IssueWarehouse[] }>(`${root}/lookups`),
  workOrders: (q: string) => apiFetch<IssueWorkOrder[]>(`${root}/work-orders?q=${encodeURIComponent(q)}`),
  balances: (warehouseId: string) => apiFetch<IssueBalance[]>(`${root}/availability?warehouseId=${encodeURIComponent(warehouseId)}`),
  create: (body: IssueInput) => apiFetch<StockIssue>(root, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: IssueInput) => apiFetch<StockIssue>(`${root}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  action: (doc: StockIssue, action: IssueAction, reason: string, cancellationDate: string, physicalReturnConfirmed: boolean) =>
    apiFetch<StockIssue>(`${root}/${encodeURIComponent(doc.id)}/${action}`, { method: "POST", body: JSON.stringify({ updatedAt: doc.updatedAt, reason, cancellationDate, physicalReturnConfirmed }) }),
  upload: async (doc: StockIssue, files: File[]) => {
    const body = new FormData(); body.set("stockIssueId", doc.id); body.set("category", "stock-issue"); body.set("updatedAt", doc.updatedAt);
    files.forEach(file => body.append("files", file));
    const headers = new Headers(getAuthHeaders()); headers.delete("Content-Type");
    const response = await fetch("/api/upload", { method: "POST", headers, body }), data = await response.json();
    if (!response.ok) throw new Error(data.message || `อัปโหลดไม่สำเร็จ (${response.status})`);
  },
  deleteFile: (doc: StockIssue, id: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt: doc.updatedAt }) }),
};
export function exportIssues(rows: StockIssue[]) {
  exportMasterCsv("stock-issues", rows.map(doc => ({ IS: doc.issueNo, วันที่: formatAccountingDate(doc.issueDate), คลัง: doc.warehouseSnapshot?.name,
    WO: doc.workOrderSnapshot?.woNo, ผู้ขอ: doc.requester, ผู้รับ: doc.receiver, สถานะ: issueStatuses[doc.status] || doc.status,
    จำนวนรายการ: doc.items.length, ยกเลิก: formatAccountingDate(doc.cancelledAt), เหตุผล: doc.cancellationReason })));
}
