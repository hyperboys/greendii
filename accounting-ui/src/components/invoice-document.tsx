import { formatAccountingDate } from "@/lib/accounting-date";
import { invoiceForm, type Invoice } from "@/lib/invoice";
import { deliveryOrderPrintPages } from "@/components/delivery-order-document";
import { useEffect, useRef, useState } from "react";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoiceDocument({ document: doc, onReady }: { document: Invoice; onReady?: (ready: boolean) => void }) {
  const pages = deliveryOrderPrintPages(invoiceForm(doc).items.map(item => ({ ...item, desc: `${item.desc}${item.unit ? `\n(${item.unit})` : ""}`, unit: "" })));
  const root = useRef<HTMLDivElement>(null);
  const [fitError, setFitError] = useState(false);
  useEffect(() => {
    let current = true;
    onReady?.(false);
    document.fonts.ready.then(() => {
      if (!current || !root.current) return;
      let valid = true;
      for (const element of root.current.querySelectorAll<HTMLElement>("[data-print-fit]")) {
        let size = 10;
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
  return <><p className={`iv-no-print rounded bg-red-50 p-3 text-red-700 ${fitError ? "" : "hidden"}`} role={fitError ? "alert" : undefined}>ข้อมูลหัวเอกสารยาวเกินพื้นที่แบบฟอร์ม กรุณาปรับข้อมูลก่อนพิมพ์ ไม่มีการตัดข้อความเพื่อซ่อนข้อมูล</p><div ref={root} id="iv-print-doc" className="mx-auto w-[210mm] text-black">
    {pages.map((rows, pageIndex) => <article key={pageIndex} className="iv-overlay relative h-[297mm] w-[210mm] bg-white text-[10pt] leading-tight">
      <div data-print-fit className="iv-value" style={{ left: "32mm", top: "41mm", width: "94mm", height: "4mm" }}>{doc.customerCode || doc.customer?.code}</div>
      <div data-print-fit className="iv-value" style={{ left: "32mm", top: "46mm", width: "94mm", height: "4mm" }}>{doc.customerName || doc.customer?.name} {doc.customerBranch ? `(${doc.customerBranch})` : ""}</div>
      <div data-print-fit className="iv-value" style={{ left: "23mm", top: "51mm", width: "103mm", height: "10mm" }}>{doc.address}</div>
      <div data-print-fit className="iv-value" style={{ left: "29mm", top: "62mm", width: "97mm", height: "4mm" }}>{doc.taxId}{doc.remark ? ` / ${doc.remark}` : ""}</div>
      <div data-print-fit className="iv-value" style={{ left: "31mm", top: "67mm", width: "95mm", height: "4mm" }}>{doc.customerPoNo}</div>
      <div data-print-fit className="iv-value" style={{ left: "155mm", top: "42mm", width: "45mm", height: "4mm" }}>{formatAccountingDate(doc.ivDate)}</div>
      <div data-print-fit className="iv-value" style={{ left: "155mm", top: "47mm", width: "45mm", height: "4mm" }}>{doc.ivNo}</div>
      <div data-print-fit className="iv-value" style={{ left: "155mm", top: "52mm", width: "45mm", height: "4mm" }}>{doc.responsibleSaleName}</div>
      <div data-print-fit className="iv-value" style={{ left: "155mm", top: "62mm", width: "45mm", height: "4mm" }}>{formatAccountingDate(doc.dueDate)}</div>
      <div className="absolute left-[11mm] top-[82mm] w-[190mm]">
        {rows.map(({ item, height, continuation }, index) => <div key={index} className="grid grid-cols-[22mm_74mm_25mm_25mm_20mm_24mm]" style={{ height: `${height * 25.4 / 96}mm` }}>
          <div className="break-words px-1 whitespace-pre-wrap">{item.partNo}</div>
          <div className="break-words px-1 whitespace-pre-wrap">{item.desc}</div>
          <div data-print-fit className="h-[6mm] px-1 text-right">{continuation ? "" : Number(item.qty).toLocaleString("en-US")}</div>
          <div data-print-fit className="h-[6mm] px-1 text-right">{continuation ? "" : money(item.unitPrice)}</div>
          <div data-print-fit className="h-[6mm] px-1 text-right">{continuation ? "" : money(item.discount)}</div>
          <div data-print-fit className="h-[6mm] px-1 text-right">{continuation ? "" : money(item.amount ?? 0)}</div>
        </div>)}
      </div>
      <div className="iv-value text-[8pt]" style={{ left: "12mm", top: "208mm", width: "115mm" }}>{doc.provisionalDeliveryOrder?.soNo || ""} {pageIndex + 1}/{pages.length}</div>
      {pageIndex === pages.length - 1 && <>
        <div className="iv-value" style={{ left: "12mm", top: "216mm", width: "115mm" }}>{Number(doc.discount) ? `ส่วนลดท้ายเอกสาร ${money(doc.discount)} บาท` : ""}</div>
        <div className="iv-value text-right" style={{ left: "177mm", top: "218mm", width: "23mm" }}>{money(Number(doc.subTotal) - Number(doc.discount))}</div>
        <div className="iv-value text-right" style={{ left: "177mm", top: "225mm", width: "23mm" }}>{money(doc.vat)}</div>
        <div className="iv-value text-right" style={{ left: "177mm", top: "236mm", width: "23mm" }}>{money(doc.netAmount)}</div>
      </>}
    </article>)}
  </div></>;
}

export function InvoicePrintStyles({ allowed = false }: { allowed?: boolean }) {
  return <style jsx global>{`
    #iv-print-doc .iv-value { position: absolute; white-space: pre-wrap; overflow-wrap: anywhere; }
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
