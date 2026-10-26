import { apiFetch, getAuthHeaders } from "./api";
import { exportMasterCsv } from "./master-data";
import { formatAccountingDate } from "./accounting-date";
import { issueStatuses, issueHistory, availableIssueActions, issueToday, type IssueAction, type IssueStatus, type StockIssue, type IssueProduct } from "./stock-issue";
export { issueToday as returnToday, availableIssueActions as availableReturnActions };
export const returnStatuses: typeof issueStatuses = { ...issueStatuses, approved: "อนุมัติ / รับคืนแล้ว" };
export type ReturnAction = IssueAction;
export const returnActions: Record<ReturnAction, string> = { submit: "ส่งอนุมัติ", approve: "อนุมัติ / รับคืนสินค้า", return: "ส่งกลับแก้ไข", reject: "ปฏิเสธ", cancel: "ยกเลิก / กลับ Stock" };
export const returnHistory: Record<string, string> = { ...issueHistory, ...returnActions };
export type ReturnInput = { stockIssueId: string; returnDate: string; sender: string; receiver: string; returnReason: string; remark: string;
  items: { stockIssueLineId: string; returnedQty: string | number }[]; requestKey?: string; updatedAt?: string };
export type ReturnSourceLine = { id: string; productId: string; productSnapshot: Omit<IssueProduct, "id">; issuedQty: string | number;
  previouslyReturnedQty: string | number; pendingQty: string | number; remainingQty: string | number };
export type ReturnSource = { issue: StockIssue; lines: ReturnSourceLine[] };
export type ReturnSourceOption = Pick<StockIssue, "id" | "issueNo" | "requester" | "receiver" | "warehouseSnapshot">;
export type StockReturn = Omit<ReturnInput, "items"> & {
  id: string; returnNo: string; lifecycleVersion: number; status: IssueStatus; createdById: string | null; updatedAt: string;
  warehouseId: string | null; issueSnapshot: { issueNo: string; issueDate: string; requester: string; receiver: string } | null;
  warehouseSnapshot: StockIssue["warehouseSnapshot"]; workOrderSnapshot: StockIssue["workOrderSnapshot"]; condition: string;
  cancelledAt: string | null; cancellationReason: string | null;
  items: (ReturnInput["items"][number] & Omit<ReturnSourceLine, "id"> & { id: string; seq: number })[];
  attachments: StockIssue["attachments"]; history?: StockIssue["history"]; movements?: StockIssue["movements"];
};
export const returnBase = "/inventory/returns", returnList = "/inventory?tab=returns";
export function newReturn(): ReturnInput {
  return { stockIssueId: "", returnDate: issueToday(), sender: "", receiver: "", returnReason: "", remark: "", items: [] };
}
export function returnForm(doc: StockReturn): ReturnInput {
  return { stockIssueId: doc.stockIssueId, returnDate: doc.returnDate.slice(0, 10), sender: doc.sender || "", receiver: doc.receiver || "",
    returnReason: doc.returnReason || "", remark: doc.remark || "", updatedAt: doc.updatedAt,
    items: doc.items.map(line => ({ stockIssueLineId: line.stockIssueLineId, returnedQty: String(line.returnedQty) })) };
}
const root = "/api/inventory/returns";
export const StockReturnsApi = {
  list: (query: Record<string, string>) => apiFetch<{ data: StockReturn[]; total: number; totalPages: number }>(`${root}?${new URLSearchParams(query)}`),
  all: (query: { q: string; status: string }) => apiFetch<StockReturn[]>(`${root}?${new URLSearchParams(query)}`),
  sources: (q: string) => apiFetch<ReturnSourceOption[]>(`${root}/sources?q=${encodeURIComponent(q)}`),
  source: (id: string, excludeId?: string) => apiFetch<ReturnSource>(`${root}/sources/${encodeURIComponent(id)}${excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : ""}`),
  get: (id: string) => apiFetch<StockReturn>(`${root}/${encodeURIComponent(id)}`),
  create: (body: ReturnInput) => apiFetch<StockReturn>(root, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: ReturnInput) => apiFetch<StockReturn>(`${root}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  action: (doc: StockReturn, action: ReturnAction, reason: string, cancellationDate: string, physicalRemovalConfirmed: boolean) =>
    apiFetch<StockReturn>(`${root}/${encodeURIComponent(doc.id)}/${action}`, { method: "POST", body: JSON.stringify({ updatedAt: doc.updatedAt, reason, cancellationDate, physicalRemovalConfirmed }) }),
  upload: async (doc: StockReturn, files: File[]) => {
    const body = new FormData(); body.set("stockReturnId", doc.id); body.set("category", "stock-return"); body.set("updatedAt", doc.updatedAt);
    files.forEach(file => body.append("files", file));
    const headers = new Headers(getAuthHeaders()); headers.delete("Content-Type");
    const response = await fetch("/api/upload", { method: "POST", headers, body }), data = await response.json();
    if (!response.ok) throw new Error(data.message || `อัปโหลดไม่สำเร็จ (${response.status})`);
  },
  deleteFile: (doc: StockReturn, id: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt: doc.updatedAt }) }),
};
export function exportReturns(rows: StockReturn[]) {
  exportMasterCsv("stock-returns", rows.map(doc => ({ SR: doc.returnNo, วันที่: formatAccountingDate(doc.returnDate), IS: doc.issueSnapshot?.issueNo,
    คลัง: doc.warehouseSnapshot?.name, ผู้ส่งคืน: doc.sender, ผู้รับคืน: doc.receiver, เหตุผลคืน: doc.returnReason,
    สถานะ: returnStatuses[doc.status] || doc.status, จำนวนรายการ: doc.items.length,
    ยกเลิก: formatAccountingDate(doc.cancelledAt), เหตุผลยกเลิก: doc.cancellationReason })));
}
