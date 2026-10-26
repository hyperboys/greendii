"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InventoryApi } from "@/lib/api";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { inventoryTabs } from "@/lib/accounting-navigation";
import { formatAccountingDateTime } from "@/lib/accounting-date";
type Product = { code?: string; name?: string; unit?: string; productType?: string };
type Balance = { id: string; warehouseId: string; warehouse?: { name: string }; product?: Product; onHand: string | number; reserved: string | number; available: string | number };
type Movement = { id: string; transactionDate: string; movementType: string; sourceDocType: string; sourceDocId: string; sourceDocNo: string | null;
  warehouse?: { name: string }; product?: Product; qtyIn: string | number; qtyOut: string | number };
export function InventoryData({ activeTab }: { activeTab: "balances" | "movements" }) {
  const canCreate = canUseAccounting(useAccountingAccess(), "inventory", "create");
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [balances, setBalances] = useState<Balance[]>([]), [movements, setMovements] = useState<Movement[]>([]);
  useEffect(() => {
    let current = true; setLoading(true); setError("");
    async function load() {
      if (activeTab === "balances") { const data = await InventoryApi.getBalances(); if (current) setBalances(data); }
      else { const data = await InventoryApi.getMovements(); if (current) setMovements(data); }
    }
    void load().catch(error => { if (current) setError(error instanceof Error ? error.message : "โหลดข้อมูลคลังไม่สำเร็จ"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [activeTab, reload]);
  const n = (value: number | string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
  function source(row: Movement) {
    if (["stock_issue", "stock_issue_reversal"].includes(row.sourceDocType)) return `/inventory/issues/${encodeURIComponent(row.sourceDocId)}`;
    if (["goods_receipt", "goods_receipt_reversal"].includes(row.sourceDocType)) return `/ap/vouchers/gr/${encodeURIComponent(row.sourceDocId)}`;
    return null;
  }
  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-blue-600">Inventory &amp; Store</p>
      <h1 className="text-2xl font-bold">คลังสินค้า &amp; การ์ดสินค้า (Stock Card)</h1><p className="text-sm text-gray-600">On Hand, Reserved, Available และประวัติการเคลื่อนย้ายสินค้า</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/inventory?tab=issues" className="rounded border bg-white px-4 py-2">ทะเบียนใบเบิก</Link>
        {canCreate && <Link href="/inventory/issues/new" className="rounded bg-blue-600 px-4 py-2 text-white">ทำรายการเบิกสินค้า</Link>}</div></header>
    <h2 className="font-bold">{inventoryTabs.find(tab => tab.id === activeTab)?.label}</h2>
    {loading && <p role="status">กำลังโหลดข้อมูลสต็อก...</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error} <button className="rounded border px-3 py-2" onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></p>}
    {!loading && !error && <div className="overflow-x-auto rounded border bg-white">
      {activeTab === "balances" ? <><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">คลัง</th><th>สินค้า</th><th>ประเภท</th><th>On Hand</th><th>Reserved</th><th>Available</th></tr></thead>
        <tbody>{balances.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.warehouse?.name || row.warehouseId}</td><td>{row.product?.name}<br />{row.product?.code}</td><td>{row.product?.productType}</td>
          <td>{n(row.onHand)} {row.product?.unit}</td><td>{n(row.reserved)}</td><td className="font-bold">{n(row.available)}</td></tr>)}</tbody></table>{!balances.length && <p className="p-4">ยังไม่มีข้อมูลสินค้าคงเหลือในคลัง</p>}</> :
        <><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">วันที่ / เวลา</th><th>ประเภท</th><th>อ้างอิง</th><th>คลัง</th><th>สินค้า</th><th>เข้า (+)</th><th>ออก (-)</th></tr></thead>
          <tbody>{movements.map(row => <tr key={row.id} className="border-t"><td className="p-3">{formatAccountingDateTime(row.transactionDate)}</td>
            <td><span className="flex items-center gap-1">{Number(row.qtyIn) > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}{row.movementType === "reversal" ? "กลับรายการ" : Number(row.qtyIn) > 0 ? "รับเข้า" : "เบิกออก"}</span></td>
            <td>{source(row) ? <Link className="text-blue-700" href={source(row)!}>{row.sourceDocNo || row.sourceDocType}</Link> : row.sourceDocNo || row.sourceDocType}</td><td>{row.warehouse?.name}</td><td>{row.product?.name}</td>
            <td>{Number(row.qtyIn) > 0 ? `+${n(row.qtyIn)}` : "-"}</td><td>{Number(row.qtyOut) > 0 ? `-${n(row.qtyOut)}` : "-"}</td></tr>)}</tbody></table>{!movements.length && <p className="p-4">ยังไม่มีประวัติการเคลื่อนย้ายสินค้า</p>}</>}
    </div>}
  </div>;
}
