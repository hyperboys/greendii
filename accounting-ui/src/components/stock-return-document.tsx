"use client";
import { useEffect, useRef, useState } from "react";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import { returnStatuses, type StockReturn } from "@/lib/stock-return";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { fitStockDocument } from "./stock-issue-document";
export { StockIssuePrintStyles as StockReturnPrintStyles } from "./stock-issue-document";
export function StockReturnDocument({ document: doc, company, onReady }: {
  document: StockReturn; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null), [error, setError] = useState("");
  const pages = Array.from({ length: Math.max(1, Math.ceil(doc.items.length / 8)) }, (_, i) => doc.items.slice(i * 8, i * 8 + 8));
  const approval = doc.history?.find(row => row.action === "approve");
  useEffect(() => {
    let current = true; onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      const overflow = !fitStockDocument(root.current);
      setError(overflow ? "ข้อมูลยาวเกินแบบใบคืน กรุณาย่อข้อความก่อนพิมพ์" : ""); onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>{error && <p role="alert" className="is-no-print text-red-700">{error}</p>}
    <div id="is-print-doc" ref={root}>{pages.map((items, page) => <article className="is-paper" key={page}>
      <header><h1 data-is-fit>{company.companyName || ""}</h1><p data-is-fit>{company.address || ""}</p><p data-is-fit>Tax ID {company.taxId || ""} · โทร. {company.tel || ""}</p></header>
      <h2>ใบคืนสินค้า (Stock Return)</h2>
      <section className="is-meta"><p>เลขที่ {doc.returnNo}</p><p>วันที่ {date(doc.returnDate)} · หน้า {page + 1}/{pages.length}</p><p>สถานะ {returnStatuses[doc.status] || doc.status} · ของดี</p></section>
      <section className="is-parties"><p data-is-fit>IS {doc.issueSnapshot?.issueNo} · คลังเดิม {doc.warehouseSnapshot?.code} · {doc.warehouseSnapshot?.name}</p>
        <p data-is-fit>WO {doc.workOrderSnapshot?.woNo || "ไม่อ้างอิง"} · {doc.workOrderSnapshot?.project}</p>
        <p data-is-fit>ผู้ส่งคืน {doc.sender} · ผู้รับคืน {doc.receiver}</p></section>
      <table><thead><tr><th>สินค้า / หน่วย</th><th>จ่ายจริง IS</th><th>คืนใบนี้</th><th>เหลือคืน ณ บันทึก</th></tr></thead><tbody>
        {items.map(item => <tr key={item.id}><td><div data-is-fit>{item.seq + 1}. {item.productSnapshot?.code} · {item.productSnapshot?.name || item.productId}<br />หน่วย {item.productSnapshot?.unit}</div></td>
          {[item.issuedQty, item.returnedQty, item.remainingQty].map((value, i) => <td data-is-fit key={i}>{Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>)}</tr>)}
      </tbody></table>
      <section className="is-note" data-is-fit>เหตุผลคืน {doc.returnReason} · หมายเหตุ {doc.remark || ""}{doc.cancellationReason ? `\nยกเลิก ${date(doc.cancelledAt)}: ${doc.cancellationReason}` : ""}</section>
      <p className="is-policy">Draft ไม่กันยอด · รออนุมัติกันสิทธิ์คืนจาก IS แต่ไม่เพิ่ม Stock · อนุมัติรับของจริงเพิ่ม Stock · ไม่รับของชำรุด / ไม่ลง GL</p>
      <p className="is-approval" data-is-fit>{approval ? `อนุมัติโดย ${approval.performedBy?.fullName || "-"} · ${date(approval.createdAt)}` : "ยังไม่มีประวัติอนุมัติ"} · ช่องลงนามว่าง ไม่ใช่ลายเซ็นดิจิทัล</p>
      <footer>{["ผู้ส่งคืน", "ผู้รับคืน", "ผู้อนุมัติ"].map(label => <div key={label}><p>{label}</p><span>ลงชื่อ __________________</span><span>วันที่ __________________</span></div>)}</footer>
    </article>)}</div></>;
}
