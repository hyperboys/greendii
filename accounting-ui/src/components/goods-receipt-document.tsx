"use client";
import { useEffect, useRef, useState } from "react";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import { receiptStatuses, type GoodsReceipt } from "@/lib/goods-receipt";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
export function GoodsReceiptDocument({ document: doc, company, onReady }: {
  document: GoodsReceipt; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null), [error, setError] = useState("");
  const pages = Array.from({ length: Math.max(1, Math.ceil(doc.items.length / 7)) }, (_, i) => doc.items.slice(i * 7, i * 7 + 7));
  const approval = doc.history?.find(row => row.action === "approve");
  useEffect(() => {
    let current = true; onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-gr-fit]"))) {
        for (let size = 10; size >= 8; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      for (const page of Array.from(root.current.querySelectorAll<HTMLElement>(".gr-paper"))) {
        if (page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1) overflow = true;
      }
      setError(overflow ? "ข้อมูลยาวเกินแบบ GR กรุณาย่อข้อความก่อนพิมพ์" : ""); onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>{error && <p role="alert" className="gr-no-print text-red-700">{error}</p>}
    <div id="gr-print-doc" ref={root}>{pages.map((items, page) => <article className="gr-paper" key={page}>
      <header><h1 data-gr-fit>{company.companyName || ""}</h1><p data-gr-fit>{company.address || ""}</p><p data-gr-fit>Tax ID {company.taxId || ""} · โทร. {company.tel || ""}</p></header>
      <h2>ใบรับสินค้า / ตรวจรับบริการ (GR)</h2>
      <section className="gr-meta"><p>เลขที่ {doc.grNo}</p><p>วันที่ {date(doc.receiptDate)} · หน้า {page + 1}/{pages.length}</p>
        <p>PO {doc.poNo || "-"}</p><p>สถานะ {receiptStatuses[doc.status] || doc.status}</p></section>
      <section className="gr-parties"><p data-gr-fit>ผู้ขาย {doc.supplierSnapshot?.name || ""} · Tax ID {doc.supplierSnapshot?.taxId || ""}</p>
        <p data-gr-fit>คลัง {doc.warehouseSnapshot?.name || "บริการ / ไม่เพิ่ม Stock"}</p>
        <p data-gr-fit>ผู้ส่ง {doc.sender} · ผู้รับ {doc.receiver}</p></section>
      <table><thead><tr><th>รายการ / หน่วย</th><th>สั่ง</th><th>รับก่อน</th><th>รอตรวจอื่น</th><th>รับครั้งนี้</th><th>เหลือ</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}><td><div data-gr-fit>{item.seq + 1}. {item.desc}<br />{item.productSnapshot?.code} · {item.productSnapshot?.name} · {item.unit}{item.productSnapshot?.productType === "service" ? " (บริการ)" : ""}</div></td>
          {[item.orderedQty, item.previouslyReceivedQty, item.pendingQty, item.currentReceiptQty, item.remainingQty].map((value, i) => <td key={i} data-gr-fit>{Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>)}</tr>)}</tbody></table>
      <section className="gr-note" data-gr-fit>หมายเหตุ {doc.remark || ""}{doc.cancellationReason ? `\nยกเลิก ${date(doc.cancelledAt)}: ${doc.cancellationReason}` : ""}</section>
      <p className="gr-policy">ยอดจำนวนเป็น snapshot ณ บันทึก/ส่งตรวจ/อนุมัติ ไม่ใช่ Stock ปัจจุบัน · บริการไม่เพิ่ม Stock · ไม่ลง GL</p>
      <p className="gr-approval" data-gr-fit>{approval ? `อนุมัติโดย ${approval.performedBy?.fullName || "-"} · ${date(approval.createdAt)}` : "ยังไม่มีประวัติอนุมัติ"} · ช่องลงนามว่าง ไม่ใช่ลายเซ็นดิจิทัล</p>
      <footer>{["ผู้ส่ง", "ผู้รับ / ตรวจรับ", "ผู้อนุมัติ"].map(label => <div key={label}><p>{label}</p><span>ลงชื่อ __________________</span><span>วันที่ __________________</span></div>)}</footer>
    </article>)}</div>
  </>;
}
export function GoodsReceiptPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    .gr-paper { box-sizing:border-box; width:210mm; height:296mm; margin:0 auto 8mm; padding:10mm; background:white; color:black; font:10pt/1.4 Tahoma,Arial,sans-serif; }
    .gr-paper * { box-sizing:border-box; } .gr-paper header { text-align:center; height:25mm; }
    .gr-paper header h1 { height:9mm; font-size:15pt; font-weight:bold; } .gr-paper header p { height:8mm; }
    .gr-paper h2 { height:12mm; text-align:center; font-size:16pt; font-weight:bold; }
    .gr-meta { display:grid; grid-template-columns:1fr 1fr; border:1px solid black; padding:2mm; height:20mm; }
    .gr-parties { border:1px solid black; border-top:0; padding:2mm; } .gr-parties p { height:9mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .accounting-shell .gr-paper table { min-width:0; width:100%; table-layout:fixed; border-collapse:collapse; margin-top:3mm; font-size:9pt; }
    .gr-paper th,.gr-paper td { border:1px solid black; padding:1mm; text-align:right; }
    .gr-paper th:first-child,.gr-paper td:first-child { width:43%; text-align:left; }
    .gr-paper td div { height:12mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .gr-note { height:22mm; border:1px solid black; padding:2mm; white-space:pre-wrap; overflow-wrap:anywhere; margin-top:3mm; }
    .gr-policy { font-size:8pt; height:10mm; padding-top:2mm; } .gr-approval { height:10mm; overflow-wrap:anywhere; }
    .gr-paper footer { display:grid; grid-template-columns:repeat(3,1fr); height:27mm; border:1px solid black; text-align:center; font-size:9pt; }
    .gr-paper footer div { border-right:1px solid black; min-width:0; } .gr-paper footer div:last-child { border:0; }
    .gr-paper footer p { padding:2mm; } .gr-paper footer span { display:block; padding:1mm; }
    @media print {
      @page { size:A4 portrait; margin:0; } html,body { width:210mm !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; min-height:0 !important; width:210mm !important; padding:0 !important; margin:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell footer:not(.gr-paper footer),.gr-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main { width:210mm !important; max-width:none !important; margin:0 !important; padding:0 !important; }
      .gr-preview { width:210mm !important; margin:0 !important; padding:0 !important; overflow:visible !important; }
      #gr-print-doc { display:${allowed ? "block" : "none"} !important; }
      .gr-paper { margin:0; break-after:page; } .gr-paper:last-child { break-after:auto; }
    }
  `}</style>;
}
