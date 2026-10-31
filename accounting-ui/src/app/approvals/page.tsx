"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountingApprovalApi, type PendingAccountingApproval } from "@/lib/accounting-approval";
import { formatAccountingDateTime } from "@/lib/accounting-date";

export default function AccountingPendingApprovals() {
  const [rows, setRows] = useState<PendingAccountingApproval[]>([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void AccountingApprovalApi.pending().then(setRows)
      .catch(reason => setError(reason instanceof Error ? reason.message : "โหลดรายการอนุมัติไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);
  return <main className="space-y-4">
    <h1 className="text-2xl font-bold">เอกสาร Accounting รอฉันอนุมัติ</h1>
    <p>แสดงขั้นปัจจุบันของรอบที่บันทึกลำดับใหม่เท่านั้น เอกสารเดิมยังดำเนินการจากหน้าแต่ละหมวด</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p>กำลังโหลด...</p> : !error && !rows.length ? <p>ไม่มีเอกสารในขั้นที่คุณมีสิทธิ์อนุมัติ</p> :
      <ul className="divide-y rounded border bg-white">{rows.map(row => <li key={`${row.docType}:${row.id}`} className="p-4">
        <Link className="font-bold text-blue-700 underline" href={row.href}>{row.docType.toUpperCase()} · {row.docNo}</Link>
        <p>ขั้น {row.step}/{row.steps} · {row.target} · ส่ง {formatAccountingDateTime(row.submittedAt)}</p>
      </li>)}</ul>}
  </main>;
}
