"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccountingSettingsApi } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { PaymentVoucherDocument, PaymentVoucherPrintStyles } from "@/components/payment-voucher-document";
import { PaymentVouchersApi as api, newVoucher, voucherForm, voucherBase as base, voucherList, voucherStatuses, voucherActions,
  voucherPaymentLabel, methodLabels, newVoucherAction, evidenceCategories, evidenceLabels,
  type PaymentVoucher, type VoucherSource, type VoucherInput, type VoucherAction, type EvidenceCategory } from "@/lib/payment-voucher";

const control = "w-full min-w-0 rounded-md border bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const money = (value: number | string | undefined) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";
const actionLabel = (action: VoucherAction, paid: boolean) => action === "cancel" && paid ? voucherActions.reverse : voucherActions[action];

export function PaymentVouchers({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter(), access = useAccountingAccess();
  const permissions = { create: canUseAccounting(access, "ap", "create"), update: canUseAccounting(access, "ap", "update"),
    approve: canUseAccounting(access, "ap", "approve"), cancel: canUseAccounting(access, "ap", "cancel"), pay: canUseAccounting(access, "ap", "pay") };
  const [doc, setDoc] = useState<PaymentVoucher | null>(null), [form, setForm] = useState<VoucherInput>(newVoucher);
  const [rows, setRows] = useState<PaymentVoucher[]>([]), [source, setSource] = useState<VoucherSource | null>(null), [sources, setSources] = useState<VoucherSource[]>([]);
  const [query, setQuery] = useState({ q: "", status: "", payment: "", page: "1", pageSize: "20" });
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [payment, setPayment] = useState("");
  const [total, setTotal] = useState(0), [pages, setPages] = useState(0);
  const [sourceQuery, setSourceQuery] = useState(""), [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [reload, setReload] = useState(0), [printReady, setPrintReady] = useState(false);
  const [action, setAction] = useState<VoucherAction | null>(null), [actionForm, setActionForm] = useState(newVoucherAction);
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const [category, setCategory] = useState<EvidenceCategory>("pv-document"), [files, setFiles] = useState<File[]>([]);
  const busy = useRef(false), requestKey = useRef(""), fileInput = useRef<HTMLInputElement>(null);
  const isForm = mode === "new" || mode === "edit", allowedForm = mode === "new" ? permissions.create : permissions.update;
  const editable = doc?.lifecycleVersion === 1 && ["draft", "returned"].includes(doc.status);
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && printReady && !loading && !loadError;
  const categories = useMemo(() => doc ? evidenceCategories(doc, { create: permissions.create, update: permissions.update, pay: permissions.pay, cancel: permissions.cancel }) : [],
    [doc, permissions.create, permissions.update, permissions.pay, permissions.cancel]);
  useEffect(() => {
    if (isForm && !allowedForm) return;
    let current = true;
    setLoading(true); setLoadError(""); setError(""); setAction(null); setPrintReady(false); setFiles([]);
    async function load() {
      if (mode === "list") {
        const result = await api.list(query);
        if (current) { setRows(result.data); setTotal(result.total); setPages(result.totalPages); }
      } else if (recordId) {
        const result = await api.get(recordId);
        if (!current) return;
        setDoc(result);
        if (isForm) setForm(voucherForm(result));
        else {
          const settings = await AccountingSettingsApi.get();
          if (current) setCompany(settings);
        }
      } else if (current) {
        requestKey.current = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
        setDoc(null); setForm(newVoucher());
      }
    }
    load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, query, reload, isForm, allowedForm]);
  useEffect(() => {
    if (mode !== "new" || !allowedForm) return;
    let current = true;
    setSourceLoading(true); setSourceError("");
    const timer = setTimeout(() => {
      api.sources(sourceQuery).then(rows => { if (current) setSources(rows); })
        .catch(error => { if (current) setSourceError(message(error)); }).finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [mode, allowedForm, sourceQuery]);
  useEffect(() => {
    setSource(null);
    if (!isForm || !allowedForm || !form.sourceDocId) return;
    let current = true;
    setSourceError("");
    api.source(form.sourceDocId).then(result => { if (current) setSource(result); }).catch(error => { if (current) setSourceError(message(error)); });
    return () => { current = false; };
  }, [form.sourceDocId, isForm, allowedForm, reload]);
  useEffect(() => {
    if (categories.length && !categories.includes(category)) setCategory(categories[0]);
  }, [categories, category]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !allowedForm) return;
    if (!source) { setError("กรุณาเลือก PS และรอโหลดข้อมูลให้สำเร็จ"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = mode === "edit" && recordId ? await api.update(recordId, form) : await api.create({ ...form, requestKey: requestKey.current });
      router.push(`${base}/${result.id}`);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !doc || !action) return;
    busy.current = true; setSaving(true); setError("");
    try {
      await api.action(doc.id, action, doc.updatedAt, actionForm);
      setAction(null); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function evidence(removeId?: string) {
    if (busy.current || !doc) return;
    busy.current = true; setSaving(true); setError("");
    try {
      if (removeId) await api.deleteFile(removeId, doc.updatedAt); else await api.upload(doc, category, files);
      const updated = await api.get(doc.id);
      setDoc(updated); setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  if (isForm && !allowedForm) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไข PV</p>;
  const actions: VoucherAction[] = [];
  if (mode === "view" && doc?.lifecycleVersion === 1) {
    if (editable && permissions.create) actions.push("submit");
    if (doc.status === "pending" && permissions.approve) {
      if (doc.createdById !== getStoredUser()?.id) actions.push("approve");
      actions.push("return", "reject");
    }
    if (doc.status === "approved" && !doc.paidAt && doc.paymentMethod !== "cheque" && permissions.pay) actions.push("pay");
    if (["draft", "returned", "pending", "approved"].includes(doc.status) && permissions.cancel && (!doc.paidAt || permissions.pay)
      && !doc.chequePayments.some(row => row.status !== "Cancelled")) actions.push("cancel");
  }
  const amounts = mode === "view" ? doc : source;
  return <div className="pv-page mx-auto max-w-[1480px]">
    <PaymentVoucherPrintStyles allowed={Boolean(printable)} />
    <header className="pv-no-print mb-5 flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-blue-600">Accounts Payable</p>
      <h1 className="text-2xl font-bold">{mode === "new" ? "สร้างใบสำคัญจ่าย" : mode === "edit" ? "แก้ไข PV" : doc?.pvNo || "ใบสำคัญจ่าย (PV)"}</h1>
      <p className="mt-1 text-sm text-gray-600">PS อนุมัติเต็มยอด 1 ต่อ 1 · อนุมัติแยกจากจ่ายจริง · ไม่ลง GL</p></div>
      <nav className="flex flex-wrap gap-2"><Link className={button} href={mode === "list" ? "/ap/vouchers?tab=ps" : voucherList}>{mode === "list" ? "ใบเบิกจ่าย PS" : "กลับรายการ PV"}</Link>
        {mode === "list" && permissions.create && <Link className={primary} href={`${base}/new`}>สร้าง PV</Link>}
        {mode === "view" && doc && editable && permissions.update && <Link className={button} href={`${base}/${doc.id}/edit`}>แก้ไข</Link>}
        {actions.map(value => <button className={value === "cancel" ? `${button} text-red-700` : button} key={value} disabled={saving || loading} onClick={() => { setAction(value); setActionForm(newVoucherAction()); }}>{actionLabel(value, Boolean(doc?.paidAt))}</button>)}
        {mode === "view" && doc?.lifecycleVersion === 1 && <button className={button} disabled={!printable || saving} onClick={() => window.print()}>พิมพ์ PV</button>}
        {mode !== "list" && <button className={button} disabled={saving} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button>}
      </nav></header>
    {loading && <p className="pv-no-print" role="status">กำลังโหลด...</p>}
    {loadError && <p className="pv-no-print rounded border border-red-300 bg-red-50 p-3 text-red-700" role="alert">{loadError}</p>}
    {error && <p className="pv-no-print mb-3 rounded border border-red-300 bg-red-50 p-3 text-red-700" role="alert">{error}</p>}
    {!loading && !loadError && mode === "list" && <section className="pv-no-print space-y-4 rounded-lg border bg-white p-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, status, payment, page: "1" }); }}>
        <label className="min-w-0 flex-1">ค้นหา PV / PS / PO / ผู้รับเหมา<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทั้งหมด</option>{Object.entries(voucherStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>การจ่าย<select className={control} value={payment} onChange={event => setPayment(event.target.value)}><option value="">ทั้งหมด</option><option value="unpaid">ยังไม่จ่าย</option><option value="paid">จ่ายแล้ว</option><option value="reversed">กลับรายการแล้ว</option></select></label>
        <button className={`${primary} self-end`}>ค้นหา</button>
      </form><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["เลข PV", "วันที่", "PS / ผู้รับเหมา", "สุทธิ", "สถานะ / การจ่าย"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-2"><Link className="font-semibold text-blue-700 underline" href={`${base}/${row.id}`}>{row.pvNo}</Link></td><td className="p-2">{formatAccountingDate(row.pvDate)}</td><td className="p-2">{row.sourceNo || row.sourceDocId}<p>{row.supplierSnapshot?.name || "-"}</p></td><td className="p-2 text-right">{money(row.netPayment)}</td><td className="p-2">{voucherStatuses[row.status] || row.status}<p>{row.lifecycleVersion === 1 ? voucherPaymentLabel(row) : "Legacy"}</p></td></tr>)}</tbody></table></div>
      {!rows.length && <p>ไม่พบใบสำคัญจ่าย</p>}
      <div className="flex flex-wrap items-center gap-3"><span>{total} รายการ · หน้า {query.page} / {Math.max(1, pages)}</span><button className={button} disabled={Number(query.page) <= 1} onClick={() => setQuery({ ...query, page: String(Number(query.page) - 1) })}>ก่อนหน้า</button><button className={button} disabled={Number(query.page) >= pages} onClick={() => setQuery({ ...query, page: String(Number(query.page) + 1) })}>ถัดไป</button></div>
    </section>}
    {!loading && !loadError && isForm && (mode === "new" || editable) && <form className="pv-no-print space-y-4" onSubmit={save}>
      <fieldset disabled={saving} className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <label>วันที่ PV *<DateInput required className={control} value={form.pvDate} onChange={pvDate => setForm({ ...form, pvDate })} /></label>
        {mode === "new" ? <SearchableSelect label="PS อนุมัติ" required value={form.sourceDocId} selectedLabel={source ? `${source.psNo} · ${source.supplierSnapshot?.name || ""}` : undefined}
          options={sources.map(row => ({ value: row.id, label: `${row.psNo} · ${row.supplierSnapshot?.name || ""} · ${money(row.netAmount)}` }))}
          onChange={sourceDocId => setForm({ ...form, sourceDocId })} onSearch={setSourceQuery} loading={sourceLoading} error={sourceError} placeholder="เลือก PS ที่ยังไม่ใช้ใน PV" searchPlaceholder="ค้นหา PS / PO / ผู้รับเหมา" />
          : <p>PS: {doc?.sourceNo} · {doc?.supplierSnapshot?.name}</p>}
        <label>วิธีจ่าย *<select className={control} value={form.paymentMethod} onChange={event => setForm({ ...form, paymentMethod: event.target.value as VoucherInput["paymentMethod"] })}>{Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>ประเภทผู้ถูกหัก WHT<select className={control} value={form.taxpayerType} onChange={event => setForm({ ...form, taxpayerType: event.target.value })}><option value="">เลือกก่อนส่งอนุมัติเมื่อมี WHT</option><option value="individual">บุคคลธรรมดา</option><option value="company">นิติบุคคล</option></select></label>
        <label className="md:col-span-2">รายละเอียด / อ้างอิงภาษี<input maxLength={500} className={control} value={form.taxDescription} onChange={event => setForm({ ...form, taxDescription: event.target.value })} /></label>
        <label className="md:col-span-2">หมายเหตุ<textarea maxLength={1000} className={control} value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
        {sourceError && mode === "edit" && <p className="text-red-700 md:col-span-2" role="alert">{sourceError}</p>}
        <p className="text-sm text-gray-600 md:col-span-2">คัดลอกรายการและยอดเต็มจาก PS ห้ามแก้ยอดเอง · Draft กัน PS ไว้จนยกเลิก/ปฏิเสธ · แนบหลักฐานหลังบันทึก</p>
      </fieldset>
      <section className="rounded border bg-white p-4"><h2 className="mb-3 font-bold">รายการจาก PS</h2>{source?.items?.map((row, i) => <p className="flex justify-between gap-3 border-b py-2" key={i}><span className="min-w-0 whitespace-pre-wrap break-words">{i + 1}. {row.desc}</span><strong>{money(row.amount)}</strong></p>)}
        <VoucherTotals amounts={amounts} />
      </section><button className={primary} disabled={saving || !source}>{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button>
    </form>}
    {!loading && !loadError && mode === "edit" && !editable && <p role="alert">แก้ไขได้เฉพาะ PV ใหม่สถานะ Draft / ส่งกลับ</p>}
    {!loading && !loadError && mode === "view" && doc && <>
      <section className="pv-no-print mb-4 space-y-2 rounded border bg-white p-4">
        <p>สถานะ: <strong>{voucherStatuses[doc.status] || doc.status}</strong> · <strong>{voucherPaymentLabel(doc)}</strong></p>
        <p>PS: {doc.lifecycleVersion === 1 ? <Link className="text-blue-700 underline" href={`/ap/vouchers/ps/${doc.sourceDocId}`}>{doc.sourceNo || doc.sourceDocId}</Link> : doc.sourceNo || doc.sourceDocId} · PO: {doc.poNo || "-"} · ผู้รับเหมา: {doc.supplierSnapshot?.name || "-"}</p>
        <p>วิธีจ่าย: {methodLabels[doc.paymentMethod] || doc.paymentMethod} · ประเภทผู้ถูกหัก: {doc.taxpayerType === "company" ? "นิติบุคคล" : doc.taxpayerType === "individual" ? "บุคคลธรรมดา" : "-"}</p>
        <p className="whitespace-pre-wrap break-words">รายละเอียดภาษี: {doc.taxDescription || "-"} · หมายเหตุ: {doc.remark || "-"}</p>
        {doc.paidAt && <p className="whitespace-pre-wrap break-words">จ่ายวันที่ {formatAccountingDate(doc.paidAt)} · ผู้รับ {doc.recipient} · จาก {doc.payerBank || "-"} → {doc.payeeBank || "-"} · อ้างอิง {doc.paymentReference || "-"}</p>}
        {doc.reversedAt && <p className="text-red-700">กลับรายการวันที่ {formatAccountingDate(doc.reversedAt)} · อ้างอิง {doc.reversalReference}</p>}
        {doc.createdById === getStoredUser()?.id && doc.status === "pending" && <p className="text-amber-800">ผู้สร้างไม่สามารถอนุมัติ PV ตัวเองได้ ต้องให้ผู้อนุมัติอีกคนดำเนินการ</p>}
        {doc.lifecycleVersion !== 1 && <p role="alert">Legacy อ่านอย่างเดียว ไม่ย้ายยอด/สถานะอัตโนมัติ</p>}
        <VoucherTotals amounts={doc} />
      </section>
      <section className="pv-no-print mb-4 space-y-2 rounded border bg-white p-4"><h2 className="font-bold">รายการจ่ายจาก PS</h2>{doc.items.map((row, i) => <p key={i} className="flex justify-between gap-3 border-b py-2"><span className="min-w-0 whitespace-pre-wrap break-words">{i + 1}. {row.desc}</span><strong>{money(row.amount)}</strong></p>)}</section>
      <section className="pv-no-print mb-4 space-y-3 rounded border bg-white p-4"><h2 className="font-bold">เอกสารแนบ / หลักฐาน</h2>
        {doc.attachments.map(file => <div className="flex flex-wrap items-center gap-3" key={file.id}><a className="break-all text-blue-700 underline" href={file.fileUrl} target="_blank" rel="noreferrer">{evidenceLabels[file.category] || file.category}: {file.originalName}</a>
          {categories.includes(file.category) && <button className={button} disabled={saving} onClick={() => { if (window.confirm("ยืนยันลบหลักฐานนี้?")) void evidence(file.id); }}>ลบหลักฐาน</button>}</div>)}
        {!doc.attachments.length && <p className="text-sm text-gray-600">ยังไม่มีไฟล์แนบ</p>}
        {categories.length > 0 && <div className="grid gap-3 md:grid-cols-2"><label>ประเภทหลักฐาน<select className={control} value={category} onChange={event => setCategory(event.target.value as EvidenceCategory)}>{categories.map(value => <option value={value} key={value}>{evidenceLabels[value]}</option>)}</select></label>
          <label>เลือกไฟล์ PDF / JPG / PNG<input className={`${control} text-sm`} ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
          <button className={`${button} justify-self-start`} disabled={saving || !files.length} onClick={() => void evidence()}>แนบหลักฐาน</button></div>}
        <p className="text-sm text-gray-600">โอนต้องมีหลักฐานจ่ายเงินก่อนบันทึกจ่าย · กลับรายการหลังจ่ายต้องแนบหลักฐานกลับรายการ · ไม่ออก 50 ทวิ/ภงด. ในระยะนี้</p>
      </section>
      {action && <form onSubmit={execute} className="pv-no-print mb-4 grid min-w-0 gap-3 rounded border border-amber-300 bg-amber-50 p-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">ยืนยัน{actionLabel(action, Boolean(doc.paidAt))} {doc.pvNo}</h2>
        {(action === "pay" || (action === "cancel" && doc.paidAt)) && <p className="text-sm md:col-span-2">บันทึกรายการที่ทำจริงภายนอกเท่านั้น ระบบไม่ได้สั่งโอนหรือคืนเงินจริงจากธนาคาร</p>}
        {action === "pay" && <><label>วันที่จ่ายจริง *<DateInput required className={control} value={actionForm.paidDate} onChange={paidDate => setActionForm({ ...actionForm, paidDate })} /></label>
          <label>ชื่อผู้รับเงิน *<input required maxLength={200} className={control} value={actionForm.recipient} onChange={event => setActionForm({ ...actionForm, recipient: event.target.value })} /></label>
          {doc.paymentMethod === "transfer" && <><label>บัญชีธนาคารผู้จ่าย *<input required maxLength={300} className={control} value={actionForm.payerBank} onChange={event => setActionForm({ ...actionForm, payerBank: event.target.value })} /></label>
            <label>บัญชีธนาคารผู้รับ *<input required maxLength={300} className={control} value={actionForm.payeeBank} onChange={event => setActionForm({ ...actionForm, payeeBank: event.target.value })} /></label>
            <label>เลขอ้างอิงการจ่าย *<input required maxLength={200} className={control} value={actionForm.paymentReference} onChange={event => setActionForm({ ...actionForm, paymentReference: event.target.value })} /></label></>}
        </>}
        {action === "cancel" && doc.paidAt && <><label>วันที่กลับรายการ *<DateInput required className={control} value={actionForm.reversalDate} onChange={reversalDate => setActionForm({ ...actionForm, reversalDate })} /></label>
          <label>เลขอ้างอิงการกลับเงิน *<input required maxLength={200} className={control} value={actionForm.reversalReference} onChange={event => setActionForm({ ...actionForm, reversalReference: event.target.value })} /></label>
          <p className="text-sm md:col-span-2">ต้องมีหลักฐานกลับรายการจ่ายก่อนยืนยัน · ปลด PS ให้ทำ PV ใหม่ แต่ไม่ยกเลิก PS/คืนวงเงิน PO</p></>}
        <label className="md:col-span-2">เหตุผล {["return", "reject", "cancel"].includes(action) ? "*" : "(ถ้ามี)"}<textarea required={["return", "reject", "cancel"].includes(action)} maxLength={1000} className={control} value={actionForm.reason} onChange={event => setActionForm({ ...actionForm, reason: event.target.value })} /></label>
        <div className="flex flex-wrap gap-3 md:col-span-2"><button className={primary} disabled={saving}>ยืนยัน{actionLabel(action, Boolean(doc.paidAt))}</button><button type="button" className={button} disabled={saving} onClick={() => setAction(null)}>ปิด</button></div>
      </form>}
      {doc.paymentMethod === "cheque" && <section className="pv-no-print mb-4 space-y-2 rounded border bg-white p-4"><h2 className="font-bold">เช็คอ้างอิง</h2>
        {doc.chequePayments.some(row => row.status !== "Cancelled") && <p>มีเช็คที่ยังไม่ยกเลิก ต้องยกเลิก/กลับรายการผ่านหน้าเช็ค ไม่ยกเลิก PV ข้ามขั้น</p>}
        <Link className="text-blue-700 underline" href="/ap/vouchers?tab=cq">เปิดทะเบียนเช็คจ่าย / หลักฐานส่งมอบ-ตัดบัญชี-กลับรายการ</Link>
        {doc.chequePayments.map(row => <p className="break-words" key={row.id}><Link className="text-blue-700 underline" href={`/ap/vouchers/cq/${row.id}`}>{row.cqNo}</Link> · {row.chequeNo} · {row.status} · {money(row.amount)}</p>)}</section>}
      <section className="pv-no-print mb-4 rounded border bg-white p-4"><h2 className="mb-3 font-bold">ประวัติเอกสาร</h2><ol className="space-y-2 text-sm">{doc.history?.map(row => <li className="break-words border-b pb-2" key={row.id}>{formatAccountingDateTime(row.createdAt)} · {row.performedBy?.fullName || "-"} · {voucherActions[row.action as keyof typeof voucherActions] || row.action}{row.reason ? ` · ${row.reason}` : ""}</li>)}</ol></section>
      {doc.lifecycleVersion === 1 && <div className="pv-preview overflow-x-auto rounded border bg-white"><PaymentVoucherDocument document={doc} company={company} onReady={setPrintReady} /></div>}
    </>}
  </div>;
}
function VoucherTotals({ amounts }: { amounts: Pick<PaymentVoucher, "amountBeforeTax" | "vat" | "wht" | "otherDeduction" | "netPayment"> | VoucherSource | null }) {
  return <dl className="mt-3 space-y-1 rounded bg-gray-50 p-3">{([
    ["ก่อน VAT", amounts?.amountBeforeTax], ["VAT", amounts?.vat], ["หัก ณ ที่จ่าย", amounts?.wht],
    ["เงินประกันตาม PS", amounts?.otherDeduction], ["ยอดจ่ายสุทธิ", amounts?.netPayment],
  ] as const).map(([label, value]) => <div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd className="font-bold">{money(value)}</dd></div>)}</dl>;
}
