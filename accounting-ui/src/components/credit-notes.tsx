"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArApi, AccountingSettingsApi } from "@/lib/api";
import { creditAmounts, creditForm, creditStatus, newCredit, newCreditLine, type CreditInput, type CreditLine, type CreditNote, type CreditSource } from "@/lib/credit-note";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { CreditNoteDocument, CreditPrintStyles } from "@/components/credit-note-document";

const base = "/ar/credit-notes";
const control = "w-full min-w-0 rounded-md border bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";

export function CreditNotes({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const canWrite = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [rows, setRows] = useState<CreditNote[]>([]);
  const [doc, setDoc] = useState<CreditNote | null>(null);
  const [form, setForm] = useState<CreditInput>(newCredit);
  const [source, setSource] = useState<CreditSource | null>(null);
  const [sources, setSources] = useState<CreditSource[]>([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState({ q: "", status: "" });
  const [action, setAction] = useState<"confirm" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const isForm = mode === "new" || mode === "edit";
  const editable = doc?.lifecycleVersion === 1 && doc.status === "draft";
  const totals = creditAmounts(form.items, source?.vatConfig || doc?.vatConfig || "NO_VAT");
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && doc.status === "approved" && printReady && !loading && !loadError;

  useEffect(() => {
    if (isForm && !canWrite) return;
    let current = true;
    setLoading(true); setLoadError(""); setError(""); setPrintReady(false); setAction(null);
    async function load() {
      if (mode === "list") { const result = await ArApi.getCreditNotes(query); if (current) setRows(result); return; }
      const document = recordId ? await ArApi.getCreditNote(recordId) : null;
      if (!current) return;
      setDoc(document);
      if (isForm) setForm(document ? creditForm(document) : newCredit());
      else {
        const settings = await AccountingSettingsApi.get();
        if (current) setCompany(settings);
      }
    }
    load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, isForm, canWrite, reload, query]);
  useEffect(() => {
    if (!isForm || !canWrite) return;
    let current = true;
    setSourceLoading(true); setSourceError(""); setSources([]);
    const timer = setTimeout(() => {
      ArApi.getCreditSources(sourceQuery).then(result => { if (current) setSources(result); })
        .catch(error => { if (current) setSourceError(message(error)); })
        .finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [isForm, canWrite, sourceQuery, reload]);
  useEffect(() => {
    setSource(null);
    if (!isForm || !canWrite || !form.invoiceId) return;
    let current = true;
    setSourceError("");
    ArApi.getCreditSource(form.invoiceId).then(result => { if (current) setSource(result); })
      .catch(error => { if (current) setSourceError(message(error)); });
    return () => { current = false; };
  }, [form.invoiceId, isForm, canWrite, reload]);
  function patchLine(index: number, change: Partial<CreditLine>) {
    setForm(previous => ({ ...previous, items: previous.items.map((row, i) => i === index ? { ...row, ...change } : row) }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite || busy.current) return;
    if (!source) { setError("กรุณาเลือก Invoice และรอโหลดข้อมูลต้นทาง"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = mode === "edit" && recordId ? await ArApi.updateCreditNote(recordId, form) : await ArApi.createCreditNote(form);
      router.push(`${base}/${result.id}`);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!doc || !action || !canWrite || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const result = action === "confirm" ? await ArApi.confirmCreditNote(doc.id, doc.updatedAt) : await ArApi.cancelCreditNote(doc.id, doc.updatedAt, reason);
      setDoc(result); setAction(null); setReason(""); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  if (isForm && !canWrite) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไขใบลดหนี้</p>;
  return <div className="cn-page mx-auto max-w-370">
    <CreditPrintStyles allowed={Boolean(printable)} />
    <header className="cn-no-print mb-5 flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-600">Accounts Receivable</p><h1 className="text-2xl font-bold">{mode === "new" ? "สร้างใบลดหนี้" : mode === "edit" ? "แก้ไขใบลดหนี้" : doc?.cnNo || "ใบลดหนี้"}</h1><p className="mt-1 text-sm text-gray-600">อ้างอิง Invoice เดียว · ลดเฉพาะหนี้ค้างรับ · ไม่คืนสินค้า / Stock / เงิน</p></div>
      <nav className="flex flex-wrap gap-2">
        {mode !== "list" && <Link className={button} href={base}>กลับรายการ</Link>}
        {mode === "list" && canWrite && <Link className={primary} href={`${base}/new`}>สร้างใบลดหนี้</Link>}
        {mode === "view" && doc && editable && canWrite && <><Link className={button} href={`${base}/${doc.id}/edit`}>แก้ไข Draft</Link><button className={primary} disabled={saving || loading} onClick={() => setAction("confirm")}>ยืนยันลดหนี้</button></>}
        {mode === "view" && doc?.lifecycleVersion === 1 && ["draft", "approved"].includes(doc.status) && canWrite && <button className={`${button} text-red-700`} disabled={saving || loading} onClick={() => setAction("cancel")}>ยกเลิก CN</button>}
        {mode === "view" && <button className={button} disabled={!printable || saving} onClick={() => { if (printable) window.print(); }}>พิมพ์ใบลดหนี้</button>}
      </nav>
    </header>
    {loadError && <p role="alert" className="cn-no-print mb-4 text-red-700">{loadError} <button className={button} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {error && <p role="alert" className="cn-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {loading && <p role="status" className="cn-no-print">กำลังโหลด...</p>}
    {mode === "list" && <div className="cn-no-print space-y-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ q: search, status }); }}>
        <label>ค้นหาเลข CN / Invoice / ลูกค้า<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทั้งหมด</option><option value="draft">Draft</option><option value="approved">ยืนยันลดหนี้แล้ว</option><option value="cancelled">ยกเลิก</option></select></label><button className={`${button} self-end`}>ค้นหา</button>
      </form>
      {!loading && !loadError && <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm"><thead><tr>{["เลขที่", "วันที่", "Invoice", "ลูกค้า", "ยอดลดก่อน VAT", "VAT", "ยอดลดสุทธิ", "สถานะ"].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row.id}><td className="p-3"><Link className="text-blue-700 underline" href={`${base}/${row.id}`}>{row.cnNo}</Link></td><td className="p-3">{formatAccountingDate(row.cnDate)}</td><td className="p-3">{row.invoiceNo || row.invoice?.ivNo}</td><td className="p-3">{row.customerName || row.customer?.name}</td><td className="p-3">{money(row.amountBeforeVat)}</td><td className="p-3">{money(row.vat)}</td><td className="p-3">{money(row.netAmount)}</td><td className="p-3">{creditStatus(row)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5">ไม่มีรายการที่ตรงกับเงื่อนไข</p>}</div>}
    </div>}
    {isForm && !loading && !loadError && (mode === "new" || editable) && <form className="cn-no-print space-y-5" onSubmit={save}>
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <section className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
          <label>วันที่ลดหนี้<DateInput required className={control} value={form.cnDate} onChange={cnDate => setForm(previous => ({ ...previous, cnDate }))} /></label>
          {mode === "new" ? <SearchableSelect label="Invoice ต้นทาง" required value={form.invoiceId} selectedLabel={source ? `${source.ivNo} — ${source.customerName || ""}` : sources.find(row => row.id === form.invoiceId)?.ivNo || ""} placeholder="เลือก Invoice ที่ยืนยันแล้ว" searchPlaceholder="เลข Invoice / ลูกค้า" loading={sourceLoading} error={sourceError} onSearch={setSourceQuery} options={sources.map(row => ({ value: row.id, label: `${row.ivNo} — ${row.customerName || ""} — คงค้าง ${money(row.outstandingAmount)}` }))} onChange={invoiceId => { setSource(null); setForm(previous => ({ ...previous, invoiceId })); }} />
            : <p>Invoice ต้นทาง: {doc?.invoiceNo || doc?.invoice?.ivNo} (เปลี่ยนไม่ได้)</p>}
          <label className="md:col-span-2">เหตุผลลดหนี้<textarea required maxLength={500} rows={2} className={control} value={form.reason} onChange={event => setForm(previous => ({ ...previous, reason: event.target.value }))} /></label>
          <label>ชื่อผู้ติดต่อ<input maxLength={100} className={control} value={form.contactPerson} onChange={event => setForm(previous => ({ ...previous, contactPerson: event.target.value }))} /></label>
        </section>
        {sourceError && <p role="alert" className="text-red-700">{sourceError}</p>}
        {source && <section className="space-y-2 rounded border bg-blue-50 p-4" data-testid="cn-source">
          <p className="font-bold">{source.ivNo} · วันที่ {formatAccountingDate(source.ivDate)}</p>
          <p className="break-words">{source.customerCode} — {source.customerName} · {source.customerBranch}</p><p className="break-words">{source.address}</p>
          <p>ตามใบกำกับ {money(source.netAmount)} · ค้างรับ {money(source.outstandingAmount)} · {source.vatConfig === "VAT7%" ? "VAT 7%" : "ไม่มี VAT"}</p>
          {source.capacity && <p>ลดสะสมได้อีก: ก่อน VAT {money(source.capacity.before)} · VAT {money(source.capacity.vat)} · รวม {money(source.capacity.net)}</p>}
          {source.activeBilling && <p role="alert" className="font-semibold text-amber-800">Invoice อยู่ใน BI ที่ยังไม่ปิด บันทึก Draft ได้ แต่ต้องจัดการ RV/ยกเลิก BI ก่อนยืนยัน CN ไม่ปรับยอด BI อัตโนมัติ</p>}
        </section>}
        <section className="min-w-0 space-y-4 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">รายการลดหนี้</h2><button type="button" className={button} disabled={form.items.length >= 200} onClick={() => setForm(previous => ({ ...previous, items: [...previous.items, newCreditLine()] }))}>เพิ่มรายการ</button></div>
          <p className="text-sm text-gray-600">ราคาลดต่อหน่วยไม่รวม VAT · VAT คำนวณตาม Invoice · ไม่แก้รายการ Invoice ต้นฉบับและไม่คืนสินค้า</p>
          <div className="space-y-3" aria-label="รายการลดหนี้">{form.items.map((row, index) => <div className="min-w-0 space-y-3 rounded border p-3" key={index}>
            <div className="flex flex-wrap justify-between gap-2"><strong>รายการ {index + 1}</strong><button type="button" className={`${button} text-red-700`} aria-label={`ลบรายการ ${index + 1}`} disabled={form.items.length === 1} onClick={() => setForm(previous => ({ ...previous, items: previous.items.filter((_, i) => i !== index) }))}>ลบ</button></div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="min-w-0">รหัสสินค้า {index + 1}<input maxLength={100} className={control} value={row.partNo} onChange={event => patchLine(index, { partNo: event.target.value })} /></label>
              <label className="min-w-0">จำนวน {index + 1}<input required type="number" min="1" max="999999999" step="1" className={control} value={row.qty} onChange={event => patchLine(index, { qty: event.target.value })} /></label>
              <label className="min-w-0">หน่วย {index + 1}<input required list="accounting-unit-options" maxLength={40} className={control} value={row.unit} onChange={event => patchLine(index, { unit: event.target.value })} /></label>
              <label className="min-w-0">ราคาลดต่อหน่วย {index + 1}<input required type="number" min="0.01" max="9999999999.99" step="0.01" className={control} value={row.unitPrice} onChange={event => patchLine(index, { unitPrice: event.target.value })} /></label>
            </div>
            <label className="block">รายละเอียด {index + 1}<textarea required rows={2} maxLength={500} className={control} value={row.desc} onChange={event => patchLine(index, { desc: event.target.value })} /></label>
            <p className="text-right font-bold">ยอดลดก่อน VAT {money(totals.lineAmounts[index])} บาท</p>
          </div>)}</div>
          <div className="grid gap-2 rounded bg-blue-50 p-3 sm:grid-cols-3" data-testid="cn-totals"><p>ก่อน VAT {money(totals.before)}</p><p>VAT {money(totals.vat)}</p><strong>ลดหนี้รวม {money(totals.net)} บาท</strong></div>
          {source && (totals.net > Number(source.outstandingAmount) || (source.capacity && (totals.before > source.capacity.before || totals.vat > source.capacity.vat))) && <p role="alert" className="text-red-700">ยอดลดหนี้เกินค้างรับหรือวงเงินก่อน VAT/VAT สะสม กรุณาปรับรายการ</p>}
        </section>
        <label className="block">หมายเหตุ<textarea maxLength={1000} rows={3} className={control} value={form.remark} onChange={event => setForm(previous => ({ ...previous, remark: event.target.value }))} /></label>
        <p className="text-sm">Draft ไม่ลดหนี้ · ยืนยันแล้วแก้ไม่ได้ · ไม่รองรับ Invoice Legacy หรือหนี้ที่ชำระเต็มแล้ว</p>
        <button className={primary} disabled={saving || !source || !form.items.length}>{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button>
      </fieldset>
    </form>}
    {mode === "edit" && !loading && !loadError && !editable && <p role="alert">เอกสารนี้แก้ไขไม่ได้ (ยืนยันแล้ว / ยกเลิก / Legacy)</p>}
    {mode === "view" && doc && !loading && !loadError && <>
      <section className="cn-no-print mb-4 space-y-2 rounded border bg-white p-4"><p className="font-bold">{creditStatus(doc)}</p>
        <p>วันที่ {formatAccountingDate(doc.cnDate)} · Invoice <Link className="text-blue-700 underline" href={`/ar/invoices/${doc.invoiceId}`}>{doc.invoiceNo || doc.invoice?.ivNo}</Link> · {doc.customerName || doc.customer?.name}</p>
        <p>ก่อน VAT {money(doc.amountBeforeVat)} · VAT {money(doc.vat)} · ยอดลดสุทธิ {money(doc.netAmount)}</p><p className="break-words">เหตุผล: {doc.reason}</p>
        {doc.confirmedAt && <p>ยืนยันเมื่อ {formatAccountingDateTime(doc.confirmedAt)}</p>}
        <p>ยกเลิกคืนยอดหนี้ได้เมื่อไม่มี BI ใหม่/RV ยืนยันที่ยังมีผลหลังยืนยัน CN · ไม่คืน Stock และไม่ลง GL</p>
        {doc.lifecycleVersion !== 1 && <p className="text-amber-800">Legacy อ่านอย่างเดียว ไม่ย้ายสถานะ/ยอดย้อนหลังอัตโนมัติ</p>}
      </section>
      {action && <form className="cn-no-print mb-4 space-y-3 rounded border bg-amber-50 p-4" onSubmit={execute}>
        <h2 className="font-bold">{action === "confirm" ? "ยืนยันลดหนี้ตามยอดรวมและ VAT?" : "ยกเลิก CN และคืนยอดหนี้ (ถ้ายืนยันแล้ว)?"}</h2>
        {action === "cancel" && <label className="block">เหตุผลยกเลิก<textarea required maxLength={1000} className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
        <div className="flex gap-2"><button className={primary} disabled={saving}>{saving ? "กำลังดำเนินการ..." : "ยืนยันดำเนินการ"}</button><button className={button} type="button" disabled={saving} onClick={() => setAction(null)}>กลับ</button></div>
      </form>}
      {doc.lifecycleVersion === 1 && <div className="cn-preview overflow-x-auto rounded border bg-gray-100 p-3"><CreditNoteDocument document={doc} company={company} onReady={setPrintReady} /></div>}
      <section className="cn-no-print mt-5 rounded border bg-white p-4"><h2 className="font-bold">ประวัติ</h2>{doc.history?.map(entry => <p className="mt-2 break-words text-sm" key={entry.id}>{formatAccountingDateTime(entry.createdAt)} · {entry.action} · {entry.performedBy?.fullName || ""}{entry.reason ? ` · ${entry.reason}` : ""}</p>)}</section>
    </>}
  </div>;
}
