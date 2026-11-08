"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountingApprovalApi, type ApprovalDetail, type ApprovalDocumentFields, type ApprovalDocumentType } from "@/lib/accounting-approval";
import { AccountingApprovalHistory } from "./accounting-approval-history";

export function AccountingApprovalPanel({ docType, document, canSubmit, onChanged, onModeChange, hideWhenEmpty = false }: {
  docType: ApprovalDocumentType;
  document: ApprovalDocumentFields & { id: string; status: string; updatedAt: string };
  canSubmit: boolean;
  onChanged: () => void;
  onModeChange?: (managed: boolean) => void;
  hideWhenEmpty?: boolean;
}) {
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const existingCycle = document.accountingApproval?.cycles.at(-1);
  useEffect(() => {
    let current = true;
    setError(""); setDetail(null); setEnabled(false);
    AccountingApprovalApi.detail(docType, document.id).then(result => {
      if (current) {
        setDetail(result);
        setEnabled(Boolean(result.chainEnabled));
        const cycle = result.accountingApproval?.cycles.at(-1);
        onModeChange?.(Boolean(cycle && cycle.state !== "legacy" ||
          result.chainEnabled && ["draft", "returned"].includes(document.status)));
      }
    }).catch(failure => {
      if (current) {
        onModeChange?.(Boolean(existingCycle && existingCycle.state !== "legacy"));
        setError(failure instanceof Error ? failure.message : "โหลดสายอนุมัติไม่สำเร็จ");
      }
    });
    return () => { current = false; };
  }, [docType, document.id, document.updatedAt, document.status, existingCycle, onModeChange]);
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
  const act = async (action: "approve" | "return" | "reject") => {
    if (busy || !detail || (action !== "approve" && !reason.trim())) return;
    setBusy(true); setError("");
    try {
      await AccountingApprovalApi.act(docType, document.id, action, detail.updatedAt, reason.trim() || undefined);
      setReason("");
      onChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ดำเนินการไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const managed = Boolean(cycle && cycle.state !== "legacy" ||
    enabled && ["draft", "returned"].includes(document.status));
  if (hideWhenEmpty && !error && !managed && !(detail || document).accountingApproval) return null;
  return <section className="accounting-approval-panel rounded border bg-white p-3">
    <style>{`@media print { .accounting-approval-panel { display:none!important; } }`}</style>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {managed && cycle && cycle.state !== "legacy" && <p>สายอนุมัติ · ขั้น {Math.min(cycle.approvals.length + 1, cycle.steps.length)}/{cycle.steps.length}
      {cycle.state === "pending" ? ` · รอ ${cycle.steps[cycle.approvals.length]?.label || ""}` : ` · ${cycle.state}`}</p>}
    {managed && enabled && canSubmit && ["draft", "returned"].includes(document.status) &&
      <button disabled={busy || !detail} className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => void submit()}>ส่งตามสายอนุมัติ</button>}
    {managed && detail?.canApprove && <section className="mt-3 space-y-2 rounded border p-3">
      <label className="block text-sm">เหตุผลส่งกลับ/ปฏิเสธ
        <textarea maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border p-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => void act("approve")}>อนุมัติขั้นนี้</button>
        <button disabled={busy || !reason.trim()} className="rounded border px-3 py-2" onClick={() => void act("return")}>ส่งกลับแก้ไข</button>
        <button disabled={busy || !reason.trim()} className="rounded border px-3 py-2 text-red-700" onClick={() => void act("reject")}>ปฏิเสธ</button>
        <Link className="px-2 py-2 text-blue-700 underline" href={`/approvals/${docType}/${encodeURIComponent(document.id)}`}>เปิดหน้าตรวจอนุมัติ</Link>
      </div>
    </section>}
    <AccountingApprovalHistory document={detail || document} />
  </section>;
}
