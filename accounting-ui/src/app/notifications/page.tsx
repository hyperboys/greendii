"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountingNotificationsApi, NotificationPage } from "@/lib/accounting-notifications";
import { formatAccountingDateTime } from "@/lib/accounting-date";

export default function AccountingNotificationsPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<NotificationPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false, request = 0;
    const refresh = async () => {
      const current = ++request;
      setLoading(true);
      try {
        const data = await AccountingNotificationsApi.list(page);
        if (!cancelled && current === request) { setResult(data); setError(""); }
      } catch (err) {
        if (!cancelled && current === request) setError(err instanceof Error ? err.message : "โหลดการแจ้งเตือนไม่สำเร็จ");
      } finally { if (!cancelled && current === request) setLoading(false); }
    };
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [page, revision]);
  async function mark(id?: string) {
    setBusy(true); setError("");
    try {
      if (id) await AccountingNotificationsApi.read(id); else await AccountingNotificationsApi.readAll();
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "เปลี่ยนสถานะการแจ้งเตือนไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  const displayed = result?.page === page ? result : null;
  return <section className="mx-auto max-w-4xl space-y-4">
    <h1 className="text-2xl font-bold">การแจ้งเตือน Accounting</h1>
    <p>แจ้งงานอนุมัติขั้นปัจจุบันและผลการอนุมัติภายในระบบเท่านั้น ไม่ส่งอีเมลหรือ LINE</p>
    <p className="text-sm text-gray-600">ข้อความเป็นประวัติเมื่อเกิดเหตุการณ์ สถานะล่าสุดให้ตรวจที่เอกสารหรือเมนูรอฉันอนุมัติ</p>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <p role="status">ยังไม่อ่าน {displayed?.unreadCount ?? "-"} รายการ</p>
      <button className="rounded border bg-white px-4 py-2" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>รีเฟรช</button>
      <button className="rounded border bg-white px-4 py-2" disabled={!displayed?.unreadCount || loading || busy || Boolean(error)} onClick={() => void mark()}>อ่านทั้งหมด</button>
    </div>
    {loading && !displayed ? <p>กำลังโหลด...</p> : displayed && <ul className="divide-y rounded border bg-white">
      {displayed.data.length ? displayed.data.map(item => <li className={`flex flex-wrap justify-between gap-3 p-4 ${item.readAt ? "" : "bg-blue-50"}`} key={item.id}>
        <div><Link href={item.href} className="font-bold text-[#0866ff]">{item.text}</Link>
          <p className="text-sm text-gray-600">{formatAccountingDateTime(item.createdAt)} · {item.readAt ? "อ่านแล้ว" : "ยังไม่อ่าน"}</p></div>
        {!item.readAt && <button className="rounded border bg-white px-3 py-2 text-sm" disabled={busy || Boolean(error)} onClick={() => void mark(item.id)}>อ่านแล้ว</button>}
      </li>) : <li className="p-4">ไม่มีการแจ้งเตือน</li>}
    </ul>}
    {displayed && <nav aria-label="หน้าการแจ้งเตือน" className="flex items-center gap-3">
      <button className="rounded border px-3 py-2" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>ก่อนหน้า</button>
      <span>หน้า {page} / {Math.max(1, displayed.totalPages)} · {displayed.total} รายการ</span>
      <button className="rounded border px-3 py-2" disabled={page >= displayed.totalPages || loading} onClick={() => setPage(value => value + 1)}>ถัดไป</button>
    </nav>}
  </section>;
}
