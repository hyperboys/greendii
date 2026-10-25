"use client";

import { useEffect, useRef, useState } from "react";
import { formatAccountingDate } from "@/lib/accounting-date";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import type { CreditLine, CreditNote } from "@/lib/credit-note";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function creditPrintPages(items: CreditLine[]) {
  const pages: CreditLine[][] = [];
  for (let i = 0; i < items.length; i += 12) pages.push(items.slice(i, i + 12));
  return pages.length ? pages : [[]];
}
export function CreditNoteDocument({ document: doc, company, onReady }: {
  document: CreditNote; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [fitError, setFitError] = useState("");
  const pages = creditPrintPages(doc.items);
  useEffect(() => {
    let current = true;
    onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-cn-fit]"))) {
        for (let size = field.tagName === "H1" ? 15 : 10; size >= 7; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      for (const paper of Array.from(root.current.querySelectorAll<HTMLElement>(".cn-paper"))) {
        const last = paper.querySelector(".cn-signatures");
        if (last && last.getBoundingClientRect().bottom > paper.getBoundingClientRect().bottom - 25) overflow = true;
      }
      setFitError(overflow ? "ข้อมูลยาวเกินแบบพิมพ์ใบลดหนี้ กรุณาย่อข้อความก่อนพิมพ์" : "");
      onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  const previousCredits = (Math.round(Number(doc.originalBeforeVat || 0) * 100) - Math.round(Number(doc.correctedBeforeVat || 0) * 100) - Math.round(Number(doc.amountBeforeVat) * 100)) / 100;
  return <>
    {fitError && <p role="alert" className="cn-no-print p-3 text-red-700">{fitError}</p>}
    <div id="cn-print-doc" ref={root}>{pages.map((items, page) => {
      const last = page === pages.length - 1;
      return <article className="cn-paper" key={page}>
        <p className="cn-page-no">หน้า {page + 1} / {pages.length}</p>
        <header className="cn-company"><h1 data-cn-fit>{company.companyName || ""}</h1><p data-cn-fit>{company.address || ""}</p><p data-cn-fit>โทร. {company.tel || ""}　เลขประจำตัวผู้เสียภาษี {company.taxId || ""}</p></header>
        <div className="cn-title"><h2>ใบลดหนี้</h2><div><p data-cn-fit>เลขที่　{doc.cnNo}</p><p>วันที่　{formatAccountingDate(doc.cnDate)}</p></div></div>
        <section className="cn-info">
          <div><p data-cn-fit>รหัสลูกค้า　{doc.customerCode || ""}</p><p className="cn-name" data-cn-fit>นามผู้ซื้อ　{doc.customerName || doc.customer?.name || ""}</p><p className="cn-address" data-cn-fit>ที่อยู่　{doc.address || ""}</p></div>
          <div><p data-cn-fit>เลขประจำตัวผู้เสียภาษี　{doc.taxId || ""}</p><p data-cn-fit>สาขา　{doc.customerBranch || ""}</p><p data-cn-fit>เลขที่ใบกำกับเดิม　{doc.invoiceNo || doc.invoice?.ivNo}</p><p>ลงวันที่　{formatAccountingDate(doc.invoiceDate)}</p><p className="cn-reason" data-cn-fit>สาเหตุ　{doc.reason}</p><p data-cn-fit>ชื่อผู้ติดต่อ　{doc.contactPerson}</p></div>
        </section>
        {doc.status !== "approved" && <p className="cn-watermark">ตัวอย่าง / ไม่ใช่ใบลดหนี้ยืนยัน</p>}
        <table className="cn-lines">
          <colgroup>{["13%", "32%", "9%", "9%", "14%", "8%", "15%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
          <thead><tr>{["รหัสสินค้า", "รายการลดหนี้", "จำนวน", "หน่วย", "ราคาลด/หน่วย", "ส่วนลด", "จำนวนเงิน"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{items.map((item, i) => <tr key={i}><td><div data-cn-fit>{item.partNo || ""}</div></td><td><div data-cn-fit>{item.desc}</div></td><td><div data-cn-fit>{Number(item.qty).toLocaleString("en-US")}</div></td><td><div data-cn-fit>{item.unit}</div></td><td><div data-cn-fit>{money(item.unitPrice)}</div></td><td>—</td><td><div data-cn-fit>{money(item.amountBeforeVat ?? Number(item.qty) * Number(item.unitPrice))}</div></td></tr>)}
            <tr className="cn-filler" style={{ height: `${Math.max(0, 96 - items.length * 8)}mm` }} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <td key={i} />)}</tr>
          </tbody>
        </table>
        <section className="cn-summary"><div className="cn-remark" data-cn-fit>หมายเหตุ　{doc.remark || ""}{previousCredits > 0 ? `\nยอดลดก่อน VAT ที่ยืนยันก่อนใบนี้ ${money(previousCredits)} บาท` : ""}</div>
          <div>{([
            ["มูลค่าตามเอกสารเดิม (ก่อน VAT)", doc.originalBeforeVat || 0],
            ["มูลค่าที่ถูกต้อง (หลัง CN สะสม)", doc.correctedBeforeVat || 0],
            ["ยอดลดหนี้ก่อน VAT ใบนี้", doc.amountBeforeVat],
            [doc.vatConfig === "VAT7%" ? "ภาษีมูลค่าเพิ่ม 7%" : "ไม่มี VAT", doc.vat],
            ["จำนวนเงินลดหนี้ทั้งสิ้น", doc.netAmount],
          ] as const).map(([label, value]) => <p key={label}><span>{label}</span><strong data-cn-fit>{last ? money(value) : ""}</strong></p>)}{!last && <small>ยอดรวมแสดงหน้าสุดท้าย</small>}</div>
        </section>
        <p className="cn-policy">ปรับลดมูลค่าหนี้เท่านั้น ไม่ใช่หลักฐานรับคืนสินค้า ไม่เปลี่ยน Stock และไม่ลงบัญชี GL</p>
        <footer className="cn-signatures"><div><p>ผู้รับใบลดหนี้</p><span /><p>วันที่ ____/____/________</p></div><div><p data-cn-fit>ในนาม　{company.companyName || ""}</p><span /><p>ผู้มีอำนาจลงนาม</p></div><div><p>ผู้จัดทำ ____________</p><p>ผู้ตรวจสอบ ____________</p></div></footer>
      </article>;
    })}</div>
  </>;
}
export function CreditPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    #cn-print-doc { width:210mm; margin:0 auto; color:black; background:white; font:10pt/1.35 Tahoma,Arial,sans-serif; }
    #cn-print-doc * { box-sizing:border-box; }
    .cn-paper { width:210mm; height:296mm; padding:8mm; position:relative; background:white; break-after:page; }
    .cn-paper:last-child { break-after:auto; } .cn-page-no { height:5mm; text-align:right; font-size:8pt; }
    .cn-company { height:27mm; text-align:center; } .cn-company h1 { height:10mm; font-size:15pt; font-weight:bold; }
    .cn-company p { height:7mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .cn-title { display:grid; grid-template-columns:1fr 65mm; gap:3mm; height:22mm; align-items:center; }
    .cn-title h2 { text-align:center; font-size:22pt; font-weight:bold; }
    .cn-title > div { border:1px solid black; border-radius:2mm; padding:2mm; } .cn-title p { height:7mm; }
    .cn-info { display:grid; grid-template-columns:1fr 1fr; height:47mm; }
    .cn-info > div { border:1px solid black; border-radius:2mm; padding:2mm; min-width:0; }
    .cn-info p { height:6mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .cn-info .cn-name { height:10mm; } .cn-info .cn-address { height:22mm; } .cn-info .cn-reason { height:10mm; }
    .cn-watermark { position:absolute; top:6mm; left:8mm; font-size:8pt; }
    .accounting-shell table.cn-lines { width:100%; min-width:0; border-collapse:collapse; table-layout:fixed; font-size:9pt; }
    .cn-lines th,.cn-lines td { border-left:1px solid black; border-right:1px solid black; padding:1mm; }
    .cn-lines th { border-top:1px solid black; border-bottom:1px solid black; height:9mm; }
    .cn-lines td { height:8mm; text-align:right; } .cn-lines td:nth-child(-n+2) { text-align:left; }
    .cn-lines td div { height:6mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .cn-lines .cn-filler td { height:inherit; } .cn-lines tbody { border-bottom:1px solid black; }
    .cn-summary { display:grid; grid-template-columns:1fr 85mm; height:40mm; border-left:1px solid black; border-bottom:1px solid black; }
    .cn-summary > div { border-right:1px solid black; min-width:0; min-height:0; }
    .cn-remark { height:40mm; padding:2mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .cn-summary p { height:7mm; display:grid; grid-template-columns:1fr 31mm; border-bottom:1px solid black; font-size:9pt; align-items:center; }
    .cn-summary span { padding:1mm; } .cn-summary strong { height:6mm; text-align:right; padding:1mm; border-left:1px solid black; }
    .cn-summary small { font-size:8pt; } .cn-policy { height:7mm; font-size:8pt; padding-top:2mm; }
    .cn-signatures { display:grid; grid-template-columns:repeat(3,1fr); gap:1mm; height:24mm; }
    .cn-signatures > div { border:1px solid black; border-radius:2mm; padding:2mm; text-align:center; min-width:0; font-size:9pt; }
    .cn-signatures p { height:6mm; overflow-wrap:anywhere; } .cn-signatures span { display:block; height:5mm; border-bottom:1px solid black; margin:0 5mm 1mm; }
    @media print {
      @page { size:A4 portrait; margin:0; }
      html,body { width:210mm !important; min-width:0 !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; width:210mm !important; margin:0 !important; padding:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell > header,.cn-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main,.cn-page,.cn-preview { width:210mm !important; max-width:none !important; min-width:0 !important; margin:0 !important; padding:0 !important; overflow:visible !important; border:0 !important; box-shadow:none !important; }
      #cn-print-doc { display:${allowed ? "block" : "none"} !important; }
      ${!allowed ? 'body::after { content:"Credit note not ready for final print"; display:block; padding:20mm; color:black; }' : ""}
    }
  `}</style>;
}
