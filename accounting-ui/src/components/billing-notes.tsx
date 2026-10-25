"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountingLookupApi, AccountingSettingsApi, ArApi } from "@/lib/api";
import { branchDefaults, type AccountCustomer } from "@/lib/account-customers";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { billingForm, billingStatus, billingTotal, newBillingNote, type BillingInput, type BillingNote, type BillingSource } from "@/lib/billing-note";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { BillingNoteDocument, BillingPrintStyles } from "@/components/billing-note-document";

const base = "/ar/billing-notes";
const control = "w-full min-w-0 rounded-md border border-[#dfe5de] bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BillingNotes({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const canWrite = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [rows, setRows] = useState<BillingNote[]>([]);
  const [doc, setDoc] = useState<BillingNote | null>(null);
  const [form, setForm] = useState<BillingInput>(newBillingNote);
  const [customers, setCustomers] = useState<AccountCustomer[]>([]);
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const [sources, setSources] = useState<BillingSource[]>([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
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
  const customer = customers.find(row => row.id === form.customerId);
  const editable = doc?.lifecycleVersion === 1 && doc.status === "draft";

  useEffect(() => {
    if (isForm && !canWrite) return;
    let current = true;
    setLoading(true); setLoadError(""); setError(""); setAction(null); setPrintReady(false);
    async function load() {
      if (mode === "list") {
        const result = await ArApi.getBillingNotes(query);
        if (current) setRows(result);
        return;
      }
      const document = recordId ? await ArApi.getBillingNote(recordId) : null;
      if (isForm) {
        const cs = await AccountingLookupApi.getCustomers();
        if (!current) return;
        setCustomers(cs); setForm(document ? billingForm(document) : newBillingNote());
      } else {
        const settings = await AccountingSettingsApi.get();
        if (current) setCompany(settings);
      }
      if (current) setDoc(document);
    }
    load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, isForm, canWrite, reload, query]);

  useEffect(() => {
    if (!isForm || !canWrite || !form.customerId) { setSources([]); return; }
    let current = true;
    setSourceLoading(true); setSourceError("");
    const timer = setTimeout(() => {
      ArApi.getBillingSources({ customerId: form.customerId, q: sourceQuery,
        ...(mode === "edit" && recordId && doc?.customerId === form.customerId ? { exceptId: recordId } : {}) })
        .then(result => { if (current) setSources(result); })
        .catch(error => { if (current) { setSources([]); setSourceError(message(error)); } })
        .finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [form.customerId, sourceQuery, mode, recordId, doc?.customerId, isForm, canWrite, reload]);

  function chooseCustomer(id: string) {
    const selected = customers.find(row => row.id === id);
    if (!selected) return;
    const branch = selected.branches[0];
    setSources([]); setSourceQuery("");
    setForm(previous => ({ ...previous, customerId: id, ...branchDefaults(selected), taxId: selected.taxId || "",
      contactPerson: branch?.contactPerson || selected.contactPerson || "", invoices: [] }));
  }
  function addInvoice(id: string) {
    const source = sources.find(row => row.id === id);
    if (!source || form.invoices.some(row => row.invoiceId === id)) return;
    setForm(previous => ({ ...previous, invoices: [...previous.invoices, {
      invoiceId: source.id, invoiceNo: source.ivNo, invoiceDate: source.ivDate, invoiceDueDate: source.dueDate,
      invoiceNetAmount: source.netAmount, outstandingAmount: source.outstandingAmount, billingAmount: source.outstandingAmount,
    }] }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite || busy.current) return;
    if (!customer || !form.invoices.length) { setError("กรุณาเลือกลูกค้าและ Invoice อย่างน้อยหนึ่งใบ"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = mode === "edit" && recordId ? await ArApi.updateBillingNote(recordId, form) : await ArApi.createBillingNote(form);
      router.push(`${base}/${result.id}`);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!doc || !action || !canWrite || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const result = action === "confirm" ? await ArApi.confirmBillingNote(doc.id, doc.updatedAt) : await ArApi.cancelBillingNote(doc.id, doc.updatedAt, reason);
      setDoc(result); setAction(null); setReason(""); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }

  if (isForm && !canWrite) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไขใบวางบิล</p>;
  return <div className="bi-page mx-auto max-w-370">
    <BillingPrintStyles allowed={mode === "view" && doc?.lifecycleVersion === 1 && doc.status === "approved" && printReady && !loading && !loadError} />
    <header className="bi-no-print mb-5 flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-600">Accounts Receivable</p><h1 className="text-2xl font-bold">{mode === "new" ? "สร้างใบวางบิล" : mode === "edit" ? "แก้ไขใบวางบิล" : doc?.biNo || "ใบวางบิล"}</h1><p className="mt-1 text-sm text-gray-600">รวม Invoice ลูกค้าเดียวกัน · วางบิลบางส่วนได้ · ไม่เพิ่มหรือลดยอดหนี้</p></div>
      <div className="flex flex-wrap gap-2">
        {mode !== "list" && <Link className={button} href={base}>กลับรายการใบวางบิล</Link>}
        {mode === "list" && canWrite && <Link className={primary} href={`${base}/new`}>สร้างใบวางบิล</Link>}
        {mode === "view" && doc && !loading && !loadError && <>
          {canWrite && editable && <><Link className={button} href={`${base}/${doc.id}/edit`}>แก้ไข</Link><button className={primary} disabled={saving} onClick={() => setAction("confirm")}>ยืนยันวางบิล</button></>}
          {canWrite && doc.lifecycleVersion === 1 && !doc.completedAt && ["draft", "approved"].includes(doc.status) && <button className={`${button} text-red-700`} disabled={saving} onClick={() => setAction("cancel")}>ยกเลิกใบวางบิล</button>}
          {doc.lifecycleVersion === 1 && doc.status === "approved" && <button className={button} disabled={!printReady} onClick={() => window.print()}>พิมพ์ใบวางบิล</button>}
        </>}
      </div>
    </header>
    {loadError && <p role="alert" className="bi-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{loadError} <button className="underline" onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {error && <p role="alert" className="bi-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {loading && <p role="status" className="bi-no-print">กำลังโหลด...</p>}
    {mode === "list" && <div className="bi-no-print space-y-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ q: search, status }); }}>
        <label>ค้นหาเลขที่ / ลูกค้า<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทั้งหมด</option><option value="draft">Draft</option><option value="approved">ยืนยันวางบิลแล้ว</option><option value="cancelled">ยกเลิก</option></select></label>
        <button className={`${button} self-end`}>ค้นหา</button>
      </form>
      {!loading && !loadError && <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm"><thead><tr>{["เลขที่", "วันที่", "ลูกค้า", "นัดชำระ", "ยอดวางบิล", "สถานะ"].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-3"><Link className="text-blue-700 underline" href={`${base}/${row.id}`}>{row.biNo}</Link></td><td className="p-3">{formatAccountingDate(row.billingDate)}</td><td className="p-3">{row.customerName || row.customer?.name}</td><td className="p-3">{formatAccountingDate(row.expectedPaymentDate)}</td><td className="p-3">{money(row.totalAmount)}</td><td className="p-3">{billingStatus(row)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5">ไม่มีรายการที่ตรงกับเงื่อนไข</p>}</div>}
    </div>}
    {isForm && !loading && !loadError && (mode === "new" || editable) && <form onSubmit={save} className="bi-no-print space-y-5">
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <section className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
          <label>วันที่วางบิล<DateInput required className={control} value={form.billingDate} onChange={billingDate => setForm(previous => ({ ...previous, billingDate }))} /></label>
          <label>วันที่นัดชำระ<DateInput className={control} value={form.expectedPaymentDate} onChange={expectedPaymentDate => setForm(previous => ({ ...previous, expectedPaymentDate }))} /></label>
          <SearchableSelect label="ลูกค้า" required value={customer ? form.customerId : ""} selectedLabel={customer ? `${customer.code || ""} — ${customer.name}` : ""} placeholder="เลือกลูกค้า" searchPlaceholder="พิมพ์รหัส / ชื่อ" options={customers.map(row => ({ value: row.id, label: `${row.code || ""} — ${row.name}` }))} onChange={chooseCustomer} />
          <label>สาขาลูกค้า<select className={control} value={form.customerBranchId || ""} onChange={event => { if (customer && event.target.value) {
            const branch = customer.branches.find(row => row.id === event.target.value);
            setForm(previous => ({ ...previous, ...branchDefaults(customer, event.target.value), contactPerson: branch?.contactPerson || customer.contactPerson || "" }));
          } }}><option value="">ข้อมูลบนเอกสาร: {form.customerBranch}</option>{customer?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></label>
          <label>ที่อยู่วางบิล<textarea maxLength={500} rows={3} className={control} value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} /></label>
          <label>เงื่อนไขการจ่ายชำระ<textarea maxLength={300} rows={3} className={control} value={form.paymentTerms} onChange={event => setForm(previous => ({ ...previous, paymentTerms: event.target.value }))} /></label>
          <label>ผู้ติดต่อ<input maxLength={100} className={control} value={form.contactPerson} onChange={event => setForm(previous => ({ ...previous, contactPerson: event.target.value }))} /></label>
          <label>เลขผู้เสียภาษี<input maxLength={40} className={control} value={form.taxId} onChange={event => setForm(previous => ({ ...previous, taxId: event.target.value }))} /></label>
        </section>
        <section className="min-w-0 space-y-4 rounded-lg border bg-white p-4">
          <h2 className="font-bold">Invoice ที่วางบิล</h2>
          <p className="text-sm text-gray-600">เลือก Invoice ที่ยืนยันแล้วและไม่ติด BI ที่ยังไม่ปิด ยอดบางส่วนไม่เกินค้างรับ เมื่อรับชำระครบส่วนวางบิล BI จะปิดและปล่อย Invoice ให้วางบิลหนี้ส่วนที่เหลือได้</p>
          {form.customerId ? <SearchableSelect label="เพิ่ม Invoice" value="" placeholder="ค้นหาและเลือก Invoice" searchPlaceholder="พิมพ์เลข Invoice" loading={sourceLoading} error={sourceError} onSearch={q => { if (q !== sourceQuery) { setSourceLoading(true); setSourceQuery(q); } }} options={sources.filter(row => !form.invoices.some(line => line.invoiceId === row.id)).map(row => ({ value: row.id, label: `${row.ivNo} — คงค้าง ${money(row.outstandingAmount)}` }))} onChange={addInvoice} /> : <p>กรุณาเลือกลูกค้าก่อน</p>}
          <div className="grid gap-3" aria-label="รายการวางบิล">{form.invoices.map((row, index) => <div key={row.invoiceId} className="grid min-w-0 gap-3 rounded border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="min-w-0 break-words"><strong>{row.invoiceNo || row.invoice?.ivNo}</strong><p className="text-sm">วันที่ {formatAccountingDate(row.invoiceDate)} · ครบกำหนด {formatAccountingDate(row.invoiceDueDate)}</p><p className="text-sm">ตามใบกำกับ {money(row.invoiceNetAmount || 0)} · คงค้าง ณ บันทึก {money(row.outstandingAmount)}</p></div>
            <label className="min-w-0">ยอดวางบิล {index + 1}<input aria-label={`ยอดวางบิล ${index + 1}`} className={control} required type="number" min="0.01" max={Number(row.outstandingAmount)} step="0.01" value={row.billingAmount} onChange={event => setForm(previous => ({ ...previous, invoices: previous.invoices.map((line, i) => i === index ? { ...line, billingAmount: event.target.value } : line) }))} /></label>
            <button className={`${button} self-end text-red-700`} type="button" aria-label={`ลบ Invoice ${index + 1}`} onClick={() => setForm(previous => ({ ...previous, invoices: previous.invoices.filter((_, i) => i !== index) }))}>ลบ</button>
          </div>)}</div>
          {!form.invoices.length && <p>ยังไม่ได้เลือก Invoice</p>}
          <p className="text-right font-bold" data-testid="bi-total">ยอดวางบิลรวม {money(billingTotal(form.invoices))} บาท</p>
        </section>
        <label className="block">หมายเหตุ<textarea maxLength={1000} rows={3} className={control} value={form.remark} onChange={event => setForm(previous => ({ ...previous, remark: event.target.value }))} /></label>
        <button className={primary} disabled={!form.invoices.length || saving}>{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button>
      </fieldset>
    </form>}
    {mode === "edit" && !loading && !loadError && !editable && <p role="alert">แก้ไขได้เฉพาะใบวางบิล Draft ใหม่เท่านั้น</p>}
    {mode === "view" && doc && !loading && !loadError && <>
      <section className="bi-no-print mb-5 space-y-3 rounded-lg border bg-white p-4">
        <p className="font-bold">สถานะ: {billingStatus(doc)}</p>
        {doc.lifecycleVersion !== 1 && <p className="text-amber-800">Legacy: อ่านอย่างเดียว ไม่เปลี่ยนสถานะ/ยอดเก่าอัตโนมัติ และไม่พิมพ์เป็นเอกสารยืนยันใหม่</p>}
        <p>ลูกค้า: {doc.customerName || doc.customer?.name} · ยอดวางบิล {money(doc.totalAmount)} บาท</p>
        <p>ยอดวางบิลเป็นข้อมูล ณ บันทึก ไม่ใช่ยอดค้างรับปัจจุบัน และไม่ใช่หลักฐานรับเงิน</p>
        {action && <form className="space-y-3 rounded border p-3" onSubmit={execute}>
          {action === "confirm" ? <p>ยืนยันวางบิลแล้วจะแก้ไขไม่ได้ และไม่เปลี่ยนยอดหนี้ Invoice ยืนยันดำเนินการต่อ</p> : <label className="block">เหตุผลยกเลิก<textarea required className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
          <button className={primary} disabled={saving}>{action === "confirm" ? "ยืนยันวางบิลจริง" : "ยืนยันยกเลิก"}</button>{" "}
          <button type="button" className={button} disabled={saving} onClick={() => setAction(null)}>ไม่ดำเนินการ</button>
        </form>}
        <h2 className="font-bold">ประวัติ</h2>{doc.history?.map(row => <p className="break-words text-sm" key={row.id}>{formatAccountingDateTime(row.createdAt)} · {row.action} · {row.performedBy?.fullName || "-"} {row.reason && `— ${row.reason}`}</p>)}
      </section>
      <div className="bi-preview overflow-x-auto rounded-lg border bg-white"><BillingNoteDocument document={doc} company={company} onReady={setPrintReady} /></div>
    </>}
  </div>;
}
