"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccountingAccess } from "./accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { getStoredUser } from "@/lib/auth";
import { DateInput } from "./date-input";
import { today } from "@/lib/goods-receipt";
import { InventoryControlsApi as api, inventoryCostPolicy, type InventoryBalance, type CostInitialization } from "@/lib/inventory-controls";
const input = "rounded border px-3 py-2 text-sm";
const button = "rounded border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
export function InventoryControls() {
  const access = useAccountingAccess(), canCreate = canUseAccounting(access, "inventory", "create"), canUpdate = canUseAccounting(access, "inventory", "update"),
    canApprove = canUseAccounting(access, "inventory", "approve"), canCancel = canUseAccounting(access, "inventory", "cancel");
  const [rows, setRows] = useState<InventoryBalance[]>([]), [requests, setRequests] = useState<CostInitialization[]>([]);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof api.lookups>>>({ products: [], warehouses: [] });
  const [warehouseId, setWarehouse] = useState(""), [productId, setProduct] = useState(""), [threshold, setThreshold] = useState("");
  const [quantity, setQuantity] = useState(""), [totalValue, setValue] = useState(""), [evidence, setEvidence] = useState(""), [asOf, setAsOf] = useState(today);
  const [reason, setReason] = useState(""), [userId, setUserId] = useState<string>(), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [reload, setReload] = useState(0);
  const key = useRef(""), guard = useRef(false);
  useEffect(() => { setUserId(getStoredUser()?.id); key.current = crypto.randomUUID(); }, []);
  useEffect(() => {
    let current = true; setLoading(true); setError("");
    Promise.all([api.balances(), api.initializations(), api.lookups()]).then(([balances, docs, lookups]) => {
      if (current) { setRows(balances); setRequests(docs); setOptions(lookups); }
    }).catch(error => { if (current) setError(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload]);
  const selected = rows.find(row => row.warehouseId === warehouseId && row.productId === productId);
  useEffect(() => {
    setThreshold(selected?.lowStockThreshold == null ? "" : String(selected.lowStockThreshold));
    setQuantity(selected ? String(selected.onHand) : ""); setValue(""); setEvidence(""); key.current = crypto.randomUUID();
  }, [selected]);
  async function run(operation: () => Promise<unknown>) {
    if (guard.current) return; guard.current = true; setBusy(true); setError("");
    try { await operation(); key.current = crypto.randomUUID(); setReload(value => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ"); }
    finally { guard.current = false; setBusy(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex justify-between gap-4"><h1 className="text-2xl font-bold">ต้นทุน Moving Average / จุดเตือนสต็อก</h1><Link className={button} href="/inventory">กลับคลัง</Link></header>
    <p className="rounded bg-amber-50 p-3 text-sm">{inventoryCostPolicy}<br />ยอดเดิมไม่มีต้นทุนที่เชื่อถือได้ = ยังไม่ตีมูลค่า ไม่ใช่ศูนย์หรือราคาหลัก ต้องกรอกมูลค่ารวมที่ฝ่ายบัญชียืนยันพร้อมหลักฐานและให้ผู้อนุมัติคนอื่นอนุมัติ จึงเริ่มฐานต้นทุน ณ จำนวนปัจจุบัน ไม่แก้ประวัติเดิม</p>
    <p className="text-sm text-red-800">รายการย้อนหลังหลังฐานต้นทุน / กลับรายการที่ไม่ใช่ Movement ล่าสุดซึ่งมีต้นทุน: ระบบปฏิเสธเพื่อไม่ทำให้ค่าเฉลี่ยผิด ต้องตรวจประวัติโดยฝ่ายบัญชีก่อน (ไม่มี GL อัตโนมัติ)</p>
    {loading && <p role="status">กำลังโหลด...</p>}{error && <p role="alert" className="text-red-700">{error} <button className={button} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {!loading && <><div className="overflow-auto rounded border bg-white"><table className="w-full text-left text-sm"><thead><tr><th>คลัง/สินค้า</th><th>จำนวน/พร้อมใช้</th><th>จุดเตือน</th><th>สถานะต้นทุน</th><th>มูลค่ารวม / เฉลี่ย</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id} className="border-t"><td className="p-3"><button className="text-blue-700" onClick={() => { setWarehouse(row.warehouseId); setProduct(row.productId); }}>{row.warehouse?.name} / {row.product?.code} {row.product?.name}</button></td>
        <td>{String(row.onHand)} / {String(row.available)}</td><td className={row.lowStock ? "font-bold text-red-700" : ""}>{row.lowStockThreshold == null ? "ไม่ตั้ง" : String(row.lowStockThreshold)} {row.lowStock && "⚠ ต่ำกว่าหรือเท่าจุดเตือน"}</td>
        <td>{row.valuationStatus === "valued" ? "มีฐานต้นทุน" : row.valuationStatus === "blocked" ? "ฐานไม่ตรงจำนวน: ถูกระงับ" : "ยังไม่ตีมูลค่า"}</td><td>{row.totalValue ?? "ไม่ทราบ"} / {row.averageCost ?? "ไม่ทราบ"}</td></tr>)}
    </tbody></table></div>
    <section className="space-y-3 rounded border bg-white p-4"><h2 className="font-bold">เลือกสินค้าและคลัง</h2><div className="flex flex-wrap gap-3">
      <label>คลัง <select className={input} value={warehouseId} onChange={event => setWarehouse(event.target.value)}><option value="">เลือกคลัง</option>{options.warehouses.map(row => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}</select></label>
      <label>สินค้า <select className={input} value={productId} onChange={event => setProduct(event.target.value)}><option value="">เลือกสินค้า</option>{options.products.filter(row => row.productType !== "service").map(row => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}</select></label></div>
      {canUpdate && <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void run(() => api.threshold({ warehouseId, productId, lowStockThreshold: threshold || null, updatedAt: selected?.updatedAt })); }}>
        <label>จุดเตือน (ว่าง = ปิด)<input type="number" min="0" step="0.001" className={input} value={threshold} onChange={event => setThreshold(event.target.value)} /></label>
        <button className={button} disabled={busy || !warehouseId || !productId}>บันทึกจุดเตือน</button></form>}
      {canCreate && selected && selected.valuationStatus === "unvalued" && <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void run(() => api.initialize({ requestKey: key.current, warehouseId, productId, quantity, totalValue, evidence, asOf, updatedAt: selected.updatedAt })); }}>
        <h3 className="font-bold sm:col-span-2">ขอตั้งต้นทุนยอดปัจจุบัน (ไม่เปลี่ยนจำนวน)</h3>
        <label>จำนวนปัจจุบันที่ตรวจสอบ *<input required className={input} type="number" min="0" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
        <label>มูลค่ารวมที่บัญชียืนยัน *<input required className={input} inputMode="decimal" pattern="(0|[1-9][0-9]*)(\.[0-9]{1,12})?" value={totalValue} onChange={event => setValue(event.target.value)} /></label>
        <label>วันที่ฐานต้นทุน (ไม่ก่อน Movement ล่าสุด) *<DateInput required className={input} value={asOf} onChange={setAsOf} /></label>
        <label>เอกสาร/วิธีตรวจสอบมูลค่า *<textarea required maxLength={1000} className={input} value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
        <button className={button} disabled={busy}>ส่งคำขอต้นทุนให้ผู้อนุมัติคนอื่น</button></form>}
    </section>
    <section className="space-y-3 rounded border bg-white p-4"><h2 className="font-bold">คำขอต้นทุน / หลักฐาน</h2>
      <label>เหตุผลปฏิเสธ/ยกเลิก <input maxLength={1000} className={input} value={reason} onChange={event => setReason(event.target.value)} /></label>
      {requests.map(doc => <article key={doc.id} className="space-y-2 border-t py-3"><p className="font-semibold">{doc.snapshot.product.code} {doc.snapshot.product.name} · {doc.warehouseId} · {doc.status}</p>
        <p className="text-sm">ณ {doc.asOf.slice(0, 10)} จำนวน {String(doc.quantity)} มูลค่า {String(doc.totalValue)} · {doc.evidence}</p>
        {doc.status === "pending" && <div className="flex gap-2">
          {canApprove && userId && userId !== doc.createdById && <button disabled={busy} className={button} onClick={() => void run(() => api.initializationAction(doc, "approve", ""))}>อนุมัติต้นทุนที่ตรวจสอบแล้ว</button>}
          {canApprove && <button disabled={busy || !reason.trim()} className={button} onClick={() => void run(() => api.initializationAction(doc, "reject", reason))}>ปฏิเสธ</button>}
          {canCancel && <button disabled={busy || !reason.trim()} className={button} onClick={() => void run(() => api.initializationAction(doc, "cancel", reason))}>ยกเลิกคำขอ</button>}
        </div>}</article>)}
    </section></>}
  </div>;
}
