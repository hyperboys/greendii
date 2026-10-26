import { apiFetch, getAuthHeaders } from "./api";

export type VoucherLine = { desc: string; amount: number | string };
export type VoucherSource = {
  id: string; psNo: string; docDate: string; poNo: string | null;
  supplierSnapshot: { name?: string; code?: string; taxId?: string; branch?: string; address?: string } | null;
  netAmount: number | string; amountBeforeTax?: number | string; vat?: number | string;
  wht?: number | string; otherDeduction?: number | string; netPayment?: number | string; items?: VoucherLine[];
};
export type VoucherInput = {
  pvDate: string; sourceDocId: string; paymentMethod: "cash" | "transfer" | "cheque"; taxpayerType: string;
  taxDescription: string; remark: string; updatedAt?: string; requestKey?: string;
};
export type VoucherAttachment = { id: string; originalName: string; fileUrl: string; category: EvidenceCategory };
export type EvidenceCategory = "pv-document" | "pv-payment" | "pv-reversal";
export type VoucherAction = "submit" | "approve" | "return" | "reject" | "pay" | "cancel";
export type VoucherActionInput = {
  reason: string; paidDate: string; payerBank: string; payeeBank: string; paymentReference: string;
  recipient: string; reversalDate: string; reversalReference: string;
};
export type PaymentVoucher = VoucherInput & {
  id: string; pvNo: string; lifecycleVersion: number; status: string; updatedAt: string;
  sourceNo: string | null; sourceDate: string | null; poNo: string | null; supplierSnapshot: VoucherSource["supplierSnapshot"];
  createdById: string | null; approvedAt: string | null; paidAt: string | null; reversedAt: string | null;
  payerBank: string | null; payeeBank: string | null; recipient: string | null; paymentReference: string | null; reversalReference: string | null;
  amountBeforeTax: number | string; vat: number | string; wht: number | string; otherDeduction: number | string; netPayment: number | string;
  items: VoucherLine[]; attachments: VoucherAttachment[];
  chequePayments: { id: string; cqNo: string; bankAccount: string; chequeNo: string; chequeDate: string; status: string; amount: number | string }[];
  history?: { id: string; action: string; reason: string | null; performedBy?: { fullName: string } | null; createdAt: string }[];
};
export const voucherBase = "/ap/vouchers/pv", voucherList = "/ap/vouchers?tab=pv";
export const voucherStatuses: Record<string, string> = { draft: "Draft", pending: "รออนุมัติ", approved: "อนุมัติแล้ว", returned: "ส่งกลับแก้ไข", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
export const voucherActions: Record<VoucherAction | "reverse", string> = { submit: "ส่งอนุมัติ", approve: "อนุมัติ", return: "ส่งกลับแก้ไข", reject: "ปฏิเสธ", pay: "บันทึกจ่ายจริง", cancel: "ยกเลิก", reverse: "กลับรายการจ่าย" };
export const evidenceLabels: Record<EvidenceCategory, string> = { "pv-document": "เอกสารประกอบ", "pv-payment": "หลักฐานจ่ายเงิน", "pv-reversal": "หลักฐานกลับรายการจ่าย" };
export const methodLabels = { cash: "เงินสด", transfer: "โอน", cheque: "เช็ค (จ่ายผ่าน Process เช็ค)" };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
export function newVoucher(): VoucherInput { return { pvDate: today(), sourceDocId: "", paymentMethod: "transfer", taxpayerType: "", taxDescription: "", remark: "" }; }
export function voucherForm(doc: PaymentVoucher): VoucherInput {
  return { pvDate: doc.pvDate.slice(0, 10), sourceDocId: doc.sourceDocId, paymentMethod: doc.paymentMethod,
    taxpayerType: doc.taxpayerType || "", taxDescription: doc.taxDescription || "", remark: doc.remark || "", updatedAt: doc.updatedAt };
}
export function newVoucherAction(): VoucherActionInput {
  return { reason: "", paidDate: today(), payerBank: "", payeeBank: "", recipient: "", paymentReference: "", reversalDate: today(), reversalReference: "" };
}
export function voucherPaymentLabel(doc: Pick<PaymentVoucher, "paidAt" | "reversedAt" | "status">) {
  return doc.reversedAt ? "กลับรายการจ่ายแล้ว" : doc.paidAt ? "จ่ายแล้ว" : doc.status === "approved" ? "อนุมัติแล้วรอจ่าย" : "ยังไม่จ่าย";
}
export function evidenceCategories(doc: PaymentVoucher, permissions: { create: boolean; update: boolean; pay: boolean; cancel: boolean }): EvidenceCategory[] {
  if (doc.lifecycleVersion !== 1) return [];
  if (["draft", "returned"].includes(doc.status) && (permissions.create || permissions.update)) return ["pv-document", "pv-payment"];
  if (doc.status !== "approved") return [];
  if (!doc.paidAt && permissions.pay) return ["pv-payment"];
  if (doc.paidAt && permissions.pay && permissions.cancel) return ["pv-reversal"];
  return [];
}
const api = "/api/ap/payment-vouchers";
export const PaymentVouchersApi = {
  list: (query: Record<string, string>) => apiFetch<{ data: PaymentVoucher[]; total: number; totalPages: number }>(`${api}?${new URLSearchParams(query)}`),
  get: (id: string) => apiFetch<PaymentVoucher>(`${api}/${encodeURIComponent(id)}`),
  sources: (q: string) => apiFetch<VoucherSource[]>(`${api}/sources?${new URLSearchParams({ q })}`),
  source: (id: string) => apiFetch<VoucherSource>(`${api}/sources/${encodeURIComponent(id)}`),
  create: (body: VoucherInput) => apiFetch<PaymentVoucher>(api, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: VoucherInput) => apiFetch<PaymentVoucher>(`${api}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  action: (id: string, action: VoucherAction, updatedAt: string, body: VoucherActionInput) =>
    apiFetch<PaymentVoucher>(`${api}/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify({ ...body, updatedAt }) }),
  upload: async (doc: PaymentVoucher, category: EvidenceCategory, files: File[]) => {
    const body = new FormData(); body.set("paymentVoucherId", doc.id); body.set("updatedAt", doc.updatedAt); body.set("category", category);
    files.forEach(file => body.append("files", file));
    const headers = new Headers(getAuthHeaders()); headers.delete("Content-Type");
    const response = await fetch("/api/upload", { method: "POST", headers, body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || `อัปโหลดไม่สำเร็จ (${response.status})`);
  },
  deleteFile: (id: string, updatedAt: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt }) }),
};
