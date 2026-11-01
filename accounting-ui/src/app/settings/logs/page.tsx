"use client";

import { useEffect, useState } from "react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { DateInput } from "@/components/date-input";
import { AccountingLogsApi, activityPath, logDateTime, type AuditLogRow, type ActivityLogRow, type LogFilters } from "@/lib/accounting-logs";

const control = "rounded border bg-white px-3 py-2 text-sm disabled:opacity-40";
const initial: LogFilters = { page: "1", limit: "50", search: "", user: "", from: "", to: "",
  entityType: "", action: "", method: "", status: "" };
const actions: Record<string, string> = { create: "สร้าง", update: "แก้ไข", submit: "ส่งอนุมัติ", approve: "อนุมัติ",
  return: "ส่งกลับ", reject: "ปฏิเสธ", cancel: "ยกเลิก", confirm: "ยืนยัน", pay: "จ่ายเงิน", delete: "ลบ" };

export default function AccountingLogsPage() {
  const access = useAccountingAccess();
  const [tab, setTab] = useState<"audit" | "activity">("audit");
  const [draft, setDraft] = useState(initial), [filters, setFilters] = useState(initial);
  const [audit, setAudit] = useState<AuditLogRow[]>([]), [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!access?.isAdmin) return;
    let current = true;
    setLoading(true); setError(""); setAudit([]); setActivity([]); setTotal(0);
    const load = async () => {
      try {
        if (tab === "audit") {
          const result = await AccountingLogsApi.audit(filters);
          if (current) { setAudit(result.rows); setTypes(result.entityTypes); setTotal(result.total); }
        } else {
          const result = await AccountingLogsApi.activity(filters);
          if (current) { setActivity(result.rows); setTotal(result.total); }
        }
      } catch (err) {
        if (current) setError(err instanceof Error ? err.message : "โหลดบันทึกกิจกรรมไม่สำเร็จ");
      } finally { if (current) setLoading(false); }
    };
    void load();
    return () => { current = false; };
  }, [access?.isAdmin, tab, filters, reload]);
  if (!access?.isAdmin) return <p role="alert">เฉพาะ admin สามารถดู Log ของ Accounting ได้</p>;
  const page = Number(filters.page), pages = Math.max(1, Math.ceil(total / Number(filters.limit)));
  return <section className="mx-auto max-w-7xl space-y-4">
    <header className="flex flex-wrap justify-between gap-3">
      <div><h1 className="text-2xl font-bold">บันทึกกิจกรรม Accounting</h1>
        <p className="mt-1 text-sm text-[#657069]">ดูประวัติเอกสารและ Activity Log แบบ Sale · อ่านอย่างเดียว · เวลาไทย</p></div>
      <button className={control} disabled={loading} onClick={() => setReload(value => value + 1)}>โหลดข้อมูลล่าสุด</button>
    </header>
    <div role="tablist" aria-label="ประเภท Log" className="flex gap-2">
      {(["audit", "activity"] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} className={control}
        onClick={() => { setTab(value); setDraft(initial); setFilters(initial); }}>{value === "audit" ? "ประวัติเอกสาร / Audit Log" : "การใช้งาน / Activity Log"}</button>)}
    </div>
    <p className="rounded bg-amber-50 p-3 text-sm">{tab === "audit"
      ? "เฉพาะเหตุการณ์ Accounting ที่มีบันทึก Audit เดิม แสดงผู้ดำเนินการ เหตุผล และข้อมูลก่อน/หลัง ไม่สร้างประวัติย้อนหลังที่ไม่เคยบันทึก"
      : "เฉพาะ API ของ Accounting จาก Activity Log เดิม แสดง HTTP status และเวลาในการตอบกลับ ไม่ใช่หลักฐานว่าเอกสารถูกอนุมัติ ไม่รวม Login/API ทั่วไปของ Sale แต่ API ข้อมูลหลักอาจเรียกจากทั้งสองระบบ"}</p>
    <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-3" onSubmit={event => {
      event.preventDefault(); setFilters({ ...draft, page: "1" });
    }}>
      <label>ค้นหา<input className={`${control} block`} value={draft.search} placeholder={tab === "audit" ? "เลขเอกสาร / เหตุผล / ID" : "API path"}
        onChange={event => setDraft({ ...draft, search: event.target.value })} /></label>
      <label>ผู้ดำเนินการ<input className={`${control} block`} value={draft.user} placeholder="ชื่อ / username"
        onChange={event => setDraft({ ...draft, user: event.target.value })} /></label>
      <label>ตั้งแต่วันที่<DateInput className={`${control} block`} value={draft.from} onChange={from => setDraft({ ...draft, from })} /></label>
      <label>ถึงวันที่<DateInput className={`${control} block`} value={draft.to} onChange={to => setDraft({ ...draft, to })} /></label>
      {tab === "audit" ? <>
        <label>ประเภทเอกสาร<select className={`${control} block`} value={draft.entityType} onChange={event => setDraft({ ...draft, entityType: event.target.value })}>
          <option value="">ทุกประเภท</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Action<input className={`${control} block`} value={draft.action} placeholder="เช่น approve / cancel"
          onChange={event => setDraft({ ...draft, action: event.target.value })} /></label>
      </> : <>
        <label>HTTP method<select className={`${control} block`} value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value })}>
          <option value="">ทั้งหมด</option>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>ผลการใช้งาน<select className={`${control} block`} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
          <option value="">ทั้งหมด</option><option value="success">สำเร็จ (&lt; 400)</option><option value="error">ผิดพลาด (≥ 400)</option></select></label>
      </>}
      <button className={control} disabled={loading}>ค้นหา</button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">กำลังโหลด...</p> : !error && <>
      <div className="overflow-auto rounded border bg-white"><table className="w-full text-left text-sm">
        <thead><tr className="border-b bg-gray-50">{["วันที่/เวลา", "ผู้ดำเนินการ / Role", tab === "audit" ? "Action" : "Method / Status",
          tab === "audit" ? "ประเภท / เลขเอกสาร" : "API / ระยะเวลา", "รายละเอียด"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{tab === "audit" ? audit.map(row => <tr className="border-b align-top" key={row.id}>
          <td className="whitespace-nowrap p-3">{logDateTime(row.createdAt)}</td>
          <td className="p-3">{row.performedBy?.fullName || row.performedById || "ระบบ"}<div className="text-xs text-gray-500">{row.performedBy?.role}</div></td>
          <td className="p-3">{actions[row.action] || row.action}<div className="text-xs text-gray-500">{row.action}</div></td>
          <td className="p-3">{types[row.entityType] || row.entityType}<div className="font-mono">{row.docNo || row.entityId}</div></td>
          <td className="min-w-64 p-3"><p className="whitespace-pre-wrap break-words">{row.reason || "—"}</p>
            <details><summary className="cursor-pointer text-blue-700">ข้อมูลก่อน/หลัง</summary>
              <p className="break-all">Request ID: {row.requestId || "—"} · IP: {row.ipAddress || "—"}</p>
              <p>ฟิลด์ที่เปลี่ยน: {row.changedFields?.join(", ") || "—"}</p>
              <h2 className="font-bold">ก่อน</h2><pre className="max-h-80 max-w-xl overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(row.oldValue, null, 2)}</pre>
              <h2 className="font-bold">หลัง</h2><pre className="max-h-80 max-w-xl overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(row.newValue, null, 2)}</pre>
            </details></td>
        </tr>) : activity.map(row => {
          const meta = activityPath(row.path);
          return <tr className="border-b align-top" key={row.id}>
            <td className="whitespace-nowrap p-3">{logDateTime(row.createdAt)}</td>
            <td className="p-3">{row.user?.fullName || row.username || "ไม่ระบุ"}<div className="text-xs text-gray-500">{row.user?.role}</div></td>
            <td className="p-3">{row.method} <span className={row.statusCode >= 400 ? "rounded bg-red-100 px-2 text-red-800" : "rounded bg-green-100 px-2 text-green-800"}>{row.statusCode}</span></td>
            <td className="max-w-xl break-all p-3 font-mono">{meta.path}<div>{row.durationMs} ms</div></td>
            <td className="max-w-sm break-all p-3">Request ID: {meta.requestId || "—"}<div>IP: {row.ipAddress || "—"}</div>
              {meta.action && <p>{meta.action}</p>}{meta.error && <p className="text-red-700">{meta.error}</p>}</td>
          </tr>;
        })}</tbody>
      </table>{(tab === "audit" ? audit : activity).length === 0 && <p className="p-6 text-center">ไม่มีข้อมูล</p>}</div>
      <div className="flex items-center justify-between gap-3"><span>{total.toLocaleString()} รายการ · หน้า {page}/{pages}</span><div className="flex gap-2">
        <button className={control} disabled={page <= 1} onClick={() => setFilters({ ...filters, page: String(page - 1) })}>ก่อนหน้า</button>
        <button className={control} disabled={page >= pages} onClick={() => setFilters({ ...filters, page: String(page + 1) })}>ถัดไป</button>
      </div></div>
    </>}
  </section>;
}
