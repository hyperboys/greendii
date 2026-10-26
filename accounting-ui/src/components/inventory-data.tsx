"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InventoryApi } from "@/lib/api";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { inventoryTabs } from "@/lib/accounting-navigation";
import { formatAccountingDateTime } from "@/lib/accounting-date";
import { DateInput } from "@/components/date-input";
import { StockCardApi, exportStockCard, stockCardDefaults, type StockCardFilters, type StockCardLookups, type StockCardMovement, type StockCardReport } from "@/lib/stock-card";
type Product = { code?: string; name?: string; unit?: string; productType?: string };
type Balance = { id: string; warehouseId: string; warehouse?: { name: string }; product?: Product; onHand: string | number; reserved: string | number; available: string | number };
const control = "rounded border bg-white px-3 py-2 text-sm";
const button = "rounded border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const number = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const initialFilters = stockCardDefaults();

export function InventoryData({ activeTab }: { activeTab: "balances" | "movements" }) {
  const canCreate = canUseAccounting(useAccountingAccess(), "inventory", "create");
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [filters, setFilters] = useState<StockCardFilters>(initialFilters), [query, setQuery] = useState<StockCardFilters>(initialFilters);
  const [lookups, setLookups] = useState<StockCardLookups>({ products: [], warehouses: [] });
  const [report, setReport] = useState<StockCardReport | null>(null), [page, setPage] = useState(1);
  useEffect(() => {
    let current = true; setLoading(true); setError("");
    async function load() {
      if (activeTab === "balances") {
        const data = await InventoryApi.getBalances();
        if (current) setBalances(data);
      } else {
        const [data, options] = await Promise.all([StockCardApi.report(query), StockCardApi.lookups()]);
        if (current) { setReport(data); setLookups(options); }
      }
    }
    void load().catch(error => { if (current) setError(error instanceof Error ? error.message : "โหลดข้อมูลคลังไม่สำเร็จ"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [activeTab, query, reload]);
  const n = (value: number | string) => number(value);
  function source(row: StockCardMovement) {
    if (["stock_return", "stock_return_reversal"].includes(row.sourceDocType)) return `/inventory/returns/${encodeURIComponent(row.sourceDocId)}`;
    if (["stock_issue", "stock_issue_reversal"].includes(row.sourceDocType)) return `/inventory/issues/${encodeURIComponent(row.sourceDocId)}`;
    if (["goods_receipt", "goods_receipt_reversal"].includes(row.sourceDocType)) return `/ap/vouchers/gr/${encodeURIComponent(row.sourceDocId)}`;
    return null;
  }
  const currentRows = report?.rows.slice((page - 1) * 20, page * 20) || [];
  const totalPages = Math.ceil((report?.rows.length || 0) / 20);
  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-blue-600">Inventory &amp; Store</p>
      <h1 className="text-2xl font-bold">คลังสินค้า &amp; การ์ดสินค้า (Stock Card)</h1><p className="text-sm text-gray-600">ยอดยกมาต้นช่วง · รับเข้า · จ่ายออก · ยอดสะสม แยกสินค้าและคลัง</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/inventory?tab=issues" className={button}>ทะเบียนใบเบิก</Link>
        <Link href="/inventory?tab=returns" className={button}>ทะเบียนใบคืน</Link>
        <Link href="/inventory?tab=opening-balances" className={button}>ยอดยกมา (OB)</Link>
        {canCreate && <Link href="/inventory/issues/new" className="rounded bg-blue-600 px-4 py-2 text-white">ทำรายการเบิกสินค้า</Link>}</div></header>
    <h2 className="font-bold">{inventoryTabs.find(tab => tab.id === activeTab)?.label}</h2>
    {activeTab === "movements" && <form className="is-no-print flex flex-wrap items-end gap-3 rounded border bg-white p-3"
      onSubmit={event => { event.preventDefault(); setPage(1); setQuery({ ...filters }); }}>
      <label className="grid gap-1 text-sm">ตั้งแต่วันที่<DateInput required value={filters.from} onChange={from => setFilters(value => ({ ...value, from }))} className={control} /></label>
      <label className="grid gap-1 text-sm">ถึงวันที่<DateInput required value={filters.to} onChange={to => setFilters(value => ({ ...value, to }))} className={control} /></label>
      <label className="grid min-w-52 gap-1 text-sm">สินค้า<select className={control} value={filters.productId} onChange={event => setFilters(value => ({ ...value, productId: event.target.value }))}>
        <option value="">ทุกสินค้า</option>{lookups.products.map(row => <option key={row.id} value={row.id}>{row.code} - {row.name}{row.active ? "" : " (ไม่ใช้งาน)"}</option>)}</select></label>
      <label className="grid min-w-44 gap-1 text-sm">คลัง<select className={control} value={filters.warehouseId} onChange={event => setFilters(value => ({ ...value, warehouseId: event.target.value }))}>
        <option value="">ทุกคลัง</option>{lookups.warehouses.map(row => <option key={row.id} value={row.id}>{row.code} - {row.name}{row.active ? "" : " (ไม่ใช้งาน)"}</option>)}</select></label>
      <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">ค้นหา</button>
      <button type="button" className={button} disabled={loading || !report?.rows.length} onClick={() => report && exportStockCard(report.rows, report.from, report.to)}>CSV ตามตัวกรองทั้งหมด</button>
      <button type="button" className={button} disabled={loading || !report} onClick={() => window.print()}>พิมพ์ / PDF</button>
      <p className="w-full text-xs text-amber-800">ยอดยกมาคำนวณจาก Movement ก่อนวันเริ่มต้น ไม่ใช่จากยอด Stock ปัจจุบัน; หากประวัติ Movement ก่อนช่วงรายงานไม่ครบ ยอดอาจไม่ตรงสต็อกจริง</p>
    </form>}
    {loading && <p role="status">กำลังโหลดข้อมูลสต็อก...</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error} <button className={button} onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {!loading && !error && <div className="space-y-4">
      {activeTab === "balances" ? <div className="overflow-x-auto rounded border bg-white"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">คลัง</th><th>สินค้า</th><th>ประเภท</th><th>On Hand</th><th>Reserved</th><th>Available</th></tr></thead>
        <tbody>{balances.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.warehouse?.name || row.warehouseId}</td><td>{row.product?.name}<br />{row.product?.code}</td><td>{row.product?.productType}</td>
          <td>{n(row.onHand)} {row.product?.unit}</td><td>{n(row.reserved)}</td><td className="font-bold">{n(row.available)}</td></tr>)}</tbody></table>{!balances.length && <p className="p-4">ยังไม่มีข้อมูลสินค้าคงเหลือในคลัง</p>}</div> :
        report && <>
          <section className="overflow-x-auto rounded border bg-white">
            <h3 className="px-3 pt-3 font-bold">สรุปยอดตามสินค้าและคลัง · {report.from} ถึง {report.to}</h3>
            <table className="w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-3">คลัง</th><th>รหัส / สินค้า</th><th>ยอดยกมา</th><th>รับเข้า</th><th>จ่ายออก</th><th>ยอดปลายช่วง</th></tr></thead>
              <tbody>{report.summaries.map(row => <tr key={`${row.productId}-${row.warehouseId}`} className="border-t">
                <td className="p-3">{row.warehouse.name}</td><td>{row.product.code} - {row.product.name} ({row.product.unit})</td>
                <td>{n(row.openingQty)}</td><td>{n(row.qtyIn)}</td><td>{n(row.qtyOut)}</td><td className="font-bold">{n(row.closingQty)}</td>
              </tr>)}</tbody>
            </table>
            {!report.summaries.length && <p className="p-3">ไม่พบ Movement ในช่วงวันที่ที่เลือก</p>}
          </section>
          <section className="overflow-x-auto rounded border bg-white">
            <table className="stock-card-screen-table w-full min-w-[1080px] text-left text-sm"><thead><tr><th className="p-3">วันที่ / เวลา</th><th>ประเภท</th><th>อ้างอิง</th><th>คลัง</th><th>สินค้า</th><th>ยอดก่อนรายการ</th><th>เข้า (+)</th><th>ออก (-)</th><th>ยอดสะสม</th></tr></thead>
              <tbody>{currentRows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{formatAccountingDateTime(row.transactionDate)}</td>
                <td><span className="flex items-center gap-1">{Number(row.qtyIn) > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}{row.movementType === "reversal" ? "กลับรายการ" : Number(row.qtyIn) > 0 ? "รับเข้า" : "จ่ายออก"}</span></td>
                <td>{source(row) ? <Link className="text-blue-700" href={source(row)!}>{row.sourceDocNo || row.sourceDocType}</Link> : row.sourceDocNo || row.sourceDocType}</td>
                <td>{row.warehouse.name}</td><td>{row.product.code} - {row.product.name}</td><td>{n(row.openingQty)}</td>
                <td>{Number(row.qtyIn) > 0 ? `+${n(row.qtyIn)}` : "-"}</td><td>{Number(row.qtyOut) > 0 ? `-${n(row.qtyOut)}` : "-"}</td><td className="font-bold">{n(row.runningQty)}</td></tr>)}</tbody>
            </table>
            {!report.rows.length && <p className="p-3">ไม่มีรายการเคลื่อนไหวในช่วงวันที่ที่เลือก</p>}
            {totalPages > 1 && <div className="is-no-print flex items-center justify-end gap-2 border-t p-3 text-sm">
              <span>{report.rows.length} รายการ · หน้า {page}/{totalPages}</span>
              <button className={button} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>ก่อนหน้า</button>
              <button className={button} disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>ถัดไป</button>
            </div>}
          </section>
        </>}
    </div>}
    {activeTab === "movements" && report && <div className="stock-card-print-only">
      <h1>Stock Card / รายงานการเคลื่อนไหวสินค้า</h1><p>ช่วงวันที่ {report.from} ถึง {report.to}</p>
      <p>หมายเหตุ: ยอดยกมาคำนวณจาก Movement ก่อนวันเริ่มต้น ไม่ใช่จาก StockBalance ปัจจุบัน</p>
      <h2>สรุปยอดตามสินค้าและคลัง</h2>
      <table><thead><tr><th>คลัง</th><th>สินค้า / หน่วย</th><th>ยอดยกมา</th><th>รับเข้า</th><th>จ่ายออก</th><th>ยอดปลายช่วง</th></tr></thead>
        <tbody>{report.summaries.map(row => <tr key={`${row.productId}-${row.warehouseId}`}><td>{row.warehouse.name}</td>
          <td>{row.product.code} - {row.product.name} ({row.product.unit})</td><td>{n(row.openingQty)}</td><td>{n(row.qtyIn)}</td>
          <td>{n(row.qtyOut)}</td><td>{n(row.closingQty)}</td></tr>)}</tbody></table>
      <table><thead><tr><th>วันที่ / เวลา</th><th>อ้างอิง</th><th>คลัง</th><th>สินค้า</th><th>ยอดก่อน</th><th>รับเข้า</th><th>จ่ายออก</th><th>ยอดสะสม</th></tr></thead>
        <tbody>{report.rows.map(row => <tr key={row.id}><td>{formatAccountingDateTime(row.transactionDate)}</td><td>{row.sourceDocNo || row.sourceDocType}</td>
          <td>{row.warehouse.name}</td><td>{row.product.code} - {row.product.name} ({row.product.unit})</td><td>{n(row.openingQty)}</td>
          <td>{n(row.qtyIn)}</td><td>{n(row.qtyOut)}</td><td>{n(row.runningQty)}</td></tr>)}</tbody></table>
    </div>}
    <style jsx global>{`@media screen{.stock-card-print-only{display:none}}@media print{body *{visibility:hidden}.stock-card-print-only,.stock-card-print-only *{visibility:visible}.stock-card-print-only{display:block!important;position:absolute;left:0;top:0;width:100%;font:10pt Arial,sans-serif}.stock-card-print-only h1{font-size:16pt}.stock-card-print-only table{width:100%;border-collapse:collapse}.stock-card-print-only th,.stock-card-print-only td{border:1px solid #444;padding:4px;text-align:left}.stock-card-print-only thead{display:table-header-group}.stock-card-print-only tr{break-inside:avoid}}`}</style>
  </div>;
}
