"use client";
import { ManualSubmitForm } from "@/components/manual-submit-form";

import { useEffect, useRef, useState } from "react";
import { AccountingLookupApi, SupplierBillsApi as api } from "@/lib/api";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "./accounting-access-provider";
import { DateInput } from "./date-input";
import { SearchableSelect } from "./searchable-select";
import { formatAccountingDate as date, formatAccountingDateTime } from "@/lib/accounting-date";
import { localAccountingDate } from "@/lib/stock-card";
import type { PurchaseOrderSupplier } from "@/lib/accounting-purchase-orders";
import {
  billPreview, centsText, computedDueDate, defaultSettlementAmount, newSupplierBillForm, supplierBillForm, supplierBillFormError,
  supplierBillHistoryLabels, supplierBillPayload, supplierBillPaymentLabels, supplierBillStatusLabels, supplierBillVatLabels,
  type SettlementVoucher, type SupplierBill, type SupplierBillDetail, type SupplierBillForm, type SupplierBillStatus, type SupplierBillVatMode,
} from "@/lib/supplier-bill";

const control = "w-full min-w-0 rounded-md border bg-white px-3 py-2";
const button = "inline-flex items-center justify-center rounded-md border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const primary = `${button} !bg-blue-600 text-white`;
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้";
const newKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
  : `sb-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
type View = { mode: "list" } | { mode: "new" } | { mode: "edit"; bill: SupplierBill } | { mode: "view"; id: string };
type Supplier = PurchaseOrderSupplier & { paymentTerm?: number | null };
type Action = { kind: "cancel" | "due" | "settle" } | { kind: "void"; settlementId: string } | null;

export function SupplierBills() {
  const access = useAccountingAccess();
  const can = {
    view: canUseAccounting(access, "ap", "view"), create: canUseAccounting(access, "ap", "create"), update: canUseAccounting(access, "ap", "update"),
    approve: canUseAccounting(access, "ap", "approve"), cancel: canUseAccounting(access, "ap", "cancel"), pay: canUseAccounting(access, "ap", "pay"),
  };
  const [view, setView] = useState<View>({ mode: "list" });
  if (!can.view) return <p className="rounded bg-amber-50 p-4 text-amber-900">ไม่มีสิทธิ์ดูทะเบียนใบแจ้งหนี้ผู้ขาย</p>;
  return <main className="mx-auto max-w-370 space-y-4">
    <header>
      <p className="text-xs font-bold uppercase text-[#0866ff]">Accounts Payable · Supplier Bills</p>
      <h1 className="mt-1 text-2xl font-bold">ทะเบียนใบแจ้งหนี้ผู้ขาย / ตั้งหนี้เจ้าหนี้</h1>
      <p className="mt-1 text-sm text-gray-600">หนี้เจ้าหนี้เกิดจากใบแจ้งหนี้/ใบกำกับภาษีของผู้ขายที่ยืนยันแล้วเท่านั้น (PO เป็นยอดผูกพัน ไม่ใช่หนี้) · ตัดชำระด้วย PV ที่จ่ายจริงแล้ว · ไม่ลงบัญชีแยกประเภทอัตโนมัติ</p>
    </header>
    {view.mode === "list" && <BillList can={can} onOpen={id => setView({ mode: "view", id })} onNew={() => setView({ mode: "new" })} />}
    {(view.mode === "new" || view.mode === "edit") && <BillEditor bill={view.mode === "edit" ? view.bill : null}
      onCancel={() => setView(view.mode === "edit" ? { mode: "view", id: view.bill.id } : { mode: "list" })}
      onSaved={bill => setView({ mode: "view", id: bill.id })} />}
    {view.mode === "view" && <BillDetail id={view.id} can={can} onBack={() => setView({ mode: "list" })}
      onEdit={bill => setView({ mode: "edit", bill })} />}
  </main>;
}

function BillList({ can, onOpen, onNew }: { can: Record<string, boolean>; onOpen: (id: string) => void; onNew: () => void }) {
  const [rows, setRows] = useState<SupplierBill[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [status, setStatus] = useState<SupplierBillStatus | "">(""), [applied, setApplied] = useState({ q: "", status: "" });
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    const params: Record<string, string> = {};
    if (applied.q) params.q = applied.q;
    if (applied.status) params.status = applied.status;
    api.list(params).then(result => { if (current) setRows(result); })
      .catch(err => { if (current) setError(message(err)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [applied]);
  return <section className="space-y-3">
    <form className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); setApplied({ q: search.trim(), status }); }}>
      <label className="sm:col-span-2">ค้นหาเลขที่ตั้งหนี้ / ใบแจ้งหนี้ / ใบกำกับภาษี / ผู้ขาย
        <input className={control} value={search} maxLength={100} onChange={event => setSearch(event.target.value)} />
      </label>
      <label>สถานะ
        <select className={control} value={status} onChange={event => setStatus(event.target.value as SupplierBillStatus | "")}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(supplierBillStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button className={button}>ค้นหา</button>
        {can.create && <button type="button" className={primary} onClick={onNew}>บันทึกใบแจ้งหนี้ผู้ขาย</button>}
      </div>
    </form>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {loading ? <p className="p-8 text-center">กำลังโหลด...</p> : !rows.length ? <p className="p-8 text-center">ไม่มีใบแจ้งหนี้ผู้ขาย</p>
      : <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
        <thead className="border-b bg-[#f8faf7]"><tr>
          {["เลขที่ตั้งหนี้", "ผู้ขาย", "เลขที่ใบแจ้งหนี้", "วันที่ใบแจ้งหนี้", "ครบกำหนด", "ยอดตามบิล", "คงค้าง", "สถานะ"].map(label =>
            <th key={label} className="p-3">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map(bill => <tr key={bill.id} className="cursor-pointer border-b hover:bg-gray-50" onClick={() => onOpen(bill.id)}>
          <td className="p-3 font-semibold text-blue-700">{bill.billNo}</td>
          <td className="p-3">{bill.supplierSnapshot?.name}</td>
          <td className="p-3">{bill.supplierInvoiceNo}{bill.taxInvoiceNo ? ` / ${bill.taxInvoiceNo}` : ""}</td>
          <td className="p-3">{date(bill.supplierInvoiceDate)}</td>
          <td className="p-3">{date(bill.dueDate)}</td>
          <td className="p-3 text-right tabular-nums">{money(bill.netAmount)}</td>
          <td className="p-3 text-right tabular-nums">{bill.status === "confirmed" ? money(bill.outstandingAmount) : "-"}</td>
          <td className="p-3">{supplierBillStatusLabels[bill.status]}{bill.paymentState ? ` · ${supplierBillPaymentLabels[bill.paymentState]}` : ""}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}

function BillEditor({ bill, onCancel, onSaved }: { bill: SupplierBill | null; onCancel: () => void; onSaved: (bill: SupplierBill) => void }) {
  const [form, setForm] = useState<SupplierBillForm>(() => bill ? supplierBillForm(bill) : newSupplierBillForm(localAccountingDate()));
  const [suppliers, setSuppliers] = useState<Supplier[]>([]), [lookupError, setLookupError] = useState(""), [lookupLoading, setLookupLoading] = useState(true);
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const requestKey = useRef(newKey());
  useEffect(() => {
    let current = true;
    AccountingLookupApi.getSuppliers().then(result => { if (current) setSuppliers(result as Supplier[]); })
      .catch(err => { if (current) setLookupError(message(err)); })
      .finally(() => { if (current) setLookupLoading(false); });
    return () => { current = false; };
  }, []);
  const set = (patch: Partial<SupplierBillForm>) => setForm(value => ({ ...value, ...patch }));
  const preview = billPreview(form.items, form.vatMode), autoDue = computedDueDate(form);
  async function save() {
    const invalid = supplierBillFormError(form);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError("");
    try {
      const payload = supplierBillPayload(form);
      onSaved(bill ? await api.update(bill.id, { ...payload, revision: bill.revision }) : await api.create({ ...payload, requestKey: requestKey.current }));
    } catch (err) { setError(message(err)); } finally { setSaving(false); }
  }
  return <ManualSubmitForm className="space-y-4 rounded border bg-white p-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <h2 className="text-lg font-bold">{bill ? `แก้ไขร่าง ${bill.billNo}` : "บันทึกใบแจ้งหนี้ผู้ขาย (ร่าง)"}</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <SearchableSelect label="ผู้ขาย" required value={form.supplierId} loading={lookupLoading} error={lookupError}
          selectedLabel={bill && form.supplierId === bill.supplierId ? `${bill.supplierSnapshot.code} ${bill.supplierSnapshot.name}` : undefined}
          options={suppliers.map(item => ({ value: item.id, label: `${item.code} ${item.name}${item.taxId ? ` (${item.taxId})` : ""}` }))}
          placeholder="เลือกผู้ขาย" searchPlaceholder="ค้นหารหัส / ชื่อ / เลขผู้เสียภาษี"
          onChange={supplierId => {
            const supplier = suppliers.find(item => item.id === supplierId);
            set({ supplierId, ...(supplier && !form.manualDueDate ? { creditTermDays: String(supplier.paymentTerm ?? 0) } : {}) });
          }} />
      </div>
      <label>เลขที่ใบแจ้งหนี้ผู้ขาย *<input className={control} required maxLength={100} value={form.supplierInvoiceNo} onChange={event => set({ supplierInvoiceNo: event.target.value })} /></label>
      <label>วันที่ใบแจ้งหนี้ผู้ขาย *<DateInput required className={control} value={form.supplierInvoiceDate} onChange={supplierInvoiceDate => set({ supplierInvoiceDate })} /></label>
      <label>รูปแบบ VAT
        <select className={control} value={form.vatMode} onChange={event => set({ vatMode: event.target.value as SupplierBillVatMode })}>
          {Object.entries(supplierBillVatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>เลขที่ใบกำกับภาษี{form.vatMode === "VAT7" ? " *" : ""}<input className={control} maxLength={100} value={form.taxInvoiceNo} onChange={event => set({ taxInvoiceNo: event.target.value })} /></label>
      <label>วันที่ใบกำกับภาษี<DateInput className={control} value={form.taxInvoiceDate} onChange={taxInvoiceDate => set({ taxInvoiceDate })} /></label>
      <label>เครดิต (วัน)<input className={control} inputMode="numeric" value={form.creditTermDays} placeholder="ตามข้อมูลผู้ขาย" onChange={event => set({ creditTermDays: event.target.value })} /></label>
      <label className="flex items-center gap-2 self-end"><input type="checkbox" checked={form.manualDueDate}
        onChange={event => set({ manualDueDate: event.target.checked, dueDate: form.dueDate || autoDue })} />แก้ไขวันครบกำหนดเอง</label>
      <label>วันครบกำหนด
        {form.manualDueDate ? <DateInput required className={control} value={form.dueDate} onChange={dueDate => set({ dueDate })} />
          : <input className={control} readOnly value={autoDue ? `${date(autoDue)} (วันที่ใบแจ้งหนี้ + เครดิต)` : "คำนวณจากเครดิตผู้ขายเมื่อบันทึก"} />}
      </label>
      <label>อ้างอิง (PO/GR)<input className={control} maxLength={200} value={form.reference} onChange={event => set({ reference: event.target.value })} /></label>
    </div>
    <table className="w-full text-left text-sm">
      <thead><tr><th className="p-2">รายการ</th><th className="w-48 p-2 text-right">จำนวนเงิน (ก่อน VAT)</th><th className="w-20" /></tr></thead>
      <tbody>{form.items.map((item, index) => <tr key={index} className="border-t">
        <td className="p-2"><input className={control} required maxLength={500} value={item.desc}
          onChange={event => set({ items: form.items.map((row, at) => at === index ? { ...row, desc: event.target.value } : row) })} /></td>
        <td className="p-2"><input className={`${control} text-right`} required inputMode="decimal" value={item.amount}
          onChange={event => set({ items: form.items.map((row, at) => at === index ? { ...row, amount: event.target.value } : row) })} /></td>
        <td className="p-2"><button type="button" className={button} disabled={form.items.length === 1}
          onClick={() => set({ items: form.items.filter((_row, at) => at !== index) })}>ลบ</button></td>
      </tr>)}</tbody>
    </table>
    <button type="button" className={button} disabled={form.items.length >= 200} onClick={() => set({ items: [...form.items, { desc: "", amount: "" }] })}>เพิ่มรายการ</button>
    <dl className="ml-auto grid max-w-sm grid-cols-2 gap-1 text-sm">
      <dt>ยอดก่อน VAT</dt><dd className="text-right tabular-nums">{centsText(preview.subTotal)}</dd>
      <dt>VAT</dt><dd className="text-right tabular-nums">{centsText(preview.vat)}</dd>
      <dt className="font-bold">ยอดตามบิล</dt><dd className="text-right font-bold tabular-nums">{centsText(preview.net)}</dd>
    </dl>
    <p className="text-xs text-gray-600">ยอดเป็นการแสดงตัวอย่าง ระบบคำนวณยอดจริงที่เซิร์ฟเวอร์ (ปัดเศษ VAT ระดับสตางค์)</p>
    <label className="block">หมายเหตุ<textarea className={control} maxLength={1000} value={form.remark} onChange={event => set({ remark: event.target.value })} /></label>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="flex gap-2">
      <button className={primary} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button>
      <button type="button" className={button} onClick={onCancel} disabled={saving}>ยกเลิก</button>
    </div>
  </ManualSubmitForm>;
}

function BillDetail({ id, can, onBack, onEdit }: { id: string; can: Record<string, boolean>; onBack: () => void; onEdit: (bill: SupplierBill) => void }) {
  const [bill, setBill] = useState<SupplierBillDetail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [reload, setReload] = useState(0), [action, setAction] = useState<Action>(null), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [dueDate, setDueDate] = useState(""), [vouchers, setVouchers] = useState<SettlementVoucher[]>([]);
  const [voucherId, setVoucherId] = useState(""), [amount, setAmount] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    api.get(id).then(result => { if (current) setBill(result); })
      .catch(err => { if (current) setError(message(err)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id, reload]);
  function open(next: Action) {
    setAction(next); setReason(""); setError(""); setVoucherId(""); setAmount("");
    if (next?.kind === "due" && bill) setDueDate(bill.dueDate.slice(0, 10));
    if (next?.kind === "settle") api.eligibleVouchers(id).then(setVouchers).catch(err => setError(message(err)));
  }
  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); setAction(null); setReload(value => value + 1); }
    catch (err) { setError(message(err)); setReload(value => value + 1); } finally { setBusy(false); }
  }
  if (loading && !bill) return <p className="p-8 text-center">กำลังโหลด...</p>;
  if (!bill) return <div className="space-y-3"><p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error || "ไม่พบใบแจ้งหนี้ผู้ขาย"}</p>
    <button className={button} onClick={onBack}>กลับ</button></div>;
  const settleable = bill.status === "confirmed" && bill.outstandingAmount > 0;
  const activeSettlements = bill.settlements.some(row => row.status === "active");
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <button className={button} onClick={onBack}>กลับรายการ</button>
      {bill.status === "draft" && can.update && <button className={button} onClick={() => onEdit(bill)}>แก้ไขร่าง</button>}
      {bill.status === "draft" && can.approve && <button className={primary} disabled={busy}
        onClick={() => void run(() => api.confirm(bill.id, bill.revision))}>ยืนยันตั้งหนี้</button>}
      {bill.status !== "cancelled" && can.update && <button className={button} onClick={() => open({ kind: "due" })}>แก้วันครบกำหนด</button>}
      {settleable && can.pay && <button className={button} onClick={() => open({ kind: "settle" })}>ตัดชำระด้วย PV ที่จ่ายแล้ว</button>}
      {bill.status !== "cancelled" && can.cancel && !activeSettlements && <button className={button} onClick={() => open({ kind: "cancel" })}>ยกเลิกใบแจ้งหนี้</button>}
    </div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {action && <ManualSubmitForm className="grid gap-3 rounded border border-blue-200 bg-blue-50 p-4 sm:grid-cols-3" onSubmit={event => {
      event.preventDefault();
      if (action.kind === "cancel") void run(() => api.cancel(bill.id, bill.revision, reason));
      if (action.kind === "due") void run(() => api.changeDueDate(bill.id, bill.revision, dueDate, reason));
      if (action.kind === "settle") void run(() => api.settle(bill.id, { revision: bill.revision, paymentVoucherId: voucherId, amount, reason: reason || undefined }));
      if (action.kind === "void") void run(() => api.voidSettlement(bill.id, action.settlementId, bill.revision, reason));
    }}>
      {action.kind === "due" && <label>วันครบกำหนดใหม่<DateInput required className={control} value={dueDate} onChange={setDueDate} /></label>}
      {action.kind === "settle" && <>
        <label className="sm:col-span-2">PV ที่บันทึกจ่ายแล้วของผู้ขายนี้
          <select className={control} required value={voucherId} onChange={event => {
            setVoucherId(event.target.value);
            setAmount(defaultSettlementAmount(bill, vouchers.find(item => item.id === event.target.value)));
          }}>
            <option value="">{vouchers.length ? "เลือก PV" : "ไม่มี PV ที่จ่ายแล้วและมียอดคงเหลือ"}</option>
            {vouchers.map(item => <option key={item.id} value={item.id}>
              {`${item.pvNo} · จ่าย ${date(item.paidAt)} · คงเหลือตัดชำระ ${money(item.availableAmount)} (จ่ายสุทธิ ${money(item.netPayment)} + WHT ${money(item.wht)})`}
            </option>)}
          </select>
        </label>
        <label>ยอดตัดชำระ<input className={`${control} text-right`} required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      </>}
      <label className="sm:col-span-2">{action.kind === "settle" ? "หมายเหตุ" : "เหตุผล *"}
        <input className={control} required={action.kind !== "settle"} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      <div className="flex items-end gap-2">
        <button className={primary} disabled={busy}>{{ cancel: "ยืนยันยกเลิก", due: "บันทึกวันครบกำหนด", settle: "บันทึกตัดชำระ", void: "ยืนยันยกเลิกการตัดชำระ" }[action.kind]}</button>
        <button type="button" className={button} disabled={busy} onClick={() => setAction(null)}>ปิด</button>
      </div>
    </ManualSubmitForm>}
    <div className="grid gap-4 rounded border bg-white p-4 sm:grid-cols-3">
      <Info label="เลขที่ตั้งหนี้" value={`${bill.billNo} (rev ${bill.revision})`} />
      <Info label="สถานะ" value={`${supplierBillStatusLabels[bill.status]}${bill.paymentState ? ` · ${supplierBillPaymentLabels[bill.paymentState]}` : ""}`} />
      <Info label="ผู้ขาย (ข้อมูล ณ วันที่บันทึก)" value={`${bill.supplierSnapshot.code} ${bill.supplierSnapshot.name}${bill.supplierSnapshot.taxId ? ` · ${bill.supplierSnapshot.taxId}` : ""}${bill.supplierSnapshot.branch ? ` · ${bill.supplierSnapshot.branch}` : ""}`} />
      <Info label="เลขที่/วันที่ใบแจ้งหนี้" value={`${bill.supplierInvoiceNo} · ${date(bill.supplierInvoiceDate)}`} />
      <Info label="เลขที่/วันที่ใบกำกับภาษี" value={bill.taxInvoiceNo ? `${bill.taxInvoiceNo} · ${date(bill.taxInvoiceDate)}` : "-"} />
      <Info label="ครบกำหนด" value={`${date(bill.dueDate)} · เครดิต ${bill.creditTermDays} วัน${bill.dueDateManual ? " (แก้ไขเอง)" : ""}`} />
      <Info label="อ้างอิง" value={bill.reference || "-"} />
      <Info label="หมายเหตุ" value={bill.remark || "-"} />
      {bill.cancelReason && <Info label="เหตุผลยกเลิก" value={bill.cancelReason} />}
    </div>
    <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
      <thead className="border-b bg-[#f8faf7]"><tr><th className="p-3">#</th><th className="p-3">รายการ</th><th className="p-3 text-right">จำนวนเงิน</th></tr></thead>
      <tbody>{bill.items.map((item, index) => <tr key={item.id} className="border-b"><td className="p-3">{index + 1}</td><td className="p-3">{item.desc}</td>
        <td className="p-3 text-right tabular-nums">{money(item.amount)}</td></tr>)}</tbody>
      <tfoot>
        {([["ยอดก่อน VAT", bill.subTotal], [supplierBillVatLabels[bill.vatMode], bill.vat], ["ยอดตามบิล", bill.netAmount],
          ["ตัดชำระแล้ว (PV ที่จ่ายจริงและยังไม่ถูกยกเลิก)", bill.settledAmount], ["ยอดคงค้าง", bill.outstandingAmount]] as const).map(([label, value]) =>
          <tr key={label}><td /><td className="p-2 text-right font-semibold">{label}</td><td className="p-2 text-right font-semibold tabular-nums">{money(value)}</td></tr>)}
      </tfoot>
    </table></div>
    {bill.ineffectiveSettlementAmount > 0 && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      มีรายการตัดชำระ {money(bill.ineffectiveSettlementAmount)} ที่อ้าง PV ซึ่งถูกยกเลิก/กลับรายการแล้ว ระบบไม่นับเป็นการชำระและคืนยอดคงค้าง ควรยกเลิกรายการตัดชำระนั้น</p>}
    <section className="rounded border bg-white p-4">
      <h3 className="mb-2 font-bold">รายการตัดชำระด้วย PV</h3>
      {!bill.settlements.length ? <p className="text-sm text-gray-600">ยังไม่มีรายการตัดชำระ</p> : <table className="w-full text-left text-sm">
        <thead><tr>{["PV", "วันที่จ่าย", "ยอดตัดชำระ", "สถานะ", ""].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{bill.settlements.map(row => <tr key={row.id} className="border-t">
          <td className="p-2">{row.paymentVoucher?.pvNo || row.paymentVoucherId}</td>
          <td className="p-2">{row.paymentVoucher?.paidAt ? date(row.paymentVoucher.paidAt) : "-"}</td>
          <td className="p-2 tabular-nums">{money(row.amount)}</td>
          <td className="p-2">{row.status === "voided" ? `ยกเลิกแล้ว: ${row.voidReason || ""}` : row.effective ? "มีผล" : "ไม่มีผล (PV ถูกยกเลิก/กลับรายการ)"}</td>
          <td className="p-2">{row.status === "active" && can.pay && can.cancel &&
            <button className={button} onClick={() => open({ kind: "void", settlementId: row.id })}>ยกเลิกการตัดชำระ</button>}</td>
        </tr>)}</tbody>
      </table>}
    </section>
    <section className="rounded border bg-white p-4">
      <h3 className="mb-2 font-bold">ประวัติการดำเนินการ (Audit)</h3>
      <ul className="space-y-1 text-sm">{bill.history.map(row => <li key={row.id}>
        {formatAccountingDateTime(row.createdAt)} · {supplierBillHistoryLabels[row.action] || row.action} · {row.performedBy?.fullName || "-"}{row.reason ? ` · ${row.reason}` : ""}
      </li>)}</ul>
    </section>
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-gray-500">{label}</p><p className="font-semibold">{value}</p></div>;
}