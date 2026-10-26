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
import { StockIssueDocument, StockIssuePrintStyles } from "@/components/stock-issue-document";
import { StockIssuesApi as api, issueBase as base, issueList as list, issueStatuses, issueActions, issueHistory, availableIssueActions,
  newIssue, issueForm, cancelledIssueQty, exportIssues, issueToday as today, type StockIssue, type IssueInput, type IssueAction,
  type IssueProduct, type IssueWarehouse, type IssueWorkOrder, type IssueBalance,
} from "@/lib/stock-issue";
const control = "w-full min-w-0 rounded border bg-white px-3 py-2", button = "rounded border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const message = (error: unknown) => error instanceof Error ? error.message : "ดำเนินการใบเบิกไม่สำเร็จ";
const number = (value: number | string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export function StockIssues({ mode = "list", recordId }: { mode?: "list" | "new" | "edit" | "view"; recordId?: string }) {
  const router = useRouter(), access = useAccountingAccess();
  const can = { create: canUseAccounting(access, "inventory", "create"), update: canUseAccounting(access, "inventory", "update"),
    approve: canUseAccounting(access, "inventory", "approve"), cancel: canUseAccounting(access, "inventory", "cancel") };
  const isForm = mode === "new" || mode === "edit", allowedForm = mode === "new" ? can.create : can.update;
  const [doc, setDoc] = useState<StockIssue | null>(null), [form, setForm] = useState<IssueInput>(newIssue);
  const [rows, setRows] = useState<StockIssue[]>([]), [query, setQuery] = useState({ q: "", status: "", page: "1", pageSize: "20" });
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [pages, setPages] = useState(0), [total, setTotal] = useState(0);
  const [products, setProducts] = useState<IssueProduct[]>([]), [warehouses, setWarehouses] = useState<IssueWarehouse[]>([]);
  const [workOrders, setWorkOrders] = useState<IssueWorkOrder[]>([]), [woQuery, setWoQuery] = useState(""), [woLoading, setWoLoading] = useState(false), [woError, setWoError] = useState("");
  const [balances, setBalances] = useState<IssueBalance[]>([]), [balanceError, setBalanceError] = useState(""), [balanceLoading, setBalanceLoading] = useState(false);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0), [balanceReload, setBalanceReload] = useState(0), [files, setFiles] = useState<File[]>([]);
  const [action, setAction] = useState<IssueAction | null>(null), [reason, setReason] = useState(""), [cancelDate, setCancelDate] = useState(today);
  const [confirmed, setConfirmed] = useState(false), [userId, setUserId] = useState<string>(), [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const [printReady, setPrintReady] = useState(false), guard = useRef(false), requestKey = useRef("");
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
        const result = await api.get(recordId);
        if (!current) return;
        setDoc(result);
        if (isForm) setForm(issueForm(result));
        else { const settings = await AccountingSettingsApi.get(); if (current) setCompany(settings); }
      } else {
        requestKey.current = crypto.randomUUID();
        if (current) { setDoc(null); setForm(newIssue()); }
      }
      if (isForm) {
        const result = await api.lookups();
        if (current) { setProducts(result.products); setWarehouses(result.warehouses); }
      }
    }
    void load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, query, reload, isForm, allowedForm]);
  useEffect(() => {
    if (!isForm || !allowedForm) return;
    let current = true; setWoLoading(true); setWoError("");
    const timer = setTimeout(() => {
      api.workOrders(woQuery).then(result => { if (current) setWorkOrders(result); }).catch(error => { if (current) setWoError(message(error)); })
        .finally(() => { if (current) setWoLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [woQuery, isForm, allowedForm]);
  useEffect(() => {
    if (!isForm || !allowedForm || !form.warehouseId) { setBalances([]); setBalanceError(""); setBalanceLoading(false); return; }
    let current = true; setBalances([]); setBalanceLoading(true); setBalanceError("");
    api.balances(form.warehouseId).then(result => { if (current) setBalances(result); }).catch(error => { if (current) setBalanceError(message(error)); })
      .finally(() => { if (current) setBalanceLoading(false); });
    return () => { current = false; };
  }, [form.warehouseId, isForm, allowedForm, balanceReload]);
  async function run(operation: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(message(error)); }
    finally { guard.current = false; setBusy(false); }
  }
  const refresh = () => setReload(value => value + 1);
  const actions = doc ? availableIssueActions(doc, can, userId) : [];
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && printReady && !loading && !loadError;
  function changeLine(index: number, patch: Partial<IssueInput["items"][number]>) {
    setForm({ ...form, items: form.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  if (isForm && !allowedForm) return <p role="alert">ไม่มีสิทธิ์สร้าง/แก้ใบเบิก <Link href={list}>กลับทะเบียน</Link></p>;
  return <>
    <StockIssuePrintStyles allowed={Boolean(printable)} />
    <div className="is-no-print mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">เบิกสินค้า (Stock Issue)</h1><p className="text-sm text-gray-600">ไม่จองขณะรออนุมัติ · อนุมัติแล้วตัดตามจำนวนจ่าย · ยกเลิกส่วนที่เหลือ ไม่มีค้างส่ง</p></div>
        {mode !== "list" && <Link href={list} className={button}>กลับทะเบียนใบเบิก</Link>}
        {mode === "list" && can.create && <Link href={`${base}/new`} className={primary}>สร้างใบเบิก</Link>}
      </header>
      {loading && <p role="status">กำลังโหลดใบเบิก...</p>}
      {loadError && <div role="alert" className="rounded bg-red-50 p-3 text-red-700">{loadError} <button className={button} onClick={refresh}>โหลดใหม่</button></div>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      {mode === "list" && <>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, status, page: "1" }); }}>
          <input aria-label="ค้นหาใบเบิก" placeholder="ค้นหา IS / WO / ผู้ขอ / ผู้รับ" className={`${control} flex-1 basis-60`} value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="สถานะใบเบิก" className={button} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(issueStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button className={button}>ค้นหา</button>
          <button type="button" disabled={busy || loading} className={button} onClick={() => void run(async () => exportIssues(await api.all({ q: query.q, status: query.status })))}>CSV ตามตัวกรองทั้งหมด</button>
        </form>
        {!loading && !loadError && <><p>ทั้งหมด {total} รายการ · หน้า {query.page}/{Math.max(1, pages)}</p>
          <div className="overflow-x-auto rounded border bg-white"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">IS / วันที่</th><th>คลัง / WO</th><th>ผู้ขอ / ผู้รับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
            {rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.issueNo}<br />{date(row.issueDate)}</td><td>{row.warehouseSnapshot?.name || row.warehouseId || "-"}<br />{row.workOrderSnapshot?.woNo || "-"}</td>
              <td>{row.requester || "-"}<br />{row.receiver || "-"}</td><td>{issueStatuses[row.status] || row.status}{row.lifecycleVersion !== 1 ? " · Legacy" : ""}</td>
              <td><Link className="text-blue-700" href={`${base}/${encodeURIComponent(row.id)}`}>ดู / พิมพ์</Link></td></tr>)}
          </tbody></table>{!rows.length && <p className="p-4">ไม่พบรายการ</p>}</div>
          <div className="flex gap-2">{[-1, 1].map(step => <button key={step} disabled={Number(query.page) + step < 1 || Number(query.page) + step > pages} className={button}
            onClick={() => setQuery({ ...query, page: String(Number(query.page) + step) })}>{step < 0 ? "ก่อนหน้า" : "ถัดไป"}</button>)}</div></>}
      </>}
      {isForm && !loading && !loadError && (mode === "edit" && !editable ? <p role="alert">ใบเบิกนี้อ่านอย่างเดียว แก้ได้เฉพาะ Draft / ส่งกลับรุ่นใหม่</p> :
        <form className="space-y-4 rounded border bg-white p-4" onSubmit={event => {
          event.preventDefault(); void run(async () => {
            const saved = doc ? await api.update(doc.id, { ...form, updatedAt: doc.updatedAt }) : await api.create({ ...form, requestKey: requestKey.current });
            router.push(`${base}/${encodeURIComponent(saved.id)}`);
          });
        }}>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>วันที่เบิก *{doc ? <input readOnly className={control} value={date(form.issueDate)} /> : <DateInput required className={control} value={form.issueDate} onChange={issueDate => setForm({ ...form, issueDate })} />}</label>
              {doc ? <label>คลัง (เปลี่ยนไม่ได้)<input readOnly className={control} value={doc.warehouseSnapshot?.name || doc.warehouseId || ""} /></label> :
                <SearchableSelect label="คลังเบิก" required value={form.warehouseId} options={warehouses.map(row => ({ value: row.id, label: `${row.code} · ${row.name}` }))}
                  placeholder="เลือกคลัง" searchPlaceholder="ค้นหาคลัง" onChange={warehouseId => setForm({ ...form, warehouseId })} />}
              <SearchableSelect label="WO อ้างอิง (ไม่บังคับ)" value={form.workOrderId} selectedLabel={workOrders.find(row => row.id === form.workOrderId)?.woNo || (doc?.workOrderId === form.workOrderId ? doc?.workOrderSnapshot?.woNo : undefined)}
                options={[{ value: "", label: "ไม่อ้างอิง WO" }, ...workOrders.map(row => ({ value: row.id, label: `${row.woNo} · ${row.project || ""}` }))]}
                loading={woLoading} error={woError} placeholder="เลือก WO" searchPlaceholder="ค้นหา WO / งาน" onSearch={setWoQuery} onChange={workOrderId => setForm({ ...form, workOrderId })} />
              <label>ผู้ขอ *<input required maxLength={200} className={control} value={form.requester} onChange={event => setForm({ ...form, requester: event.target.value })} /></label>
              <label>ผู้รับของ *<input required maxLength={200} className={control} value={form.receiver} onChange={event => setForm({ ...form, receiver: event.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-gray-600">Available เป็นยอดปัจจุบันเพื่อประกอบการกรอก ไม่ได้จอง ระบบตรวจอีกครั้งเมื่ออนุมัติ · ทศนิยมไม่เกิน 3 หลัก</p>
              <button type="button" className={button} disabled={!form.warehouseId || balanceLoading} onClick={() => setBalanceReload(value => value + 1)}>อัปเดตยอดพร้อมเบิก</button></div>
            {balanceLoading && <p role="status">กำลังตรวจยอด Stock...</p>}
            {balanceError && <p role="alert" className="text-red-700">{balanceError}</p>}
            {form.items.map((line, index) => {
              const available = balances.find(row => row.productId === line.productId)?.available ?? 0;
              const product = products.find(row => row.id === line.productId), old = doc?.items.find(row => row.productId === line.productId)?.productSnapshot;
              const cancelled = cancelledIssueQty(line);
              return <section key={index} className="min-w-0 space-y-3 rounded border p-3">
                <div className="flex items-center justify-between"><h3 className="font-bold">รายการ {index + 1}</h3><button type="button" disabled={form.items.length === 1} className={button} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>ลบรายการ</button></div>
                <SearchableSelect label={`สินค้า ${index + 1}`} required value={line.productId} selectedLabel={product ? `${product.code} · ${product.name}` : old ? `${old.code} · ${old.name}` : undefined}
                  options={products.filter(row => row.id === line.productId || !form.items.some(other => other.productId === row.id)).map(row => ({ value: row.id, label: `${row.code} · ${row.name} · ${row.unit || "ไม่มีหน่วย"}` }))}
                  placeholder="เลือกสินค้าที่เก็บคลัง / ผลิต" searchPlaceholder="ค้นหารหัส / ชื่อสินค้า" onChange={productId => changeLine(index, { productId })} />
                <p className="text-sm">หน่วย {product?.unit || old?.unit || "-"} · Available {balanceLoading || balanceError || !form.warehouseId ? "ยังไม่ทราบ" : number(available)}
                  {!balanceLoading && !balanceError && form.warehouseId && Number(line.issuedQty) > Number(available) ? " · จำนวนจ่ายเกินพร้อมเบิกปัจจุบัน ต้องตรวจ/ปรับก่อนอนุมัติ" : ""}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label>จำนวนขอ *<input required type="number" min="0.001" max="999999999.999" step="0.001" className={control} value={line.requestedQty} onChange={event => changeLine(index, { requestedQty: event.target.value })} /></label>
                  <label>จำนวนจ่าย *<input required type="number" min="0" max={Number(line.requestedQty) || 0} step="0.001" className={control} value={line.issuedQty} onChange={event => changeLine(index, { issuedQty: event.target.value })} /></label>
                  <div><p>ยกเลิกส่วนที่เหลือเมื่ออนุมัติ</p><p className="py-2 font-bold">{cancelled == null ? "จำนวนไม่ถูกต้อง" : number(cancelled)}</p></div>
                </div>
              </section>;
            })}
            <button type="button" disabled={form.items.length >= 200} className={button} onClick={() => setForm({ ...form, items: [...form.items, { productId: "", requestedQty: "1", issuedQty: "1" }] })}>เพิ่มรายการ</button>
            <label className="block">หมายเหตุ<textarea maxLength={1000} rows={3} className={control} value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
            <p className="text-sm">บันทึกเป็นร่างก่อน หลักฐาน PDF/JPG/PNG แนบเพิ่มบนหน้าเอกสารได้ ไม่บังคับ</p>
          </fieldset>
          <button disabled={busy || !form.items.some(line => Number(line.issuedQty) > 0)} className={primary}>{busy ? "กำลังบันทึก..." : "บันทึกใบเบิก"}</button>
        </form>)}
      {mode === "view" && doc && !loading && !loadError && <section className="space-y-3 rounded border bg-white p-4">
        <h2 className="text-lg font-bold">{doc.issueNo} · {issueStatuses[doc.status] || doc.status}</h2>
        <p className="break-words">คลัง {doc.warehouseSnapshot?.name || doc.warehouseId || "-"} · WO {doc.workOrderSnapshot?.woNo || "-"} · ผู้ขอ {doc.requester || "-"} · ผู้รับ {doc.receiver || "-"}</p>
        {doc.lifecycleVersion !== 1 && <p role="alert" className="text-amber-800">ใบเบิก Legacy อ่านอย่างเดียว ไม่กลับ Stock เก่า ต้องตรวจย้ายข้อมูลแยก</p>}
        <div className="flex flex-wrap gap-2">{editable && can.update && <Link className={button} href={`${base}/${encodeURIComponent(doc.id)}/edit`}>แก้ไขใบเบิก</Link>}
          {actions.map(value => <button disabled={busy} key={value} className={button} onClick={() => { setAction(value); setReason(""); setCancelDate(today()); setConfirmed(false); }}>{issueActions[value]}</button>)}
          {doc.lifecycleVersion === 1 && <button disabled={busy || !printable} className={button} onClick={() => window.print()}>พิมพ์ / PDF</button>}
        </div>
        {action && <form className="space-y-3 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(async () => { await api.action(doc, action, reason, cancelDate, confirmed); refresh(); }); }}>
          <h3 className="font-bold">ยืนยัน{issueActions[action]}</h3>
          {["return", "reject", "cancel"].includes(action) && <label className="block">เหตุผล *<textarea required disabled={busy} maxLength={1000} className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
          {action === "cancel" && <><label className="block">วันที่ยกเลิก *<DateInput required className={control} value={cancelDate} onChange={setCancelDate} /></label>
            {doc.status === "approved" && <label className="flex items-start gap-2 text-amber-800"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />ยืนยันว่ารับสินค้าที่จ่ายตามใบนี้กลับคืนครบจริงแล้ว การยกเลิกจะเพิ่ม Stock กลับทั้งใบ ไม่ใช่การคืนบางส่วน</label>}
            <p className="text-sm">ใบคืนที่ยังมีผลจะบล็อกการยกเลิก วันกลับรายการต้องไม่ก่อนวันเบิก/Movement ล่าสุด ไม่ลบประวัติเดิม</p></>}
          {action === "approve" && <p className="text-amber-800">อนุมัติคือบันทึกจ่ายสินค้าตามจำนวนในใบและตัด Stock ทันที ไม่มีขั้นจ่ายแยก ส่วนที่เหลือยกเลิก ไม่มีค้างส่ง ถ้า available ไม่พอให้ส่งกลับแก้ ไม่ลดจำนวนจ่ายให้เอง</p>}
          <button disabled={busy || !actions.includes(action)} className={primary}>ยืนยัน</button> <button type="button" disabled={busy} className={button} onClick={() => setAction(null)}>ปิด</button>
        </form>}
        <h3 className="font-bold">หลักฐาน (ไม่บังคับ)</h3>
        {doc.attachments.map(file => <div key={file.id} className="flex flex-wrap items-center gap-2"><a className="min-w-0 break-all text-blue-700" href={file.fileUrl} target="_blank" rel="noreferrer">{file.originalName}</a>
          {editable && (can.create || can.update) && <button disabled={busy} className={button} onClick={() => void run(async () => { await api.deleteFile(doc, file.id); refresh(); })}>ลบหลักฐาน</button>}</div>)}
        {editable && (can.create || can.update) && <div className="space-y-2">
          <input key={doc.updatedAt} aria-label="หลักฐานใบเบิก" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" disabled={busy} className="block max-w-full" onChange={event => setFiles(Array.from(event.target.files || []))} />
          <button disabled={busy || !files.length} className={button} onClick={() => void run(async () => { await api.upload(doc, files); refresh(); })}>แนบหลักฐานใบเบิก</button>
        </div>}
        <h3 className="font-bold">รายการตามเอกสาร {doc.status === "draft" || doc.status === "pending" || doc.status === "returned" ? "(ยังไม่จ่าย)" : ""}</h3>
        {doc.items.map(item => <div key={item.id} className="min-w-0 rounded border p-3 text-sm"><p className="break-words font-semibold">{item.seq + 1}. {item.productSnapshot?.code} · {item.productSnapshot?.name || item.productId}</p>
          <p>ขอ {number(item.requestedQty)} · <strong>จ่ายตามใบนี้ {number(item.issuedQty)}</strong> · ยกเลิกส่วนที่เหลือ {number(item.cancelledQty)} {item.productSnapshot?.unit}</p></div>)}
        <p className="whitespace-pre-wrap break-words">หมายเหตุ: {doc.remark || "-"}</p>
        {doc.cancelledAt && <p className="break-words text-red-700">ยกเลิก {date(doc.cancelledAt)} · {doc.cancellationReason}</p>}
        <h3 className="font-bold">Stock Movement อ้างใบนี้</h3>
        {doc.movements?.map(row => <p key={row.id} className="break-words text-sm">{date(row.transactionDate)} · {doc.items.find(item => item.productId === row.productId)?.productSnapshot?.name || row.productId} · เข้า {number(row.qtyIn)} / ออก {number(row.qtyOut)}{row.reversalRefId ? ` · กลับ ${row.reversalRefId}` : ""}</p>)}
        <h3 className="font-bold">ประวัติ</h3>
        {doc.history?.map(row => <p key={row.id} className="break-words border-t pt-2 text-sm">{time(row.createdAt)} · {issueHistory[row.action] || row.action} · {row.performedBy?.fullName || "-"}{row.reason ? ` · ${row.reason}` : ""}</p>)}
      </section>}
    </div>
    {mode === "view" && doc?.lifecycleVersion === 1 && !loading && !loadError && <div className="is-preview mt-5 w-full overflow-x-auto"><StockIssueDocument document={doc} company={company} onReady={setPrintReady} /></div>}
  </>;
}
