"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountingLookupApi, ArApi } from "@/lib/api";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { branchDefaults, invoiceDueDate, type AccountCustomer } from "@/lib/account-customers";
import { deliveryOrderAmounts, type DeliveryOrderProduct } from "@/lib/delivery-order";
import { invoiceForm, invoiceStatus, newInvoice, type Invoice, type InvoiceInput, type InvoiceSource } from "@/lib/invoice";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { DocumentItems } from "@/components/document-items";
import { InvoiceDocument, InvoicePrintStyles } from "@/components/invoice-document";

const base = "/ar/invoices";
const control = "w-full min-w-0 rounded-md border border-[#dfe5de] bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Invoices({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const canWrite = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [doc, setDoc] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceInput>(newInvoice);
  const [customers, setCustomers] = useState<AccountCustomer[]>([]);
  const [products, setProducts] = useState<DeliveryOrderProduct[]>([]);
  const [sources, setSources] = useState<InvoiceSource[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
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
  const linked = Boolean(form.provisionalDeliveryOrderId);
  const customer = customers.find(item => item.id === form.customerId);
  const totals = deliveryOrderAmounts(form.items, form.discount, form.vatConfig);

  useEffect(() => {
    if (isForm && !canWrite) return;
    let current = true;
    setLoading(true); setLoadError(""); setError(""); setAction(null);
    async function load() {
      if (mode === "list") {
        const result = await ArApi.getInvoices(query);
        if (current) setRows(Array.isArray(result) ? result : result.items);
        return;
      }
      const document = recordId ? await ArApi.getInvoice(recordId) : null;
      if (isForm) {
        const [cs, ps] = await Promise.all([AccountingLookupApi.getCustomers(), AccountingLookupApi.getProducts()]);
        if (!current) return;
        setCustomers(cs); setProducts(ps);
        setForm(document ? invoiceForm(document) : newInvoice());
      }
      if (current) { setDoc(document); setSourceLabel(document?.provisionalDeliveryOrder?.soNo || "ไม่อ้างอิง SO"); }
    }
    load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, isForm, canWrite, reload, query]);

  useEffect(() => {
    if (mode !== "new" || !canWrite) return;
    let current = true;
    setSourceLoading(true); setSourceError("");
    const timer = setTimeout(() => {
      ArApi.getInvoiceSources(sourceQuery).then(result => { if (current) setSources(result); })
        .catch(error => { if (current) { setSources([]); setSourceError(message(error)); } })
        .finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [sourceQuery, mode, canWrite]);

  function chooseCustomer(id: string) {
    const selected = customers.find(item => item.id === id);
    if (!selected) return;
    setForm(previous => ({ ...previous, customerId: id, ...branchDefaults(selected), taxId: selected.taxId || "",
      creditTerm: selected.creditTerm, vatConfig: selected.vatConfig }));
  }
  async function chooseSource(id: string) {
    if (busy.current) return;
    if (!id) { setForm(newInvoice()); setSourceLabel("ไม่อ้างอิง SO"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const source = await ArApi.getDeliveryOrder(id);
      if (source.status === "cancelled") throw new Error("SO ถูกยกเลิกแล้ว");
      const selected = customers.find(item => item.id === source.customerId);
      if (!selected) throw new Error("ลูกค้า SO ปิดใช้งานหรือไม่อยู่ในรายการ");
      setForm(previous => ({
        ...previous, provisionalDeliveryOrderId: source.id, customerId: source.customerId,
        ...branchDefaults(selected, selected.branches.find(branch => branch.name === source.customerBranch)?.id),
        customerBranchId: "", customerBranch: source.customerBranch, taxId: selected.taxId || "",
        shippingAddress: source.shippingAddress || "", workOrderId: source.workOrderId,
        creditTerm: source.creditTerm, vatConfig: source.vatConfig, discount: source.discount,
        items: source.items.map(item => ({ ...item, unit: item.unit || "", remark: item.remark || "", partNo: item.partNo || "" })),
      }));
      setSourceLabel(source.soNo);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite || busy.current) return;
    if (!customer) { setError("กรุณาเลือกลูกค้าที่เปิดใช้งาน"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = mode === "edit" && recordId ? await ArApi.updateInvoice(recordId, form) : await ArApi.createInvoice(form);
      router.push(`${base}/${result.id}`);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!doc || !action || !canWrite || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const result = action === "confirm" ? await ArApi.confirmInvoice(doc.id, doc.updatedAt) : await ArApi.cancelInvoice(doc.id, doc.updatedAt, reason);
      setDoc(result); setAction(null); setReason(""); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }

  if (isForm && !canWrite) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไข Invoice</p>;
  const editable = doc?.lifecycleVersion === 1 && doc.status === "draft";
  return <div className="iv-page mx-auto min-w-0 max-w-6xl">
    <InvoicePrintStyles allowed={mode === "view" && doc?.lifecycleVersion === 1 && doc.status === "approved" && printReady && !loading && !loadError} />
    <header className="iv-no-print mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-600">Accounts Receivable</p><h1 className="text-2xl font-bold">{mode === "new" ? "สร้างใบแจ้งหนี้ / ใบกำกับภาษี" : mode === "edit" ? "แก้ไข Invoice" : doc?.ivNo || "ใบแจ้งหนี้ / ใบกำกับภาษี"}</h1><p className="mt-1 text-sm text-gray-600">Draft ยังไม่ตั้งหนี้ · ยืนยันแล้วจึงตั้งหนี้ · ไม่ตัด Stock</p></div>
      <div className="flex flex-wrap gap-2">
        {mode !== "list" && <Link className={button} href={base}>กลับรายการ Invoice</Link>}
        {mode === "list" && canWrite && <Link className={primary} href={`${base}/new`}>สร้าง Invoice</Link>}
        {mode === "view" && doc && !loading && !loadError && <>
          {canWrite && editable && <><Link className={button} href={`${base}/${doc.id}/edit`}>แก้ไข</Link><button className={primary} disabled={saving} onClick={() => setAction("confirm")}>ยืนยันตั้งหนี้</button></>}
          {canWrite && doc.lifecycleVersion === 1 && ["draft", "approved"].includes(doc.status) && <button className={`${button} text-red-700`} disabled={saving} onClick={() => setAction("cancel")}>ยกเลิก Invoice</button>}
          {doc.lifecycleVersion === 1 && doc.status === "approved" && <button className={button} disabled={!printReady} onClick={() => window.print()}>พิมพ์ข้อมูลลงแบบฟอร์ม</button>}
        </>}
      </div>
    </header>
    {loadError && <p role="alert" className="iv-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{loadError} <button className="underline" onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {error && <p role="alert" className="iv-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {loading && <p role="status" className="iv-no-print">กำลังโหลด...</p>}
    {mode === "list" && <div className="iv-no-print space-y-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ q: search, status }); }}>
        <label>ค้นหาเลขที่ / ลูกค้า<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทั้งหมด</option><option value="draft">Draft</option><option value="approved">ยืนยันแล้ว</option><option value="cancelled">ยกเลิก</option></select></label>
        <button className={`${button} self-end`}>ค้นหา</button>
      </form>
      {!loading && !loadError && <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{["เลขที่", "วันที่", "ลูกค้า", "SO", "ยอดสุทธิ", "คงค้าง", "สถานะ"].map(title => <th className="p-3 text-left" key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row.id}><td className="p-3"><Link className="text-blue-700 underline" href={`${base}/${row.id}`}>{row.ivNo}</Link></td><td className="p-3">{formatAccountingDate(row.ivDate)}</td><td className="p-3">{row.customerName || row.customer?.name}</td><td className="p-3">{row.provisionalDeliveryOrder?.soNo || "-"}</td><td className="p-3">{money(row.netAmount)}</td><td className="p-3">{money(row.outstandingAmount)}</td><td className="p-3">{invoiceStatus(row)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-center">ไม่มีรายการที่ตรงกับเงื่อนไข</p>}</div>}
    </div>}
    {isForm && !loading && !loadError && (mode === "new" || editable) && <form onSubmit={save} className="iv-no-print space-y-5">
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <section className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
          <label>วันที่ Invoice<DateInput required className={control} value={form.ivDate} onChange={ivDate => setForm(previous => ({ ...previous, ivDate }))} /></label>
          {mode === "new" ? <SearchableSelect label="คัดลอกจาก SO (ไม่บังคับ)" value={form.provisionalDeliveryOrderId || ""} selectedLabel={sourceLabel} placeholder="ไม่อ้างอิง SO" searchPlaceholder="พิมพ์เลข SO" loading={sourceLoading} error={sourceError} options={[{ value: "", label: "ไม่อ้างอิง SO" }, ...sources.map(source => ({ value: source.id, label: `${source.soNo} — ${source.customer?.name || ""}` }))]} onSearch={q => { if (q !== sourceQuery) { setSourceLoading(true); setSourceQuery(q); } }} onChange={id => { void chooseSource(id); }} />
            : <p>SO อ้างอิง: {sourceLabel} (ไม่สามารถเปลี่ยนหลังบันทึก)</p>}
          <fieldset disabled={linked} className="min-w-0"><SearchableSelect label="ลูกค้า" required value={customer ? form.customerId : ""} selectedLabel={customer ? `${customer.code || ""} — ${customer.name}` : ""} placeholder="เลือกลูกค้า" searchPlaceholder="พิมพ์รหัส / ชื่อ" options={customers.map(item => ({ value: item.id, label: `${item.code || ""} — ${item.name}` }))} onChange={chooseCustomer} /></fieldset>
          {linked && <p className="text-sm text-gray-600 md:col-span-2">ข้อมูลคัดลอกจาก SO สามารถแก้ไขใน Invoice Draft ได้ โดยไม่เปลี่ยนข้อมูล SO ต้นฉบับ ลูกค้าและ SO อ้างอิงยังคงเดิม</p>}
          <label>สาขาลูกค้า<select className={control} value={form.customerBranchId || ""} onChange={event => {
            const branchId = event.target.value;
            if (customer && branchId) setForm(previous => ({ ...previous, ...branchDefaults(customer, branchId) }));
            else setForm(previous => ({ ...previous, customerBranchId: "" }));
          }}>
            <option value="">ข้อมูลสาขาบนเอกสาร: {form.customerBranch}</option>{customer?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}
          </select></label>
          <label>เลขผู้เสียภาษี<input className={control} value={form.taxId} onChange={event => setForm(previous => ({ ...previous, taxId: event.target.value }))} /></label>
          <label>เลข PO ลูกค้า<input className={control} value={form.customerPoNo} onChange={event => setForm(previous => ({ ...previous, customerPoNo: event.target.value }))} /></label>
          <label>ที่อยู่ออกบิล<textarea rows={3} className={control} value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} /></label>
          <label>ที่อยู่จัดส่ง<textarea rows={3} className={control} value={form.shippingAddress} onChange={event => setForm(previous => ({ ...previous, shippingAddress: event.target.value }))} /></label>
          <label>จำนวนวันเครดิต<input required className={control} type="number" min="0" max="36500" step="1" value={form.creditTerm} onChange={event => setForm(previous => ({ ...previous, creditTerm: event.target.value }))} /><span className="text-sm">ครบกำหนด {formatAccountingDate(invoiceDueDate(form.ivDate, Number(form.creditTerm)))}</span></label>
          <label>VAT<select className={control} value={form.vatConfig} onChange={event => setForm(previous => ({ ...previous, vatConfig: event.target.value === "NO_VAT" ? "NO_VAT" : "VAT7%" }))}><option value="VAT7%">VAT 7%</option><option value="NO_VAT">No VAT</option></select></label>
        </section>
        <DocumentItems title="รายการ Invoice" items={form.items} products={products} onChange={items => setForm(previous => ({ ...previous, items }))} />
        <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
          <label>ส่วนลดท้ายเอกสาร (บาท)<input required className={control} type="number" min="0" max={Math.max(0, totals.subTotal)} step="0.01" value={form.discount} onChange={event => setForm(previous => ({ ...previous, discount: event.target.value }))} /></label>
          <dl className="space-y-2">{[["รวมเงิน", totals.subTotal], ["ส่วนลดท้ายเอกสาร", form.discount], ["ยอดก่อน VAT", totals.taxableAmount], ["VAT", totals.vat], ["ยอดสุทธิ", totals.netAmount]].map(([label, amount]) => <div key={label} className="flex justify-between gap-2 border-b"><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
        </section>
        <label className="block">หมายเหตุ<textarea className={control} value={form.remark} onChange={event => setForm(previous => ({ ...previous, remark: event.target.value }))} /></label>
        <button className={primary} type="submit">{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button>
      </fieldset>
    </form>}
    {mode === "edit" && !loading && doc && !editable && <p role="alert">แก้ไขได้เฉพาะ Draft ในวงจรใหม่ เอกสาร Legacy/ยืนยัน/ยกเลิกแล้วเป็นแบบอ่านอย่างเดียว</p>}
    {mode === "view" && doc && !loading && !loadError && <>
      <div className="iv-no-print mb-4 space-y-4">
        <section className="rounded-lg border bg-white p-4"><p>สถานะ: {invoiceStatus(doc)}</p><p>ยอดสุทธิ {money(doc.netAmount)} บาท · ค้างรับ {money(doc.outstandingAmount)} บาท</p><p>ครบกำหนด {formatAccountingDate(doc.dueDate)} · SO {doc.provisionalDeliveryOrder?.soNo || "-"}</p>
          {doc.confirmedAt && <p>ยืนยันเมื่อ {formatAccountingDateTime(doc.confirmedAt)}</p>}
          {doc.lifecycleVersion !== 1 && <p className="text-amber-800">Legacy: คงยอดและสถานะเดิม ไม่แก้ไข/ยืนยัน/ยกเลิกผ่านวงจรใหม่โดยอัตโนมัติ ต้องตรวจข้อมูลก่อนย้าย</p>}
        </section>
        {action && <form className="space-y-3 rounded border bg-amber-50 p-4" onSubmit={execute}>
          <p>{action === "confirm" ? `ยืนยันตั้งหนี้ ${money(doc.netAmount)} บาท? หลังยืนยันแก้ไขไม่ได้ และไม่ตัด Stock` : "ยกเลิกและล้างยอดค้างรับได้เฉพาะไม่มี BI/RV/CN ที่ยังไม่ยกเลิกอ้างอิง"}</p>
          {action === "cancel" && <label className="block">เหตุผลยกเลิก<textarea required className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>}
          <div className="flex gap-2"><button className={primary} disabled={saving}>{saving ? "กำลังดำเนินการ..." : action === "confirm" ? "ยืนยันตั้งหนี้จริง" : "ยืนยันยกเลิก"}</button><button className={button} type="button" disabled={saving} onClick={() => setAction(null)}>กลับ</button></div>
        </form>}
        <p className="text-sm text-gray-600">ตัวอย่างด้านล่างเป็นข้อมูลสำหรับพิมพ์ทับกระดาษสำเร็จรูปตาม invoice.pdf ไม่พิมพ์โลโก้ เส้นตาราง หัวเอกสาร หรือช่องรับชำระซ้ำ · พิมพ์ได้เมื่อยืนยันแล้ว ตั้ง A4 ขนาดจริง 100% ปิดหัว/ท้ายกระดาษของเบราว์เซอร์ และทดลองกระดาษก่อนใช้จริง</p>
      </div>
      <div className="iv-preview max-w-full overflow-x-auto rounded border"><InvoiceDocument document={doc} onReady={setPrintReady} /></div>
      <section className="iv-no-print mt-4 rounded-lg border bg-white p-4"><h2 className="font-bold">ประวัติ</h2>{doc.history?.map(entry => <p key={entry.id}>{formatAccountingDateTime(entry.createdAt)} · {entry.action} · {entry.performedBy?.fullName || "-"} {entry.reason || ""}</p>)}</section>
    </>}
  </div>;
}
