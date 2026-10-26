"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccountingSettingsApi } from "@/lib/api";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "./accounting-access-provider";
import { DateInput } from "./date-input";
import { SearchableSelect } from "./searchable-select";
import { formatAccountingDate as date, formatAccountingDateTime } from "@/lib/accounting-date";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { ChequePaymentDocument, ChequePaymentPrintStyles } from "./cheque-payment-document";
import { ChequePaymentsApi as api, chequeBase as base, chequeList, chequeStatuses, chequeActionLabels, chequeEvidenceLabels,
  newCheque, chequeForm, newChequeAction, chequeActions, chequeEvidence, exportCheques,
  type ChequePayment, type ChequeInput, type ChequeSource, type ChequeStatus, type ChequeCategory } from "@/lib/cheque-payment";

const control = "w-full min-w-0 rounded-md border bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const money = (value: number | string | undefined) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";

export function ChequePayments({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter(), access = useAccountingAccess();
  const create = canUseAccounting(access, "ap", "create"), update = canUseAccounting(access, "ap", "update"),
    approve = canUseAccounting(access, "ap", "approve"), pay = canUseAccounting(access, "ap", "pay"), cancel = canUseAccounting(access, "ap", "cancel");
  const can = useMemo(() => ({ create, update, approve, pay, cancel }), [create, update, approve, pay, cancel]);
  const [doc, setDoc] = useState<ChequePayment | null>(null), [form, setForm] = useState<ChequeInput>(newCheque);
  const [rows, setRows] = useState<ChequePayment[]>([]), [source, setSource] = useState<ChequeSource | null>(null), [sources, setSources] = useState<ChequeSource[]>([]);
  const [query, setQuery] = useState({ q: "", status: "", page: "1", pageSize: "20" }), [search, setSearch] = useState(""), [filter, setFilter] = useState("");
  const [sourceQuery, setSourceQuery] = useState(""), [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState("");
  const [total, setTotal] = useState(0), [pages, setPages] = useState(0), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [saving, setSaving] = useState(false), [reload, setReload] = useState(0);
  const [action, setAction] = useState<Exclude<ChequeStatus, "Prepared"> | null>(null), [actionForm, setActionForm] = useState(newChequeAction);
  const [category, setCategory] = useState<ChequeCategory>("cq-document"), [files, setFiles] = useState<File[]>([]);
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({}), [printReady, setPrintReady] = useState(false);
  const busy = useRef(false), requestKey = useRef(""), fileInput = useRef<HTMLInputElement>(null);
  const isForm = mode === "new" || mode === "edit", allowedForm = mode === "new" ? create : update;
  const editable = doc?.lifecycleVersion === 1 && doc.status === "Prepared";
  const actions = doc ? chequeActions(doc, can) : [];
  const categories = useMemo(() => doc ? chequeEvidence(doc, can) : [], [doc, can]);
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && !loading && !loadError && printReady;
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
        if (isForm && result.lifecycleVersion === 1) setForm(chequeForm(result));
        if (!isForm) { const settings = await AccountingSettingsApi.get(); if (current) setCompany(settings); }
      } else if (current) {
        requestKey.current = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
        setDoc(null); setForm(newCheque());
      }
    }
    load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, isForm, allowedForm, query, reload]);
  useEffect(() => {
    if (mode !== "new" || !allowedForm) return;
    let current = true;
    setSourceLoading(true); setSourceError("");
    const timer = setTimeout(() => {
      api.sources(sourceQuery).then(result => { if (current) setSources(result); }).catch(error => { if (current) setSourceError(message(error)); })
        .finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [mode, allowedForm, sourceQuery]);
  useEffect(() => {
    setSource(null);
    if (!isForm || !allowedForm || !form.paymentVoucherId) return;
    let current = true;
    setSourceError("");
    api.source(form.paymentVoucherId).then(result => { if (current) setSource(result); }).catch(error => { if (current) setSourceError(message(error)); });
    return () => { current = false; };
  }, [isForm, allowedForm, form.paymentVoucherId, reload]);
  useEffect(() => { if (categories.length && !categories.includes(category)) setCategory(categories[0]); }, [categories, category]);
  async function run(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try { await work(); } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!allowedForm) return;
    if (!source) { setError("กรุณาเลือก PV และรอข้อมูลต้นทางให้โหลดสำเร็จ"); return; }
    await run(async () => {
      const result = mode === "edit" && recordId ? await api.update(recordId, form) : await api.create({ ...form, requestKey: requestKey.current });
      router.push(`${base}/${result.id}`);
    });
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!doc || !action) return;
    await run(async () => { await api.status(doc, action, actionForm); setAction(null); setReload(value => value + 1); });
  }
  async function evidence(removeId?: string) {
    if (!doc) return;
    await run(async () => {
      if (removeId) await api.deleteFile(doc, removeId); else await api.upload(doc, category, files);
      setDoc(await api.get(doc.id)); setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    });
  }
  if (isForm && !allowedForm) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไขเช็คจ่าย</p>;
  const draft = <K extends keyof ChequeInput>(key: K, value: ChequeInput[K]) => setForm(previous => ({ ...previous, [key]: value }));
  return <div className="cq-page mx-auto max-w-[1480px]">
    <ChequePaymentPrintStyles allowed={Boolean(printable)} />
    <header className="cq-no-print mb-5 flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-blue-600">Accounts Payable</p>
      <h1 className="text-2xl font-bold">{mode === "new" ? "สร้างเช็คจ่าย" : mode === "edit" ? "แก้ไขเช็คจ่าย" : doc?.cqNo || "การจ่ายเงิน / เช็คจ่าย (CQ)"}</h1>
      <p className="mt-1 text-sm text-gray-600">PV อนุมัติ วิธีเช็ค เต็มยอด · ส่งมอบ = PV จ่ายแล้ว · ไม่ลง GL</p></div>
      <nav className="flex flex-wrap gap-2"><Link className={button} href={mode === "list" ? "/ap/vouchers?tab=pv" : chequeList}>{mode === "list" ? "ใบสำคัญจ่าย PV" : "กลับทะเบียนเช็ค"}</Link>
        {mode === "list" && create && <Link className={primary} href={`${base}/new`}>สร้างเช็คจ่าย</Link>}
        {mode === "view" && editable && update && <Link className={button} href={`${base}/${doc?.id}/edit`}>แก้ไข</Link>}
        {mode === "view" && actions.map(value => <button className={value === "Cancelled" ? `${button} text-red-700` : button} disabled={loading || saving} key={value} onClick={() => { setAction(value); setActionForm(newChequeAction()); }}>{chequeActionLabels[value]}</button>)}
        {mode === "view" && doc?.lifecycleVersion === 1 && <button className={button} disabled={!printable || saving} onClick={() => window.print()}>พิมพ์ใบรายละเอียด</button>}
        <button className={button} disabled={saving} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button>
      </nav></header>
    {loading && <p className="cq-no-print" role="status">กำลังโหลด...</p>}
    {loadError && <p role="alert" className="cq-no-print rounded border border-red-300 bg-red-50 p-3 text-red-700">{loadError}</p>}
    {error && <p role="alert" className="cq-no-print mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</p>}
    {!loading && !loadError && mode === "list" && <section className="cq-no-print space-y-4 rounded border bg-white p-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, status: filter, page: "1" }); }}>
        <label className="min-w-0 flex-1">ค้นหา CQ / PV / เลขเช็ค / บัญชี / ผู้รับ<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={filter} onChange={event => setFilter(event.target.value)}><option value="">ทั้งหมด</option>{Object.entries(chequeStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className={`${primary} self-end`}>ค้นหา</button>
        <button type="button" className={`${button} self-end`} disabled={saving} onClick={() => void run(async () => exportCheques(await api.all(query)))}>CSV ทั้งหมดตามตัวกรอง</button>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["CQ / PV", "เลขเช็ค / บัญชี", "วันที่เช็ค", "ผู้รับ", "จำนวนเงิน", "สถานะ"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr className="border-t" key={row.id}><td className="p-2"><Link className="font-semibold text-blue-700 underline" href={`${base}/${row.id}`}>{row.cqNo}</Link><p>{row.pvNo || "-"}</p></td><td className="p-2">{row.chequeNo}<p>{row.bankName} {row.bankAccountNo || row.bankAccount}</p></td><td className="p-2">{date(row.chequeDate)}</td><td className="p-2">{row.payee}</td><td className="p-2 text-right">{money(row.amount)}</td><td className="p-2">{chequeStatuses[row.status] || row.status}{row.lifecycleVersion !== 1 && <p>Legacy อ่านอย่างเดียว</p>}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>ไม่พบเช็คจ่าย</p>}
      <div className="flex flex-wrap items-center gap-3"><span>{total} รายการ · หน้า {query.page} / {Math.max(1, pages)}</span><button className={button} disabled={Number(query.page) <= 1} onClick={() => setQuery({ ...query, page: String(Number(query.page) - 1) })}>ก่อนหน้า</button><button className={button} disabled={Number(query.page) >= pages} onClick={() => setQuery({ ...query, page: String(Number(query.page) + 1) })}>ถัดไป</button></div>
    </section>}
    {!loading && !loadError && isForm && (mode === "new" || editable) && <form onSubmit={save} className="cq-no-print space-y-4">
      <fieldset disabled={saving} className="grid min-w-0 gap-4 rounded border bg-white p-4 md:grid-cols-2">
        <label>วันที่เอกสาร *<DateInput required disabled={mode === "edit"} className={control} value={form.docDate} onChange={value => draft("docDate", value)} /></label>
        {mode === "new" ? <SearchableSelect label="PV อนุมัติ วิธีเช็ค" required value={form.paymentVoucherId} selectedLabel={source ? `${source.pvNo} · ${source.supplierSnapshot?.name || ""}` : undefined}
          options={sources.map(row => ({ value: row.id, label: `${row.pvNo} · ${row.supplierSnapshot?.name || ""} · ${money(row.netPayment)}` }))}
          onChange={value => draft("paymentVoucherId", value)} onSearch={setSourceQuery} loading={sourceLoading} error={sourceError} placeholder="เลือก PV ที่ยังไม่มีเช็ค" searchPlaceholder="ค้นหา PV / PS / ผู้รับเหมา" />
          : <p>PV: {doc?.pvNo} · ยอดเต็ม {money(doc?.amount)}</p>}
        <label>ธนาคารบริษัทผู้จ่าย *<input required maxLength={200} className={control} value={form.bankName} onChange={event => draft("bankName", event.target.value)} /></label>
        <label>สาขาธนาคาร *<input required maxLength={200} className={control} value={form.bankBranch} onChange={event => draft("bankBranch", event.target.value)} /></label>
        <label>เลขบัญชีบริษัท *<input required readOnly={mode === "edit"} maxLength={50} inputMode="numeric" className={control} value={form.bankAccountNo} onChange={event => draft("bankAccountNo", event.target.value)} /></label>
        <label>เลขเช็คธนาคาร *<input required readOnly={mode === "edit"} maxLength={50} className={control} value={form.chequeNo} onChange={event => draft("chequeNo", event.target.value)} /></label>
        <label>วันที่บนเช็ค *<DateInput required className={control} value={form.chequeDate} onChange={value => draft("chequeDate", value)} /></label>
        <label>ผู้รับเงินตามเช็ค *<input required maxLength={200} className={control} value={form.payee} onChange={event => draft("payee", event.target.value)} /></label>
        <label className="md:col-span-2">หมายเหตุ<textarea maxLength={1000} className={control} value={form.remark} onChange={event => draft("remark", event.target.value)} /></label>
        <p className="font-bold md:col-span-2">ยอดเช็คเต็ม PV: {money(source?.netPayment ?? doc?.amount)} บาท</p>
        <p className="text-sm text-gray-600 md:col-span-2">เลข CQ ออกตามเดือนวันที่เอกสาร · บัญชี/เลขเช็ค/PV/วันที่เอกสารเปลี่ยนไม่ได้หลังสร้าง ต้องยกเลิกแล้วออกใหม่ · เลขเช็คที่ยกเลิกแล้วห้ามใช้ซ้ำ · บัญชีนี้เป็นของบริษัท ไม่ใช่ Supplier</p>
        {sourceError && mode === "edit" && <p className="text-red-700 md:col-span-2" role="alert">{sourceError}</p>}
      </fieldset><button className={primary} disabled={saving || !source}>{saving ? "กำลังบันทึก..." : "บันทึกเตรียมเช็ค"}</button>
    </form>}
    {!loading && !loadError && mode === "edit" && !editable && <p role="alert">แก้ไขได้เฉพาะเช็คใหม่สถานะ Prepared</p>}
    {!loading && !loadError && mode === "view" && doc && <>
      <section className="cq-no-print mb-4 space-y-2 rounded border bg-white p-4">
        <p>สถานะ: <strong>{chequeStatuses[doc.status] || doc.status}</strong> · วันที่เอกสาร {date(doc.docDate)}</p>
        <p>PV: <Link className="text-blue-700 underline" href={`/ap/vouchers/pv/${doc.paymentVoucherId}`}>{doc.pvNo || doc.paymentVoucherId}</Link> · PS: {doc.voucherSnapshot?.sourceNo || "-"} · PO: {doc.voucherSnapshot?.poNo || "-"}</p>
        <p className="break-words">ธนาคาร {doc.bankName || "-"} · สาขา {doc.bankBranch || "-"} · บัญชี {doc.bankAccountNo || doc.bankAccount}</p>
        <p className="break-words">เลขเช็ค {doc.chequeNo} · วันที่บนเช็ค {date(doc.chequeDate)} · ผู้รับ {doc.payee} · <strong>{money(doc.amount)} บาท</strong></p>
        <p>พิมพ์เช็ค {date(doc.printedAt)} · ลงนาม {date(doc.signedAt)} โดย {doc.signer || "-"} · ส่งมอบ {date(doc.releaseDate)} ให้ {doc.recipient || "-"}</p>
        <p className="break-words">ตัดบัญชี {date(doc.clearedAt)} · อ้างอิง {doc.clearingReference || "-"}</p>
        {doc.cancelledAt && <p className="break-words text-red-700">ยกเลิก/กลับรายการ {date(doc.cancelledAt)} · {doc.cancellationReason} · อ้างอิง {doc.reversalReference || "-"}{doc.releaseDate ? " · PV ถูกยกเลิก/กลับรายการแล้ว ไม่เปิดจ่ายซ้ำ" : " · PV ยังรอจ่าย ออกเช็คเลขใหม่ได้"}</p>}
        <p className="whitespace-pre-wrap break-words">หมายเหตุ: {doc.remark || "-"}</p>
        <p className="text-sm text-gray-600">พิมพ์ใบรายละเอียดไม่เปลี่ยนสถานะเช็ค · ไม่ใช่พิมพ์ลงเช็คธนาคารจริง · ส่งมอบจึงถือว่า PV จ่ายแล้ว</p>
        {doc.lifecycleVersion !== 1 && <p role="alert">Legacy อ่านอย่างเดียว ไม่เปลี่ยนยอด/สถานะ/เลขย้อนหลังอัตโนมัติ</p>}
      </section>
      <section className="cq-no-print mb-4 space-y-3 rounded border bg-white p-4"><h2 className="font-bold">เอกสารแนบ / หลักฐานเช็ค</h2>
        {doc.attachments.map(file => <div key={file.id} className="flex flex-wrap items-center gap-3"><a className="break-all text-blue-700 underline" href={file.fileUrl} target="_blank" rel="noreferrer">{chequeEvidenceLabels[file.category] || file.category}: {file.originalName}</a>
          {categories.includes(file.category) && <button className={button} disabled={saving} onClick={() => { if (window.confirm("ยืนยันลบหลักฐานนี้?")) void evidence(file.id); }}>ลบหลักฐาน</button>}</div>)}
        {!doc.attachments.length && <p>ยังไม่มีไฟล์แนบ</p>}
        {categories.length > 0 && <div className="grid gap-3 md:grid-cols-2"><label>ประเภทหลักฐาน<select className={control} value={category} onChange={event => setCategory(event.target.value as ChequeCategory)}>{categories.map(value => <option key={value} value={value}>{chequeEvidenceLabels[value]}</option>)}</select></label>
          <label>เลือกไฟล์ PDF / JPG / PNG<input type="file" className={`${control} text-sm`} ref={fileInput} multiple accept=".pdf,.jpg,.jpeg,.png" onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
          <button className={`${button} justify-self-start`} disabled={saving || !files.length} onClick={() => void evidence()}>แนบหลักฐานเช็ค</button></div>}
        <p className="text-sm text-gray-600">แนบหลักฐานตามขั้นก่อนดำเนินการ; หลักฐานขั้นที่ผ่านแล้วแก้ไม่ได้ การกลับรายการต้องตรวจการคืนเช็ค/หยุดจ่าย/คืนเงินจริงภายนอกให้เสร็จก่อน</p>
      </section>
      {action && <form onSubmit={execute} className="cq-no-print mb-4 grid min-w-0 gap-3 rounded border border-amber-300 bg-amber-50 p-4 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">ยืนยัน{chequeActionLabels[action]} {doc.cqNo}</h2>
        <p className="text-sm md:col-span-2">บันทึกการดำเนินการที่ทำจริงภายนอก ระบบไม่สั่งพิมพ์เช็ค ลงนาม ส่งเงิน หรือหยุดจ่ายผ่านธนาคาร</p>
        {action === "Printed" && <label>วันที่พิมพ์เช็คจริง *<DateInput required className={control} value={actionForm.printedDate} onChange={value => setActionForm({ ...actionForm, printedDate: value })} /></label>}
        {action === "Signed" && <><label>วันที่ลงนาม *<DateInput required className={control} value={actionForm.signedDate} onChange={value => setActionForm({ ...actionForm, signedDate: value })} /></label>
          <label>ชื่อผู้ลงนาม *<input required maxLength={200} className={control} value={actionForm.signer} onChange={event => setActionForm({ ...actionForm, signer: event.target.value })} /></label></>}
        {action === "Released" && <><label>วันที่ส่งมอบ *<DateInput required className={control} value={actionForm.releaseDate} onChange={value => setActionForm({ ...actionForm, releaseDate: value })} /></label>
          <label>ชื่อผู้รับเช็ค *<input required maxLength={200} className={control} value={actionForm.recipient} onChange={event => setActionForm({ ...actionForm, recipient: event.target.value })} /></label>
          <p className="text-sm md:col-span-2">ต้องแนบหลักฐานส่งมอบก่อน · เมื่อยืนยัน PV จะเป็นจ่ายแล้ว · ส่งมอบเช็คลงวันที่ล่วงหน้าได้</p></>}
        {action === "Cleared" && <><label>วันที่ตัดบัญชี *<DateInput required className={control} value={actionForm.clearedDate} onChange={value => setActionForm({ ...actionForm, clearedDate: value })} /></label>
          <label>เลขอ้างอิงตัดบัญชี *<input required maxLength={200} className={control} value={actionForm.clearingReference} onChange={event => setActionForm({ ...actionForm, clearingReference: event.target.value })} /></label>
          <p className="text-sm md:col-span-2">ต้องมีหลักฐานธนาคาร · วันที่ไม่ก่อนส่งมอบและวันที่บนเช็ค · ไม่บันทึกจ่าย PV ซ้ำ</p></>}
        {action === "Cancelled" && <><label>วันที่ยกเลิก / กลับรายการ *<DateInput required className={control} value={actionForm.cancelledDate} onChange={value => setActionForm({ ...actionForm, cancelledDate: value })} /></label>
          {doc.releaseDate && <label>เลขอ้างอิงกลับรายการ *<input required maxLength={200} className={control} value={actionForm.reversalReference} onChange={event => setActionForm({ ...actionForm, reversalReference: event.target.value })} /></label>}
          <label className="md:col-span-2">เหตุผลยกเลิก *<textarea required maxLength={1000} className={control} value={actionForm.reason} onChange={event => setActionForm({ ...actionForm, reason: event.target.value })} /></label>
          <p className="text-sm md:col-span-2">{doc.releaseDate ? "ต้องแนบหลักฐานกลับรายการ · ยกเลิกเช็คและกลับรายการ/ยกเลิก PV พร้อมกัน ปลด PS ให้ทำ PV ใหม่ ไม่คืนวงเงิน PO" : "ก่อนส่งมอบ: ยกเลิกเช็คแล้ว PV ยังรอจ่าย ออกเช็คเลขใหม่ได้"} · เลขเช็คยกเลิกห้ามใช้ซ้ำ</p></>}
        <div className="flex flex-wrap gap-3 md:col-span-2"><button className={primary} disabled={saving}>ยืนยัน{chequeActionLabels[action]}</button><button type="button" className={button} disabled={saving} onClick={() => setAction(null)}>ปิด</button></div>
      </form>}
      <section className="cq-no-print mb-4 rounded border bg-white p-4"><h2 className="mb-3 font-bold">ประวัติเช็ค</h2><ol className="space-y-2 text-sm">{doc.history?.map(row => <li className="break-words border-b pb-2" key={row.id}>{formatAccountingDateTime(row.createdAt)} · {row.performedBy?.fullName || "-"} · {row.action}{row.reason ? ` · ${row.reason}` : ""}</li>)}</ol></section>
      {doc.lifecycleVersion === 1 && <div className="cq-preview overflow-x-auto rounded border bg-white"><ChequePaymentDocument document={doc} company={company} onReady={setPrintReady} /></div>}
    </>}
  </div>;
}
