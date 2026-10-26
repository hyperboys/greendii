import { apiFetch, getAuthHeaders } from "./api";
import { exportMasterCsv } from "./master-data";
import { formatAccountingDate } from "./accounting-date";

export type ChequeStatus = "Prepared" | "Printed" | "Signed" | "Released" | "Cleared" | "Cancelled";
export type ChequeCategory = "cq-document" | "cq-release" | "cq-clear" | "cq-reversal";
export type ChequePermissions = { create: boolean; update: boolean; approve: boolean; pay: boolean; cancel: boolean };
export type ChequeSource = {
  id: string; pvNo: string; pvDate: string; sourceNo: string | null; netPayment: number | string;
  supplierSnapshot: { name?: string; code?: string; taxId?: string; address?: string } | null;
};
export type ChequeInput = {
  docDate: string; paymentVoucherId: string; bankName: string; bankBranch: string; bankAccountNo: string;
  chequeNo: string; chequeDate: string; payee: string; remark: string; requestKey?: string; updatedAt?: string;
};
export type ChequeActionInput = {
  printedDate: string; signedDate: string; signer: string; releaseDate: string; recipient: string;
  clearedDate: string; clearingReference: string; cancelledDate: string; reason: string; reversalReference: string;
};
export type ChequePayment = ChequeInput & {
  id: string; cqNo: string; bankAccount: string; pvNo: string | null; lifecycleVersion: number; status: ChequeStatus;
  amount: number | string; updatedAt: string; createdAt: string; createdById: string | null;
  voucherSnapshot: { pvDate: string; sourceNo: string; poNo: string; supplier: ChequeSource["supplierSnapshot"];
    amountBeforeTax: number | string; vat: number | string; wht: number | string; retention: number | string; netPayment: number | string } | null;
  printedAt: string | null; signedAt: string | null; signer: string | null; releaseDate: string | null; recipient: string | null;
  clearedAt: string | null; clearingReference: string | null; cancelledAt: string | null; cancellationReason: string | null; reversalReference: string | null;
  attachments: { id: string; originalName: string; fileUrl: string; category: ChequeCategory }[];
  history?: { id: string; action: string; reason: string | null; createdAt: string; performedBy?: { fullName: string } | null }[];
};
export const chequeBase = "/ap/vouchers/cq", chequeList = "/ap/vouchers?tab=cq";
export const chequeStatuses: Record<ChequeStatus, string> = {
  Prepared: "เตรียมเช็ค", Printed: "พิมพ์เช็คแล้ว", Signed: "ลงนามแล้ว", Released: "ส่งมอบแล้ว / PV จ่ายแล้ว",
  Cleared: "ธนาคารตัดบัญชีแล้ว", Cancelled: "ยกเลิก",
};
export const chequeActionLabels: Record<Exclude<ChequeStatus, "Prepared">, string> = {
  Printed: "บันทึกพิมพ์เช็ค", Signed: "บันทึกลงนาม", Released: "ส่งมอบเช็ค", Cleared: "บันทึกตัดบัญชี", Cancelled: "ยกเลิก / กลับรายการ",
};
export const chequeEvidenceLabels: Record<ChequeCategory, string> = {
  "cq-document": "เอกสารประกอบเช็ค", "cq-release": "หลักฐานส่งมอบเช็ค", "cq-clear": "หลักฐานตัดบัญชี", "cq-reversal": "หลักฐานคืนเช็ค / หยุดจ่าย / คืนเงินจริง",
};
export const chequePaid = (doc: Pick<ChequePayment, "releaseDate">) => Boolean(doc.releaseDate);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
export function newCheque(): ChequeInput {
  return { docDate: today(), paymentVoucherId: "", bankName: "", bankBranch: "", bankAccountNo: "", chequeNo: "", chequeDate: today(), payee: "", remark: "" };
}
export function chequeForm(doc: ChequePayment): ChequeInput {
  return { docDate: doc.docDate.slice(0, 10), paymentVoucherId: doc.paymentVoucherId, bankName: doc.bankName || "",
    bankBranch: doc.bankBranch || "", bankAccountNo: doc.bankAccountNo || "", chequeNo: doc.chequeNo,
    chequeDate: doc.chequeDate.slice(0, 10), payee: doc.payee, remark: doc.remark || "", updatedAt: doc.updatedAt };
}
export function newChequeAction(): ChequeActionInput {
  return { printedDate: today(), signedDate: today(), signer: "", releaseDate: today(), recipient: "", clearedDate: today(),
    clearingReference: "", cancelledDate: today(), reason: "", reversalReference: "" };
}
export function chequeActions(doc: ChequePayment, can: ChequePermissions): Exclude<ChequeStatus, "Prepared">[] {
  if (doc.lifecycleVersion !== 1 || doc.status === "Cancelled") return [];
  const next: Partial<Record<ChequeStatus, Exclude<ChequeStatus, "Prepared">>> = { Prepared: "Printed", Printed: "Signed", Signed: "Released", Released: "Cleared" };
  const permissions = { Printed: can.create, Signed: can.approve, Released: can.pay, Cleared: can.pay, Cancelled: false };
  const action = next[doc.status], result: Exclude<ChequeStatus, "Prepared">[] = action && permissions[action] ? [action] : [];
  if (can.cancel && (!chequePaid(doc) || can.pay)) result.push("Cancelled");
  return result;
}
export function chequeEvidence(doc: ChequePayment, can: ChequePermissions): ChequeCategory[] {
  if (doc.lifecycleVersion !== 1) return [];
  if (["Prepared", "Printed"].includes(doc.status) && (can.create || can.update)) return ["cq-document"];
  if (doc.status === "Signed" && can.pay) return ["cq-release"];
  if (doc.status === "Released") return [...(can.pay ? ["cq-clear" as const] : []), ...(can.pay && can.cancel ? ["cq-reversal" as const] : [])];
  if (doc.status === "Cleared" && can.pay && can.cancel) return ["cq-reversal"];
  return [];
}
export function exportCheques(rows: ChequePayment[]) {
  exportMasterCsv("cheque-payments", rows.map(row => ({
    CQ: row.cqNo, Date: formatAccountingDate(row.docDate), PV: row.pvNo, Bank: row.bankName,
    Branch: row.bankBranch, Account: `\t${row.bankAccountNo || row.bankAccount}`, ChequeNo: `\t${row.chequeNo}`,
    ChequeDate: formatAccountingDate(row.chequeDate), Payee: row.payee, Amount: String(row.amount),
    Status: chequeStatuses[row.status] || row.status, Released: formatAccountingDate(row.releaseDate),
    Cleared: formatAccountingDate(row.clearedAt), ClearingReference: row.clearingReference,
    Cancelled: formatAccountingDate(row.cancelledAt), CancellationReason: row.cancellationReason, ReversalReference: row.reversalReference, Remark: row.remark,
  })));
}
const base = "/api/ap/cheque-payments";
export const ChequePaymentsApi = {
  list: (query: Record<string, string>) => apiFetch<{ data: ChequePayment[]; total: number; totalPages: number }>(`${base}?${new URLSearchParams(query)}`),
  all: (query: Record<string, string>) => apiFetch<ChequePayment[]>(`${base}?${new URLSearchParams({ q: query.q, status: query.status })}`),
  get: (id: string) => apiFetch<ChequePayment>(`${base}/${encodeURIComponent(id)}`),
  sources: (q: string) => apiFetch<ChequeSource[]>(`${base}/sources?${new URLSearchParams({ q })}`),
  source: (id: string) => apiFetch<ChequeSource>(`${base}/sources/${encodeURIComponent(id)}`),
  create: (body: ChequeInput) => apiFetch<ChequePayment>(base, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: ChequeInput) => apiFetch<ChequePayment>(`${base}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  status: (doc: ChequePayment, status: ChequeStatus, body: ChequeActionInput) => apiFetch<ChequePayment>(`${base}/${encodeURIComponent(doc.id)}/status`,
    { method: "PATCH", body: JSON.stringify({ ...body, status, updatedAt: doc.updatedAt }) }),
  upload: async (doc: ChequePayment, category: ChequeCategory, files: File[]) => {
    const body = new FormData(); body.set("chequePaymentId", doc.id); body.set("updatedAt", doc.updatedAt); body.set("category", category);
    files.forEach(file => body.append("files", file));
    const headers = new Headers(getAuthHeaders()); headers.delete("Content-Type");
    const response = await fetch("/api/upload", { method: "POST", headers, body }), result = await response.json();
    if (!response.ok) throw new Error(result.message || `อัปโหลดไม่สำเร็จ (${response.status})`);
  },
  deleteFile: (doc: ChequePayment, id: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt: doc.updatedAt }) }),
};
