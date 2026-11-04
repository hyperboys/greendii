import { AccountingApprovalSignatures } from "./accounting-approval-signatures";
import { hasApprovedActors } from "@/lib/accounting-approval";
import { openingStatuses, type StockOpeningBalance } from "@/lib/stock-opening-balance";
import { formatAccountingDate } from "@/lib/accounting-date";

const qty = (value: string | number) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export function StockOpeningDocument({ document: doc }: { document: StockOpeningBalance }) {
  return <section className="opening-print space-y-3 rounded border bg-white p-4">
    <h1 className="flex items-center justify-between text-xl font-bold">
      <span>ใบยอดยกมาคลัง (OB) · {doc.openingNo}</span>
      {hasApprovedActors(doc) && <span className="block h-12 w-2/5"><AccountingApprovalSignatures document={doc} compact /></span>}
    </h1>
    <p>สถานะ: <strong>{openingStatuses[doc.status] || doc.status}</strong></p>
    <p>วันเริ่มใช้ {formatAccountingDate(doc.cutoverDate)} · คลัง {doc.warehouseSnapshot?.name || doc.warehouseId}</p>
    <p>หมายเหตุ: {doc.remark || "-"}</p>
    <p>ผลต่างเท่านั้นที่มี Movement เมื่ออนุมัติ; ยอดตรวจนับไม่ได้ถูกบวกซ้ำทั้งจำนวน</p>
    <table className="w-full text-left text-sm">
      <thead><tr><th>สินค้า</th><th>หน่วย</th><th>ยอดตาม Movement</th><th>ยอดตรวจนับ</th><th>ผลต่าง</th></tr></thead>
      <tbody>{doc.items.map(line => <tr key={line.id}>
        <td>{line.productSnapshot.code} · {line.productSnapshot.name}</td><td>{line.productSnapshot.unit}</td>
        <td>{qty(line.bookQtyAtCutover)}</td><td>{qty(line.countedQty)}</td><td>{Number(line.deltaQty) > 0 ? "+" : ""}{qty(line.deltaQty)}</td>
      </tr>)}</tbody>
    </table>
    {!!doc.movements?.length && <div><h2 className="font-bold">Stock Movements</h2>{doc.movements.map(row => <p key={row.id} className="text-sm">
      {row.sourceDocType === "stock_opening_balance_reversal" ? "กลับรายการ" : "ปรับยอด"} · เข้า {qty(row.qtyIn)} · ออก {qty(row.qtyOut)} · {formatAccountingDate(row.transactionDate)}
    </p>)}</div>}
    {!!doc.history?.length && <div><h2 className="font-bold">ประวัติการดำเนินการ</h2>{doc.history.map(row => <p key={row.id} className="text-sm">
      {row.createdAt.slice(0, 16).replace("T", " ")} · {row.performedBy?.fullName || "-"} · {row.action}{row.reason ? ` · ${row.reason}` : ""}
    </p>)}</div>}
    <style>{`@media print {
      @page { size: A4; margin: 8mm; }
      .opening-print { display:block!important; width:100%; border:0!important; padding:0!important; }
      .opening-print table { width:100%; border-collapse:collapse; }
      .opening-print th,.opening-print td { border-bottom:1px solid #888; padding:6px; text-align:left; }
      .opening-print tr { break-inside:avoid; }
    }`}</style>
  </section>;
}
