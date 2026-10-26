"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { getStoredUser } from "@/lib/auth";
import { DateInput } from "@/components/date-input";
import { StockOpeningApi, downloadOpeningTemplate, exportOpenings, openingActions, openingBase, openingList,
  openingStatuses, parseOpeningCsv, type StockOpeningAction, type StockOpeningBalance, type StockOpeningInput,
  type StockOpeningLookups, type StockOpeningPreview } from "@/lib/stock-opening-balance";
import { localAccountingDate } from "@/lib/stock-card";

const input = "w-full min-w-0 rounded border bg-white px-3 py-2 text-sm";
const button = "rounded border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const primary = "rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const message = (error: unknown) => error instanceof Error ? error.message : "ดำเนินการยอดยกมาไม่สำเร็จ";
const qty = (value: string | number) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
type Mode = "list" | "new" | "edit" | "view";

export function StockOpeningBalances({ mode = "list", recordId }: { mode?: Mode; recordId?: string }) {
  const router = useRouter(), access = useAccountingAccess();
  const can = {
    create: canUseAccounting(access, "inventory", "create"),
    update: canUseAccounting(access, "inventory", "update"),
    approve: canUseAccounting(access, "inventory", "approve"),
    cancel: canUseAccounting(access, "inventory", "cancel"),
  };
  const isForm = mode === "new" || mode === "edit";
  const allowedForm = mode === "new" ? can.create : can.update;
  const [rows, setRows] = useState<StockOpeningBalance[]>([]);
  const [doc, setDoc] = useState<StockOpeningBalance | null>(null);
  const [form, setForm] = useState<StockOpeningInput>({ warehouseId: "", cutoverDate: localAccountingDate(), remark: "", items: [] });
  const [lookups, setLookups] = useState<StockOpeningLookups>({ products: [], warehouses: [], cutoverDate: null });
  const [preview, setPreview] = useState<StockOpeningPreview | null>(null);
  const [search, setSearch] = useState(""), [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(""), [error, setError] = useState("");
  const [userId, setUserId] = useState<string>();
  const [reload, setReload] = useState(0);
  const guard = useRef(false), requestKey = useRef("");

  useEffect(() => { setUserId(getStoredUser()?.id); }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setLoadError(""); setError("");
    async function load() {
      if (mode === "list") {
        const data = await StockOpeningApi.list({ q: search, status: statusFilter });
        if (current) setRows(data);
        return;
      }
      const options = await StockOpeningApi.lookups();
      if (!current) return;
      setLookups(options);
      if (recordId) {
        const saved = await StockOpeningApi.get(recordId);
        if (!current) return;
        setDoc(saved);
        setForm({ warehouseId: saved.warehouseId, cutoverDate: saved.cutoverDate.slice(0, 10), remark: saved.remark || "",
          updatedAt: saved.updatedAt, items: saved.items.map(line => ({ productId: line.productId, countedQty: String(line.countedQty) })) });
      } else {
        requestKey.current = crypto.randomUUID();
        setDoc(null); setPreview(null);
        setForm({ warehouseId: "", cutoverDate: options.cutoverDate || localAccountingDate(), remark: "", items: [] });
      }
    }
    void load().catch(reason => { if (current) setLoadError(message(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, search, statusFilter, reload]);

  useEffect(() => {
    if (!isForm || !form.warehouseId || !form.cutoverDate) { setPreview(null); return; }
    let current = true;
    StockOpeningApi.preview(form.warehouseId, form.cutoverDate, doc?.id)
      .then(data => {
        if (!current) return;
        setPreview(data);
        setForm(value => value.items.length ? value : { ...value,
          items: data.lines.filter(line => Number(line.bookQtyAtCutover) !== 0)
            .map(line => ({ productId: line.productId, countedQty: "" })) });
      })
      .catch(reason => { if (current) { setPreview(null); setError(message(reason)); } });
    return () => { current = false; };
  }, [isForm, form.warehouseId, form.cutoverDate, doc?.id]);

  async function run(operation: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try { await operation(); } catch (reason) { setError(message(reason)); }
    finally { guard.current = false; setBusy(false); }
  }

  function changeItem(index: number, patch: Partial<StockOpeningInput["items"][number]>) {
    setForm(value => ({ ...value, items: value.items.map((line, i) => i === index ? { ...line, ...patch } : line) }));
  }
  function addItem() {
    const product = lookups.products.find(row => !form.items.some(line => line.productId === row.id));
    setForm(value => ({ ...value, items: [...value.items, { productId: product?.id || "", countedQty: "" }] }));
  }
  const requiredMissing = (preview?.lines || []).filter(line => Number(line.bookQtyAtCutover) !== 0 &&
    !form.items.some(item => item.productId === line.productId));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (requiredMissing.length) throw new Error(`ต้องระบุสินค้าที่มียอดตาม Movement: ${requiredMissing.slice(0, 8).map(line => line.product.code).join(", ")}`);
      const saved = doc
        ? await StockOpeningApi.update(doc.id, { ...form, updatedAt: doc.updatedAt })
        : await StockOpeningApi.create({ ...form, requestKey: requestKey.current });
      router.push(`${openingBase}/${encodeURIComponent(saved.id)}`);
    });
  }

  async function perform(action: StockOpeningAction) {
    if (!doc) return;
    const reason = ["return", "reject", "cancel"].includes(action) ? window.prompt(`ระบุเหตุผล${action === "cancel" ? "ยกเลิก" : "ดำเนินการ"}:`) : undefined;
    if (["return", "reject", "cancel"].includes(action) && !reason?.trim()) return;
    if (action === "cancel" && !window.confirm("ยืนยันยกเลิกยอดยกมา? การยกเลิกหลังอนุมัติจะกลับรายการส่วนต่าง Stock")) return;
    await run(async () => {
      const result = await StockOpeningApi.action(doc, action, reason || undefined, action === "cancel" ? localAccountingDate() : undefined);
      setDoc(result);
      setForm(value => ({ ...value, updatedAt: result.updatedAt }));
      setReload(value => value + 1);
    });
  }

  async function importFile(file?: File) {
    if (!file) return;
    await run(async () => {
      if (form.items.length && !window.confirm("การนำเข้า CSV จะแทนที่รายการปัจจุบันทั้งหมด ดำเนินการต่อหรือไม่?")) return;
      const items = parseOpeningCsv(await file.text(), lookups.products);
      setForm(value => ({ ...value, items }));
    });
  }

  if (isForm && !allowedForm) return <p role="alert" className="p-4">ไม่มีสิทธิ์สร้าง/แก้ยอดยกมา <Link href={openingList}>กลับทะเบียน</Link></p>;
  const editable = doc?.lifecycleVersion === 1 && ["draft", "returned"].includes(doc.status);
  const actions: StockOpeningAction[] = doc?.lifecycleVersion === 1 ? [
    ...(can.create && ["draft", "returned"].includes(doc.status) ? ["submit" as const] : []),
    ...(can.approve && doc.status === "pending" && doc.createdById !== userId ? ["approve" as const, "return" as const, "reject" as const] : []),
    ...(can.cancel && ["draft", "returned", "pending", "approved"].includes(doc.status) ? ["cancel" as const] : []),
  ] : [];

  return <main className="mx-auto max-w-6xl space-y-4 p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-600">Inventory &amp; Store</p>
        <h1 className="text-2xl font-bold">{mode === "list" ? "ยอดยกมา / กระทบยอดคลัง (OB)" : doc?.openingNo || "สร้างยอดยกมาคลัง"}</h1>
        <p className="text-sm text-gray-600">ยอดตรวจนับ ณ สิ้นวันก่อนเริ่มใช้ · ลงเฉพาะผลต่างจาก Movement เมื่ออนุมัติ</p>
      </div>
      {mode !== "list" ? <Link href={openingList} className={button}>กลับทะเบียนยอดยกมา</Link> :
        <div className="flex flex-wrap gap-2">{can.create && <Link href={`${openingBase}/new`} className={primary}>สร้างใบยอดยกมา</Link>}
          <button className={button} disabled={!rows.length} onClick={() => exportOpenings(rows)}>Export CSV</button></div>}
    </header>
    {loading && <p role="status">กำลังโหลดข้อมูลยอดยกมา...</p>}
    {loadError && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{loadError} <button className={button} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}

    {mode === "list" && !loading && !loadError && <>
      <form className="flex flex-wrap gap-2 rounded border bg-white p-3" onSubmit={event => event.preventDefault()}>
        <input className={`${input} min-w-52 flex-1`} aria-label="ค้นหาใบยอดยกมา" placeholder="ค้นหาเลขที่ / คลัง" value={search} onChange={event => setSearch(event.target.value)} />
        <select className={input} aria-label="สถานะ" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="">ทุกสถานะ</option>{Object.entries(openingStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </form>
      <div className="overflow-x-auto rounded border bg-white"><table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr><th className="p-3">เลขที่ / วันเริ่มใช้</th><th>คลัง</th><th>รายการ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-t">
          <td className="p-3">{row.openingNo}<br />{row.cutoverDate.slice(0, 10)}</td>
          <td>{row.warehouseSnapshot?.name || row.warehouseId}</td><td>{row.items.length}</td>
          <td>{openingStatuses[row.status] || row.status}</td><td><Link className="text-blue-700" href={`${openingBase}/${encodeURIComponent(row.id)}`}>ดูรายละเอียด</Link></td>
        </tr>)}</tbody></table>{!rows.length && <p className="p-4">ไม่พบใบยอดยกมา</p>}</div>
    </>}

    {isForm && !loading && !loadError && (mode === "edit" && !editable
      ? <p role="alert">แก้ได้เฉพาะ Draft / ส่งกลับ</p>
      : <form className="space-y-4 rounded border bg-white p-4" onSubmit={save}>
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">คลัง *<select required className={input} disabled={Boolean(doc)}
              value={form.warehouseId} onChange={event => setForm(value => ({ ...value, warehouseId: event.target.value }))}>
              <option value="">เลือกคลัง</option>{lookups.warehouses.map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm">วันเริ่มใช้ *<DateInput required className={input} disabled={Boolean(doc)}
              value={form.cutoverDate} onChange={cutoverDate => setForm(value => ({ ...value, cutoverDate }))} /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">หมายเหตุ<textarea className={input} maxLength={1000} rows={2}
              value={form.remark} onChange={event => setForm(value => ({ ...value, remark: event.target.value }))} /></label>
          </div>
          {lookups.cutoverDate && <p className="rounded bg-blue-50 p-3 text-sm">วันเริ่มใช้กลางของบริษัท: <strong>{lookups.cutoverDate}</strong></p>}
          <p className="text-xs text-gray-600">ส่งอนุมัติได้ตั้งแต่วันเริ่มใช้เป็นต้นไป เพื่อไม่ให้ยอด Stock ถูกปรับก่อนวันที่มีผล</p>
          <section className="space-y-3 rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">ตรวจนับและเทียบยอดตาม Movement</h2>
              <p className="text-xs text-gray-600">ยอดตรวจนับเป็นยอดจริง ไม่ใช่จำนวนที่จะบวกเพิ่ม · ระบบคำนวณผลต่างให้อัตโนมัติ</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} onClick={downloadOpeningTemplate}>ดาวน์โหลด CSV ตัวอย่าง</button>
                <label className={`${button} cursor-pointer`}>นำเข้า CSV<input type="file" accept=".csv,text/csv" className="sr-only"
                  onChange={event => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                <button type="button" className={button} onClick={addItem}>เพิ่มสินค้า</button>
              </div>
            </div>
            {preview && <div className={`rounded p-3 text-sm ${preview.mismatches.length ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
              {preview.mismatches.length ? <><strong>ห้ามส่งอนุมัติจนกว่าจะแก้ยอดไม่ตรง</strong><ul className="list-disc pl-5">{preview.mismatches.map(row => <li key={row}>{row}</li>)}</ul></>
                : <p>Movement และ StockBalance ตรงกัน · {preview.lines.length} สินค้ามียอดในคลัง</p>}
              {preview.activeDocument && <p className="mt-1">มีใบที่ใช้งานอยู่แล้ว: {preview.activeDocument.openingNo}</p>}
            </div>}
            {requiredMissing.length > 0 && <p role="alert" className="text-red-700">ต้องเพิ่มสินค้าที่มียอดตาม Movement: {requiredMissing.map(row => row.product.code).join(", ")}</p>}
            {form.items.map((line, index) => {
              const product = lookups.products.find(row => row.id === line.productId);
              const baseLine = preview?.lines.find(row => row.productId === line.productId);
              const delta = line.countedQty !== "" && baseLine ? Number(line.countedQty) - Number(baseLine.bookQtyAtCutover) : null;
              return <div key={`${line.productId}-${index}`} className="grid min-w-0 gap-2 rounded border p-3 sm:grid-cols-[minmax(200px,2fr)_repeat(3,minmax(110px,1fr))_auto] sm:items-end">
                <label className="grid gap-1 text-sm">สินค้า *
                  <select required className={input} value={line.productId} onChange={event => changeItem(index, { productId: event.target.value })}>
                    <option value="">เลือกสินค้า</option>{lookups.products.filter(row => row.id === line.productId || !form.items.some(item => item.productId === row.id))
                      .map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
                  </select><span className="text-xs text-gray-500">หน่วย {product?.unit || "-"}</span>
                </label>
                <label className="grid gap-1 text-sm">ยอด Movement<input readOnly className={input} value={baseLine?.bookQtyAtCutover ?? "0.000"} /></label>
                <label className="grid gap-1 text-sm">ยอดตรวจนับจริง *<input required type="number" min="0" max="999999999.999" step="0.001" className={input}
                  value={line.countedQty} onChange={event => changeItem(index, { countedQty: event.target.value })} /></label>
                <div className="text-sm"><p>ผลต่างที่จะลง Stock</p><p className={`py-2 font-bold ${delta !== null && delta < 0 ? "text-red-700" : "text-green-700"}`}>{delta === null ? "-" : `${delta > 0 ? "+" : ""}${qty(delta)}`}</p></div>
                <button type="button" className={button} disabled={Boolean(baseLine && Number(baseLine.bookQtyAtCutover) !== 0)}
                  title={baseLine && Number(baseLine.bookQtyAtCutover) !== 0 ? "ต้องนับสินค้าที่มียอดตาม Movement" : ""}
                  onClick={() => setForm(value => ({ ...value, items: value.items.filter((_, i) => i !== index) }))}>ลบ</button>
              </div>;
            })}
            {!form.items.length && <p className="text-sm text-gray-600">เลือกคลังและเพิ่มรายการตรวจนับ หรือโหลดรายการสินค้าจาก CSV</p>}
          </section>
          <label className="flex gap-2 text-sm text-amber-800"><input type="checkbox" required />ยืนยันว่าเป็นยอดตรวจนับจริง ณ สิ้นวันก่อนวันเริ่มใช้ และตรวจสอบสินค้าครบตามคลังแล้ว</label>
          <div className="flex flex-wrap gap-2"><button disabled={busy || !preview || Boolean(preview.activeDocument)} className={primary}>บันทึก Draft</button>
            {doc && <Link className={button} href={`${openingBase}/${encodeURIComponent(doc.id)}`}>ยกเลิกการแก้ไข</Link>}</div>
        </fieldset>
      </form>)}

    {mode === "view" && doc && !loading && !loadError && <>
      <section className="opening-print space-y-3 rounded border bg-white p-4">
        <h1 className="hidden text-xl font-bold print:block">ใบยอดยกมาคลัง (OB) · {doc.openingNo}</h1>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p>สถานะ: <strong>{openingStatuses[doc.status] || doc.status}</strong></p>
          <p>วันเริ่มใช้ {doc.cutoverDate.slice(0, 10)} · คลัง {doc.warehouseSnapshot?.name || doc.warehouseId}</p>
          <p>หมายเหตุ: {doc.remark || "-"}</p></div>
          <div className="is-no-print flex flex-wrap gap-2">
            {doc.status === "draft" || doc.status === "returned" ? can.update && <Link className={button} href={`${openingBase}/${encodeURIComponent(doc.id)}/edit`}>แก้ไข</Link> : null}
            {actions.map(action => <button key={action} className={action === "approve" ? primary : button} disabled={busy} onClick={() => void perform(action)}>{openingActions[action]}</button>)}
            <button className={button} onClick={() => window.print()}>พิมพ์</button>
          </div>
        </div>
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">ผลต่างเท่านั้นที่มี Movement เมื่ออนุมัติ; ยอดตรวจนับไม่ได้ถูกบวกซ้ำทั้งจำนวน</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr><th className="p-2">สินค้า</th><th>หน่วย</th><th>ยอดตาม Movement</th><th>ยอดตรวจนับ</th><th>ผลต่าง</th></tr></thead>
          <tbody>{doc.items.map(line => <tr key={line.id} className="border-t"><td className="p-2">{line.productSnapshot.code} · {line.productSnapshot.name}</td>
            <td>{line.productSnapshot.unit}</td><td>{qty(line.bookQtyAtCutover)}</td><td>{qty(line.countedQty)}</td><td className="font-bold">{Number(line.deltaQty) > 0 ? "+" : ""}{qty(line.deltaQty)}</td></tr>)}</tbody>
        </table></div>
        {doc.movements?.length ? <div><h2 className="font-bold">Stock Movements</h2>{doc.movements.map(row => <p key={row.id} className="text-sm">
          {row.sourceDocType === "stock_opening_balance_reversal" ? "กลับรายการ" : "ปรับยอด"} · เข้า {qty(row.qtyIn)} · ออก {qty(row.qtyOut)} · {row.transactionDate.slice(0, 10)}
        </p>)}</div> : null}
        {doc.history?.length ? <div><h2 className="font-bold">ประวัติการดำเนินการ</h2>{doc.history.map(row => <p key={row.id} className="text-sm">
          {row.createdAt.slice(0, 16).replace("T", " ")} · {row.performedBy?.fullName || "-"} · {row.action}{row.reason ? ` · ${row.reason}` : ""}
        </p>)}</div> : null}
      </section>
    </>}
    <style jsx global>{`@media print{body *{visibility:hidden}.opening-print,.opening-print *{visibility:visible}.opening-print{display:block!important;position:absolute;left:0;top:0;width:100%;border:0!important}.opening-print table{width:100%;border-collapse:collapse}.opening-print th,.opening-print td{border-bottom:1px solid #888;padding:6px;text-align:left}.opening-print .is-no-print{display:none!important}}`}</style>
  </main>;
}
