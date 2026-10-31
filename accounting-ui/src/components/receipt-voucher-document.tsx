"use client";

import { useEffect, useRef, useState } from "react";
import { formatAccountingDate } from "@/lib/accounting-date";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { receiptTotals, type ReceiptLine, type ReceiptVoucher } from "@/lib/receipt-voucher";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function receiptPrintPages(rows: ReceiptLine[]) {
  const pages: ReceiptLine[][] = [];
  for (let index = 0; index < rows.length; index += 6) pages.push(rows.slice(index, index + 6));
  return pages.length ? pages : [[]];
}
export function ReceiptVoucherDocument({ document: doc, company, onReady }: {
  document: ReceiptVoucher; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [fitError, setFitError] = useState("");
  const pages = receiptPrintPages(doc.allocations);
  const totals = receiptTotals(doc.allocations);
  const entries = [
    { name: doc.paymentMethod === "cash" ? "เงินสด" : doc.paymentMethod === "cheque" ? `เช็ครับ ${doc.bankName || ""}` : `เงินฝากธนาคาร ${doc.bankName || ""}`, debit: totals.received, credit: 0 },
    { name: "ภาษีเงินได้ถูกหัก ณ ที่จ่าย", debit: totals.wht, credit: 0 },
    { name: "ค่าธรรมเนียมธนาคาร", debit: totals.fee, credit: 0 },
    { name: "ลูกหนี้การค้า", debit: 0, credit: totals.settled },
  ].filter(row => row.debit || row.credit);
  useEffect(() => {
    let current = true;
    onReady?.(false);
    void document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let overflow = false;
      for (const field of Array.from(root.current.querySelectorAll<HTMLElement>("[data-rv-fit]"))) {
        for (let size = field.tagName === "H1" ? 15 : 10; size >= 7; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      for (const paper of Array.from(root.current.querySelectorAll<HTMLElement>(".rv-paper"))) {
        const last = paper.querySelector(".rv-signatures");
        if (last && last.getBoundingClientRect().bottom > paper.getBoundingClientRect().bottom - 25) overflow = true;
      }
      setFitError(overflow ? "ข้อมูลยาวเกินแบบพิมพ์ กรุณาย่อข้อความก่อนพิมพ์" : "");
      onReady?.(!overflow);
    });
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>
    {fitError && <p role="alert" className="rv-no-print p-3 text-red-700">{fitError}</p>}
    <div id="rv-print-doc" ref={root}>{pages.map((rows, page) => {
      const last = page === pages.length - 1;
      return <article className="rv-paper" key={page}>
        <p className="rv-page-no">หน้า {page + 1} / {pages.length}</p>
        <h1 data-rv-fit>{company.companyName || ""}</h1>
        <div className="rv-types">[　] ใบสำคัญจ่าย　Payment Voucher<br />[X] ใบสำคัญรับ　Receipt Voucher<br />[　] เอกสารโอนบัญชี　Journal Voucher</div>
        <section className="rv-header">
          <p data-rv-fit>สมุดรายวัน (Journal) : สมุดรายวันรับ</p>
          <div><p data-rv-fit>เลขที่เอกสาร : {doc.rvNo}</p><p>วันที่ : {formatAccountingDate(doc.receiptDate)}</p></div>
          <p data-rv-fit>เลขที่เอกสารอ้างอิง : {doc.paymentMethod === "cheque" ? doc.chequeNo : doc.refNo || ""}　{doc.whtCertificateNo ? `หนังสือรับรอง WHT: ${doc.whtCertificateNo}` : ""}</p>
          <p className="rv-description" data-rv-fit>รายละเอียด : รับชำระหนี้จาก {doc.customerName || doc.customer?.name || ""} {doc.customerBranch || ""}</p>
        </section>
        <table className="rv-grid rv-ledger">
          <colgroup>{["12%", "9%", "39%", "14%", "14%", "12%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
          <thead><tr>{["เลขที่บัญชี", "แผนก", "ชื่อบัญชี (Account Name)", "เดบิต", "เครดิต", "โครงการ"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{last ? entries.map((row, i) => <tr key={i}><td /><td /><td><div data-rv-fit>{row.name}</div></td><td><div data-rv-fit>{row.debit ? money(row.debit) : ""}</div></td><td><div data-rv-fit>{row.credit ? money(row.credit) : ""}</div></td><td /></tr>)
            : <tr><td colSpan={6}>รายละเอียดต่อเนื่อง — ยอดรวมแสดงหน้าสุดท้าย</td></tr>}</tbody>
          <tfoot><tr><td colSpan={3}>รวมทั้งสิ้น (Total) {last ? entries.length : ""} รายการ (Items)</td><td><div data-rv-fit>{last ? money(totals.settled) : ""}</div></td><td><div data-rv-fit>{last ? money(totals.settled) : ""}</div></td><td /></tr></tfoot>
        </table>
        <table className="rv-grid rv-bank"><thead><tr>{["สมุดเงินฝาก", "ธนาคาร", "สาขา", "เลขที่สมุดเงินฝาก", "เลขที่เช็ค", "วันที่บนเช็ค", "จำนวนเงิน"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody><tr><td /><td><div data-rv-fit>{doc.paymentMethod !== "cash" ? doc.bankName : ""}</div></td><td /><td /><td><div data-rv-fit>{doc.paymentMethod === "cheque" ? doc.chequeNo : ""}</div></td><td><div data-rv-fit>{doc.paymentMethod === "cheque" ? formatAccountingDate(doc.chequeDate) : ""}</div></td><td><div data-rv-fit>{last && doc.paymentMethod !== "cash" ? money(totals.received) : ""}</div></td></tr></tbody></table>
        <p className="rv-detail-title">รายละเอียดการตัดรับชำระ Invoice / BI {doc.lifecycleVersion !== 1 || doc.status !== "approved" ? "— ตัวอย่าง / ยังไม่ยืนยัน" : ""}</p>
        <table className="rv-grid rv-details">
          <colgroup>{["23%", "19%", "16%", "13%", "13%", "16%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
          <thead><tr>{["Invoice / วันที่", "BI", "เงินเข้าสุทธิ", "WHT", "ค่าธรรมเนียม", "ยอดลดหนี้"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.invoiceId}>
            <td><div data-rv-fit>{row.invoiceNo || row.invoice?.ivNo}<br />{formatAccountingDate(row.invoiceDate)}</div></td>
            <td><div data-rv-fit>{row.billingNote?.biNo || row.biNo || ""}</div></td>
            <td><div data-rv-fit>{money(row.receivedAmount)}</div></td><td><div data-rv-fit>{money(row.whtAmount)}</div></td><td><div data-rv-fit>{money(row.bankFee)}</div></td><td><div data-rv-fit>{money(receiptTotals([row]).settled)}</div></td>
          </tr>)}</tbody>
        </table>
        <p className="rv-remark" data-rv-fit>หมายเหตุ : {doc.remark || ""}</p>
        <p className="rv-not-gl">แสดงสรุปการรับชำระ ไม่ใช่การลงบัญชี GL · เว้นรหัสบัญชี แผนก และโครงการไว้ตรวจสอบ</p>
        <div className="rv-signatures">{["ผู้เตรียม (Prepared by)", "ผู้ตรวจ (Checked by)", "ผู้อนุมัติ (Approved by)", "ผู้ลงบัญชี (Posted by)", "ผู้รับเงิน / ผู้จ่ายเงิน"].map(label => <div key={label}><p>{label}</p><span /></div>)}</div>
      </article>;
    })}</div>
  </>;
}
export function ReceiptPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    #rv-print-doc { width:210mm; margin:0 auto; background:white; color:black; font:10pt/1.35 Tahoma,Arial,sans-serif; }
    #rv-print-doc * { box-sizing:border-box; }
    .rv-paper { width:210mm; height:296mm; padding:8mm; background:white; break-after:page; }
    .rv-paper:last-child { break-after:auto; }
    .rv-page-no { height:5mm; text-align:right; font-size:8pt; }
    #rv-print-doc h1 { height:10mm; text-align:center; font-size:15pt; font-weight:bold; overflow-wrap:anywhere; }
    .rv-types { height:20mm; padding-left:10mm; }
    .rv-header { border:1px solid black; padding:3mm; height:43mm; }
    .rv-header p { height:7mm; overflow-wrap:anywhere; white-space:pre-wrap; }
    .rv-header > div { display:grid; grid-template-columns:1fr 1fr; gap:3mm; }
    .rv-header .rv-description { height:13mm; }
    .accounting-shell table.rv-grid { min-width:0; width:100%; table-layout:fixed; border-collapse:collapse; font-size:9pt; }
    .rv-grid td,.rv-grid th { border:1px solid black; padding:1mm; overflow-wrap:anywhere; }
    .rv-grid th { font-weight:bold; text-align:center; height:9mm; }
    .rv-ledger td { height:8mm; text-align:right; }
    .rv-ledger td:nth-child(3) { text-align:left; }
    .rv-ledger td div { height:6mm; }
    .rv-ledger tfoot td:first-child { text-align:center; }
    .rv-bank { margin-top:1mm; } .rv-bank td { height:9mm; } .rv-bank td div { height:7mm; }
    .rv-detail-title { height:8mm; padding-top:2mm; font-size:9pt; }
    .rv-details td { height:11mm; text-align:right; }
    .rv-details td:nth-child(-n+2) { text-align:left; } .rv-details td div { height:9mm; }
    .rv-remark { height:17mm; padding-top:2mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .rv-not-gl { height:6mm; font-size:8pt; }
    .rv-signatures { display:grid; grid-template-columns:repeat(5,1fr); border-left:1px solid black; }
    .rv-signatures > div { border:1px solid black; border-left:0; height:20mm; text-align:center; font-size:8pt; }
    .rv-signatures p { padding:1mm; border-bottom:1px solid black; height:8mm; }
    @media print {
      @page { size:A4 portrait; margin:0; }
      html,body { width:210mm !important; min-width:0 !important; margin:0 !important; padding:0 !important; background:white !important; }
      .accounting-shell { display:block !important; width:210mm !important; margin:0 !important; padding:0 !important; }
      .accounting-shell aside,.accounting-shell > div > header,.accounting-shell > header,.rv-no-print { display:none !important; }
      .accounting-shell > div,.accounting-shell main,.rv-page,.rv-preview { width:210mm !important; max-width:none !important; min-width:0 !important; margin:0 !important; padding:0 !important; overflow:visible !important; border:0 !important; box-shadow:none !important; }
      #rv-print-doc { display:${allowed ? "block" : "none"} !important; }
      ${!allowed ? 'body::after { content:"Receipt voucher not ready for final print"; display:block; padding:20mm; color:black; }' : ""}
    }
  `}</style>;
}
