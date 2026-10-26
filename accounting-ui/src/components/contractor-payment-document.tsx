"use client";

import { useEffect, useRef, useState } from "react";
import { formatAccountingDate } from "@/lib/accounting-date";
import { paymentStatuses, type ContractorPayment, type PaymentLine } from "@/lib/contractor-payment";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function paymentPrintPages(items: PaymentLine[]) {
  const pages: PaymentLine[][] = [];
  for (let i = 0; i < items.length; i += 8) pages.push(items.slice(i, i + 8));
  return pages.length ? pages : [[]];
}
export function ContractorPaymentDocument({ document: doc, company, onReady }: {
  document: ContractorPayment; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null), [fitError, setFitError] = useState("");
  const pages = paymentPrintPages(doc.items);
  useEffect(() => {
    let current = true;
    onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-ps-fit]"))) {
        for (let size = field.tagName === "H1" ? 15 : 10; size >= 7; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      for (const paper of Array.from(root.current.querySelectorAll<HTMLElement>(".ps-paper"))) {
        const footer = paper.querySelector("footer");
        if (!footer || footer.getBoundingClientRect().bottom > paper.getBoundingClientRect().bottom - 20) overflow = true;
      }
      setFitError(overflow ? "ข้อมูลยาวเกินแบบพิมพ์ PS กรุณาย่อข้อความก่อนพิมพ์" : "");
      onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>
    {fitError && <p role="alert" className="ps-no-print p-3 text-red-700">{fitError}</p>}
    <div id="ps-print-doc" ref={root}>{pages.map((items, page) => {
      const last = page === pages.length - 1;
      return <article className="ps-paper" key={page}>
        <p className="ps-page-no">หน้า {page + 1} / {pages.length} · {paymentStatuses[doc.status] || doc.status}</p>
        <header className="ps-company"><h1 data-ps-fit>{company.companyName || ""}</h1><p data-ps-fit>{company.address || ""}</p><p data-ps-fit>โทร. {company.tel || ""} · เลขประจำตัวผู้เสียภาษี {company.taxId || ""}</p></header>
        <div className="ps-title"><h2>ใบเบิกจ่ายผู้รับเหมา</h2><div><p data-ps-fit>เลขที่ {doc.psNo}</p><p>วันที่ {formatAccountingDate(doc.docDate)}</p><p>รอบเบิก {doc.paymentRound}</p></div></div>
        <section className="ps-info"><div><p data-ps-fit>รหัส {doc.supplierSnapshot?.code || ""} · {doc.supplierSnapshot?.name || ""}</p><p data-ps-fit>สาขา {doc.supplierSnapshot?.branch || ""} · Tax ID {doc.supplierSnapshot?.taxId || ""}</p><p className="ps-address" data-ps-fit>ที่อยู่ {doc.supplierSnapshot?.address || ""}</p></div>
          <div><p data-ps-fit>PO อ้างอิง {doc.poNo}</p><p data-ps-fit>ผู้ติดต่อ {doc.supplierSnapshot?.contactPerson || ""}</p><p data-ps-fit>วงเงิน PO ก่อน VAT {money(doc.poAmount)}</p><p data-ps-fit>เบิกสะสมก่อนใบนี้ {money(doc.previouslyRequestedAmount)}</p><p data-ps-fit>คงเหลือหลังใบนี้ {money(doc.remainingAmount)}</p></div></section>
        {doc.status !== "approved" && <p className="ps-watermark">{paymentStatuses[doc.status] || doc.status} — ยังใช้จ่ายเงินไม่ได้</p>}
        <table className="ps-lines"><colgroup><col style={{ width: "8%" }} /><col style={{ width: "47%" }} /><col style={{ width: "25%" }} /><col style={{ width: "20%" }} /></colgroup>
          <thead><tr><th>ลำดับ</th><th>รายละเอียด</th><th>หมายเหตุ</th><th>จำนวนเงินก่อน VAT</th></tr></thead><tbody>
            {items.map((row, i) => <tr key={i}><td>{page * 8 + i + 1}</td><td><div data-ps-fit>{row.desc}</div></td><td><div data-ps-fit>{row.remark || ""}</div></td><td><div data-ps-fit>{money(row.amount)}</div></td></tr>)}
            <tr className="ps-filler" style={{ height: `${(8 - items.length) * 12}mm` }} aria-hidden="true"><td /><td /><td /><td /></tr>
          </tbody></table>
        <section className="ps-summary"><div className="ps-remark" data-ps-fit>หมายเหตุ {doc.remark || ""}</div><div>{([
          ["ยอดเบิกก่อน VAT", doc.currentRequestAmount], [doc.vatConfig === "VAT7%" ? "VAT 7%" : "ไม่มี VAT", doc.vat],
          [`หัก ณ ที่จ่าย ${doc.whtRate}%`, doc.wht], [`เงินประกัน ${doc.retentionRate}%`, doc.retention],
          ["ยอดสุทธิเบิกจ่าย", doc.netAmount], ["ประกันสะสมก่อนใบนี้", doc.previouslyRetainedAmount],
          ["ประกันรวมถึงใบนี้", (Math.round(Number(doc.previouslyRetainedAmount) * 100) + Math.round(Number(doc.retention) * 100)) / 100],
        ] as const).map(([label, value]) => <p key={label}><span>{label}</span><strong data-ps-fit>{last ? money(value) : ""}</strong></p>)}{!last && <small>ยอดรวมแสดงหน้าสุดท้าย</small>}</div></section>
        <p className="ps-policy">ยอดสะสม ณ บันทึก/ส่ง/อนุมัติล่าสุด · ไม่ใช่หลักฐานจ่ายเงินจริง · ไม่ลง GL / Stock / คืนเงินประกัน</p>
        <footer className="ps-signatures">{["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"].map(label => <div key={label}><p>{label}</p><span /><p>วันที่ ____/____/________</p></div>)}</footer>
      </article>;
    })}</div>
  </>;
}
export function ContractorPaymentPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    #ps-print-doc { width:210mm; margin:0 auto; color:black; background:white; font:10pt/1.35 Tahoma,Arial,sans-serif; }
    #ps-print-doc * { box-sizing:border-box; }
    .ps-paper { width:210mm; height:296mm; padding:8mm; position:relative; background:white; break-after:page; }
    .ps-paper:last-child { break-after:auto; } .ps-page-no { height:5mm; text-align:right; font-size:8pt; }
    .ps-company { height:25mm; text-align:center; } .ps-company h1 { height:9mm; font-size:15pt; font-weight:bold; }
    .ps-company p { height:7mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .ps-title { display:grid; grid-template-columns:1fr 65mm; gap:3mm; height:22mm; align-items:center; }
    .ps-title h2 { text-align:center; font-size:19pt; font-weight:bold; }
    .ps-title p { height:6mm; overflow-wrap:anywhere; }
    .ps-info { display:grid; grid-template-columns:1fr 80mm; gap:2mm; height:38mm; }
    .ps-info > div { border:1px solid black; border-radius:2mm; padding:2mm; min-width:0; }
    .ps-info p { height:6mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .ps-info .ps-address { height:18mm; }
    .ps-watermark { position:absolute; top:8mm; left:8mm; font-size:8pt; }
    .accounting-shell table.ps-lines { width:100%; min-width:0; table-layout:fixed; border-collapse:collapse; font-size:9pt; }
    .ps-lines th,.ps-lines td { border:1px solid black; padding:1mm; }
    .ps-lines th { height:8mm; } .ps-lines td { height:12mm; } .ps-lines td:last-child { text-align:right; }
    .ps-lines td div { height:10mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .ps-lines .ps-filler td { height:inherit; }
    .ps-summary { display:grid; grid-template-columns:1fr 85mm; height:51mm; border-left:1px solid black; border-bottom:1px solid black; }
    .ps-summary > div { border-right:1px solid black; min-width:0; min-height:0; }
    .ps-remark { height:51mm; padding:2mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .ps-summary p { height:7mm; display:grid; grid-template-columns:1fr 31mm; border-bottom:1px solid black; align-items:center; font-size:9pt; }
    .ps-summary span { padding:1mm; } .ps-summary strong { height:6mm; text-align:right; padding:1mm; border-left:1px solid black; }
    .ps-summary small { font-size:8pt; } .ps-policy { height:8mm; padding-top:1mm; font-size:8pt; }
    .ps-signatures { display:grid; grid-template-columns:repeat(3,1fr); gap:2mm; height:23mm; }
    .ps-signatures > div { border:1px solid black; border-radius:2mm; padding:2mm; text-align:center; min-width:0; font-size:9pt; }
    .ps-signatures p { height:6mm; } .ps-signatures span { display:block; height:5mm; border-bottom:1px solid black; margin:0 5mm 1mm; }
    @media print {
      @page { size:A4 portrait; margin:0; }
      html,body { width:210mm !important; min-width:0 !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; width:210mm !important; margin:0 !important; padding:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell > header,.ps-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main,.ps-page,.ps-preview { width:210mm !important; max-width:none !important; min-width:0 !important; margin:0 !important; padding:0 !important; overflow:visible !important; border:0 !important; box-shadow:none !important; }
      #ps-print-doc { display:${allowed ? "block" : "none"} !important; }
      ${!allowed ? 'body::after { content:"PS not ready for print"; display:block; padding:20mm; color:black; }' : ""}
    }
  `}</style>;
}
