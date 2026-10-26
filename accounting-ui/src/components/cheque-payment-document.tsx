"use client";

import { useEffect, useRef, useState } from "react";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import { chequeStatuses, type ChequePayment } from "@/lib/cheque-payment";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";

export function ChequePaymentDocument({ document: doc, company, onReady }: {
  document: ChequePayment; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLElement>(null), [fitError, setFitError] = useState("");
  useEffect(() => {
    let current = true; onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-cq-fit]"))) {
        for (let size = 11; size >= 8; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      const paper = root.current.getBoundingClientRect(), footer = root.current.querySelector("footer")?.getBoundingClientRect();
      if (!footer || footer.bottom > paper.bottom - 20) overflow = true;
      setFitError(overflow ? "ข้อมูลยาวเกินใบรายละเอียดเช็ค กรุณาย่อข้อความก่อนพิมพ์" : ""); onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>
    {fitError && <p role="alert" className="cq-no-print p-3 text-red-700">{fitError}</p>}
    <article id="cq-print-doc" className="cq-paper" ref={root}>
      <header className="cq-company"><h1 data-cq-fit>{company.companyName || ""}</h1><p data-cq-fit>{company.address || ""}</p><p data-cq-fit>Tax ID {company.taxId || ""} · โทร. {company.tel || ""}</p></header>
      <h2 className="cq-title">ใบรายละเอียดเช็คจ่าย / Cheque Payment</h2>
      <p className="cq-warning">ไม่ใช่เช็คธนาคาร · ไม่ใช่หลักฐานว่าธนาคารตัดบัญชีจนกว่าจะบันทึก Cleared</p>
      <section className="cq-meta"><p>เลขเอกสาร <strong>{doc.cqNo}</strong></p><p>วันที่เอกสาร {date(doc.docDate)}</p>
        <p>สถานะ <strong>{chequeStatuses[doc.status] || doc.status}</strong></p><p>PV {doc.pvNo || "-"}</p></section>
      <section className="cq-box"><h3>อ้างอิงเอกสาร</h3><p data-cq-fit>PS {doc.voucherSnapshot?.sourceNo || ""} · PO {doc.voucherSnapshot?.poNo || ""}</p>
        <p data-cq-fit>ผู้รับเหมา {doc.voucherSnapshot?.supplier?.name || ""} · Tax ID {doc.voucherSnapshot?.supplier?.taxId || ""}</p></section>
      <section className="cq-box"><h3>ธนาคารบริษัทผู้จ่าย</h3><p data-cq-fit>ธนาคาร {doc.bankName} · สาขา {doc.bankBranch}</p><p data-cq-fit>เลขบัญชี {doc.bankAccountNo || doc.bankAccount}</p></section>
      <section className="cq-box"><h3>รายละเอียดเช็ค</h3><p data-cq-fit>เลขเช็ค {doc.chequeNo} · วันที่บนเช็ค {date(doc.chequeDate)}</p>
        <p data-cq-fit>จ่ายให้ {doc.payee}</p><p className="cq-amount">จำนวนเงิน {Number(doc.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p></section>
      <table className="cq-stages"><thead><tr><th>ขั้นตอน</th><th>วันที่</th><th>ผู้เกี่ยวข้อง / เลขอ้างอิง</th></tr></thead><tbody>
        <tr><td>พิมพ์เช็ค (Printed)</td><td>{date(doc.printedAt)}</td><td /></tr>
        <tr><td>ลงนาม (Signed)</td><td>{date(doc.signedAt)}</td><td><div data-cq-fit>{doc.signer || ""}</div></td></tr>
        <tr><td>ส่งมอบ (Released)</td><td>{date(doc.releaseDate)}</td><td><div data-cq-fit>{doc.recipient || ""}</div></td></tr>
        <tr><td>ตัดบัญชี (Cleared)</td><td>{date(doc.clearedAt)}</td><td><div data-cq-fit>{doc.clearingReference || ""}</div></td></tr>
        <tr><td>ยกเลิก / กลับรายการ</td><td>{date(doc.cancelledAt)}</td><td><div data-cq-fit>{doc.reversalReference || ""}</div></td></tr>
      </tbody></table>
      <section className="cq-notes" data-cq-fit>หมายเหตุ: {doc.remark || ""}{doc.cancellationReason ? `\nเหตุผลยกเลิก: ${doc.cancellationReason}` : ""}</section>
      <p className="cq-policy">ส่งมอบ = PV จ่ายแล้ว · Cleared เก็บวันธนาคารตัดบัญชีแยก · ยกเลิกหลังส่งมอบกลับรายการ PV ไม่ลง GL<br />บันทึกการทำรายการภายนอก ไม่ใช่คำสั่งธนาคาร · ช่องลงชื่อเว้นว่างสำหรับลงนามจริง</p>
      <footer className="cq-signatures">{["ผู้จัดทำ", "ผู้ลงนามเช็ค", "ผู้ส่งมอบ", "ผู้รับเช็ค"].map(label => <div key={label}><p>{label}</p><span>ลงชื่อ __________________</span><span>วันที่ __________________</span></div>)}</footer>
    </article>
  </>;
}
export function ChequePaymentPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    .cq-paper { width:210mm; height:296mm; margin:0 auto; padding:10mm; color:black; background:white; font:11pt/1.4 Tahoma,Arial,sans-serif; }
    .cq-paper * { box-sizing:border-box; } .cq-company { height:23mm; text-align:center; }
    .cq-company h1 { height:8mm; font-weight:bold; font-size:15pt; } .cq-company p { height:7mm; }
    .cq-title { height:10mm; text-align:center; font-size:16pt; font-weight:bold; }
    .cq-warning { height:8mm; text-align:center; font-size:9pt; }
    .cq-meta { display:grid; grid-template-columns:1fr 1fr; height:18mm; border:1px solid black; padding:2mm; }
    .cq-meta p { min-width:0; } .cq-box { border:1px solid black; border-top:0; padding:2mm; }
    .cq-box h3 { font-weight:bold; height:6mm; } .cq-box p { height:8mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .cq-box .cq-amount { font-size:14pt; font-weight:bold; height:10mm; }
    .accounting-shell table.cq-stages { width:100%; min-width:0; table-layout:fixed; border-collapse:collapse; margin-top:3mm; font-size:10pt; }
    .cq-stages th,.cq-stages td { border:1px solid black; padding:1mm; height:9mm; }
    .cq-stages th:first-child { width:32%; } .cq-stages th:nth-child(2) { width:22%; }
    .cq-stages td div { height:7mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .cq-notes { height:20mm; padding:2mm; white-space:pre-wrap; overflow-wrap:anywhere; border:1px solid black; border-top:0; }
    .cq-policy { height:12mm; padding:2mm 0; font-size:8pt; }
    .cq-signatures { display:grid; grid-template-columns:repeat(4,1fr); height:23mm; border:1px solid black; text-align:center; font-size:9pt; }
    .cq-signatures > div { min-width:0; border-right:1px solid black; } .cq-signatures > div:last-child { border-right:0; }
    .cq-signatures p { height:8mm; padding:1mm; } .cq-signatures span { display:block; height:7mm; }
    @media print {
      @page { size:A4 portrait; margin:0; } html,body { width:210mm !important; min-width:0 !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; width:210mm !important; margin:0 !important; padding:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell > header,.cq-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main,.cq-page,.cq-preview { width:210mm !important; max-width:none !important; min-width:0 !important; margin:0 !important; padding:0 !important; overflow:visible !important; border:0 !important; box-shadow:none !important; }
      #cq-print-doc { display:${allowed ? "block" : "none"} !important; }
      ${!allowed ? 'body::after { content:"CQ not ready for print"; display:block; padding:20mm; color:black; }' : ""}
    }
  `}</style>;
}
