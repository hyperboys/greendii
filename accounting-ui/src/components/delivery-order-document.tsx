import Image from "next/image";
import { formatAccountingDocumentDate as formatAccountingDate } from "@/lib/accounting-date";
import { deliveryOrderStatus, type DeliveryOrder, type DeliveryOrderLine } from "@/lib/delivery-order";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { COMPANY_PRINT_TEL, COMPANY_THAI_ADDRESS } from "@/lib/company-print-details";

const SO_ROW_HEIGHT = 21;
const SO_TABLE_HEIGHT = 430;

function wrapText(value: string, width: number) {
  return value.split("\n").flatMap(line => {
    const characters = Array.from(line);
    return characters.length ? Array.from({ length: Math.ceil(characters.length / width) }, (_, i) => characters.slice(i * width, (i + 1) * width).join("")) : [""];
  });
}

export function deliveryOrderPrintPages(items: DeliveryOrderLine[], charsPerLine = 27, lineHeight = 17, pageHeight = 430, codeWidth = 12, unitWidth = 6, wrapDescription = (value: string) => wrapText(value, charsPerLine)) {
  const pages: { item: DeliveryOrderLine; height: number; continuation: boolean }[][] = [[]];
  const linesPerChunk = Math.min(20, Math.floor((pageHeight - 6) / lineHeight));
  let used = 0;
  for (const item of items) {
    const description = wrapDescription(`${item.desc}${item.remark ? `\n${item.remark}` : ""}`);
    const code = wrapText(item.partNo || item.product?.code || "", codeWidth);
    const unit = wrapText(item.unit || "", unitWidth);
    const lines = Math.max(description.length, code.length, unit.length);
    // Split oversized descriptions without repeating quantities or monetary amounts.
    for (let offset = 0; offset < lines; offset += linesPerChunk) {
      const height = Math.max(24, Math.min(linesPerChunk, lines - offset) * lineHeight + 6);
      if (used + height > pageHeight && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      pages[pages.length - 1].push({
        item: { ...item, desc: description.slice(offset, offset + linesPerChunk).join("\n"), remark: "", partNo: code.slice(offset, offset + linesPerChunk).join("\n"), unit: unit.slice(offset, offset + linesPerChunk).join("\n"), product: null },
        height, continuation: offset > 0,
      });
      used += height;
    }
  }
  return pages;
}

export function DeliveryOrderDocument({ document: doc, company }: { document: DeliveryOrder; company: PurchaseOrderCompanySettings }) {
  const pages = deliveryOrderPrintPages(doc.items, 27, SO_ROW_HEIGHT, SO_TABLE_HEIGHT, 8, 5);
  return (
    <div id="so-print-doc" className="mx-auto min-w-[720px] max-w-[210mm] bg-white text-black">
      {pages.map((rows, pageIndex) => {
        return (
          <article className="so-paper" key={pageIndex}>
            <p className="so-page-number">หน้า {pageIndex + 1} / {pages.length}</p>
            <header className="so-company">
              <Image unoptimized loading="eager" width={160} height={90} src="/logo.jpg" alt="โลโก้บริษัท" className="so-company-logo" />
              <h1>{company.companyName || "-"}</h1>
              <p className="so-company-address">{COMPANY_THAI_ADDRESS}</p>
              <p>โทร. {COMPANY_PRINT_TEL}　เลขประจำตัวผู้เสียภาษีอากร {company.taxId || "-"}</p>
            </header>
            <div className="so-title-row">
              <div className="so-title"><h2>ใบส่งของชั่วคราว</h2><strong>TEMPORARY INVOICE</strong></div>
            </div>
            <p className="so-customer-code">รหัสลูกค้า　{doc.customer?.code || ""}</p>
            <section className="so-info">
              <div className="so-customer">
                <p className="so-customer-row"><strong>ชื่อลูกค้า</strong><span>{doc.customer?.name || ""}{doc.customerBranch ? ` (${doc.customerBranch})` : ""}</span></p>
                <p className="so-address so-customer-row"><strong>ที่อยู่</strong><span>{doc.shippingAddress || ""}</span></p>
                <div className="so-contact"><span>โทร.　{doc.customerTel || ""}</span><span>โทรสาร　{doc.customerFax || ""}</span></div>
              </div>
              <div className="so-document-info">
                <dl className="so-number">
                  <div><dt>เลขที่</dt><dd>{doc.soNo}</dd></div>
                  <div><dt>วันที่</dt><dd>{formatAccountingDate(doc.docDate)}</dd></div>
                </dl>
              </div>
            </section>
            <table className="so-lines">
              <colgroup>{["18%", "58%", "12%", "12%"].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
              <thead><tr>{["รหัสสินค้า", "รายการ", "จำนวน", "หน่วย"].map(label => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ item, height, continuation }, index) => <tr key={index} style={{ height }}>
                  <td>{item.partNo || item.product?.code || ""}</td>
                  <td className="so-description">{item.desc}{item.remark && <small>{item.remark}</small>}</td>
                  <td className="so-numeric">{continuation ? "" : Number(item.qty).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                  <td className="so-unit">{item.unit}</td>
                </tr>)}
                <tr className="so-filler" style={{ height: Math.max(0, SO_TABLE_HEIGHT - rows.reduce((sum, row) => sum + row.height, 0)) }} aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <td key={index} />)}</tr>
              </tbody>
            </table>
            <section className="so-summary">
              <div className="so-notes">
                <strong>หมายเหตุ</strong>
                <p>{doc.remark}</p>
                {doc.workOrder?.woNo && <p>อ้างอิง WO: {doc.workOrder.woNo}</p>}
                {doc.receiver && <p>ผู้รับสินค้า: {doc.receiver}</p>}
                <p className="so-status">สถานะ: {deliveryOrderStatus(doc.status)} — ยังไม่ตัด Stock</p>
              </div>
            </section>
            <footer className="so-signatures">
              {[
                { role: "ผู้รับสินค้า", name: "" }, { role: "ผู้ส่งสินค้า", name: doc.createdBy?.fullName || "" }, { role: "ผู้มีอำนาจ", name: "" },
              ].map(({ role, name }) => <div key={role}>
                <p className="so-signature-name">{name || "\u00a0"}</p>
                <strong>{role}</strong><p>วันที่ ____/____/________</p>
              </div>)}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

export function DeliveryOrderPrintStyles() {
  return <style jsx global>{`
    #so-print-doc { font-family: var(--font-noto-thai), Tahoma, sans-serif; font-size: 14px; line-height: 1.4; }
    #so-print-doc .so-paper { position: relative; padding: 9mm 8mm 8mm; }
    #so-print-doc .so-page-number { text-align: right; font-size: 12px; margin-bottom: 2mm; }
    #so-print-doc .so-company { position: relative; text-align: center; margin-bottom: 5mm; padding: 0 40mm; min-height: 24mm; }
    #so-print-doc .so-company-logo { position: absolute; left: 0; top: 0; width: 38mm; height: 24mm; object-fit: contain; }
    #so-print-doc h1 { font-size: 20px; font-weight: 700; }
    #so-print-doc .so-company-address { font-size: 14px; font-weight: 600; white-space: pre-wrap; }
    #so-print-doc .so-title-row { position: relative; min-height: 16mm; display: flex; align-items: center; justify-content: flex-end; }
    #so-print-doc .so-title { position: absolute; left: 50%; transform: translateX(-50%); text-align: center; }
    #so-print-doc h2 { font-size: 23px; font-weight: 700; margin-bottom: 2mm; }
    #so-print-doc .so-title strong { font-size: 14px; }
    #so-print-doc table { border-collapse: collapse; table-layout: fixed; min-width: 0; }
    #so-print-doc .so-number { width: 100%; }
    #so-print-doc .so-number > div { display: grid; grid-template-columns: 20mm minmax(0, 1fr); gap: 2mm; }
    #so-print-doc .so-customer-code { margin: 2mm 0 1mm; }
    #so-print-doc .so-info { display: grid; grid-template-columns: 56% 44%; gap: 1mm; margin-bottom: 1mm; padding-right: 1mm; }
    #so-print-doc .so-customer, #so-print-doc .so-document-info { padding: 5px; min-height: 26mm; overflow-wrap: anywhere; }
    #so-print-doc .so-customer, #so-print-doc .so-document-info { border: 1px solid black; border-radius: 4px; }
    #so-print-doc .so-document-info { display: flex; align-items: center; }
    #so-print-doc .so-customer-row { display: grid; grid-template-columns: 18mm minmax(0, 1fr); gap: 1mm; }
    #so-print-doc .so-address { min-height: 12mm; white-space: pre-wrap; }
    #so-print-doc .so-contact { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
    #so-print-doc .so-lines { width: 100%; border: 1px solid black; }
    #so-print-doc .so-lines th { border: 1px solid black; padding: 5px 2px; font-weight: 600; text-align: center; }
    #so-print-doc .so-lines td { border-left: 1px solid black; border-right: 1px solid black; padding: 3px 4px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
    #so-print-doc .so-description small { display: block; font-size: inherit; }
    #so-print-doc .so-numeric { text-align: right; font-variant-numeric: tabular-nums; }
    #so-print-doc .so-unit { text-align: center; }
    #so-print-doc .so-filler td { padding: 0; }
    #so-print-doc .so-summary { border: 1px solid black; border-top: 0; break-inside: avoid; }
    #so-print-doc .so-notes { padding: 5px; white-space: pre-wrap; overflow-wrap: anywhere; }
    #so-print-doc .so-status { font-size: 12px; margin-top: 3mm; }
    #so-print-doc .so-signatures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1mm; margin-top: 1mm; break-inside: avoid; text-align: center; }
    #so-print-doc .so-signatures > div { border: 1px solid black; border-radius: 3px; min-height: 30mm; padding: 7mm 5mm 2mm; }
    #so-print-doc .so-signature-name { border-bottom: 1px solid black; min-height: 6mm; overflow-wrap: anywhere; }
    #so-print-doc .so-signatures strong { display: block; margin-top: 1mm; }
    @page { size: A4; margin: 8mm; }
    @media print {
      html, body, .accounting-shell { background: white !important; }
      body * { visibility: hidden !important; }
      #so-print-doc, #so-print-doc * { visibility: visible !important; }
      #so-print-doc { position: absolute !important; left: 0; top: 0; width: 100%; min-width: 0 !important; max-width: none; padding: 0; margin: 0; }
      #so-print-doc .so-paper { padding: 0; break-after: page; }
      #so-print-doc .so-paper:last-child { break-after: auto; }
      .so-preview { overflow: visible !important; }
      .so-no-print { display: none !important; }
      #so-print-doc thead { display: table-header-group; }
      #so-print-doc tr { break-inside: avoid; }
    }
  `}</style>;
}
