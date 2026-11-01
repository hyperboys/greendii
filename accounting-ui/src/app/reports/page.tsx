"use client";

import { useEffect, useState } from "react";
import { ReportsApi } from "@/lib/api";
import { RefreshCw, FileSpreadsheet, Printer } from "lucide-react";
import { AccountingSearchParams, reportTabs, selectedTab } from "@/lib/accounting-navigation";
import { DateInput } from "@/components/date-input";
import { localAccountingDate } from "@/lib/stock-card";
import { formatAccountingDate } from "@/lib/accounting-date";
import {
  AccountingReport, ReportTab, ReceiptState, isReceiptState, receiptStateLabels, reportColumns, reportValue,
  filterReportRows, exportAccountingReport, agingReportTabs,
} from "@/lib/accounting-reports";

const field = "mt-1 h-10 w-full rounded border border-[#dfe5de] bg-white px-3";
const button = "flex h-10 items-center justify-center gap-2 rounded border border-[#dfe5de] bg-white px-4 text-sm font-bold disabled:opacity-50";

export default function ReportsPage({ searchParams = {} }: { searchParams?: AccountingSearchParams }) {
  const activeTab = selectedTab(reportTabs, searchParams.tab);
  const tab: ReportTab = activeTab;
  const aging = agingReportTabs.includes(tab);
  const [dates, setDates] = useState(() => {
    const today = localAccountingDate();
    return { asOfDate: today, from: `${today.slice(0, 7)}-01`, to: today };
  });
  const [applied, setApplied] = useState(dates);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<ReceiptState | "">("");
  const [result, setResult] = useState<{ tab: ReportTab; report: AccountingReport } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setResult(null);
    const request = tab === "arAging" ? ReportsApi.getArAging(applied.asOfDate)
      : tab === "apAging" ? ReportsApi.getApAging(applied.asOfDate)
        : tab === "apPoCommitment" ? ReportsApi.getApPoCommitment(applied.asOfDate)
        : tab === "reconDelivery" ? ReportsApi.getReconDeliveryToInvoice(applied)
          : ReportsApi.getReconPoToGoodsReceipt(applied);
    request.then(report => {
      if (!cancelled) setResult({ tab, report });
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายงานได้");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, applied, refresh]);

  const report = result?.tab === tab ? result.report : null;
  const rows = report ? filterReportRows(report.rows, search, aging ? "" : state) : [];
  const columns = reportColumns(tab);
  const title = tab === "apAging" ? "วิเคราะห์อายุเจ้าหนี้ตามใบแจ้งหนี้ผู้ขายที่ตั้งหนี้แล้ว"
    : tab === "apPoCommitment" ? "ยอด PO ตามอายุวันที่สั่งซื้อ (ยอดผูกพัน ไม่ใช่หนี้)"
    : reportTabs.find(item => item.id === tab)?.label || "รายงาน";
  const ready = !loading && !error && report !== null;

  return <main className="accounting-report mx-auto max-w-370">
    <header className="mb-5">
      <p className="report-controls text-xs font-bold uppercase text-[#0866ff]">Financial & Reconciliation Reports</p>
      <h1 className="mt-1 text-2xl font-bold">รายงานการเงิน & การกระทบยอด</h1>
      <h2 className="mt-2 text-lg font-bold">{title}</h2>
    </header>
    <form className="report-controls mb-4 grid gap-3 rounded border bg-white p-4 sm:grid-cols-3" onSubmit={event => {
      event.preventDefault();
      if (!aging && dates.from && dates.to && dates.from > dates.to) {
        setError("ตั้งแต่วันที่ต้องไม่เกินถึงวันที่"); return;
      }
      setApplied({ ...dates }); setRefresh(value => value + 1);
    }}>
      {aging ? <label>วันที่อ้างอิงจัดอายุ
        <DateInput required className={field} value={dates.asOfDate} onChange={asOfDate => setDates(value => ({ ...value, asOfDate }))} />
      </label> : <>
        <label>ตั้งแต่วันที่เอกสารต้นทาง
          <DateInput className={field} value={dates.from} onChange={from => setDates(value => ({ ...value, from }))} />
        </label>
        <label>ถึงวันที่เอกสารต้นทาง
          <DateInput className={field} value={dates.to} onChange={to => setDates(value => ({ ...value, to }))} />
        </label>
      </>}
      <button className={`${button} self-end`} disabled={loading}><RefreshCw size={16} />ประมวลผล / รีเฟรช</button>
      <label>{tab === "apAging" ? "ค้นหาเลขที่ตั้งหนี้ / ใบแจ้งหนี้ / ใบกำกับภาษี / ผู้ขาย" : "ค้นหาเลขที่เอกสาร / คู่ค้า"}
        <input className={field} value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      {!aging && <label>สถานะกระทบยอด
        <select className={field} value={state} onChange={event => {
          const value = event.target.value;
          if (value === "" || isReceiptState(value)) setState(value);
        }}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(receiptStateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>}
      <div className="flex flex-wrap gap-2 self-end">
        <button type="button" className={button} disabled={!ready || !rows.length} onClick={() => {
          if (report) exportAccountingReport(report, rows, tab);
        }}><FileSpreadsheet size={16} />CSV ตามตัวกรอง</button>
        <button type="button" className={button} disabled={!ready} onClick={() => window.print()}><Printer size={16} />พิมพ์ / PDF</button>
      </div>
    </form>
    {error && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {report && <div className="mb-4 space-y-2">
      {report.asOfDate ? <p>วันที่อ้างอิง {formatAccountingDate(report.asOfDate)}</p>
        : <p>ช่วงวันที่ต้นทาง {report.from ? formatAccountingDate(report.from) : "ทั้งหมด"} – {report.to ? formatAccountingDate(report.to) : "ทั้งหมด"} · สถานะเอกสารปัจจุบัน</p>}
      <p>ค้นหา: {search.trim() || "ทั้งหมด"} · สถานะ: {aging || !state ? "ทั้งหมด" : receiptStateLabels[state]} · {rows.length} รายการ</p>
      {report.warnings.map(warning => <p key={warning} className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
    </div>}
    {loading ? <p className="p-8 text-center">กำลังประมวลผลรายงาน...</p>
      : ready && !rows.length ? <p className="p-8 text-center">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</p>
        : ready && <div className="report-table overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-[#f8faf7]"><tr>{columns.map(column =>
              <th key={column.key} className={`p-3 ${column.format === "money" ? "text-right" : ""}`}>{column.label}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.documentNo} className="border-b">
              {columns.map(column => <td key={column.key} className={`p-3 ${column.format === "money" ? "text-right tabular-nums" : ""}`}>
                {reportValue(row, column)}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>}
    {ready && tab === "reconPo" && rows.some(row => row.lines?.length) && <section className="mt-5">
      <h3 className="mb-2 font-bold">รายละเอียดจำนวนต่อรายการ PO (ไม่รวมจำนวนต่างหน่วย)</h3>
      <div className="report-table overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
        <thead><tr>{["PO", "รายการ", "หน่วย", "สั่งซื้อ", "รับอนุมัติแล้ว", "รออนุมัติ", "ยังไม่รับ"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.flatMap(row => (row.lines || []).map(line => <tr key={`${row.documentNo}-${line.poLineId}`} className="border-t">
          <td className="p-3">{row.documentNo}</td><td className="p-3">{line.desc}</td><td className="p-3">{line.unit}</td>
          {[line.orderedQty, line.receivedQty, line.pendingQty, line.remainingQty].map((qty, index) => <td className="p-3" key={index}>{qty.toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>)}
        </tr>))}</tbody>
      </table></div>
    </section>}
    <style jsx global>{`@media print {
      body * { visibility: hidden; }
      .accounting-report, .accounting-report * { visibility: visible; }
      .accounting-report { position: absolute; left: 0; top: 0; width: 100%; font-family: var(--font-body); color: #000; }
      .accounting-report .report-controls { display: none !important; }
      .accounting-report .report-table { overflow: visible; border: 0; }
      .accounting-report table { width: 100%; min-width: 0; table-layout: fixed; overflow-wrap: anywhere; border-collapse: collapse; font-size: 10pt; }
      .accounting-report th, .accounting-report td { border: 1px solid #555; padding: 4px; }
      .accounting-report thead { display: table-header-group; }
      .accounting-report tr { break-inside: avoid; }
    }`}</style>
  </main>;
}
