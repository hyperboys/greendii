"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { formatAccountingDateTime } from "@/lib/accounting-date";
import { masterEndpoints, type MasterKind } from "@/lib/master-data";

const button = "rounded border px-3 py-2 text-sm disabled:opacity-40";
type History = { id: string; action: string; createdAt: string; performedBy?: { fullName: string } | null;
  changedFields?: string[] | null; oldValue: unknown; newValue: unknown };
export function MasterPagination({ total, page, onPage, pageSize = 20 }: {
  total: number; page: number; onPage: (page: number) => void; pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="my-3 flex flex-wrap items-center gap-3 text-sm">
    <span>{total} รายการ · หน้า {Math.min(page, pages)} / {pages}</span>
    <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>ก่อนหน้า</button>
    <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>ถัดไป</button>
  </div>;
}
export function MasterRecordTools({ kind, id, updatedAt }: { kind: MasterKind; id: string; updatedAt?: string }) {
  const access = useAccountingAccess();
  const router = useRouter();
  const [history, setHistory] = useState<History[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = useRef(false);
  const endpoint = `${masterEndpoints[kind]}/${encodeURIComponent(id)}`;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await apiFetch<{ data: History[]; total: number }>(`${endpoint}/history?page=${page}&pageSize=20`);
      setHistory(result.data); setTotal(result.total);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดประวัติไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [endpoint, page]);
  useEffect(() => { void load(); }, [load]);
  const remove = async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      await apiFetch(`${endpoint}/permanent`, { method: "DELETE", body: JSON.stringify({ updatedAt }) });
      router.push(`/master?tab=${kind}`);
    } catch (err) { setError(err instanceof Error ? err.message : "ลบข้อมูลไม่สำเร็จ"); }
    finally { busy.current = false; setLoading(false); }
  };
  return <section className="mt-5 space-y-3 rounded-lg border bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">ประวัติข้อมูลหลัก</h3>
      <button type="button" className={button} disabled={loading} onClick={() => void load()}>โหลดประวัติใหม่</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p>กำลังโหลด...</p> : history.length === 0 ? <p className="text-sm">ยังไม่มีประวัติที่บันทึกไว้ (ข้อมูลเก่าอาจไม่มีประวัติ)</p>
      : history.map(item => <details key={item.id} className="rounded border p-3 text-sm">
        <summary>{formatAccountingDateTime(item.createdAt)} · {item.action} · {item.performedBy?.fullName || "ระบบ"}
          {item.changedFields?.length ? ` · ${item.changedFields.join(", ")}` : ""}</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">{[["ก่อนแก้ไข", item.oldValue], ["หลังแก้ไข", item.newValue]].map(([label, value]) =>
          <div key={String(label)} className="min-w-0"><strong>{String(label)}</strong><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre></div>)}</div>
      </details>)}
    <MasterPagination total={total} page={page} onPage={setPage} />
    {canUseAccounting(access, "master", "delete") && <div className="border-t pt-3">
      <p className="mb-2 text-sm">ลบถาวรได้เฉพาะข้อมูลไม่เคยถูกอ้างอิง หากเคยใช้งานให้ปิดสถานะในหน้าแก้ไขแทน</p>
      {!confirmDelete ? <button type="button" className={`${button} text-red-700`} onClick={() => setConfirmDelete(true)}>ลบข้อมูลที่ไม่เคยใช้งาน</button>
        : <div className="flex flex-wrap items-center gap-3"><span>ยืนยันลบข้อมูลถาวร?</span>
          <button type="button" className={`${button} text-red-700`} disabled={loading} onClick={() => void remove()}>ยืนยันลบ</button>
          <button type="button" className={button} onClick={() => setConfirmDelete(false)}>ไม่ลบ</button></div>}
    </div>}
  </section>;
}
