"use client";
import { ManualSubmitForm } from "@/components/manual-submit-form";
import { AccountingApprovalPanel } from "@/components/accounting-approval-panel";
import { legacyApprovalControlVisible } from "@/lib/accounting-approval";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountingSettingsApi } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import { ContractorPaymentInformation } from "@/components/ap-document-information";
import { useAccountingDocumentPrint } from "@/components/use-accounting-document-print";
import {
  ContractorPaymentsApi as api, paymentBase as base, paymentList, paymentStatuses, paymentActions,
  newPayment, newPaymentLine, paymentForm, paymentPreview,
  type ContractorPayment, type PaymentInput, type PaymentLine, type PaymentSource, type PaymentAction,
} from "@/lib/contractor-payment";

const control = "w-full min-w-0 rounded-md border bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";

export function ContractorPayments({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const access = useAccountingAccess();
  const canCreate = canUseAccounting(access, "ap", "create"), canEdit = canUseAccounting(access, "ap", "update");
  const canApprove = canUseAccounting(access, "ap", "approve"), canCancel = canUseAccounting(access, "ap", "cancel");
  const [doc, setDoc] = useState<ContractorPayment | null>(null);
  const [form, setForm] = useState<PaymentInput>(newPayment);
  const [rows, setRows] = useState<ContractorPayment[]>([]);
  const [query, setQuery] = useState({ q: "", status: "", page: "1", pageSize: "20" });
  const [search, setSearch] = useState(""), [status, setStatus] = useState("");
  const [total, setTotal] = useState(0), [pages, setPages] = useState(0);
  const [source, setSource] = useState<PaymentSource | null>(null), [sources, setSources] = useState<PaymentSource[]>([]);
  const [sourceQuery, setSourceQuery] = useState(""), [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [reload, setReload] = useState(0);
  const [action, setAction] = useState<PaymentAction | null>(null), [reason, setReason] = useState("");
  const [chainManaged, setChainManaged] = useState(false);
  const print = useAccountingDocumentPrint(doc);
  const busy = useRef(false), requestKey = useRef("");
  const isForm = mode === "new" || mode === "edit";
  const allowedForm = mode === "new" ? canCreate : canEdit;
  const editable = doc?.lifecycleVersion === 1 && ["draft", "returned"].includes(doc.status);
  const totals = paymentPreview(form, source?.vatConfig || doc?.vatConfig || "NO_VAT");
  const printable = mode === "view" && doc?.lifecycleVersion === 1 && !loading && !loadError;
  useEffect(() => {
    if (isForm && !allowedForm) return;
    let current = true;
    setLoading(true); setLoadError(""); setError(""); setAction(null);
    async function load() {
      if (mode === "list") {
        const result = await api.list(query);
        if (current) { setRows(result.data); setTotal(result.total); setPages(result.totalPages); }
      } else if (recordId) {
        const result = await api.get(recordId);
        if (!current) return;
        setDoc(result);
        if (isForm) setForm(paymentForm(result));
      } else if (current) {
        requestKey.current = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
        setDoc(null); setForm(newPayment());
      }
    }
    load().catch(error => { if (current) setLoadError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, query, reload, isForm, allowedForm]);
  useEffect(() => {
    if (!isForm || !allowedForm || mode !== "new") return;
    let current = true;
    setSourceLoading(true); setSourceError("");
    const timer = setTimeout(() => {
      api.sources(sourceQuery).then(rows => { if (current) setSources(rows); })
        .catch(error => { if (current) setSourceError(message(error)); }).finally(() => { if (current) setSourceLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [isForm, allowedForm, mode, sourceQuery]);
  useEffect(() => {
    if (!isForm || !allowedForm || !form.poId) { setSource(null); return; }
    let current = true;
    setSource(null); setSourceError("");
    api.source(form.poId).then(result => {
      if (!current) return;
      setSource(result);
      if (mode === "new") setForm(previous => ({ ...previous, paymentRound: result.nextRound || 1 }));
    }).catch(error => { if (current) setSourceError(message(error)); });
    return () => { current = false; };
  }, [form.poId, isForm, allowedForm, mode, reload]);
  function patchLine(index: number, change: Partial<PaymentLine>) {
    setForm(previous => ({ ...previous, items: previous.items.map((row, i) => i === index ? { ...row, ...change } : row) }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !allowedForm) return;
    if (!source) { setError("กรุณาเลือก PO และรอโหลดข้อมูลให้สำเร็จ"); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = mode === "edit" && recordId ? await api.update(recordId, form) : await api.create({ ...form, requestKey: requestKey.current });
      router.push(`${base}/${result.id}`);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!doc || !action || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      await api.action(doc.id, action, doc.updatedAt, reason);
      setReason(""); setAction(null); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  if (isForm && !allowedForm) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไข PS</p>;
  const ownDocument = doc?.createdById === getStoredUser()?.id;
  const actions: PaymentAction[] = [];
  if (mode === "view" && doc?.lifecycleVersion === 1) {
    if (editable && canCreate) actions.push("submit");
    if (doc.status === "pending" && canApprove) {
      if (!ownDocument) actions.push("approve");
      actions.push("return", "reject");
    }
    if (["draft", "returned", "pending", "approved"].includes(doc.status) && canCancel) actions.push("cancel");
  }
  const visibleActions = actions.filter(value => legacyApprovalControlVisible(value, chainManaged));
  return <div className="ps-page mx-auto max-w-370">
    {print.error && <p role="alert" className="ps-no-print rounded bg-red-50 p-3 text-red-700">{print.error}</p>}
    <header className="ps-no-print mb-5 flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-600">Accounts Payable</p><h1 className="text-2xl font-bold">{mode === "new" ? "สร้างใบเบิกจ่ายผู้รับเหมา" : mode === "edit" ? "แก้ไข PS" : doc?.psNo || "ใบเบิกจ่ายผู้รับเหมา (PS)"}</h1>
        <p className="mt-1 text-sm text-gray-600">เบิกเป็นงวดตาม PO · กันวงเงินเมื่อส่งอนุมัติ · ไม่ใช่หลักฐานจ่ายเงินจริง</p></div>
      <nav className="flex flex-wrap gap-2">
        <Link className={button} href={mode === "list" ? "/ap/vouchers" : paymentList}>{mode === "list" ? "ใบสั่งซื้อ PO" : "กลับรายการ PS"}</Link>
        {mode === "list" && canCreate && <Link className={primary} href={`${base}/new`}>สร้าง PS</Link>}
        {mode === "view" && doc && editable && canEdit && <Link className={button} href={`${base}/${doc.id}/edit`}>แก้ไข</Link>}
        {visibleActions.map(value => <button className={value === "cancel" ? `${button} text-red-700` : button} key={value} disabled={loading || saving} onClick={() => { setAction(value); setReason(""); }}>{paymentActions[value]}</button>)}
        {mode === "view" && doc?.lifecycleVersion === 1 && <button className={button} disabled={!printable || saving || print.printing} onClick={() => void print.requestPrint(async onReady => {
          const [module, company] = await Promise.all([import("@/components/contractor-payment-document"), AccountingSettingsApi.get()]);
          return <><module.ContractorPaymentPrintStyles allowed /><module.ContractorPaymentDocument document={doc} company={company} onReady={onReady} /></>;
        })}>{print.printing ? "กำลังเตรียมเอกสาร..." : "พิมพ์ PS"}</button>}
        {mode !== "list" && <button className={button} disabled={saving} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button>}
      </nav>
    </header>
    {loading && <p className="ps-no-print" role="status">กำลังโหลด...</p>}
    {loadError && <p className="ps-no-print rounded border border-red-300 bg-red-50 p-3 text-red-700" role="alert">{loadError}</p>}
    {error && <p className="ps-no-print mb-3 rounded border border-red-300 bg-red-50 p-3 text-red-700" role="alert">{error}</p>}
    {!loading && !loadError && mode === "list" && <section className="ps-no-print space-y-4 rounded-lg border bg-white p-4">
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, status, page: "1" }); }}>
        <label className="min-w-0 flex-1">ค้นหา PS / PO / ผู้รับเหมา<input className={control} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>สถานะ<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">ทั้งหมด</option>{Object.entries(paymentStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <button className={`${primary} self-end`}>ค้นหา</button>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["เลข PS", "วันที่", "PO / รอบ", "ผู้รับเหมา", "ก่อน VAT", "สุทธิ", "สถานะ"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr className="border-t" key={row.id}><td className="p-2"><Link className="font-semibold text-blue-700 underline" href={`${base}/${row.id}`}>{row.psNo}</Link></td><td className="p-2">{formatAccountingDate(row.docDate)}</td><td className="p-2">{row.poNo || row.poId} / {row.paymentRound}</td><td className="p-2">{row.supplierSnapshot?.name || "-"}</td><td className="p-2 text-right">{money(row.currentRequestAmount)}</td><td className="p-2 text-right">{money(row.netAmount)}</td><td className="p-2">{paymentStatuses[row.status] || row.status}{row.lifecycleVersion !== 1 ? " (Legacy)" : ""}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>ไม่พบใบเบิกจ่ายผู้รับเหมา</p>}
      <div className="flex flex-wrap items-center gap-3"><span>{total} รายการ · หน้า {query.page} / {Math.max(1, pages)}</span><button className={button} disabled={Number(query.page) <= 1} onClick={() => setQuery({ ...query, page: String(Number(query.page) - 1) })}>ก่อนหน้า</button><button className={button} disabled={Number(query.page) >= pages} onClick={() => setQuery({ ...query, page: String(Number(query.page) + 1) })}>ถัดไป</button></div>
    </section>}
    {!loading && !loadError && isForm && (mode === "new" || editable) && <ManualSubmitForm onSubmit={save} className="ps-no-print space-y-5">
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <label>วันที่เอกสาร *<DateInput required value={form.docDate} onChange={docDate => setForm({ ...form, docDate })} className={control} /></label>
        {mode === "new" ? <SearchableSelect label="PO" required value={form.poId} selectedLabel={source ? `${source.poNo} · ${source.supplier.name}` : undefined}
          options={sources.map(po => ({ value: po.id, label: `${po.poNo} · ${po.supplier.name}` }))} onChange={poId => setForm({ ...form, poId })}
          onSearch={setSourceQuery} loading={sourceLoading} error={sourceError} placeholder="เลือกใบสั่งซื้อ" searchPlaceholder="ค้นหาเลข PO หรือผู้รับเหมา" />
          : <div><p>PO: {doc?.poNo}</p><p>ผู้รับเหมา: {doc?.supplierSnapshot?.name}</p></div>}
        <label>รอบเบิก *<input type="number" min="1" max="999999" step="1" required disabled={mode === "edit"} className={control} value={form.paymentRound} onChange={event => setForm({ ...form, paymentRound: event.target.value })} /></label>
        <div className="rounded border bg-blue-50 p-3 text-sm"><p>วงเงินก่อน VAT: {money(source?.before || 0)}</p><p>กันวงเงินแล้ว: {money(source?.used?.before || 0)}</p><p>คงเหลือให้ส่งอนุมัติ: {money((source?.before || 0) - (source?.used?.before || 0))}</p><p>เงินประกันสะสม: {money(source?.used?.retention || 0)}</p></div>
        <p className="text-sm text-gray-600 md:col-span-2">รอบซ้ำไม่ได้แม้ใบเดิมยกเลิก · Draft ไม่กันวงเงิน · ยอดจะตรวจอีกครั้งตอนส่ง/อนุมัติ</p>
        {sourceError && mode === "edit" && <p role="alert" className="text-red-700 md:col-span-2">{sourceError}</p>}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4"><h2 className="font-bold">รายการเบิก (ก่อน VAT)</h2>
        {form.items.map((row, index) => <fieldset className="grid min-w-0 gap-3 rounded border p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" key={index}>
          <legend className="px-1 text-sm">รายการ {index + 1}</legend>
          <label>รายละเอียด *<textarea required maxLength={500} className={control} value={row.desc} onChange={event => patchLine(index, { desc: event.target.value })} /></label>
          <label>จำนวนเงิน *<input type="number" min="0.01" max="9999999999.99" step="0.01" required className={control} value={row.amount} onChange={event => patchLine(index, { amount: event.target.value })} /></label>
          <label>หมายเหตุรายการ<input maxLength={300} className={control} value={row.remark || ""} onChange={event => patchLine(index, { remark: event.target.value })} /></label>
          <button type="button" className={`${button} self-end justify-self-start text-red-700`} disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>ลบรายการ {index + 1}</button>
        </fieldset>)}
        <button type="button" className={button} disabled={form.items.length >= 200} onClick={() => setForm({ ...form, items: [...form.items, newPaymentLine()] })}>เพิ่มรายการ</button>
      </section>
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <label>หัก ณ ที่จ่าย (%)<input type="number" min="0" max="100" step="0.01" required className={control} value={form.whtRate} onChange={event => setForm({ ...form, whtRate: event.target.value })} /></label>
        <label>เงินประกันผลงาน (%)<input type="number" min="0" max="100" step="0.01" required className={control} value={form.retentionRate} onChange={event => setForm({ ...form, retentionRate: event.target.value })} /></label>
        <label className="md:col-span-2">หมายเหตุ<textarea maxLength={1000} className={control} value={form.remark || ""} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
        <div className="space-y-1 rounded bg-gray-50 p-3 md:col-span-2">{[["ก่อน VAT", totals.before], ["VAT ตาม PO", totals.vat], ["หัก ณ ที่จ่าย", totals.wht], ["เงินประกัน", totals.retention], ["ยอดสุทธิเบิกจ่าย", totals.net]].map(([label, value]) => <p className="flex justify-between gap-3" key={label}><span>{label}</span><strong>{money(value)}</strong></p>)}</div>
        <p className="text-sm text-gray-600 md:col-span-2">WHT และเงินประกันคิดจากยอดก่อน VAT · ยังไม่ทำคืนเงินประกัน/GL/จ่ายเงินจริง</p>
      </section>
      <button className={primary} disabled={saving || !source}>{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button>
    </ManualSubmitForm>}
    {!loading && !loadError && mode === "edit" && !editable && <p role="alert">แก้ไขได้เฉพาะ PS ใหม่สถานะ Draft / ส่งกลับ</p>}
    {!loading && !loadError && mode === "view" && doc && <>
      <div className="ps-no-print mb-4 empty:hidden"><AccountingApprovalPanel docType="ps" hideWhenEmpty document={doc} canSubmit={canCreate} onChanged={() => setReload(value => value + 1)} onModeChange={setChainManaged} /></div>
      <section className="ps-no-print mb-4 space-y-2 rounded border bg-white p-4"><p>สถานะ: <strong>{paymentStatuses[doc.status] || doc.status}</strong> · รอบ {doc.paymentRound}</p>
        <p>ยอดสะสม/คงเหลือบนเอกสารเป็นข้อมูล ณ บันทึกหรือส่ง/อนุมัติครั้งล่าสุด ไม่ใช่ยอดคงเหลือสด</p>
        {ownDocument && doc.status === "pending" && <p className="text-amber-800">ผู้สร้างไม่สามารถอนุมัติใบตัวเองได้ ต้องให้ผู้อนุมัติอีกคนดำเนินการ</p>}
        {doc.lifecycleVersion !== 1 && <p role="alert" className="text-amber-800">Legacy: อ่านอย่างเดียว ไม่เปลี่ยนยอด/อนุมัติ/ยกเลิกอัตโนมัติ ต้องตรวจข้อมูลก่อนย้ายระบบ</p>}
      </section>
      {action && <ManualSubmitForm onSubmit={execute} className="ps-no-print mb-4 space-y-3 rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="font-bold">ยืนยัน{paymentActions[action]} {doc.psNo}</h2>
        <label>เหตุผล {["return", "reject", "cancel"].includes(action) ? "*" : "(ถ้ามี)"}<textarea autoFocus maxLength={1000} required={["return", "reject", "cancel"].includes(action)} className={control} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="flex gap-3"><button className={primary} disabled={saving}>ยืนยัน{paymentActions[action]}</button><button type="button" className={button} disabled={saving} onClick={() => setAction(null)}>ปิด</button></div>
      </ManualSubmitForm>}
      <ContractorPaymentInformation document={doc} />
      <details className="ps-no-print my-5 rounded-xl border bg-white p-5"><summary className="mb-3 cursor-pointer font-bold">ประวัติเอกสาร ({doc.history?.length || 0})</summary>
        <ol className="space-y-2 text-sm">{doc.history?.map(row => <li key={row.id} className="border-b pb-2">{formatAccountingDateTime(row.createdAt)} · {row.performedBy?.fullName || "-"} · {paymentActions[row.action as PaymentAction] || row.action}{row.reason ? ` · ${row.reason}` : ""}</li>)}</ol>
      </details>
      {print.printContent}
    </>}
  </div>;
}
