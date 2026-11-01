"use client";

import { useEffect, useState } from "react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { AccountingGlApi, GlSettings } from "@/lib/accounting-gl";

export default function GlSettingsPage() {
  const access = useAccountingAccess();
  const [settings, setSettings] = useState<GlSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!access?.isAdmin) return;
    let cancelled = false;
    setBusy(true); setError("");
    AccountingGlApi.get().then(result => { if (!cancelled) setSettings(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "โหลดการตั้งค่า GL ไม่สำเร็จ"); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [access?.isAdmin, reload]);
  if (!access?.isAdmin) return <p role="alert">เฉพาะ admin สามารถตั้งค่า GL ได้</p>;
  return <section className="mx-auto max-w-4xl space-y-4">
    <h1 className="text-2xl font-bold">ตั้งค่าผังบัญชีและนโยบาย GL</h1>
    <p className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
      โครงตั้งค่าเท่านั้น: การลงบัญชีอัตโนมัติและการปิดงวดยังปิดอยู่ การบันทึก Mapping ไม่สร้าง Journal และไม่เปลี่ยนยอดบัญชี
      ต้องยืนยันกติกาภาษี การลงบัญชี และการปิดงวดก่อนเปิดใช้
    </p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-green-700">{notice}</p>}
    <button type="button" disabled={busy} className="rounded border bg-white px-4 py-2" onClick={() => {
      setNotice(""); setReload(value => value + 1);
    }}>โหลดข้อมูลล่าสุด</button>
    {!settings ? <p>{busy ? "กำลังโหลด..." : "ยังไม่มีข้อมูลตั้งค่า"}</p> : <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setNotice("");
      try {
        const config = await AccountingGlApi.save({
          revision: settings.config.revision, fiscalYearStartMonth: settings.config.fiscalYearStartMonth,
          policyNotes: settings.config.policyNotes, mappings: settings.config.mappings.map(({ role, accountId }) => ({ role, accountId })),
        });
        setSettings(current => current ? { ...current, config } : current);
        setNotice("บันทึกโครงตั้งค่าแล้ว — การลงบัญชีและปิดงวดยังคงปิดอยู่");
      } catch (err) {
        setError(err instanceof Error ? err.message : "บันทึกการตั้งค่า GL ไม่สำเร็จ");
      } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-4 rounded border bg-white p-4">
        <label className="block">เดือนเริ่มปีบัญชี
          <select className="ml-3 rounded border p-2" value={settings.config.fiscalYearStartMonth} onChange={event => {
            const month = Number(event.target.value);
            setSettings(current => current ? { ...current, config: { ...current.config, fiscalYearStartMonth: month } } : current);
          }}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(settings.roles).map(([role, label]) => {
          const selected = settings.config.mappings.find(mapping => mapping.role === role);
          return <label key={role}>{label} ({role})
            <select className="mt-1 w-full rounded border p-2" value={selected?.accountId || ""} onChange={event => {
              const accountId = event.target.value;
              setSettings(current => current ? { ...current, config: { ...current.config,
                mappings: [...current.config.mappings.filter(mapping => mapping.role !== role), ...(accountId ? [{ role, accountId }] : [])],
              } } : current);
            }}>
              <option value="">ยังไม่กำหนด</option>
              {selected && !settings.accounts.some(account => account.id === selected.accountId) &&
                <option value={selected.accountId}>{selected.code} {selected.name} (ปิดใช้งาน / ต้องเลือกใหม่)</option>}
              {settings.accounts.map(account => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
            </select>
          </label>;
        })}</div>
        <label className="block">หมายเหตุนโยบายที่บัญชีต้องยืนยัน
          <textarea maxLength={4000} rows={5} className="mt-1 w-full rounded border p-3" value={settings.config.policyNotes} onChange={event => {
            const policyNotes = event.target.value;
            setSettings(current => current ? { ...current, config: { ...current.config, policyNotes } } : current);
          }} />
        </label>
        <p className="text-sm text-gray-600">Revision {settings.config.revision} · ไม่เปิดการลงบัญชีหรือปิดงวด</p>
        <button className="rounded bg-[#0866ff] px-4 py-2 text-white">บันทึก Mapping</button>
      </fieldset>
    </form>}
  </section>;
}
