"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountingLookupApi, AccountingSettingsApi, ArApi } from "@/lib/api";
import { branchDefaults, type AccountCustomer } from "@/lib/account-customers";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { newReceipt, receiptForm, receiptStatus, receiptTotals, type ReceiptInput, type ReceiptLine, type ReceiptSource, type ReceiptSources, type ReceiptVoucher } from "@/lib/receipt-voucher";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { ReceiptVoucherDocument, ReceiptPrintStyles } from "@/components/receipt-voucher-document";

const base = "/ar/receipts";
const control = "w-full min-w-0 rounded-md border bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";
const emptySources: ReceiptSources = { invoices: [], billingNotes: [] };

export function ReceiptVouchers({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const canWrite = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [rows, setRows] = useState<ReceiptVoucher[]>([]);
  const [doc, setDoc] = useState<ReceiptVoucher | null>(null);
  const [form, setForm] = useState<ReceiptInput>(newReceipt);
  const [customers, setCustomers] = useState<AccountCustomer[]>([]);
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const [sources, setSources] = useState<ReceiptSources>(emptySources);
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
  const [files, setFiles] = useState<File[]>([]);
  const [printReady, setPrintReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isForm = mode === "new" || mode === "edit";
  const editable = doc?.lifecycleVersion === 1 && doc.status === "draft";
  const customer = customers.find(row => row.id === form.customerId);
  const totals = receiptTotals(form.allocations);
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && doc.status === "approved" && printReady && !loading && !loadError;

  useEffect(() => {
    if (isForm && !canWrite) return;
    let current = true;
    setLoading(true); setLoadError(""); setError(""); setAction(null); setPrintReady(false); setFiles([]);
    async function load() {
      if (mode === "list") { const result = await ArApi.getReceiptVouchers(query); if (current) setRows(result); return; }
      const document = recordId ? await ArApi.getReceiptVoucher(recordId) : null;
      if (isForm) {
        const cs = await AccountingLookupApi.getCustomers();
        if (current) { setCustomers(cs); setForm(document ? receiptForm(document) : newReceipt()); }
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
    if (!isForm || !canWrite || !form.customerId) { setSources(emptySources); return; }
    let current = true;
    setSourceLoading(true); setSourceError(""); setSources(emptySources);
    const timer = setTimeout(() => {
      ArApi.getReceiptSources({ customerId: form.customerId, q: sourceQuery })
        .then(result => { if (current) setSources(result); })
        .catch(error => { if (current) setSourceError(message(error)); })
        .finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [isForm, canWrite, form.customerId, sourceQuery, reload]);
  function addSources(selected: ReceiptSource[]) {
    setForm(previous => ({ ...previous, allocations: [...previous.allocations, ...selected
      .filter(row => !previous.allocations.some(line => line.invoiceId === row.id))
      .map(row => ({ invoiceId: row.id, invoiceNo: row.ivNo, invoiceDate: row.ivDate, invoiceNetAmount: row.netAmount,
        outstandingBefore: row.outstandingAmount, billingNoteId: row.billingNoteId, biNo: row.biNo,
        limit: row.limit, receivedAmount: row.limit, whtAmount: 0, bankFee: 0 }))] }));
  }
  function updateAmount(index: number, field: "receivedAmount" | "whtAmount" | "bankFee", value: string) {
    setForm(previous => ({ ...previous, allocations: previous.allocations.map((row, i) => i === index ? { ...row, [field]: value } : row) }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite || busy.current) return;
    if (!customer || !form.allocations.length) { setError("กรุณาเลือกลูกค้าและ Invoice"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = mode === "edit" && recordId ? await ArApi.updateReceiptVoucher(recordId, form) : await ArApi.createReceiptVoucher(form);
      router.push(`${base}/${result.id}`);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!doc || !action || !canWrite || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const result = action === "confirm" ? await ArApi.confirmReceiptVoucher(doc.id, doc.updatedAt) : await ArApi.cancelReceiptVoucher(doc.id, doc.updatedAt, reason);
      setDoc(result); setAction(null); setReason(""); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function evidence(removeId?: string) {
    if (!doc || !editable || !canWrite || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      if (removeId) await ArApi.deleteReceiptFile(removeId, doc.updatedAt);
      else await ArApi.uploadReceiptFiles(doc.id, doc.updatedAt, files);
      setDoc(await ArApi.getReceiptVoucher(doc.id)); setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  const sourceFor = (row: ReceiptLine) => sources.invoices.find(source => source.id === row.invoiceId)
    || sources.billingNotes.flatMap(bill => bill.invoices).find(source => source.id === row.invoiceId);

  if (isForm && !canWrite) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไขใบสำคัญรับ</p>;
  return <div className="rv-page mx-auto max-w-370">
    <ReceiptPrintStyles allowed={Boolean(printable)} />
    <header className="rv-no-print mb-5 flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-600">Accounts Receivable</p><h1 className="text-2xl font-bold">{mode === "new" ? "สร้างใบสำคัญรับ" : mode === "edit" ? "แก้ไขใบสำคัญรับ" : doc?.rvNo || "รับชำระเงิน"}</h1><p className="mt-1 text-sm text-gray-600">ยอดลดหนี้ = เงินเข้าสุทธิ + WHT + ค่าธรรมเนียมที่บริษัทรับภาระ · ไม่รับเกินหนี้</p></div>
      <nav className="flex flex-wrap gap-2">
        {mode !== "list" && <Link className={button} href={base}>กลับรายการ</Link>}
        {mode === "list" && canWrite && <Link className={primary} href={`${base}/new`}>สร้างใบสำคัญรับ</Link>}
        {mode === "view" && doc && canWrite && editable && <><Link className={button} href={`${base}/${doc.id}/edit`}>แก้ไข Draft</Link><button className={primary} disabled={saving || loading} onClick={() => setAction("confirm")}>ยืนยันรับชำระ</button></>}
        {mode === "view" && doc?.lifecycleVersion === 1 && ["draft", "approved"].includes(doc.status) && canWrite && <button className={`${button} text-red-700`} disabled={saving || loading} onClick={() => setAction("cancel")}>ยกเลิก RV</button>}
        {mode === "view" && <button className={button} disabled={!printable || saving} onClick={() => { if (printable) window.print(); }}>พิมพ์ใบสำคัญรับ</button>}
      </nav>
    </header>
    {loadError && <p role="alert" className="rv-no-print mb-4 text-red-700">{loadError} <button className={button} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {error && <p role="alert" className="rv-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {loading && <p role="status" className="rv-no-print">กำลังโหลด...</p>}
    {mode === "list" && <div className="rv-no-print space-y-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ q: search, status }); }}>
        <label>ค้นหาเลขที่ / ลูกค้า<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทั้งหมด</option><option value="draft">Draft</option><option value="approved">ยืนยันรับชำระแล้ว</option><option value="cancelled">ยกเลิก</option></select></label><button className={`${button} self-end`}>ค้นหา</button>
      </form>
      {!loading && !loadError && <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm"><thead><tr>{["เลขที่", "วันที่", "ลูกค้า", "เงินเข้าสุทธิ", "WHT", "ค่าธรรมเนียม", "ยอดลดหนี้", "สถานะ"].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row.id}><td className="p-3"><Link className="text-blue-700 underline" href={`${base}/${row.id}`}>{row.rvNo}</Link></td><td className="p-3">{formatAccountingDate(row.receiptDate)}</td><td className="p-3">{row.customerName || row.customer?.name}</td><td className="p-3">{money(row.totalReceived)}</td><td className="p-3">{money(row.whtAmount)}</td><td className="p-3">{money(row.bankFee)}</td><td className="p-3">{money(receiptTotals(row.allocations).settled)}</td><td className="p-3">{receiptStatus(row)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5">ไม่มีรายการที่ตรงกับเงื่อนไข</p>}</div>}
    </div>}
    {isForm && !loading && !loadError && (mode === "new" || editable) && <form onSubmit={save} className="rv-no-print space-y-5">
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <section className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
          <label>วันที่รับชำระ<DateInput required className={control} value={form.receiptDate} onChange={receiptDate => setForm(previous => ({ ...previous, receiptDate }))} /></label>
          <SearchableSelect label="ลูกค้า" required value={customer ? form.customerId : ""} selectedLabel={customer ? `${customer.code || ""} — ${customer.name}` : ""} placeholder="เลือกลูกค้า" searchPlaceholder="พิมพ์รหัส / ชื่อ" options={customers.map(row => ({ value: row.id, label: `${row.code || ""} — ${row.name}` }))} onChange={id => {
            const selected = customers.find(row => row.id === id);
            if (selected) { setSources(emptySources); setSourceQuery(""); setForm(previous => ({ ...previous, customerId: id, ...branchDefaults(selected), taxId: selected.taxId || "", allocations: [] })); }
          }} />
          <label>สาขาลูกค้า<select className={control} value={form.customerBranchId || ""} onChange={event => { if (customer && event.target.value) setForm(previous => ({ ...previous, ...branchDefaults(customer, event.target.value) })); }}><option value="">ข้อมูลบนเอกสาร: {form.customerBranch}</option>{customer?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></label>
          <label>วิธีรับเงิน<select className={control} value={form.paymentMethod} onChange={event => setForm(previous => ({ ...previous, paymentMethod: event.target.value === "cash" ? "cash" : "transfer" }))}><option value="transfer">โอนเงิน</option><option value="cash">เงินสด</option></select></label>
          {form.paymentMethod === "transfer" && <><label>ธนาคารที่รับเงิน<input required maxLength={100} className={control} value={form.bankName} onChange={event => setForm(previous => ({ ...previous, bankName: event.target.value }))} /></label><label>เลขอ้างอิงโอน<input required maxLength={100} className={control} value={form.refNo} onChange={event => setForm(previous => ({ ...previous, refNo: event.target.value }))} /></label></>}
          <label>เลขหนังสือรับรองหัก ณ ที่จ่าย {totals.wht > 0 && "(จำเป็น)"}<input required={totals.wht > 0} maxLength={100} className={control} value={form.whtCertificateNo} onChange={event => setForm(previous => ({ ...previous, whtCertificateNo: event.target.value }))} /></label>
        </section>
        <section className="min-w-0 space-y-4 rounded-lg border bg-white p-4">
          <h2 className="font-bold">จัดสรรรับชำระตาม Invoice</h2>
          <p className="text-sm text-gray-600">กรอกจำนวนบาทราย Invoice ไม่คำนวณเปอร์เซ็นต์ หากมี BI ยืนยันค้างอยู่จะผูกให้อัตโนมัติ และรับได้ไม่เกินส่วนวางบิล · Invoice ใน BI Draft/Legacy ยังรับไม่ได้</p>
          {form.customerId && <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <SearchableSelect label="เพิ่ม Invoice" value="" placeholder="ค้นหาเลข Invoice" searchPlaceholder="เลข Invoice" loading={sourceLoading} error={sourceError} onSearch={setSourceQuery} options={sources.invoices.filter(row => !form.allocations.some(line => line.invoiceId === row.id)).map(row => ({ value: row.id, label: `${row.ivNo} — รับได้ ${money(row.limit)} ${row.biNo || ""}` }))} onChange={id => addSources(sources.invoices.filter(row => row.id === id))} />
            <SearchableSelect label="เพิ่มจาก BI ที่ยืนยันแล้ว" value="" placeholder="ค้นหาเลข BI" searchPlaceholder="เลข BI" loading={sourceLoading} error={sourceError} onSearch={setSourceQuery} options={sources.billingNotes.filter(bill => bill.invoices.some(row => !form.allocations.some(line => line.invoiceId === row.id))).map(bill => ({ value: bill.id, label: `${bill.biNo} — ${bill.invoices.length} Invoice` }))} onChange={id => addSources(sources.billingNotes.find(bill => bill.id === id)?.invoices || [])} />
          </div>}
          {!form.customerId && <p>กรุณาเลือกลูกค้าก่อน</p>}
          <div className="grid gap-3" aria-label="รายการรับชำระ">{form.allocations.map((row, index) => {
            const live = sourceFor(row);
            const limit = live?.limit ?? row.limit;
            return <div key={row.invoiceId} className="min-w-0 space-y-3 rounded border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 break-words"><strong>{row.invoiceNo || row.invoice?.ivNo}</strong><p className="text-sm">วันที่ {formatAccountingDate(row.invoiceDate)} · {live?.biNo || row.biNo || "รับตรง Invoice"}</p><p className="text-sm">คงค้าง {money(live?.outstandingAmount ?? row.invoice?.outstandingAmount ?? row.outstandingBefore ?? 0)} · รับได้ {limit === undefined ? "ตรวจสอบอีกครั้งเมื่อบันทึก" : money(limit)}</p></div><button className={`${button} text-red-700`} type="button" aria-label={`ลบ Invoice ${index + 1}`} onClick={() => setForm(previous => ({ ...previous, allocations: previous.allocations.filter((_, i) => i !== index) }))}>ลบ</button></div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">{([["receivedAmount", "เงินเข้าสุทธิ"], ["whtAmount", "WHT"], ["bankFee", "ค่าธรรมเนียม"]] as const).map(([field, label]) => <label className="min-w-0" key={field}>{label} {index + 1}<input aria-label={`${label} ${index + 1}`} className={control} required type="number" min="0" max={limit} step="0.01" value={row[field]} onChange={event => updateAmount(index, field, event.target.value)} /></label>)}</div>
              <p className="text-right font-bold">ยอดลดหนี้ {money(receiptTotals([row]).settled)} บาท</p>
              {limit !== undefined && receiptTotals([row]).settled > limit && <p role="alert" className="text-red-700">ยอดรวมลดหนี้เกินวงเงินรับชำระ กรุณาปรับเงินเข้าสุทธิ/WHT/ค่าธรรมเนียม</p>}
            </div>;
          })}</div>
          {!form.allocations.length && <p>ยังไม่ได้เลือก Invoice</p>}
          <div className="grid gap-2 rounded bg-blue-50 p-3 sm:grid-cols-2" data-testid="rv-totals"><p>เงินเข้าสุทธิ {money(totals.received)}</p><p>WHT {money(totals.wht)}</p><p>ค่าธรรมเนียม {money(totals.fee)}</p><strong>ยอดลดหนี้รวม {money(totals.settled)} บาท</strong></div>
        </section>
        <label className="block">หมายเหตุ<textarea maxLength={1000} rows={3} className={control} value={form.remark} onChange={event => setForm(previous => ({ ...previous, remark: event.target.value }))} /></label>
        <p className="text-sm">บันทึก Draft ก่อนแนบหลักฐานได้ที่หน้ารายละเอียด · Draft ยังไม่ลดหนี้</p>
        <button className={primary} disabled={saving || !form.allocations.length}>{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button>
      </fieldset>
    </form>}
    {mode === "edit" && !loading && !loadError && !editable && <p role="alert">เอกสารนี้แก้ไขไม่ได้ (ยืนยันแล้ว / ยกเลิก / Legacy)</p>}
    {mode === "view" && doc && !loading && !loadError && <>
      <section className="rv-no-print mb-4 space-y-2 rounded border bg-white p-4">
        <p className="font-bold">{receiptStatus(doc)}</p>
        <p>วันที่รับชำระ {formatAccountingDate(doc.receiptDate)} · {doc.customerName || doc.customer?.name}</p>
        <p>เงินเข้าสุทธิ {money(doc.totalReceived)} · WHT {money(doc.whtAmount)} · ค่าธรรมเนียม {money(doc.bankFee)} · ยอดลดหนี้ {money(receiptTotals(doc.allocations).settled)}</p>
        {doc.confirmedAt && <p>ยืนยันเมื่อ {formatAccountingDateTime(doc.confirmedAt)}</p>}
        {doc.lifecycleVersion !== 1 && <p className="text-amber-800">Legacy อ่านอย่างเดียว ไม่มีการเปลี่ยนยอดย้อนหลังหรือแปลงข้อมูลอัตโนมัติ</p>}
        <p>ยืนยันแล้วแก้ไม่ได้ · ยกเลิกจะคืนยอดลดหนี้ทั้งหมดและเปิด BI กลับ แต่ห้ามกลับยอดหากมี BI ใหม่หลังปิด BI เดิม</p>
      </section>
      {action && <form className="rv-no-print mb-4 space-y-3 rounded border bg-amber-50 p-4" onSubmit={execute}>
        <h2 className="font-bold">{action === "confirm" ? "ยืนยันลดหนี้ตามยอดเงิน + WHT + ค่าธรรมเนียม?" : "ยกเลิก RV และคืนยอดหนี้ (ถ้ายืนยันแล้ว)?"}</h2>
        {action === "cancel" && <label className="block">เหตุผลยกเลิก<textarea required maxLength={1000} className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
        <div className="flex gap-2"><button className={primary} disabled={saving}>{saving ? "กำลังดำเนินการ..." : "ยืนยันดำเนินการ"}</button><button className={button} disabled={saving} type="button" onClick={() => setAction(null)}>กลับ</button></div>
      </form>}
      <section className="rv-no-print mb-4 space-y-3 rounded border bg-white p-4">
        <h2 className="font-bold">หลักฐานแนบ (ไม่บังคับ)</h2>
        <ul className="space-y-2">{doc.attachments.map(file => <li className="flex flex-wrap items-center gap-3" key={file.id}><a className="min-w-0 break-all text-blue-700 underline" href={file.fileUrl} target="_blank" rel="noreferrer">{file.originalName}</a>{editable && canWrite && <button className={button} disabled={saving} onClick={() => void evidence(file.id)}>ลบหลักฐาน</button>}</li>)}</ul>
        {editable && canWrite && <div className="flex flex-wrap gap-3"><input ref={fileInput} className="w-full min-w-0" type="file" multiple onChange={event => setFiles(Array.from(event.target.files || []))} /><button className={button} disabled={saving || !files.length || files.length > 10} onClick={() => void evidence()}>แนบหลักฐาน</button><p className="w-full text-sm">สูงสุด 10 ไฟล์ต่อครั้ง ขนาดตามการตั้งค่า API · ยืนยันแล้วเพิ่ม/ลบไม่ได้</p></div>}
      </section>
      {doc.lifecycleVersion === 1 && <div className="rv-preview overflow-x-auto rounded border bg-gray-100 p-3"><ReceiptVoucherDocument document={doc} company={company} onReady={setPrintReady} /></div>}
      <section className="rv-no-print mt-5 rounded border bg-white p-4"><h2 className="font-bold">ประวัติ</h2>{doc.history?.map(entry => <p className="mt-2 break-words text-sm" key={entry.id}>{formatAccountingDateTime(entry.createdAt)} · {entry.action} · {entry.performedBy?.fullName || ""}{entry.reason ? ` · ${entry.reason}` : ""}</p>)}</section>
    </>}
  </div>;
}
