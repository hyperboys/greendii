"use client";
import { ManualSubmitForm } from "@/components/manual-submit-form";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InventoryControlsApi as api, transferActions, type Transfer, type TransferInput } from "@/lib/inventory-controls";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "./accounting-access-provider";
import { getStoredUser } from "@/lib/auth";
import { DateInput } from "./date-input";
import { today } from "@/lib/goods-receipt";
const input = "rounded border bg-white px-3 py-2";
const button = "rounded border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const labels: Record<string, string> = { draft: "ร่าง", pending: "รออนุมัติ", returned: "ส่งกลับ", approved: "อนุมัติ", rejected: "ปฏิเสธ", cancelled: "ยกเลิก",
  submit: "ส่งอนุมัติ / จองสินค้า", approve: "อนุมัติโอน", return: "ส่งกลับ", reject: "ปฏิเสธ", cancel: "ยกเลิก / โอนกลับ" };
const blank = (): TransferInput => ({ sourceWarehouseId: "", destinationWarehouseId: "", transferDate: today(), remark: "", items: [{ productId: "", quantity: "" }] });
export function StockTransfers() {
  const access = useAccountingAccess(), can = { create: canUseAccounting(access, "inventory", "create"), update: canUseAccounting(access, "inventory", "update"),
    approve: canUseAccounting(access, "inventory", "approve"), cancel: canUseAccounting(access, "inventory", "cancel") };
  const [options, setOptions] = useState<Awaited<ReturnType<typeof api.lookups>>>({ products: [], warehouses: [] });
  const [rows, setRows] = useState<Transfer[]>([]), [doc, setDoc] = useState<Transfer | null>(null), [form, setForm] = useState<TransferInput>(blank);
  const [editing, setEditing] = useState(false), [query, setQuery] = useState({ q: "", status: "", page: "1", pageSize: "20" }), [search, setSearch] = useState("");
  const [pages, setPages] = useState(0), [total, setTotal] = useState(0), [userId, setUserId] = useState<string>();
  const [reason, setReason] = useState(""), [cancelDate, setCancelDate] = useState(today), [physical, setPhysical] = useState(false), [action, setAction] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const key = useRef(""), guard = useRef(false);
  useEffect(() => { setUserId(getStoredUser()?.id); key.current = crypto.randomUUID(); }, []);
  useEffect(() => {
    let current = true; setLoading(true); setError("");
    Promise.all([api.transfers(query), api.lookups()]).then(([result, lookups]) => {
      if (current) { setRows(result.data); setPages(result.totalPages); setTotal(result.total); setOptions(lookups); }
    }).catch(error => { if (current) setError(error instanceof Error ? error.message : "โหลดไม่สำเร็จ"); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, reload]);
  async function run(operation: () => Promise<void>) {
    if (guard.current) return; guard.current = true; setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "ดำเนินการใบโอนไม่สำเร็จ"); }
    finally { guard.current = false; setBusy(false); }
  }
  const refresh = () => setReload(value => value + 1);
  function edit(value: Transfer | null) {
    setDoc(value); setForm(value ? { ...value, transferDate: value.transferDate.slice(0, 10) } : blank());
    setEditing(true); setAction(""); key.current = crypto.randomUUID();
  }
  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">โอนสินค้าระหว่างคลัง (TR)</h1><div className="flex gap-2"><Link href="/inventory" className={button}>กลับคลัง</Link>
      {can.create && <button className={button} disabled={busy} onClick={() => edit(null)}>สร้างใบโอน</button>}</div></header>
    <p className="rounded bg-amber-50 p-3 text-sm">ร่างไม่ลง Stock · ส่งอนุมัติจองคลังต้นทาง · ผู้สร้างรวม admin ห้ามอนุมัติเอง · อนุมัติลดต้นทางและเพิ่มปลายทางพร้อมกันโดยใช้ต้นทุนคลังต้นทาง ไม่ใช่ราคาหลัก หากต้นทุนเดิมไม่ทราบจะแสดงยังไม่ตีมูลค่า และไม่ผสมของไม่ทราบต้นทุนเข้าฐานที่ตีมูลค่าแล้ว</p>
    {loading && <p role="status">กำลังโหลด...</p>}{error && <p role="alert" className="text-red-700">{error} <button className={button} onClick={refresh}>โหลดใหม่</button></p>}
    {editing && (doc ? can.update : can.create) && <ManualSubmitForm className="space-y-3 rounded border bg-white p-4" onSubmit={event => { event.preventDefault(); void run(async () => {
      const saved = doc ? await api.updateTransfer(doc, form) : await api.createTransfer({ ...form, requestKey: key.current });
      setDoc(await api.transfer(saved.id)); setEditing(false); refresh();
    }); }}><h2 className="font-bold">{doc ? `แก้ ${doc.transferNo}` : "สร้างใบโอนร่าง"}</h2><fieldset disabled={busy} className="space-y-3">
      <div className="flex flex-wrap gap-3"><label>วันที่โอน *<DateInput required disabled={Boolean(doc)} className={input} value={form.transferDate} onChange={transferDate => setForm({ ...form, transferDate })} /></label>
        {(["sourceWarehouseId", "destinationWarehouseId"] as const).map(field => <label key={field}>{field === "sourceWarehouseId" ? "คลังต้นทาง" : "คลังปลายทาง"} *<select required disabled={Boolean(doc)} className={input} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })}>
          <option value="">เลือกคลัง</option>{options.warehouses.map(row => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}</select></label>)}</div>
      {form.items.map((line, index) => <div className="flex flex-wrap gap-2" key={index}>
        <label>สินค้า *<select required className={input} value={line.productId} onChange={event => setForm({ ...form, items: form.items.map((row, i) => i === index ? { ...row, productId: event.target.value } : row) })}>
          <option value="">เลือกสินค้า</option>{options.products.filter(row => row.productType !== "service").map(row => <option key={row.id} value={row.id}>{row.code} {row.name} {row.unit}</option>)}</select></label>
        <label>จำนวน *<input required type="number" min="0.001" step="0.001" max="999999999.999" className={input} value={line.quantity} onChange={event => setForm({ ...form, items: form.items.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row) })} /></label>
        <button type="button" className={button} disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>ลบ</button>
      </div>)}
      <button type="button" className={button} disabled={form.items.length >= 200} onClick={() => setForm({ ...form, items: [...form.items, { productId: "", quantity: "" }] })}>เพิ่มสินค้า</button>
      <label className="block">หมายเหตุ<textarea maxLength={1000} className={input} value={form.remark || ""} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
    </fieldset><div className="flex gap-2"><button className={button} disabled={busy}>บันทึกร่าง</button><button type="button" className={button} onClick={() => setEditing(false)}>ปิดการแก้ไข</button></div></ManualSubmitForm>}
    {doc && !editing && <section className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-bold">{doc.transferNo} · {labels[doc.status] || doc.status}</h2><p>{doc.snapshot.source.name} → {doc.snapshot.destination.name} · {doc.transferDate.slice(0, 10)}</p>
      <ul>{doc.items.map(line => <li key={line.productId}>{line.productSnapshot?.code} {line.productSnapshot?.name} · {String(line.quantity)} {line.productSnapshot?.unit}</li>)}</ul><p>{doc.remark}</p>
      <div className="flex flex-wrap gap-2">{can.update && ["draft", "returned"].includes(doc.status) && <button className={button} disabled={busy} onClick={() => edit(doc)}>แก้ไข</button>}
        {transferActions(doc, can, userId).map(value => <button key={value} className={button} disabled={busy} onClick={() => { setAction(value); setReason(""); setPhysical(false); setCancelDate(today()); }}>{labels[value]}</button>)}
        <button className={button} onClick={() => { setDoc(null); setAction(""); }}>ปิดรายละเอียด</button></div>
      {action && <ManualSubmitForm className="space-y-3 rounded border p-3" onSubmit={event => { event.preventDefault(); void run(async () => {
        await api.transferAction(doc, action, reason, cancelDate, physical); setDoc(await api.transfer(doc.id)); setAction(""); refresh();
      }); }}><h3 className="font-bold">ยืนยัน{labels[action]}</h3>
        {["return", "reject", "cancel"].includes(action) && <label className="block">เหตุผล *<textarea required maxLength={1000} className={input} value={reason} onChange={event => setReason(event.target.value)} /></label>}
        {action === "cancel" && doc.status === "approved" && <><label>วันที่โอนกลับ *<DateInput required className={input} value={cancelDate} onChange={setCancelDate} /></label>
          <label className="block"><input required type="checkbox" checked={physical} onChange={event => setPhysical(event.target.checked)} /> ยืนยันโอนสินค้ากลับจริง (ต้องไม่กระทบยอดจอง/ติดลบ; ต้นทุนที่มีรายการต่อแล้วกลับไม่ได้)</label></>}
        <button className={button} disabled={busy}>ยืนยัน</button></ManualSubmitForm>}
      <h3 className="font-bold">Movements / ต้นทุนที่บันทึกจริง</h3>{doc.movements?.map(row => <p className="text-sm" key={row.id}>{row.warehouseId} / {row.productId} รับ {String(row.qtyIn)} จ่าย {String(row.qtyOut)} · มูลค่ารับ {row.valueIn ?? "ไม่ทราบ"} จ่าย {row.valueOut ?? "ไม่ทราบ"} · {row.costStatus === "valued" ? "มีต้นทุน" : "ยังไม่ตีมูลค่า"}</p>)}
      <h3 className="font-bold">ประวัติ</h3>{doc.history?.map(row => <p className="text-sm" key={row.id}>{row.createdAt} · {row.performedBy?.fullName} · {labels[row.action] || row.action} · {row.reason}</p>)}
    </section>}
    <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setQuery({ ...query, q: search, page: "1" }); }}>
      <input aria-label="ค้นหาเลขใบโอน" className={input} value={search} onChange={event => setSearch(event.target.value)} />
      <select aria-label="สถานะ" className={input} value={query.status} onChange={event => setQuery({ ...query, status: event.target.value, page: "1" })}><option value="">ทุกสถานะ</option>
        {["draft", "pending", "returned", "approved", "rejected", "cancelled"].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select><button className={button}>ค้นหา</button></form>
    {!loading && <div className="overflow-auto rounded border bg-white"><table className="w-full text-left text-sm"><thead><tr><th>TR / วันที่</th><th>ต้นทาง → ปลายทาง</th><th>สถานะ</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id} className="border-t"><td className="p-3"><button className="text-blue-700" disabled={busy} onClick={() => void run(async () => { setDoc(await api.transfer(row.id)); setEditing(false); setAction(""); })}>{row.transferNo}</button><br />{row.transferDate.slice(0, 10)}</td>
        <td>{row.snapshot.source.name} → {row.snapshot.destination.name}</td><td>{labels[row.status] || row.status}</td></tr>)}</tbody></table>{!rows.length && <p className="p-3">ไม่พบใบโอน</p>}</div>}
    <div className="flex items-center gap-3"><span>ทั้งหมด {total} · หน้า {query.page}/{pages || 1}</span><button className={button} disabled={Number(query.page) <= 1 || loading} onClick={() => setQuery({ ...query, page: String(Number(query.page) - 1) })}>ก่อนหน้า</button>
      <button className={button} disabled={Number(query.page) >= pages || loading} onClick={() => setQuery({ ...query, page: String(Number(query.page) + 1) })}>ถัดไป</button></div>
  </div>;
}
