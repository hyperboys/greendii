import { apiFetch } from "./api";

export const approvalDocumentTypes = ["po", "gr", "is", "sr", "ps", "pv", "opening", "invoice", "bi", "rv", "cn"] as const;
export type ApprovalDocumentType = typeof approvalDocumentTypes[number];
export type ApprovalTarget = { kind: "role" | "user"; targetId: string };
export type ApprovalActor = {
  step: number; actorId: string; fullName: string; signatureText: string | null; signatureUrl: string | null; approvedAt: string;
};
export type ApprovalCycle = {
  cycle: number; state: "pending" | "approved" | "returned" | "rejected" | "cancelled" | "legacy";
  configRevision?: number; submittedAt: string; submittedById: string;
  steps: (ApprovalTarget & { label: string })[]; approvals: ApprovalActor[];
  closedAt?: string; closedById?: string; reason?: string;
};
export type ApprovalSnapshot = { version: 1; cycles: ApprovalCycle[] };
export type ApprovalDocumentFields = { accountingApproval?: ApprovalSnapshot | null };
export type ApprovalConfiguration = {
  docType: ApprovalDocumentType; enabled: boolean; steps: ApprovalTarget[]; revision: number; updatedAt: string | null;
};
export type PendingAccountingApproval = {
  docType: ApprovalDocumentType; id: string; docNo: string; updatedAt: string; submittedAt: string;
  step: number; steps: number; target: string; href: string;
  documentHref: string;
};
export type ApprovalDetail = {
  accountingApproval: ApprovalSnapshot | null; canApprove: boolean; status: string; updatedAt: string; docNo: string; documentHref: string;
};
const ACTION_PATHS: Partial<Record<ApprovalDocumentType, string>> = {
  po: "/api/ap/purchase-orders", gr: "/api/ap/goods-receipts", ps: "/api/ap/contractor-payments", pv: "/api/ap/payment-vouchers",
  is: "/api/inventory/issues", sr: "/api/inventory/returns", opening: "/api/inventory/opening-balances",
};
const BASE = "/api/accounting-approvals";
export const AccountingApprovalApi = {
  configuration: () => apiFetch<{ rolloutReady: boolean; configurations: ApprovalConfiguration[] }>(`${BASE}/configuration`),
  saveConfiguration: (config: ApprovalConfiguration) => apiFetch<ApprovalConfiguration>(`${BASE}/configuration/${config.docType}`, {
    method: "PUT", body: JSON.stringify({ enabled: config.enabled, steps: config.steps, revision: config.revision }),
  }),
  pending: () => apiFetch<PendingAccountingApproval[]>(`${BASE}/pending`),
  detail: (docType: ApprovalDocumentType, id: string) => apiFetch<ApprovalDetail>(
    `${BASE}/${docType}/${encodeURIComponent(id)}`),
  act: (docType: ApprovalDocumentType, id: string, action: "approve" | "return" | "reject", updatedAt: string, reason?: string) => {
    const base = ACTION_PATHS[docType];
    if (!base) return Promise.reject(new Error("ยังไม่เปิด lifecycle อนุมัติ AR"));
    return apiFetch<ApprovalDocumentFields>(`${base}/${encodeURIComponent(id)}/${action}`, {
      method: "POST", body: JSON.stringify({ updatedAt, reason }),
    });
  },
};
export function latestApprovalCycle(document: ApprovalDocumentFields): ApprovalCycle | null {
  return document.accountingApproval?.cycles.at(-1) || null;
}
export function approvedActors(document: ApprovalDocumentFields): ApprovalActor[] {
  return latestApprovalCycle(document)?.approvals || [];
}
export function signatureText(actor: Pick<ApprovalActor, "signatureText" | "fullName">) {
  if (actor.signatureText?.trim()) return actor.signatureText.trim();
  const parts = actor.fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${Array.from(parts[parts.length - 1])[0]}.` : actor.fullName.trim();
}
