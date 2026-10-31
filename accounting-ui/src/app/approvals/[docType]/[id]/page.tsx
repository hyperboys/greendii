"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountingApprovalApi, approvalDocumentTypes, type ApprovalDetail, type ApprovalDocumentType } from "@/lib/accounting-approval";
import { AccountingApprovalHistory } from "@/components/accounting-approval-history";
import { AccountingApprovalSignatures } from "@/components/accounting-approval-signatures";

export default function AccountingApprovalReview({ params }: { params: { docType: string; id: string } }) {
  const valid = approvalDocumentTypes.includes(params.docType as ApprovalDocumentType);
  const type = params.docType as ApprovalDocumentType;
  const [detail, setDetail] = useState<ApprovalDetail | null>(null), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!valid) { setError("ประเภทเอกสารไม่ถูกต้อง"); return; }
    try { setDetail(await AccountingApprovalApi.detail(type, params.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "โหลดเอกสารไม่สำเร็จ"); }
  }, [valid, type, params.id]);
  useEffect(() => { void load(); }, [load]);
  const perform = async (action: "approve" | "return" | "reject") => {
    if (!detail || busy) return;
    setBusy(true); setError("");
    try {
      await AccountingApprovalApi.act(type, params.id, action, detail.updatedAt, reason);
      setReason(""); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ดำเนินการไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const supported = !["invoice", "bi", "rv", "cn"].includes(type);
  return <main className="space-y-4">
    <h1 className="text-2xl font-bold">ตรวจอนุมัติ Accounting · {detail?.docNo || params.docType.toUpperCase()}</h1>
    <Link className="text-blue-700 underline" href="/approvals">กลับรายการรออนุมัติ</Link>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {detail && <>
      <p>สถานะ: {detail.status}</p>
      <Link className="font-bold text-blue-700 underline" href={detail.documentHref}>เปิดรายละเอียดเอกสาร / รายการ / หลักฐาน / พิมพ์</Link>
      <AccountingApprovalHistory document={detail} />
      <AccountingApprovalSignatures document={detail} />
      {detail.canApprove && supported && <section className="space-y-3 rounded border bg-white p-4">
        <p>อนุมัติเฉพาะขั้นปัจจุบัน การตั้งหนี้/Stock จะเกิดเมื่อครบขั้นตามกติกาเอกสารเดิมเท่านั้น</p>
        <label className="block">เหตุผลส่งกลับ/ปฏิเสธ
          <textarea maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="block w-full rounded border p-2" />
        </label>
        <div className="flex gap-3">
          <button disabled={busy} className="rounded bg-blue-600 p-2 text-white" onClick={() => void perform("approve")}>อนุมัติขั้นนี้</button>
          <button disabled={busy || !reason.trim()} className="rounded border p-2" onClick={() => void perform("return")}>ส่งกลับแก้ไข</button>
          <button disabled={busy || !reason.trim()} className="rounded border p-2 text-red-700" onClick={() => void perform("reject")}>ปฏิเสธ</button>
        </div>
      </section>}
      {detail.canApprove && !supported && <p role="alert">ยังไม่เปิด lifecycle อนุมัติ AR กรุณาติดต่อผู้ดูแล</p>}
    </>}
  </main>;
}
