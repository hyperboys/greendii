"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { masterEndpoints, masterForm, exportMasterCsv, type MasterRow, type MasterMode, type MasterDraft } from "@/lib/master-data";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { MasterPagination, MasterRecordTools } from "@/components/master-record-tools";

type Kind = "sales" | "products" | "warehouses" | "coa";
const labels: Record<Kind, string> = { sales: "Sale บัญชี", products: "สินค้าและบริการ", warehouses: "คลังสินค้า", coa: "ผังบัญชี" };
const input = "mt-1 w-full min-w-0 rounded border bg-white p-2 text-sm disabled:bg-gray-50";
const button = "inline-block rounded border px-3 py-2 text-sm disabled:opacity-40";
const categories = [["asset", "สินทรัพย์"], ["liability", "หนี้สิน"], ["equity", "ส่วนของเจ้าของ"], ["revenue", "รายได้"], ["expense", "ค่าใช้จ่าย"]];
const types = [["stored", "สินค้าเก็บสต็อก"], ["manufactured", "สินค้าผลิต"], ["service", "บริการ"]];
export function SimpleMaster({ kind, mode = "list", recordId }: { kind: Kind; mode?: MasterMode; recordId?: string }) {
  const access = useAccountingAccess();
  const router = useRouter();
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [record, setRecord] = useState<MasterRow>();
  const [form, setForm] = useState(masterForm());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const endpoint = masterEndpoints[kind];
  const writable = mode !== "view" && canUseAccounting(access, "master", mode === "new" ? "create" : "update");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (mode === "list") setRows(await apiFetch<MasterRow[]>(endpoint));
      else {
        const item = recordId ? await apiFetch<MasterRow>(`${endpoint}/${encodeURIComponent(recordId)}`) : undefined;
        if (mode !== "new" && !item) throw new Error("ไม่พบรายการ");
        setRecord(item); setForm(masterForm(item));
      }
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [mode, recordId, endpoint]);
  useEffect(() => { void load(); }, [load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!writable || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const saved = await apiFetch<MasterRow>(record ? `${endpoint}/${encodeURIComponent(record.id)}` : endpoint, {
        method: record ? "PUT" : "POST", body: JSON.stringify(form),
      });
      router.push(`/master/${kind}/${encodeURIComponent(saved.id)}`);
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { busy.current = false; setSaving(false); }
  };
  const filtered = rows.filter(row => (status === "all" || row.active === (status === "active")) &&
    (!category || (kind === "products" ? row.productType : row.category) === category) &&
    [row.code, row.name, row.category, row.unit, row.tel, row.email, row.location, row.accountMapping]
      .some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  const field = (key: keyof MasterDraft, label: string, numeric = false, required = false) => <label className="block text-sm" key={key}>{label}
    <input className={input} required={required} type={numeric ? "number" : key === "email" ? "email" : "text"}
      multiple={key === "email"} min={numeric ? 0 : undefined} max={numeric ? "9999999999.99" : undefined} step={numeric ? "0.01" : undefined}
      value={String(form[key] ?? "")} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} /></label>;
  const select = (key: keyof MasterDraft, label: string, options: string[][]) => <label className="block text-sm" key={key}>{label}
    <select className={input} value={String(form[key])} onChange={e => setForm(current => ({ ...current, [key]: e.target.value,
      ...(key === "accountType" && e.target.value === "header" ? { accountMapping: "" } : {}) }))}>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  return <section className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{labels[kind]}</h1>
      <Link className={button} href={`/master?tab=${kind}`}>กลับรายการ</Link></div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {mode === "list" ? <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">ค้นหารหัส / ชื่อ / รายละเอียด<input className={input} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
        <label className="text-sm">สถานะ<select className={input} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></label>
        {(kind === "products" || kind === "coa") && <label className="text-sm">ประเภท / หมวด<select className={input} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="">ทั้งหมด</option>{(kind === "products" ? types : categories).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>}
        <button className={button} disabled={loading} onClick={() => void load()}>โหลดใหม่</button>
        <button className={button} disabled={loading || Boolean(error) || !filtered.length} onClick={() => exportMasterCsv(kind, filtered)}>Export CSV ({filtered.length})</button>
        {canUseAccounting(access, "master", "create") && <Link className={`${button} bg-blue-600 text-white`} href={`/master/${kind}/new`}>เพิ่ม{labels[kind]}</Link>}
      </div>
      {loading ? <p>กำลังโหลด...</p> : <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
        <thead><tr>{["รหัส", "ชื่อ", "รายละเอียด", "สถานะ", "จัดการ"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{!filtered.length ? <tr><td className="p-5" colSpan={5}>ไม่พบข้อมูล</td></tr> : filtered.slice((currentPage - 1) * 20, currentPage * 20).map(row => <tr key={row.id} className="border-t">
          <td className="p-3">{row.code}</td><td className="p-3">{row.name}</td>
          <td className="p-3">{kind === "products" ? `${row.productType} · ${row.unit || "-"} · ${row.price} · ${row.vatConfig}`
            : kind === "coa" ? `${row.category} · ${row.accountType} · ${row.accountMapping || "-"}` : row.location || row.tel || row.email || "-"}</td>
          <td className="p-3">{row.active ? "ใช้งาน" : "ปิดใช้งาน"}</td><td className="p-3"><div className="flex flex-wrap gap-2">
            <Link className={button} href={`/master/${kind}/${encodeURIComponent(row.id)}`}>ดูข้อมูล</Link>
            {canUseAccounting(access, "master", "update") && <Link className={button} href={`/master/${kind}/${encodeURIComponent(row.id)}/edit`}>แก้ไข</Link>}</div></td>
        </tr>)}</tbody></table></div>}
      <MasterPagination total={filtered.length} page={currentPage} onPage={setPage} />
    </> : loading ? <p>กำลังโหลด...</p> : !error || record || mode === "new" ? <>
      <form onSubmit={save} className="space-y-4 rounded-lg border bg-white p-5">
        <p className="text-sm">{mode === "view" ? "ดูข้อมูล" : record ? "แก้ไข" : "เพิ่มใหม่"} · {kind === "sales" ? "แยกจากผู้ใช้และ Sale ระบบ Sales" : "ไม่เปลี่ยนยอด Stock และไม่ลง GL"}</p>
        <fieldset disabled={!writable || saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
          {field("code", "รหัส *", false, true)}{field("name", "ชื่อ *", false, true)}
          {kind === "sales" && <>{field("tel", "โทรศัพท์")}{field("email", "อีเมล (หลายอีเมลคั่นด้วย ,)")}</>}
          {kind === "products" && <>{select("productType", "ประเภทสินค้า", types)}{field("unit", "หน่วย")}
            {field("category", "หมวดหมู่")}{select("vatConfig", "VAT", [["VAT7%", "VAT 7%"], ["NO_VAT", "ไม่มี VAT"]])}
            {field("price", "ราคาขาย", true)}{field("cost", "ต้นทุนอ้างอิง (ไม่ใช่มูลค่าสต็อก)", true)}</>}
          {kind === "warehouses" && field("location", "ที่ตั้ง")}
          {kind === "coa" && <>{select("category", "หมวดบัญชี *", [["", "เลือกหมวด"], ...categories])}
            {select("accountType", "ชนิดบัญชี", [["header", "บัญชีหัว"], ["detail", "บัญชีย่อย"]])}
            {form.accountType === "detail" && select("accountMapping", "Mapping (ทะเบียนเท่านั้น ไม่ลง GL)", [["", "ไม่ระบุ"],
              ...["AR", "AP", "SALES", "CASH", "BANK", "VAT_INPUT", "VAT_OUTPUT"].map(value => [value, value])])}</>}
          {(kind === "products" || kind === "warehouses") && <label className="text-sm sm:col-span-2">รายละเอียด<textarea className={input} rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />เปิดใช้งาน</label>
        </fieldset>
        {mode === "view" && canUseAccounting(access, "master", "update") && record && <Link className={button} href={`/master/${kind}/${encodeURIComponent(record.id)}/edit`}>แก้ไข</Link>}
        {mode !== "view" && <button className={`${button} bg-blue-600 text-white`} disabled={!writable || saving} type="submit">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>}
      </form>
      {record && <MasterRecordTools kind={kind} id={record.id} updatedAt={record.updatedAt} />}
    </> : null}
  </section>;
}
