"use client";
import { useEffect, useRef, useState } from "react";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import { issueStatuses, type StockIssue } from "@/lib/stock-issue";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
export function StockIssueDocument({ document: doc, company, onReady }: {
  document: StockIssue; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null), [error, setError] = useState("");
  const pages = Array.from({ length: Math.max(1, Math.ceil(doc.items.length / 8)) }, (_, i) => doc.items.slice(i * 8, i * 8 + 8));
  const approval = doc.history?.find(row => row.action === "approve");
  useEffect(() => {
    let current = true; onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-is-fit]"))) {
        for (let size = 10; size >= 8; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      for (const page of Array.from(root.current.querySelectorAll<HTMLElement>(".is-paper"))) {
        if (page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1) overflow = true;
      }
      setError(overflow ? "ข้อมูลยาวเกินแบบใบเบิก กรุณาย่อข้อความก่อนพิมพ์" : ""); onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>{error && <p role="alert" className="is-no-print text-red-700">{error}</p>}
    <div id="is-print-doc" ref={root}>{pages.map((items, page) => <article className="is-paper" key={page}>
      <header><h1 data-is-fit>{company.companyName || ""}</h1><p data-is-fit>{company.address || ""}</p><p data-is-fit>Tax ID {company.taxId || ""} · โทร. {company.tel || ""}</p></header>
      <h2>ใบเบิกสินค้า (Stock Issue)</h2>
      <section className="is-meta"><p>เลขที่ {doc.issueNo}</p><p>วันที่ {date(doc.issueDate)} · หน้า {page + 1}/{pages.length}</p>
        <p>สถานะ {issueStatuses[doc.status] || doc.status}</p></section>
      <section className="is-parties"><p data-is-fit>คลัง {doc.warehouseSnapshot?.code} · {doc.warehouseSnapshot?.name}</p>
        <p data-is-fit>WO {doc.workOrderSnapshot ? `${doc.workOrderSnapshot.woNo} · ${doc.workOrderSnapshot.project || ""}` : "ไม่อ้างอิง"}</p>
        <p data-is-fit>ผู้ขอ {doc.requester} · ผู้รับของ {doc.receiver}</p></section>
      <table><thead><tr><th>สินค้า / หน่วย</th><th>ขอ</th><th>จ่ายตามใบนี้</th><th>ยกเลิกส่วนที่เหลือ</th></tr></thead><tbody>
        {items.map(item => <tr key={item.id}><td><div data-is-fit>{item.seq + 1}. {item.productSnapshot?.code} · {item.productSnapshot?.name || item.productId}<br />หน่วย {item.productSnapshot?.unit}</div></td>
          {[item.requestedQty, item.issuedQty, item.cancelledQty].map((value, i) => <td data-is-fit key={i}>{Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>)}</tr>)}
      </tbody></table>
      <section className="is-note" data-is-fit>หมายเหตุ {doc.remark || ""}{doc.cancellationReason ? `\nยกเลิก ${date(doc.cancelledAt)}: ${doc.cancellationReason}` : ""}</section>
      <p className="is-policy">Draft / รออนุมัติ ยังไม่จ่ายและไม่จอง Stock · อนุมัติแล้วตัดตามจำนวนจ่าย ส่วนที่เหลือยกเลิก ไม่มีค้างส่ง · ไม่ลง GL</p>
      <p className="is-approval" data-is-fit>{approval ? `อนุมัติโดย ${approval.performedBy?.fullName || "-"} · ${date(approval.createdAt)}` : "ยังไม่มีประวัติอนุมัติ"} · ช่องลงนามว่าง ไม่ใช่ลายเซ็นดิจิทัล</p>
      <footer>{["ผู้ขอ / ผู้จ่าย", "ผู้รับของ", "ผู้อนุมัติ"].map(label => <div key={label}><p>{label}</p><span>ลงชื่อ __________________</span><span>วันที่ __________________</span></div>)}</footer>
    </article>)}</div></>;
}
export function StockIssuePrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    .is-paper { box-sizing:border-box; width:210mm; height:296mm; margin:0 auto 8mm; padding:10mm; background:white; color:black; font:10pt/1.4 Tahoma,Arial,sans-serif; }
    .is-paper * { box-sizing:border-box; } .is-paper header { text-align:center; height:25mm; }
    .is-paper header h1 { height:9mm; font-size:15pt; font-weight:bold; } .is-paper header p { height:8mm; }
    .is-paper h2 { height:12mm; text-align:center; font-size:16pt; font-weight:bold; }
    .is-meta { display:grid; grid-template-columns:1fr 1fr; border:1px solid black; padding:2mm; height:20mm; }
    .is-parties { border:1px solid black; border-top:0; padding:2mm; } .is-parties p { height:9mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .accounting-shell .is-paper table { min-width:0; width:100%; table-layout:fixed; border-collapse:collapse; margin-top:3mm; font-size:9pt; }
    .is-paper th,.is-paper td { border:1px solid black; padding:1mm; text-align:right; }
    .is-paper th:first-child,.is-paper td:first-child { width:46%; text-align:left; }
    .is-paper td div { height:10mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .is-note { height:22mm; border:1px solid black; padding:2mm; white-space:pre-wrap; overflow-wrap:anywhere; margin-top:3mm; }
    .is-policy { font-size:8pt; height:10mm; padding-top:2mm; } .is-approval { height:10mm; overflow-wrap:anywhere; }
    .is-paper footer { display:grid; grid-template-columns:repeat(3,1fr); height:27mm; border:1px solid black; text-align:center; font-size:9pt; }
    .is-paper footer div { border-right:1px solid black; min-width:0; } .is-paper footer div:last-child { border:0; }
    .is-paper footer p { padding:2mm; } .is-paper footer span { display:block; padding:1mm; }
    @media print {
      @page { size:A4 portrait; margin:0; } html,body { width:210mm !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; min-height:0 !important; width:210mm !important; padding:0 !important; margin:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell footer:not(.is-paper footer),.is-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main { width:210mm !important; max-width:none !important; margin:0 !important; padding:0 !important; }
      .is-preview { width:210mm !important; margin:0 !important; padding:0 !important; overflow:visible !important; }
      #is-print-doc { display:${allowed ? "block" : "none"} !important; }
      .is-paper { margin:0; break-after:page; } .is-paper:last-child { break-after:auto; }
    }
  `}</style>;
}
