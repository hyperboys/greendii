"use client";

import { useEffect, useRef, useState } from "react";
import { formatAccountingDate } from "@/lib/accounting-date";
import { voucherPaymentLabel, voucherStatuses, type PaymentVoucher, type VoucherLine } from "@/lib/payment-voucher";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function voucherPrintPages(items: VoucherLine[]) {
  const pages: VoucherLine[][] = [];
  for (let i = 0; i < items.length; i += 8) pages.push(items.slice(i, i + 8));
  return pages.length ? pages : [[]];
}
export function PaymentVoucherDocument({ document: doc, company, onReady }: {
  document: PaymentVoucher; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null), [fitError, setFitError] = useState("");
  const pages = voucherPrintPages(doc.items), gross = (Math.round(Number(doc.amountBeforeTax) * 100) + Math.round(Number(doc.vat) * 100)) / 100;
  useEffect(() => {
    let current = true;
    onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-pv-fit]"))) {
        for (let size = field.tagName === "H1" ? 15 : 10; size >= 7; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      for (const paper of Array.from(root.current.querySelectorAll<HTMLElement>(".pv-paper"))) {
        const footer = paper.querySelector("footer");
        if (!footer || footer.getBoundingClientRect().bottom > paper.getBoundingClientRect().bottom - 20) overflow = true;
      }
      setFitError(overflow ? "ข้อมูลยาวเกินแบบพิมพ์ PV กรุณาย่อข้อความก่อนพิมพ์" : "");
      onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>
    {fitError && <p className="pv-no-print p-3 text-red-700" role="alert">{fitError}</p>}
    <div id="pv-print-doc" ref={root}>{pages.map((items, page) => {
      const last = page === pages.length - 1;
      const credits: [string, number | string][] = [["ภาษีหัก ณ ที่จ่าย", doc.wht], ["เงินประกันผลงานตาม PS", doc.otherDeduction],
        [doc.paymentMethod === "cash" ? "เงินสด / ยอดสุทธิจ่าย" : doc.paymentMethod === "cheque" ? "เช็ค / ยอดสุทธิจ่าย" : "ธนาคาร / ยอดสุทธิจ่าย", doc.netPayment]];
      return <article className="pv-paper" key={page}>
        <p className="pv-page-no">หน้า {page + 1} / {pages.length} · {voucherStatuses[doc.status] || doc.status} · {voucherPaymentLabel(doc)}</p>
        <header className="pv-company"><h1 data-pv-fit>{company.companyName || ""}</h1><p data-pv-fit>{company.address || ""}</p><p data-pv-fit>เลขประจำตัวผู้เสียภาษี {company.taxId || ""} · โทร. {company.tel || ""}</p></header>
        <h2 className="pv-title">[X] ใบสำคัญจ่าย Payment Voucher</h2>
        <section className="pv-info"><div><p>สมุดรายวัน (Journal): สมุดรายวันจ่าย</p><p data-pv-fit>เลขที่เอกสาร (Document No.): {doc.pvNo}</p><p data-pv-fit>เลขที่เอกสารอ้างอิง (Ref No.): {doc.sourceNo} · {doc.poNo || ""}</p><p className="pv-name" data-pv-fit>จ่ายให้ {doc.supplierSnapshot?.code || ""} · {doc.supplierSnapshot?.name || ""}</p><p className="pv-address" data-pv-fit>ที่อยู่ {doc.supplierSnapshot?.address || ""}</p></div>
          <div><p>วันที่เอกสาร (Date): {formatAccountingDate(doc.pvDate)}</p><p>วันที่เอกสารอ้างอิง: {formatAccountingDate(doc.sourceDate)}</p><p>วันที่จ่ายจริง: {formatAccountingDate(doc.paidAt)}</p><p data-pv-fit>Tax ID {doc.supplierSnapshot?.taxId || ""} · สาขา {doc.supplierSnapshot?.branch || ""}</p><p data-pv-fit>รายละเอียดภาษี {doc.taxDescription || ""}</p></div></section>
        <p className="pv-description" data-pv-fit>รายละเอียด (Description): ชำระค่างานตาม PS · {doc.remark || ""}</p>
        <table className="pv-journal"><colgroup>{["11%", "9%", "43%", "15%", "15%", "7%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
          <thead><tr>{["เลขที่บัญชี", "แผนก", "ชื่อบัญชี / รายละเอียด", "เดบิต", "เครดิต", "โครงการ"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{items.map((row, i) => <tr key={i}><td /><td /><td><div data-pv-fit>{row.desc}</div></td><td><div data-pv-fit>{money(row.amount)}</div></td><td /><td /></tr>)}
            <tr className="pv-filler" style={{ height: `${(8 - items.length) * 8}mm` }} aria-hidden="true"><td /><td /><td /><td /><td /><td /></tr>
            {last && <><tr><td /><td /><td>ภาษีมูลค่าเพิ่มตาม PS</td><td>{money(doc.vat)}</td><td /><td /></tr>
              {credits.map(([label, value]) => <tr key={label}><td /><td /><td>{label}</td><td /><td>{money(value)}</td><td /></tr>)}</>}
            <tr className="pv-total"><td colSpan={3}>{last ? `รวมทั้งสิ้น (Total) · ${doc.items.length} รายการ` : "ยอดรวมแสดงหน้าสุดท้าย"}</td><td>{last ? money(gross) : ""}</td><td>{last ? money(gross) : ""}</td><td /></tr>
          </tbody></table>
        <table className="pv-bank"><colgroup>{["15%", "20%", "18%", "18%", "14%", "15%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
          <thead><tr>{["วิธีจ่าย", "ธนาคาร / บัญชีผู้จ่าย", "บัญชีผู้รับ / ผู้รับเงิน", "เลขอ้างอิง / เลขเช็ค", "วันที่จ่าย", "จำนวนเงิน"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody><tr><td><div data-pv-fit>{doc.paymentMethod === "cash" ? "เงินสด" : doc.paymentMethod === "transfer" ? "โอน" : doc.paidAt ? "เช็ค" : "เช็ค (รอส่งมอบ)"}</div></td><td><div data-pv-fit>{doc.payerBank || ""}</div></td><td><div data-pv-fit>{doc.payeeBank || doc.recipient || ""}</div></td><td><div data-pv-fit>{doc.paymentReference || doc.chequePayments.filter(row => row.status !== "Cancelled").map(row => row.chequeNo).join(", ")}</div></td><td>{formatAccountingDate(doc.paidAt)}</td><td>{last ? money(doc.netPayment) : ""}</td></tr></tbody></table>
        <p className="pv-reversal" data-pv-fit>{doc.reversedAt ? `กลับรายการจ่าย ${formatAccountingDate(doc.reversedAt)} · อ้างอิง ${doc.reversalReference}` : ""}</p>
        <p className="pv-policy">ตารางเดบิต/เครดิตเป็นสรุปการจัดสรรตาม PS เท่านั้น ไม่ลง GL · ช่องรหัสบัญชี/แผนก/โครงการเว้นว่าง · อนุมัติไม่ใช่การจ่ายเงินจริง</p>
        <footer className="pv-signatures">{["ผู้เตรียม (Prepared by)", "ผู้ตรวจ (Checked by)", "ผู้อนุมัติ (Approved by)", "ผู้ลงบัญชี (Posted by)", "ผู้รับเงิน / ผู้จ่ายเงิน"].map(label => <div key={label}><p>{label}</p><span /></div>)}</footer>
      </article>;
    })}</div>
  </>;
}
export function PaymentVoucherPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    #pv-print-doc { width:210mm; margin:0 auto; color:black; background:white; font:10pt/1.35 Tahoma,Arial,sans-serif; }
    #pv-print-doc * { box-sizing:border-box; } .pv-paper { width:210mm; height:296mm; padding:8mm; position:relative; background:white; break-after:page; }
    .pv-paper:last-child { break-after:auto; } .pv-page-no { height:5mm; text-align:right; font-size:8pt; }
    .pv-company { height:23mm; text-align:center; } .pv-company h1 { height:9mm; font-size:15pt; font-weight:bold; }
    .pv-company p { height:7mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .pv-title { height:10mm; font-size:16pt; font-weight:bold; }
    .pv-info { display:grid; grid-template-columns:1.2fr 1fr; gap:2mm; height:45mm; border:1px solid black; padding:2mm; }
    .pv-info > div { min-width:0; } .pv-info p { height:6mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .pv-info .pv-name { height:9mm; } .pv-info .pv-address { height:14mm; }
    .pv-description { height:12mm; padding:2mm; border:1px solid black; border-top:0; overflow-wrap:anywhere; white-space:pre-wrap; }
    .accounting-shell table.pv-journal,.accounting-shell table.pv-bank { width:100%; min-width:0; table-layout:fixed; border-collapse:collapse; font-size:9pt; }
    .pv-journal th,.pv-journal td,.pv-bank th,.pv-bank td { border:1px solid black; padding:1mm; }
    .pv-journal th { height:8mm; } .pv-journal td { height:8mm; }
    .pv-journal td:nth-child(4),.pv-journal td:nth-child(5) { text-align:right; }
    .pv-journal td div { height:6mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .pv-journal .pv-filler td { height:inherit; } .pv-total { font-weight:bold; }
    .pv-bank { margin-top:2mm; } .pv-bank th { height:10mm; font-size:8pt; } .pv-bank td { height:16mm; }
    .pv-bank td div { height:14mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .pv-bank td:last-child { text-align:right; }
    .pv-reversal { height:8mm; padding-top:1mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .pv-policy { height:9mm; font-size:8pt; padding:1mm 0; }
    .pv-signatures { display:grid; grid-template-columns:repeat(5,1fr); height:20mm; border:1px solid black; }
    .pv-signatures > div { border-right:1px solid black; min-width:0; text-align:center; font-size:8pt; }
    .pv-signatures > div:last-child { border-right:0; } .pv-signatures p { height:9mm; border-bottom:1px solid black; padding:1mm; }
    .pv-signatures span { display:block; height:9mm; }
    @media print {
      @page { size:A4 portrait; margin:0; }
      html,body { width:210mm !important; min-width:0 !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; width:210mm !important; margin:0 !important; padding:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell > header,.pv-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main,.pv-page,.pv-preview { width:210mm !important; max-width:none !important; min-width:0 !important; margin:0 !important; padding:0 !important; overflow:visible !important; border:0 !important; box-shadow:none !important; }
      #pv-print-doc { display:${allowed ? "block" : "none"} !important; }
      ${!allowed ? 'body::after { content:"PV not ready for print"; display:block; padding:20mm; color:black; }' : ""}
    }
  `}</style>;
}
