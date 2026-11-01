"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArApi } from "@/lib/api";
import type { ReceiptVoucher } from "@/lib/receipt-voucher";
import { receivedChequeActions, receivedChequeLabels, type ReceivedChequeAction } from "@/lib/received-cheque";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { DateInput } from "@/components/date-input";
import { formatAccountingDate } from "@/lib/accounting-date";

const actionLabels = { deposit: "นำฝาก", clear: "เช็คผ่าน", dishonour: "เช็คคืนและกลับหนี้" };
const button = "rounded border px-3 py-2 disabled:opacity-40";
export function ReceivedChequeControls({ doc, onChange }: { doc: ReceiptVoucher; onChange: (doc: ReceiptVoucher) => void }) {
  const canWrite = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [action, setAction] = useState<ReceivedChequeAction | "">("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }));
  const [bank, setBank] = useState(""), [ref, setRef] = useState(""), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const locked = useRef(false);
  if (doc.paymentMethod !== "cheque") return null;
  const actions = receivedChequeActions(doc);
  return <section className="rv-no-print space-y-3 rounded border bg-white p-4">
    <h2 className="font-bold">เช็ครับ: {doc.receivedChequeState ? receivedChequeLabels[doc.receivedChequeState] : "ยังไม่เข้าวงจรเช็ครับ / อ่านอย่างเดียว"}</h2>
    <p>ยืนยัน RV ลดหนี้ทันที · นำฝาก/เช็คผ่านไม่ลดหนี้ซ้ำ · เช็คคืนกลับเฉพาะเงินเช็คครั้งเดียว</p>
    <p className="text-sm">เช็คคืนยังคงลดหนี้ด้วย WHT/ค่าธรรมเนียม · ยกเลิก RV หลังเช็คคืนจะกลับเฉพาะ WHT/ค่าธรรมเนียมที่ยังลดหนี้อยู่</p>
    {doc.chequeDepositedAt && <p>นำฝาก {formatAccountingDate(doc.chequeDepositedAt)} · {doc.chequeDepositBank} · {doc.chequeDepositRef}</p>}
    {doc.chequeClearedAt && <p>เช็คผ่าน {formatAccountingDate(doc.chequeClearedAt)}</p>}
    {doc.chequeDishonouredAt && <p>เช็คคืน {formatAccountingDate(doc.chequeDishonouredAt)} · {doc.chequeDishonourReason}</p>}
    {canWrite && actions.map(value => <button key={value} className={button} disabled={busy} onClick={() => { setAction(value); setError(""); }}>{actionLabels[value]}</button>)}
    {canWrite && action && <form className="space-y-2" onSubmit={async event => {
      event.preventDefault();
      if (locked.current || !actions.includes(action)) return;
      locked.current = true; setBusy(true); setError("");
      try { onChange(await ArApi.receivedChequeAction(doc.id, action, { updatedAt: doc.updatedAt, actionDate: date, depositBank: bank, depositRef: ref, reason })); setAction(""); }
      catch (error) { setError(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ กรุณาโหลดใหม่"); }
      finally { locked.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-2">
        <label className="block">วันที่ดำเนินการ<DateInput required value={date} onChange={setDate} /></label>
        {action === "deposit" && <><label className="block">ธนาคาร/บัญชีนำฝาก<input required maxLength={200} value={bank} onChange={event => setBank(event.target.value)} /></label><label className="block">เลขอ้างอิงนำฝาก<input required maxLength={100} value={ref} onChange={event => setRef(event.target.value)} /></label></>}
        {action === "dishonour" && <><p className="text-red-700">จะกลับเฉพาะเงินเช็คและทบทวนการปิด BI เดิม WHT/ค่าธรรมเนียมยังลดหนี้อยู่ ไม่มีการคืนเงิน / ออกเช็คจ่าย</p><label className="block">เหตุผลเช็คคืน<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label></>}
        <button className={button}>ยืนยัน{actionLabels[action]}</button> <button type="button" className={button} onClick={() => setAction("")}>ปิด</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
export function ReceivedCheques() {
  const [rows, setRows] = useState<ReceiptVoucher[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  useEffect(() => { let current = true;
    ArApi.getReceivedCheques().then(rows => { if (current) setRows(rows); }).catch(error => { if (current) setError(error instanceof Error ? error.message : "โหลดไม่ได้"); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  return <div className="space-y-4"><h1 className="text-2xl font-bold">ทะเบียนเช็ครับ (RV) — ไม่ใช่เช็คจ่าย CQ</h1>
    <Link className="text-blue-700 underline" href="/ar/receipts">กลับรับชำระ</Link>
    <label className="block">สถานะเช็ค<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">ทั้งหมด</option>{Object.entries(receivedChequeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {loading && <p role="status">กำลังโหลด...</p>}{error && <p role="alert">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["RV", "ลูกค้า", "ธนาคาร", "เลขเช็ค", "วันที่เช็ค", "เงินเช็ค", "สถานะ RV", "สถานะเช็ค"].map(label => <th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.filter(row => !filter || row.receivedChequeState === filter).map(row => <tr key={row.id}><td className="p-2"><Link className="text-blue-700 underline" href={`/ar/receipts/${row.id}`}>{row.rvNo}</Link></td><td>{row.customerName}</td><td>{row.bankName}</td><td>{row.chequeNo}</td><td>{row.chequeDate && formatAccountingDate(row.chequeDate)}</td><td>{Number(row.totalReceived).toFixed(2)}</td><td>{row.status}</td><td>{row.receivedChequeState ? receivedChequeLabels[row.receivedChequeState] : "ยังไม่เข้าวงจร / อ่านอย่างเดียว"}</td></tr>)}</tbody></table></div>
  </div>;
}
