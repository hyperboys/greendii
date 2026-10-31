import { apiFetch } from "./api";

export type PaymentLine = { desc: string; amount: number | string; remark: string | null };
export type PaymentInput = {
  docDate: string; poId: string; paymentRound: number | string; whtRate: number | string;
  retentionRate: number | string; remark: string | null; items: PaymentLine[]; updatedAt?: string; requestKey?: string;
};
export type PaymentSource = {
  id: string; poNo: string; poDate: string; supplier: { name: string }; vatConfig?: string;
  before?: number; vat?: number; gross?: number;
  used?: { before: number; vat: number; gross: number; retention: number }; nextRound?: number;
};
export type ContractorPayment = PaymentInput & {
  accountingApproval?: import("./accounting-approval").ApprovalSnapshot | null;
  id: string; psNo: string; poNo: string | null; lifecycleVersion: number; status: string; updatedAt: string;
  createdById: string | null; approvedById: string | null; approvedAt: string | null; vatConfig: string;
  supplierSnapshot: { code?: string; name?: string; taxId?: string; address?: string; branch?: string; contactPerson?: string } | null;
  poAmount: number | string; previouslyRequestedAmount: number | string; remainingAmount: number | string;
  previouslyRetainedAmount: number | string; currentRequestAmount: number | string; vat: number | string;
  wht: number | string; retention: number | string; netAmount: number | string;
  history?: { id: string; action: string; reason: string | null; performedBy?: { fullName: string } | null; createdAt: string }[];
};
export type PaymentAction = "submit" | "approve" | "return" | "reject" | "cancel";
export const paymentStatuses: Record<string, string> = {
  draft: "Draft", pending: "รออนุมัติ", approved: "อนุมัติแล้ว", returned: "ส่งกลับแก้ไข", rejected: "ปฏิเสธ", cancelled: "ยกเลิก",
};
export const paymentActions: Record<PaymentAction, string> = {
  submit: "ส่งอนุมัติ", approve: "อนุมัติ", return: "ส่งกลับแก้ไข", reject: "ปฏิเสธ", cancel: "ยกเลิก",
};
export const paymentBase = "/ap/vouchers/ps";
export const paymentList = "/ap/vouchers?tab=ps";
export const newPaymentLine = (): PaymentLine => ({ desc: "", amount: "", remark: "" });
export function newPayment(): PaymentInput {
  return { docDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }), poId: "", paymentRound: 1,
    whtRate: 0, retentionRate: 0, remark: "", items: [newPaymentLine()] };
}
export function paymentForm(doc: ContractorPayment): PaymentInput {
  return { docDate: doc.docDate.slice(0, 10), poId: doc.poId, paymentRound: doc.paymentRound,
    whtRate: doc.whtRate, retentionRate: doc.retentionRate, remark: doc.remark || "", updatedAt: doc.updatedAt,
    items: doc.items.map(row => ({ desc: row.desc, amount: row.amount, remark: row.remark || "" })) };
}
export function paymentPreview(form: PaymentInput, vatConfig: string) {
  const before = form.items.reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0);
  const percent = (rate: number | string) => {
    const scaled = Math.round(Number(rate || 0) * 100);
    return Number.isSafeInteger(before) && Number.isSafeInteger(scaled)
      ? Number((BigInt(before) * BigInt(scaled) + BigInt(5000)) / BigInt(10000)) : NaN;
  };
  const vat = vatConfig === "VAT7%" ? Math.round(before * 7 / 100) : 0;
  const wht = percent(form.whtRate), retention = percent(form.retentionRate);
  return { before: before / 100, vat: vat / 100, wht: wht / 100, retention: retention / 100, net: (before + vat - wht - retention) / 100 };
}
const api = "/api/ap/contractor-payments";
export const ContractorPaymentsApi = {
  list: (query: Record<string, string>) => apiFetch<{ data: ContractorPayment[]; total: number; page: number; totalPages: number }>(`${api}?${new URLSearchParams(query)}`),
  get: (id: string) => apiFetch<ContractorPayment>(`${api}/${encodeURIComponent(id)}`),
  sources: (q: string) => apiFetch<PaymentSource[]>(`${api}/sources?${new URLSearchParams({ q })}`),
  source: (id: string) => apiFetch<PaymentSource>(`${api}/sources/${encodeURIComponent(id)}`),
  create: (body: PaymentInput) => apiFetch<ContractorPayment>(api, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: PaymentInput) => apiFetch<ContractorPayment>(`${api}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  action: (id: string, action: PaymentAction, updatedAt: string, reason: string) =>
    apiFetch<ContractorPayment>(`${api}/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify({ updatedAt, reason }) }),
};
