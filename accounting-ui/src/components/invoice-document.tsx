import { formatAccountingDate } from "@/lib/accounting-date";
import { invoiceForm, type Invoice } from "@/lib/invoice";
import { billingAmountText } from "@/lib/billing-note";
import { deliveryOrderPrintPages } from "@/components/delivery-order-document";
import { useEffect, useRef, useState } from "react";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoiceDocument({ document: doc, onReady }: { document: Invoice; onReady?: (ready: boolean) => void }) {
  const pages = deliveryOrderPrintPages(invoiceForm(doc).items, 40, 24, 450);
  const root = useRef<HTMLDivElement>(null);
  const [fitError, setFitError] = useState(false);
  useEffect(() => {
    let current = true;
    onReady?.(false);
    document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let valid = true;
      for (const element of root.current.querySelectorAll<HTMLElement>("[data-print-fit]")) {
        let size = 12;
        element.style.fontSize = `${size}pt`;
        while (size > 6 && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
          size -= 0.5;
          element.style.fontSize = `${size}pt`;
        }
        if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) valid = false;
      }
      setFitError(!valid);
      onReady?.(valid);
    });
    return () => { current = false; };
  }, [doc, onReady]);
  return <><p className={`iv-no-print rounded bg-red-50 p-3 text-red-700 ${fitError ? "" : "hidden"}`} role={fitError ? "alert" : undefined}>ข้อมูลยาวเกินพื้นที่แบบฟอร์ม กรุณาปรับข้อมูลก่อนพิมพ์ ไม่มีการตัดข้อความเพื่อซ่อนข้อมูล</p><div ref={root} id="iv-print-doc" className="mx-auto w-[210mm] text-black">
    {pages.map((rows, pageIndex) => <article key={pageIndex} className="iv-overlay relative h-[297mm] w-[210mm] bg-white text-[12pt] leading-tight">
      <div data-print-fit className="iv-value" style={{ left: "27.5mm", top: "24.5mm", width: "25mm", height: "5.5mm" }}>{doc.customerCode || doc.customer?.code}</div>
      <div data-print-fit className="iv-value" style={{ left: "27.5mm", top: "30mm", width: "115mm", height: "5.5mm" }}>{doc.customerName || doc.customer?.name}</div>
      <div data-print-fit className="iv-value" style={{ left: "27.5mm", top: "35.5mm", width: "115mm", height: "12mm" }}>{doc.address}</div>
      <div data-print-fit className="iv-value" style={{ left: "58.5mm", top: "24.5mm", width: "39mm", height: "5.5mm" }}>{doc.taxId ? `TAX ID: ${doc.taxId}` : ""}</div>
      <div data-print-fit className="iv-value" style={{ left: "98.5mm", top: "24.5mm", width: "44mm", height: "5.5mm" }}>{doc.customerBranch ? `สาขา ${doc.customerBranch}` : ""}</div>
      <div data-print-fit className="iv-value" style={{ left: "29.5mm", top: "48mm", width: "113mm", height: "5.5mm" }}>{doc.customerPoNo}</div>
      <div data-print-fit className="iv-value" style={{ left: "27.5mm", top: "54mm", width: "115mm", height: "11mm" }}>{doc.remark}</div>
      <div data-print-fit className="iv-value" style={{ left: "153mm", top: "24.5mm", width: "45mm", height: "5.5mm" }}>{formatAccountingDate(doc.ivDate)}</div>
      <div data-print-fit className="iv-value" style={{ left: "153mm", top: "30mm", width: "45mm", height: "5.5mm" }}>{doc.ivNo}</div>
      <div data-print-fit className="iv-value" style={{ left: "153mm", top: "35.5mm", width: "45mm", height: "5.5mm" }}>{doc.responsibleSaleName}</div>
      <div data-print-fit className="iv-value" style={{ left: "153mm", top: "41mm", width: "45mm", height: "5.5mm" }}>{doc.creditTerm}　วัน</div>
      <div data-print-fit className="iv-value" style={{ left: "153mm", top: "46.5mm", width: "45mm", height: "5.5mm" }}>{formatAccountingDate(doc.dueDate)}</div>
      <div className="iv-items">
        {rows.map(({ item, height, continuation }, index) => <div key={index} className="iv-item" style={{ height: `${height * 25.4 / 96}mm` }}>
          <div data-print-fit>{item.partNo}</div>
          <div data-print-fit>{item.desc}</div>
          <div data-print-fit className="iv-number text-right">{continuation ? "" : Number(item.qty).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</div>
          <div data-print-fit className="iv-unit">{item.unit}</div>
          <div data-print-fit className="iv-number text-right">{continuation ? "" : money(item.unitPrice)}</div>
          <div data-print-fit className="iv-number text-right">{continuation || !Number(item.discount) ? "" : money(item.discount)}</div>
          <div data-print-fit className="iv-number text-right">{continuation ? "" : money(item.amount ?? 0)}</div>
        </div>)}
      </div>
      <div className="iv-value text-[8pt]" style={{ left: "8.5mm", top: "188.5mm", width: "125mm" }}>{doc.provisionalDeliveryOrder?.soNo || ""} {pages.length > 1 ? `${pageIndex + 1}/${pages.length}` : ""}</div>
      {pageIndex === pages.length - 1 && <>
        <div data-print-fit className="iv-value" style={{ left: "8.5mm", top: "193.5mm", width: "125mm", height: "5.5mm" }}>{Number(doc.discount) ? `ส่วนลดท้ายเอกสาร ${money(doc.discount)} บาท` : ""}</div>
        <div data-print-fit className="iv-value" style={{ left: "37mm", top: "199mm", width: "110mm", height: "6mm" }}>({billingAmountText(doc.netAmount)})</div>
        <div data-print-fit className="iv-value text-right" style={{ left: "170.5mm", top: "201mm", width: "23mm", height: "5.5mm" }}>{money(Number(doc.subTotal) - Number(doc.discount))}</div>
        <div data-print-fit className="iv-value" style={{ left: "160.5mm", top: "208.5mm", width: "10mm", height: "5.5mm" }}>{doc.vatConfig === "VAT7%" ? "7%" : ""}</div>
        <div data-print-fit className="iv-value text-right" style={{ left: "170.5mm", top: "208.5mm", width: "23mm", height: "5.5mm" }}>{money(doc.vat)}</div>
        <div data-print-fit className="iv-value text-right" style={{ left: "170.5mm", top: "219mm", width: "23mm", height: "5.5mm" }}>{money(doc.netAmount)}</div>
      </>}
    </article>)}
  </div></>;
}

export function InvoicePrintStyles({ allowed = false }: { allowed?: boolean }) {
  return <style jsx global>{`
    #iv-print-doc .iv-value { position: absolute; white-space: pre-wrap; overflow-wrap: anywhere; }
    #iv-print-doc .iv-items { position: absolute; left: 8.5mm; top: 68.5mm; width: 185mm; }
    #iv-print-doc .iv-item { display: grid; grid-template-columns: 22mm 74.5mm 7mm 11.5mm 25mm 22mm 23mm; line-height: 1.5; }
    #iv-print-doc .iv-item > div { height: 100%; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    #iv-print-doc .iv-item > .iv-number { white-space: nowrap; }
    #iv-print-doc .iv-item > .iv-unit { padding-left: 3.5mm; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
      body * { visibility: hidden !important; }
      #iv-print-doc, #iv-print-doc * { visibility: visible !important; }
      #iv-print-doc { position: static; margin: 0 !important; width: 210mm !important; }
      #iv-print-doc .iv-overlay { height: 296mm; break-after: page; break-inside: avoid; }
      #iv-print-doc .iv-overlay:last-child { break-after: auto; }
      html, body, .accounting-shell, .accounting-shell main, .iv-page { width: 210mm !important; min-height: 0 !important; max-width: none !important; }
      .accounting-shell, .accounting-shell main, .iv-page { display: block !important; padding: 0 !important; margin: 0 !important; }
      .iv-preview { overflow: visible !important; border: 0 !important; }
      .iv-no-print, .accounting-shell > aside, .accounting-shell > div > header { display: none !important; }
      ${!allowed ? `#iv-print-doc { display: none !important; } body::after { content: "Invoice not ready for printing: confirm document and resolve layout errors first."; visibility: visible !important; display: block; color: black; }` : ""}
    }
  `}</style>;
}
