"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountingApprovalApi, type ApprovalDetail, type ApprovalDocumentFields, type ApprovalDocumentType } from "@/lib/accounting-approval";
import { AccountingApprovalHistory } from "./accounting-approval-history";

export function AccountingApprovalPanel({ docType, document, canSubmit, onChanged }: {
  docType: ApprovalDocumentType;
  document: ApprovalDocumentFields & { id: string; status: string; updatedAt: string };
  canSubmit: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    setError(""); setDetail(null); setEnabled(false);
    AccountingApprovalApi.detail(docType, document.id).then(result => {
      if (current) { setDetail(result); setEnabled(Boolean(result.chainEnabled)); }
    }).catch(failure => { if (current) setError(failure instanceof Error ? failure.message : "โหลดสายอนุมัติไม่สำเร็จ"); });
    return () => { current = false; };
  }, [docType, document.id, document.updatedAt]);
  const submit = async () => {
    if (busy || !detail) return;
    setBusy(true); setError("");
    try {
      await AccountingApprovalApi.act(docType, document.id, "submit", detail.updatedAt);
      onChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ส่งอนุมัติไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const cycle = detail?.accountingApproval?.cycles.at(-1);
  return <section className="accounting-approval-panel rounded border bg-white p-3">
    <style>{`@media print { .accounting-approval-panel { display:none!important; } }`}</style>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {cycle && cycle.state !== "legacy" && <p>สายอนุมัติ · ขั้น {Math.min(cycle.approvals.length + 1, cycle.steps.length)}/{cycle.steps.length}
      {cycle.state === "pending" ? ` · รอ ${cycle.steps[cycle.approvals.length]?.label || ""}` : ` · ${cycle.state}`}</p>}
    {enabled && canSubmit && ["draft", "returned"].includes(document.status) &&
      <button disabled={busy || !detail} className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => void submit()}>ส่งตามสายอนุมัติ</button>}
    {detail?.canApprove && <Link className="block text-blue-700 underline" href={`/approvals/${docType}/${encodeURIComponent(document.id)}`}>ตรวจสอบและอนุมัติขั้นนี้</Link>}
    <AccountingApprovalHistory document={detail || document} />
  </section>;
}
