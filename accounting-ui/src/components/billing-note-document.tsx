"use client";

import { useEffect, useRef, useState } from "react";
import { formatAccountingDate } from "@/lib/accounting-date";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import type { BillingLine, BillingNote } from "@/lib/billing-note";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function billingPrintPages(items: BillingLine[]) {
  const pages: BillingLine[][] = [];
  for (let i = 0; i < items.length; i += 17) pages.push(items.slice(i, i + 17));
  return pages.length ? pages : [[]];
}
export function BillingNoteDocument({ document: doc, company, onReady }: {
  document: BillingNote; company: PurchaseOrderCompanySettings; onReady?: (ready: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [fitError, setFitError] = useState("");
  const pages = billingPrintPages(doc.invoices);
  useEffect(() => {
    let current = true;
    onReady?.(false);
    async function check() {
      await document.fonts.ready;
      if (!current || !root.current) return;
      const fields = Array.from(root.current.querySelectorAll<HTMLElement>("[data-bi-fit]"));
      let overflow = false;
      for (const field of fields) {
        field.style.fontSize = "";
        for (let size = 10; size >= 7; size -= 0.5) {
          field.style.fontSize = `${size}pt`;
          if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) break;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) overflow = true;
      }
      setFitError(overflow ? "ข้อมูลยาวเกินพื้นที่แบบพิมพ์ กรุณาย่อข้อความก่อนยืนยัน/พิมพ์" : "");
      onReady?.(!overflow);
    }
    void check();
    return () => { current = false; };
  }, [doc, company, onReady]);
  return <>
    {fitError && <p role="alert" className="bi-no-print p-3 text-red-700">{fitError}</p>}
    <div id="bi-print-doc" ref={root}>
      {pages.map((rows, page) => <article className="bi-paper" key={page}>
        <p className="bi-page-number">หน้า {page + 1} / {pages.length}</p>
        <header className="bi-company">
          <h1 data-bi-fit>{company.companyName || ""}</h1>
          <p className="bi-company-address" data-bi-fit>{company.address || ""}</p>
          <p data-bi-fit>โทร. {company.tel || ""}　เลขประจำตัวผู้เสียภาษีอากร {company.taxId || ""}</p>
          <h2>ใบวางบิล</h2>
        </header>
        <p className="bi-code" data-bi-fit>รหัสลูกค้า　{doc.customerCode || doc.customer?.code || ""}</p>
        <section className="bi-info">
          <div className="bi-customer">
            <p className="bi-name" data-bi-fit><strong>ชื่อลูกค้า</strong>　{doc.customerName || doc.customer?.name || ""} {doc.customerBranch && `(${doc.customerBranch})`}</p>
            <p className="bi-address" data-bi-fit><strong>ที่อยู่</strong>　{doc.address || ""}</p>
            <p data-bi-fit>{doc.contactPerson ? `ผู้ติดต่อ ${doc.contactPerson}` : ""}</p>
          </div>
          <div className="bi-terms">
            <p data-bi-fit>เลขที่　{doc.biNo}</p>
            <p>วันที่　{formatAccountingDate(doc.billingDate)}</p>
            <p>วันที่นัดชำระ　{formatAccountingDate(doc.expectedPaymentDate)}</p>
            <p className="bi-payment-terms" data-bi-fit>เงื่อนไขการจ่ายชำระ　{doc.paymentTerms}</p>
          </div>
        </section>
        <p className="bi-ack">รับบิลไว้ตรวจสอบตามรายการข้างล่างนี้ถูกต้องแล้ว{doc.status !== "approved" || doc.lifecycleVersion !== 1 ? " — ตัวอย่าง / ไม่ใช่ใบวางบิลยืนยัน" : ""}</p>
        <table className="bi-lines">
          <colgroup>{["6%", "14%", "10%", "29%", "11%", "16%", "14%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
          <thead><tr>{["ลำดับที่", "เลขที่เอกสาร", "วันที่เอกสาร", "ประเภทรายการ", "วันครบกำหนด", "จำนวนเงินตามใบกำกับ", "จำนวนเงินวางบิล"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => <tr key={row.invoiceId}>
              <td>{page * 17 + i + 1}</td><td><div data-bi-fit>{row.invoiceNo || row.invoice?.ivNo}</div></td>
              <td>{formatAccountingDate(row.invoiceDate || row.invoice?.ivDate)}</td>
              <td>ใบแจ้งหนี้ / ใบกำกับภาษี</td><td>{formatAccountingDate(row.invoiceDueDate || row.invoice?.dueDate)}</td>
              <td className="bi-money"><div data-bi-fit>{money(row.invoiceNetAmount ?? row.invoice?.netAmount ?? 0)}</div></td>
              <td className="bi-money"><div data-bi-fit>{money(row.billingAmount)}</div></td>
            </tr>)}
            <tr className="bi-filler" style={{ height: `${Math.max(0, 120 - rows.length * 7)}mm` }} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <td key={i} />)}</tr>
          </tbody>
          <tfoot><tr><td colSpan={3}>รวม　{page === pages.length - 1 ? doc.invoices.length : ""}　รายการ　เป็นเงิน</td><td colSpan={3}>{page !== pages.length - 1 && "ยอดรวมแสดงหน้าสุดท้าย"}</td><td className="bi-money"><div data-bi-fit>{page === pages.length - 1 ? money(doc.totalAmount) : ""}</div></td></tr></tfoot>
        </table>
        <div className="bi-remark" data-bi-fit><strong>หมายเหตุ</strong>　{doc.remark || ""}</div>
        <footer className="bi-signatures">
          <div><p>ในนาม　{company.companyName || ""}</p><span /><p>ผู้วางบิล</p><p>วันที่ ____/____/________</p></div>
          <div><p>&nbsp;</p><span /><p>ผู้รับวางบิล</p><p>วันที่ ____/____/________</p></div>
        </footer>
      </article>)}
    </div>
  </>;
}
export function BillingPrintStyles({ allowed }: { allowed: boolean }) {
  return <style jsx global>{`
    #bi-print-doc { width: 210mm; margin: 0 auto; color: #000; background: #fff; font-family: Tahoma, Arial, sans-serif; font-size: 10pt; line-height: 1.35; }
    #bi-print-doc * { box-sizing: border-box; }
    .bi-paper { width: 210mm; height: 296mm; padding: 9mm; position: relative; background: #fff; }
    .bi-page-number { text-align: right; height: 5mm; font-size: 9pt; }
    .bi-company { text-align: center; height: 30mm; }
    .bi-company h1 { height: 8mm; font-size: 16pt !important; font-weight: bold; }
    .bi-company p { height: 6mm; white-space: pre-wrap; overflow-wrap: anywhere; }
    .bi-company h2 { font-size: 16pt; font-weight: bold; margin-top: 2mm; }
    .bi-code { height: 6mm; margin-top: 2mm; }
    .bi-info { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm; height: 35mm; }
    .bi-info > div { border: 1px solid #000; border-radius: 2mm; padding: 2mm; min-width: 0; }
    .bi-info p { overflow-wrap: anywhere; white-space: pre-wrap; }
    .bi-name { height: 9mm; }
    .bi-address { height: 15mm; }
    .bi-customer > p:last-child { height: 5mm; }
    .bi-terms > p { height: 6mm; }
    .bi-terms .bi-payment-terms { height: 11mm; }
    .bi-ack { height: 7mm; padding-top: 1mm; font-size: 9pt; }
    .accounting-shell table.bi-lines { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; font-size: 9pt; }
    .bi-lines th, .bi-lines td { border-left: 1px solid #000; border-right: 1px solid #000; padding: 1mm; overflow-wrap: anywhere; vertical-align: top; }
    .bi-lines thead th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: center; height: 10mm; font-weight: normal; vertical-align: middle; }
    .bi-lines tbody tr:not(.bi-filler) { height: 7mm; }
    .bi-lines tbody td > div { height: 5mm; }
    .bi-lines tfoot td { border-top: 1px solid #000; border-bottom: 1px solid #000; height: 8mm; vertical-align: middle; }
    .bi-lines tfoot td > div { height: 5mm; }
    .bi-money { text-align: right; }
    .bi-remark { height: 19mm; border: 1px solid #000; border-top: 0; padding: 1mm; white-space: pre-wrap; overflow-wrap: anywhere; }
    .bi-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm; height: 31mm; }
    .bi-signatures > div { border: 1px solid #000; border-radius: 2mm; padding: 2mm; }
    .bi-signatures p:not(:first-child) { text-align: center; }
    .bi-signatures p:first-child { height: 8mm; overflow-wrap: anywhere; font-size: 9pt; }
    .bi-signatures span { display: block; border-bottom: 1px solid #000; margin: 4mm 10mm 1mm; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { width: 210mm !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .accounting-shell { display: block !important; width: 210mm !important; margin: 0 !important; padding: 0 !important; }
      .accounting-shell aside, .accounting-shell > div > header, .accounting-shell > header, .bi-no-print { display: none !important; }
      .accounting-shell > div, .accounting-shell main, .bi-page, .bi-preview { width: 210mm !important; max-width: none !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; }
      #bi-print-doc { display: ${allowed ? "block" : "none"} !important; }
      .bi-paper { break-after: page; page-break-after: always; }
      .bi-paper:last-child { break-after: auto; page-break-after: auto; }
      ${!allowed ? 'body::after { content: "Billing note not ready for final print"; display: block; padding: 20mm; color: #000; }' : ""}
    }
  `}</style>;
}
