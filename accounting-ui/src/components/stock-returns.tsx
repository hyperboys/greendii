"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountingSettingsApi } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { SearchableSelect } from "@/components/searchable-select";
import { DateInput } from "@/components/date-input";
import { formatAccountingDate as date, formatAccountingDateTime as time } from "@/lib/accounting-date";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { StockReturnDocument, StockReturnPrintStyles } from "@/components/stock-return-document";
import { StockReturnsApi as api, returnBase as base, returnList as list, returnStatuses, returnActions, returnHistory, availableReturnActions,
  newReturn, returnForm, exportReturns, returnToday as today, type StockReturn, type ReturnInput, type ReturnAction, type ReturnSource, type ReturnSourceOption } from "@/lib/stock-return";
const control = "w-full min-w-0 rounded border bg-white px-3 py-2", button = "rounded border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const message = (error: unknown) => error instanceof Error ? error.message : "ดำเนินการใบคืนไม่สำเร็จ";
const number = (value: number | string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export function StockReturns({ mode = "list", recordId }: { mode?: "list" | "new" | "edit" | "view"; recordId?: string }) {
  const router = useRouter(), access = useAccountingAccess();
  const can = { create: canUseAccounting(access, "inventory", "create"), update: canUseAccounting(access, "inventory", "update"),
    approve: canUseAccounting(access, "inventory", "approve"), cancel: canUseAccounting(access, "inventory", "cancel") };
  const isForm = mode === "new" || mode === "edit", allowedForm = mode === "new" ? can.create : can.update;
  const [doc, setDoc] = useState<StockReturn | null>(null), [form, setForm] = useState<ReturnInput>(newReturn);
  const [rows, setRows] = useState<StockReturn[]>([]), [query, setQuery] = useState({ q: "", status: "", page: "1", pageSize: "20" });
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [pages, setPages] = useState(0), [total, setTotal] = useState(0);
  const [sources, setSources] = useState<ReturnSourceOption[]>([]), [sourceQuery, setSourceQuery] = useState(""), [sourcesLoading, setSourcesLoading] = useState(false), [sourcesError, setSourcesError] = useState("");
  const [source, setSource] = useState<ReturnSource | null>(null), [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0), [sourceReload, setSourceReload] = useState(0), [files, setFiles] = useState<File[]>([]);
  const [action, setAction] = useState<ReturnAction | null>(null), [reason, setReason] = useState(""), [cancelDate, setCancelDate] = useState(today), [confirmed, setConfirmed] = useState(false);
  const [userId, setUserId] = useState<string>(), [company, setCompany] = useState<PurchaseOrderCompanySettings>({}), [printReady, setPrintReady] = useState(false);
  const guard = useRef(false), requestKey = useRef("");
  const editable = doc?.lifecycleVersion === 1 && ["draft", "returned"].includes(doc.status);
  useEffect(() => { setUserId(getStoredUser()?.id); }, []);
  useEffect(() => {
    if (isForm && !allowedForm) return;
    let current = true; setLoading(true); setLoadError(""); setPrintReady(false); setAction(null); setFiles([]);
    async function load() {
      if (mode === "list") {
        const result = await api.list(query);
        if (current) { setRows(result.data); setTotal(result.total); setPages(result.totalPages); }
      } else if (recordId) {
        const result = await api.get(recordId); if (!current) return; setDoc(result);
        if (isForm) setForm(returnForm(result));
        else { const settings = await AccountingSettingsApi.get(); if (current) setCompany(settings); }
      } else { requestKey.current = crypto.randomUUID(); if (current) { setDoc(null); setForm(newReturn()); } }
    }
    void load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, query, reload, isForm, allowedForm]);
  useEffect(() => {
    if (!isForm || !allowedForm || mode === "edit") return;
    let current = true; setSourcesLoading(true); setSourcesError("");
    const timer = setTimeout(() => {
      api.sources(sourceQuery).then(result => { if (current) setSources(result); }).catch(error => { if (current) setSourcesError(message(error)); })
        .finally(() => { if (current) setSourcesLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [sourceQuery, isForm, allowedForm, mode]);
  useEffect(() => {
    if (!isForm || !allowedForm || !form.stockIssueId) { setSource(null); setSourceError(""); setSourceLoading(false); return; }
    let current = true; setSource(null); setSourceLoading(true); setSourceError("");
    api.source(form.stockIssueId, doc?.id).then(result => { if (current) setSource(result); }).catch(error => { if (current) setSourceError(message(error)); })
      .finally(() => { if (current) setSourceLoading(false); });
    return () => { current = false; };
  }, [form.stockIssueId, doc?.id, isForm, allowedForm, sourceReload, reload]);
  async function run(operation: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(message(error)); }
    finally { guard.current = false; setBusy(false); }
  }
  const refresh = () => setReload(value => value + 1);
  const actions = doc ? availableReturnActions(doc, can, userId) : [];
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && printReady && !loading && !loadError;
  function changeLine(index: number, patch: Partial<ReturnInput["items"][number]>) {
    setForm({ ...form, items: form.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  if (isForm && !allowedForm) return <p role="alert">ไม่มีสิทธิ์สร้าง/แก้ใบคืน <Link href={list}>กลับทะเบียน</Link></p>;
  return <>
    <StockReturnPrintStyles allowed={Boolean(printable)} />
    <div className="is-no-print mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">คืนสินค้า (Stock Return)</h1>
        <p className="text-sm text-gray-600">อ้าง IS ที่จ่ายจริง · ของดีเข้าคลังเดิม · รออนุมัติกันยอดคืน ไม่เพิ่ม Stock จนอนุมัติ</p></div>
        {mode !== "list" && <Link href={list} className={button}>กลับทะเบียนใบคืน</Link>}
        {mode === "list" && can.create && <Link href={`${base}/new`} className={primary}>สร้างใบคืน</Link>}
      </header>
      {loading && <p role="status">กำลังโหลดใบคืน...</p>}
      {loadError && <div role="alert" className="rounded bg-red-50 p-3 text-red-700">{loadError} <button className={button} onClick={refresh}>โหลดใหม่</button></div>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      {mode === "list" && <>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, status, page: "1" }); }}>
          <input aria-label="ค้นหาใบคืน" placeholder="ค้นหา SR / IS / ผู้ส่งคืน / ผู้รับคืน" className={`${control} flex-1 basis-60`} value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="สถานะใบคืน" className={button} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(returnStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button className={button}>ค้นหา</button><button type="button" disabled={busy || loading} className={button} onClick={() => void run(async () => exportReturns(await api.all({ q: query.q, status: query.status })))}>CSV ตามตัวกรองทั้งหมด</button>
        </form>
        {!loading && !loadError && <><p>ทั้งหมด {total} รายการ · หน้า {query.page}/{Math.max(1, pages)}</p>
          <div className="overflow-x-auto rounded border bg-white"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">SR / วันที่</th><th>IS / คลัง</th><th>ผู้ส่งคืน / ผู้รับคืน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
            {rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.returnNo}<br />{date(row.returnDate)}</td><td>{row.issueSnapshot?.issueNo || "-"}<br />{row.warehouseSnapshot?.name || row.warehouseId || "-"}</td>
              <td>{row.sender || "-"}<br />{row.receiver || "-"}</td><td>{returnStatuses[row.status] || row.status}{row.lifecycleVersion !== 1 ? " · Legacy" : ""}</td><td><Link className="text-blue-700" href={`${base}/${encodeURIComponent(row.id)}`}>ดู / พิมพ์</Link></td></tr>)}
          </tbody></table>{!rows.length && <p className="p-4">ไม่พบรายการ</p>}</div>
          <div className="flex gap-2">{[-1, 1].map(step => <button key={step} disabled={Number(query.page) + step < 1 || Number(query.page) + step > pages} className={button}
            onClick={() => setQuery({ ...query, page: String(Number(query.page) + step) })}>{step < 0 ? "ก่อนหน้า" : "ถัดไป"}</button>)}</div></>}
      </>}
      {isForm && !loading && !loadError && (mode === "edit" && !editable ? <p role="alert">ใบคืนนี้อ่านอย่างเดียว แก้ได้เฉพาะ Draft / ส่งกลับรุ่นใหม่</p> :
        <form className="space-y-4 rounded border bg-white p-4" onSubmit={event => {
          event.preventDefault(); void run(async () => {
            const saved = doc ? await api.update(doc.id, { ...form, updatedAt: doc.updatedAt }) : await api.create({ ...form, requestKey: requestKey.current });
            router.push(`${base}/${encodeURIComponent(saved.id)}`);
          });
        }}>
          <fieldset disabled={busy} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">
            <label>วันที่คืน *{doc ? <input readOnly className={control} value={date(form.returnDate)} /> : <DateInput required className={control} value={form.returnDate} onChange={returnDate => setForm({ ...form, returnDate })} />}</label>
            {doc ? <label>IS (เปลี่ยนไม่ได้)<input readOnly className={control} value={doc.issueSnapshot?.issueNo || doc.stockIssueId} /></label> :
              <SearchableSelect label="IS ต้นทาง" required value={form.stockIssueId} selectedLabel={source?.issue.issueNo} options={sources.map(row => ({ value: row.id, label: `${row.issueNo} · ${row.requester} · ${row.warehouseSnapshot?.name || ""}` }))}
                loading={sourcesLoading} error={sourcesError} onSearch={setSourceQuery} onChange={stockIssueId => setForm({ ...form, stockIssueId, items: [] })}
                placeholder="เลือก IS ที่อนุมัติแล้ว" searchPlaceholder="ค้นหา IS / ผู้ขอ / ผู้รับ" />}
            <label>ผู้ส่งคืน *<input required maxLength={200} className={control} value={form.sender} onChange={event => setForm({ ...form, sender: event.target.value })} /></label>
            <label>ผู้รับคืน *<input required maxLength={200} className={control} value={form.receiver} onChange={event => setForm({ ...form, receiver: event.target.value })} /></label>
          </div>
          <p className="text-sm">คลังเดิม: {source?.issue.warehouseSnapshot?.name || doc?.warehouseSnapshot?.name || "เลือก IS ก่อน"} · WO {source?.issue.workOrderSnapshot?.woNo || doc?.workOrderSnapshot?.woNo || "-"} · รับเฉพาะของดี ไม่เปลี่ยนหน่วย</p>
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm">คงเหลือหักคืนแล้วและใบคืน pending อื่น ระบบตรวจซ้ำตอนส่ง/อนุมัติ; Draft/ส่งกลับไม่กันยอด</p>
            <button type="button" className={button} disabled={!form.stockIssueId || sourceLoading} onClick={() => setSourceReload(value => value + 1)}>อัปเดตยอดคืนได้</button></div>
          {sourceLoading && <p role="status">กำลังตรวจยอดคืนได้...</p>}
          {sourceError && <p role="alert" className="text-red-700">{sourceError}</p>}
          {form.items.map((line, index) => {
            const row = source?.lines.find(row => row.id === line.stockIssueLineId), saved = doc?.items.find(row => row.stockIssueLineId === line.stockIssueLineId);
            const snapshot = row?.productSnapshot || saved?.productSnapshot;
            return <section key={index} className="min-w-0 space-y-3 rounded border p-3"><div className="flex items-center justify-between"><h3 className="font-bold">รายการคืน {index + 1}</h3>
              <button type="button" className={button} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>ลบรายการ</button></div>
              <SearchableSelect label={`สินค้า ${index + 1}`} required value={line.stockIssueLineId} selectedLabel={snapshot ? `${snapshot.code} · ${snapshot.name}` : undefined}
                options={(source?.lines || []).filter(row => row.id === line.stockIssueLineId || !form.items.some(other => other.stockIssueLineId === row.id)).map(row => ({
                  value: row.id, label: `${row.productSnapshot.code} · ${row.productSnapshot.name} · ${row.productSnapshot.unit}`,
                }))} loading={sourceLoading} error={sourceError} placeholder="เลือกรายการจ่ายจริงจาก IS" searchPlaceholder="ค้นหาสินค้าใน IS"
                onChange={stockIssueLineId => changeLine(index, { stockIssueLineId })} />
              <div className="grid gap-2 text-sm sm:grid-cols-4"><p>จ่ายจริง {row ? number(row.issuedQty) : "-"}</p><p>คืนแล้ว {row ? number(row.previouslyReturnedQty) : "-"}</p>
                <p>รออนุมัติอื่น {row ? number(row.pendingQty) : "-"}</p><p>เหลือคืนได้ {row ? number(row.remainingQty) : "-"} {snapshot?.unit}</p></div>
              <label className="block">จำนวนคืน *<input required type="number" min="0.001" max={row ? Number(row.remainingQty) : "999999999.999"} step="0.001" className={control}
                value={line.returnedQty} onChange={event => changeLine(index, { returnedQty: event.target.value })} /></label>
              {row && Number(line.returnedQty) > Number(row.remainingQty) && <p role="alert" className="text-red-700">จำนวนคืนเกินคงเหลือ ต้องปรับก่อนบันทึก/ส่ง</p>}
            </section>;
          })}
          <button type="button" className={button} disabled={!source || sourceLoading || Boolean(sourceError) || form.items.length >= source.lines.length || form.items.length >= 200}
            onClick={() => setForm({ ...form, items: [...form.items, { stockIssueLineId: "", returnedQty: "1" }] })}>เพิ่มรายการคืน</button>
          <label className="block">เหตุผลคืน *<textarea required maxLength={1000} rows={2} className={control} value={form.returnReason} onChange={event => setForm({ ...form, returnReason: event.target.value })} /></label>
          <label className="block">หมายเหตุ<textarea maxLength={1000} rows={3} className={control} value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
          <p className="text-sm">บันทึก Draft ยังไม่รับ Stock; หลักฐาน PDF/JPG/PNG ไม่บังคับ แนบเพิ่มบนหน้าเอกสาร</p></fieldset>
          <button disabled={busy || sourceLoading || !source || Boolean(sourceError) || !form.items.length} className={primary}>{busy ? "กำลังบันทึก..." : "บันทึกใบคืน"}</button>
        </form>)}
      {mode === "view" && doc && !loading && !loadError && <section className="space-y-3 rounded border bg-white p-4">
        <h2 className="text-lg font-bold">{doc.returnNo} · {returnStatuses[doc.status] || doc.status}</h2>
        <p className="break-words">IS {doc.issueSnapshot?.issueNo || "-"} · คลังเดิม {doc.warehouseSnapshot?.name || doc.warehouseId || "-"} · ผู้ส่งคืน {doc.sender || "-"} · ผู้รับคืน {doc.receiver || "-"}</p>
        {doc.stockIssueId && <Link className="block text-blue-700" href={`/inventory/issues/${encodeURIComponent(doc.stockIssueId)}`}>เปิดใบเบิกต้นทาง</Link>}
        {doc.lifecycleVersion !== 1 && <p role="alert" className="text-amber-800">ใบคืน Legacy อ่านอย่างเดียว ไม่ปรับ Stock เก่า ต้องตรวจย้ายข้อมูลแยก</p>}
        <div className="flex flex-wrap gap-2">{editable && can.update && <Link className={button} href={`${base}/${encodeURIComponent(doc.id)}/edit`}>แก้ไขใบคืน</Link>}
          {actions.map(value => <button disabled={busy} key={value} className={button} onClick={() => { setAction(value); setReason(""); setCancelDate(today()); setConfirmed(false); }}>{returnActions[value]}</button>)}
          {doc.lifecycleVersion === 1 && <button disabled={busy || !printable} className={button} onClick={() => window.print()}>พิมพ์ / PDF</button>}</div>
        {action && <form className="space-y-3 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(async () => { await api.action(doc, action, reason, cancelDate, confirmed); refresh(); }); }}>
          <h3 className="font-bold">ยืนยัน{returnActions[action]}</h3>
          {["return", "reject", "cancel"].includes(action) && <label className="block">เหตุผล *<textarea required disabled={busy} maxLength={1000} className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
          {action === "cancel" && <><label className="block">วันที่ยกเลิก *<DateInput required className={control} value={cancelDate} onChange={setCancelDate} /></label>
            {doc.status === "approved" && <label className="flex items-start gap-2 text-amber-800"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />ยืนยันว่าส่งของที่รับคืนตามใบนี้กลับออกไปจริงครบแล้ว การยกเลิกจะลด Stock ทั้งใบ ไม่ใช่คืนบางส่วน</label>}
            <p className="text-sm">ต้องมี Available พอ ไม่กินยอดจอง วันที่ไม่ก่อน Movement ล่าสุด; ยกเลิกแล้วปล่อยสิทธิ์คืนให้ IS</p></>}
          {action === "approve" && <p className="text-amber-800">อนุมัติคือยืนยันรับของดีจริงเข้าคลังเดิมและเพิ่ม Stock ตามจำนวนใบนี้</p>}
          <div className="flex gap-2"><button disabled={busy} className={primary}>ยืนยัน</button><button type="button" disabled={busy} className={button} onClick={() => setAction(null)}>ปิด</button></div>
        </form>}
        <h3 className="font-bold">หลักฐาน (ไม่บังคับ)</h3>
        {doc.attachments.map(file => <div key={file.id} className="flex flex-wrap items-center gap-2"><a className="min-w-0 break-all text-blue-700" href={file.fileUrl} target="_blank" rel="noreferrer">{file.originalName}</a>
          {editable && (can.create || can.update) && <button disabled={busy} className={button} onClick={() => void run(async () => { await api.deleteFile(doc, file.id); refresh(); })}>ลบหลักฐาน</button>}</div>)}
        {editable && (can.create || can.update) && <div className="space-y-2"><input key={doc.updatedAt} aria-label="หลักฐานใบคืน" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" disabled={busy} className="block max-w-full" onChange={event => setFiles(Array.from(event.target.files || []))} />
          <button disabled={busy || !files.length} className={button} onClick={() => void run(async () => { await api.upload(doc, files); refresh(); })}>แนบหลักฐานใบคืน</button></div>}
        <h3 className="font-bold">รายการตามเอกสาร · ของดี{["draft", "pending", "returned"].includes(doc.status) ? " (ยังไม่เพิ่ม Stock)" : ""}</h3>
        {doc.items.map(item => <div key={item.id} className="min-w-0 rounded border p-3 text-sm"><p className="break-words font-semibold">{item.seq + 1}. {item.productSnapshot?.code} · {item.productSnapshot?.name || item.productId}</p>
          <p>จ่ายจริง IS {number(item.issuedQty)} · <strong>คืนตามใบนี้ {number(item.returnedQty)}</strong> · คืนแล้ว {number(item.previouslyReturnedQty)} · รออนุมัติอื่น {number(item.pendingQty)} · เหลือคืน ณ บันทึก {number(item.remainingQty)} {item.productSnapshot?.unit}</p></div>)}
        <p className="whitespace-pre-wrap break-words">เหตุผลคืน: {doc.returnReason || "-"} · หมายเหตุ: {doc.remark || "-"}</p>
        {doc.cancelledAt && <p className="break-words text-red-700">ยกเลิก {date(doc.cancelledAt)} · {doc.cancellationReason}</p>}
        <h3 className="font-bold">Stock Movement อ้างใบนี้</h3>
        {doc.movements?.map(row => <p key={row.id} className="break-words text-sm">{date(row.transactionDate)} · {doc.items.find(item => item.productId === row.productId)?.productSnapshot?.name || row.productId} · เข้า {number(row.qtyIn)} / ออก {number(row.qtyOut)}{row.reversalRefId ? ` · กลับ ${row.reversalRefId}` : ""}</p>)}
        <h3 className="font-bold">ประวัติ</h3>
        {doc.history?.map(row => <p key={row.id} className="break-words border-t pt-2 text-sm">{time(row.createdAt)} · {returnHistory[row.action] || row.action} · {row.performedBy?.fullName || "-"}{row.reason ? ` · ${row.reason}` : ""}</p>)}
      </section>}
    </div>
    {mode === "view" && doc?.lifecycleVersion === 1 && !loading && !loadError && <div className="is-preview mt-5 w-full overflow-x-auto"><StockReturnDocument document={doc} company={company} onReady={setPrintReady} /></div>}
  </>;
}
