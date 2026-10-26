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
import { GoodsReceiptDocument, GoodsReceiptPrintStyles } from "@/components/goods-receipt-document";
import { GoodsReceiptsApi as api, receiptBase as base, receiptList as list, receiptStatuses, receiptActions, receiptHistory,
  availableReceiptActions, newReceipt, receiptForm, exportReceipts, today,
  type GoodsReceipt, type ReceiptInput, type ReceiptAction, type ReceiptSource, type ReceiptSourceOption, type ReceiptProduct, type ReceiptWarehouse,
} from "@/lib/goods-receipt";
const control = "w-full min-w-0 rounded border bg-white px-3 py-2";
const button = "rounded border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const message = (error: unknown) => error instanceof Error ? error.message : "ดำเนินการ GR ไม่สำเร็จ";
const number = (value: number | string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export function GoodsReceipts({ mode = "list", recordId }: { mode?: "list" | "new" | "edit" | "view"; recordId?: string }) {
  const router = useRouter(), access = useAccountingAccess();
  const can = { create: canUseAccounting(access, "ap", "create"), update: canUseAccounting(access, "ap", "update"),
    approve: canUseAccounting(access, "ap", "approve"), cancel: canUseAccounting(access, "ap", "cancel") };
  const [doc, setDoc] = useState<GoodsReceipt | null>(null), [form, setForm] = useState<ReceiptInput>(newReceipt);
  const [rows, setRows] = useState<GoodsReceipt[]>([]), [query, setQuery] = useState({ q: "", status: "", page: "1", pageSize: "20" });
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [pages, setPages] = useState(0), [total, setTotal] = useState(0);
  const [sources, setSources] = useState<ReceiptSourceOption[]>([]), [source, setSource] = useState<ReceiptSource | null>(null);
  const [sourceQuery, setSourceQuery] = useState(""), [sourceError, setSourceError] = useState(""), [sourceLoading, setSourceLoading] = useState(false);
  const [products, setProducts] = useState<ReceiptProduct[]>([]), [warehouses, setWarehouses] = useState<ReceiptWarehouse[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [reload, setReload] = useState(0), [files, setFiles] = useState<File[]>([]);
  const [action, setAction] = useState<ReceiptAction | null>(null), [reason, setReason] = useState(""), [cancelDate, setCancelDate] = useState(today);
  const [userId, setUserId] = useState<string>(), [company, setCompany] = useState<PurchaseOrderCompanySettings>({}), [printReady, setPrintReady] = useState(false);
  const guard = useRef(false), requestKey = useRef("");
  const isForm = mode === "new" || mode === "edit", allowedForm = mode === "new" ? can.create : can.update;
  const editable = doc?.lifecycleVersion === 1 && ["draft", "returned"].includes(doc.status);
  useEffect(() => { setUserId(getStoredUser()?.id); }, []);
  useEffect(() => {
    if (isForm && !allowedForm) return;
    let current = true;
    setLoading(true); setLoadError(""); setPrintReady(false); setAction(null); setFiles([]);
    async function load() {
      if (mode === "list") {
        const result = await api.list(query);
        if (current) { setRows(result.data); setTotal(result.total); setPages(result.totalPages); }
      } else if (recordId) {
        const result = await api.get(recordId);
        if (!current) return;
        setDoc(result);
        if (isForm) setForm(receiptForm(result));
        else { const settings = await AccountingSettingsApi.get(); if (current) setCompany(settings); }
      } else {
        requestKey.current = crypto.randomUUID();
        if (current) { setDoc(null); setForm(newReceipt()); }
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
    if (mode !== "new" || !allowedForm) return;
    let current = true; setSourceLoading(true); setSourceError("");
    const timer = setTimeout(() => {
      api.sources(sourceQuery).then(result => { if (current) setSources(result); })
        .catch(error => { if (current) setSourceError(message(error)); }).finally(() => { if (current) setSourceLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [mode, allowedForm, sourceQuery]);
  useEffect(() => {
    if (!isForm || !allowedForm || !form.poId) { setSource(null); return; }
    let current = true; setSource(null); setSourceError("");
    api.source(form.poId, mode === "edit" ? recordId : undefined).then(result => { if (current) setSource(result); })
      .catch(error => { if (current) setSourceError(message(error)); });
    return () => { current = false; };
  }, [form.poId, isForm, allowedForm, mode, recordId, reload]);
  async function run(operation: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(message(error)); }
    finally { guard.current = false; setBusy(false); }
  }
  const refresh = () => { setReload(value => value + 1); };
  const actions = doc ? availableReceiptActions(doc, can, userId) : [];
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && printReady && !loading && !loadError;
  if (isForm && !allowedForm) return <p role="alert">ไม่มีสิทธิ์สร้าง/แก้ GR <Link href={list}>กลับทะเบียน</Link></p>;
  return <>
    <GoodsReceiptPrintStyles allowed={Boolean(printable)} />
    <div className="gr-no-print mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">รับสินค้า / ตรวจรับบริการ (GR)</h1><p className="text-sm text-gray-600">PO อนุมัติแล้ว · กันจำนวนตอนส่งตรวจ · เพิ่ม Stock เมื่ออนุมัติเท่านั้น</p></div>
        {mode !== "list" && <Link href={list} className={button}>กลับทะเบียน GR</Link>}
        {mode === "list" && can.create && <Link href={`${base}/new`} className={primary}>สร้างใบรับสินค้า</Link>}
      </header>
      {loading && <p role="status">กำลังโหลด GR...</p>}
      {loadError && <div role="alert" className="rounded bg-red-50 p-3 text-red-700">{loadError} <button className={button} onClick={refresh}>โหลดใหม่</button></div>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
      {mode === "list" && <>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, status, page: "1" }); }}>
          <input aria-label="ค้นหา GR" placeholder="ค้นหา GR / PO / ผู้ขาย" className={`${control} flex-1 basis-60`} value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="สถานะ GR" className={button} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(receiptStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button className={button}>ค้นหา</button><button type="button" disabled={busy || loading} className={button} onClick={() => void run(async () => exportReceipts(await api.all({ q: query.q, status: query.status })))}>CSV ตามตัวกรองทั้งหมด</button>
        </form>
        {!loading && !loadError && <><p>ทั้งหมด {total} รายการ · หน้า {query.page}/{Math.max(1, pages)}</p>
          <div className="overflow-x-auto rounded border bg-white"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">GR / วันที่</th><th>PO / ผู้ขาย</th><th>คลัง</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.grNo}<br />{date(row.receiptDate)}</td><td>{row.poNo || "-"}<br />{row.supplierSnapshot?.name || "-"}</td><td>{row.warehouseSnapshot?.name || "-"}</td><td>{receiptStatuses[row.status] || row.status}{row.lifecycleVersion !== 1 ? " · Legacy" : ""}</td>
              <td><Link className="text-blue-700" href={`${base}/${encodeURIComponent(row.id)}`}>ดู / พิมพ์</Link></td></tr>)}</tbody></table>{!rows.length && <p className="p-4">ไม่พบรายการ</p>}</div>
          <div className="flex gap-2">{[-1, 1].map(step => <button key={step} disabled={Number(query.page) + step < 1 || Number(query.page) + step > pages} className={button}
            onClick={() => setQuery({ ...query, page: String(Number(query.page) + step) })}>{step < 0 ? "ก่อนหน้า" : "ถัดไป"}</button>)}</div></>}
      </>}
      {isForm && !loading && !loadError && (mode === "edit" && !editable ? <p role="alert">GR นี้อ่านอย่างเดียว แก้ได้เฉพาะ Draft / ส่งกลับรุ่นใหม่</p> :
        <form className="space-y-4 rounded border bg-white p-4" onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            if (!source) throw new Error("กรุณาโหลด PO และตรวจยอดคงเหลือก่อนบันทึก");
            const saved = doc ? await api.update(doc.id, { ...form, updatedAt: doc.updatedAt }) : await api.create({ ...form, requestKey: requestKey.current });
            router.push(`${base}/${encodeURIComponent(saved.id)}`);
          });
        }}>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>วันที่รับ *{doc ? <input readOnly className={control} value={date(form.receiptDate)} /> : <DateInput required className={control} value={form.receiptDate} onChange={receiptDate => setForm({ ...form, receiptDate })} />}</label>
              {doc ? <label>PO (เปลี่ยนไม่ได้)<input readOnly className={control} value={doc.poNo || doc.poId} /></label> :
                <SearchableSelect label="PO อนุมัติแล้ว" required value={form.poId} selectedLabel={source?.poNo} loading={sourceLoading} error={sourceError}
                  options={sources.map(row => ({ value: row.id, label: `${row.poNo} · ${row.supplier?.name || ""}` }))} placeholder="เลือก PO" searchPlaceholder="ค้นหา PO / ผู้ขาย" onSearch={setSourceQuery}
                  onChange={poId => { setSource(null); setForm({ ...form, poId, items: [] }); }} />}
              <SearchableSelect label="คลังรับ (บังคับเมื่อมีสินค้า)" value={form.warehouseId} options={[{ value: "", label: "บริการ / ไม่ระบุคลัง" }, ...warehouses.map(row => ({ value: row.id, label: `${row.code} · ${row.name}` }))]}
                placeholder="เลือกคลัง" searchPlaceholder="ค้นหาคลัง" onChange={warehouseId => setForm({ ...form, warehouseId })} />
              <div><p className="font-semibold">ผู้ขายจาก PO</p><p>{source?.supplier.name || "-"}</p></div>
              <label>ผู้ส่ง *<input required maxLength={200} className={control} value={form.sender} onChange={event => setForm({ ...form, sender: event.target.value })} /></label>
              <label>ผู้รับ / ตรวจรับ *<input required maxLength={200} className={control} value={form.receiver} onChange={event => setForm({ ...form, receiver: event.target.value })} /></label>
            </div>
            {sourceError && <p role="alert" className="text-red-700">{sourceError}</p>}
            <p className="text-sm text-gray-600">เลือกเฉพาะรายการที่รับครั้งนี้ · กรณี PO ยังไม่ผูกสินค้าให้เลือก master หน่วยตรงกัน · Draft ไม่กันจำนวน ต้องตรวจอีกครั้งเมื่อส่งอนุมัติ</p>
            {source?.lines.map(line => {
              const entry = form.items.find(item => item.poLineId === line.id);
              const options = products.filter(product => Boolean(line.unit?.trim()) && product.unit?.trim() === line.unit?.trim() && (!line.productId || product.id === line.productId));
              const savedProduct = doc?.items.find(item => item.poLineId === line.id)?.productSnapshot;
              const change = (patch: Partial<ReceiptInput["items"][number]>) => setForm({ ...form, items: form.items.map(item => item.poLineId === line.id ? { ...item, ...patch } : item) });
              return <section key={line.id} className="min-w-0 space-y-3 rounded border p-3">
                <label className="flex items-start gap-2 font-semibold"><input type="checkbox" checked={Boolean(entry)} onChange={event => setForm({ ...form,
                  items: event.target.checked ? [...form.items, { poLineId: line.id, productId: line.productId || "", currentReceiptQty: "" }] : form.items.filter(item => item.poLineId !== line.id) })} />
                  <span className="min-w-0 break-words">{line.seq + 1}. {line.desc} · {line.unit}</span></label>
                {!line.unit?.trim() && <p role="alert" className="text-red-700">PO line นี้ไม่มีหน่วย ต้องตรวจสอบต้นทางก่อนรับสินค้า</p>}
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{[["สั่ง", line.orderedQty], ["รับแล้ว", line.previouslyReceivedQty], ["รอตรวจอื่น", line.pendingQty], ["คงเหลือรับได้", line.remainingQty]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-bold">{number(value)}</dd></div>)}</dl>
                {entry && <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableSelect label="สินค้า / บริการ" required value={entry.productId} selectedLabel={products.find(row => row.id === entry.productId)?.name || (savedProduct ? `${savedProduct.code} · ${savedProduct.name}` : undefined)}
                    options={options.map(product => ({ value: product.id, label: `${product.code} · ${product.name} · ${product.productType === "service" ? "บริการ" : "สินค้า"}` }))}
                    placeholder="เลือก master หน่วยตรง PO" searchPlaceholder="ค้นหาสินค้า / บริการ" onChange={productId => change({ productId })} />
                  <label>จำนวนรับครั้งนี้ *<input required type="number" min="0.001" step="0.001" max={Number(line.remainingQty)} className={control} value={entry.currentReceiptQty} onChange={event => change({ currentReceiptQty: event.target.value })} /></label>
                </div>}
              </section>;
            })}
            <label className="block">หมายเหตุ<textarea maxLength={1000} rows={3} className={control} value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
            <p className="text-sm">บันทึกร่างก่อน แล้วแนบหลักฐาน PDF/JPG/PNG บนหน้าเอกสารก่อนส่งตรวจ</p>
          </fieldset>
          <button disabled={busy || !source || !form.items.length} className={primary}>{busy ? "กำลังบันทึก..." : "บันทึก GR"}</button>
        </form>)}
      {mode === "view" && doc && !loading && !loadError && <>
        <section className="space-y-3 rounded border bg-white p-4">
          <h2 className="text-lg font-bold">{doc.grNo} · {receiptStatuses[doc.status] || doc.status}</h2>
          <Link className="text-blue-700" href={`/ap/vouchers/${encodeURIComponent(doc.poId)}`}>ดู PO {doc.poNo}</Link>
          {doc.lifecycleVersion !== 1 && <p role="alert" className="text-amber-800">GR Legacy อ่านอย่างเดียว ต้องตรวจย้าย PO-line/ยอด Stock ก่อนใช้ workflow ใหม่</p>}
          <div className="flex flex-wrap gap-2">{editable && can.update && <Link className={button} href={`${base}/${encodeURIComponent(doc.id)}/edit`}>แก้ไข GR</Link>}
            {actions.map(value => <button disabled={busy} key={value} className={button} onClick={() => { setAction(value); setReason(""); setCancelDate(today()); }}>{receiptActions[value]}</button>)}
            {doc.lifecycleVersion === 1 && <button disabled={busy || !printable} className={button} onClick={() => window.print()}>พิมพ์ / PDF</button>}
          </div>
          {action && <form className="space-y-3 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(async () => { await api.action(doc, action, reason, cancelDate); refresh(); }); }}>
            <h3 className="font-bold">ยืนยัน{receiptActions[action]}</h3>
            {["return", "reject", "cancel"].includes(action) && <label className="block">เหตุผล *<textarea required disabled={busy} maxLength={1000} className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
            {action === "cancel" && <><label className="block">วันที่ยกเลิก *<DateInput required className={control} value={cancelDate} onChange={setCancelDate} /></label>
              <p className="text-amber-800">ยกเลิกทั้งใบ ถ้าอนุมัติแล้วจะกลับ Stock/คืนจำนวนรับ PO เมื่อ available พอ ไม่กินยอดจอง · วันที่ต้องไม่ก่อน Movement ล่าสุด · ไม่คืนเงิน/คืนผู้ขายให้เอง</p></>}
            {action === "approve" && <p>สินค้าจะเพิ่ม Stock และ Movement ในคลังที่ระบุ บริการไม่เพิ่ม Stock</p>}
            <button disabled={busy || !actions.includes(action)} className={primary}>ยืนยัน</button> <button type="button" disabled={busy} className={button} onClick={() => setAction(null)}>ปิด</button>
          </form>}
          <h3 className="font-bold">หลักฐานตรวจรับ (บังคับก่อนส่งตรวจ)</h3>
          {doc.attachments.map(file => <div key={file.id} className="flex flex-wrap items-center gap-2">
            <a className="min-w-0 break-all text-blue-700" href={file.fileUrl} target="_blank" rel="noreferrer">{file.originalName}</a>
            {editable && (can.create || can.update) && <button disabled={busy} className={button} onClick={() => void run(async () => { await api.deleteFile(doc, file.id); refresh(); })}>ลบหลักฐาน</button>}
          </div>)}
          {editable && (can.create || can.update) && <div className="space-y-2">
            <input key={doc.updatedAt} aria-label="หลักฐาน GR" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" disabled={busy} className="block max-w-full" onChange={event => setFiles(Array.from(event.target.files || []))} />
            <button disabled={busy || !files.length} className={button} onClick={() => void run(async () => { await api.upload(doc, files); refresh(); })}>แนบหลักฐาน GR</button>
          </div>}
          <h3 className="font-bold">รายการ / snapshot ณ บันทึกหรืออนุมัติ</h3>
          {doc.items.map(item => <div key={item.id} className="min-w-0 rounded border p-3 text-sm">
            <p className="break-words font-semibold">{item.seq + 1}. {item.desc || item.productSnapshot?.name || item.productId}</p>
            <p>สั่ง {number(item.orderedQty)} · รับก่อน {number(item.previouslyReceivedQty)} · รอตรวจอื่น {number(item.pendingQty || 0)} · <strong>รับครั้งนี้ {number(item.currentReceiptQty)}</strong> · เหลือ {number(item.remainingQty)} {item.unit} · {item.productSnapshot?.productType === "service" ? "บริการ ไม่เพิ่ม Stock" : "สินค้า"}</p>
          </div>)}
          <p className="whitespace-pre-wrap break-words">หมายเหตุ: {doc.remark || "-"}</p>
          {doc.cancelledAt && <p className="break-words text-red-700">ยกเลิก {date(doc.cancelledAt)} · {doc.cancellationReason}</p>}
          <h3 className="font-bold">Stock Movement ที่อ้าง GR นี้</h3>
          {doc.movements?.map(row => <p key={row.id} className="break-words text-sm">{date(row.transactionDate)} · {doc.items.find(item => item.productId === row.productId)?.productSnapshot?.name || row.productId} · เข้า {number(row.qtyIn)} / ออก {number(row.qtyOut)}{row.reversalRefId ? ` · กลับ ${row.reversalRefId}` : ""}</p>)}
          <h3 className="font-bold">ประวัติ</h3>
          {doc.history?.map(row => <p key={row.id} className="break-words border-t pt-2 text-sm">{time(row.createdAt)} · {receiptHistory[row.action] || row.action} · {row.performedBy?.fullName || "-"}{row.reason ? ` · ${row.reason}` : ""}</p>)}
        </section>
      </>}
    </div>
    {mode === "view" && doc?.lifecycleVersion === 1 && !loading && !loadError && <div className="gr-preview mt-5 w-full overflow-x-auto">
      <GoodsReceiptDocument document={doc} company={company} onReady={setPrintReady} />
    </div>}
  </>;
}
