import { formatAccountingDate } from "@/lib/accounting-date";
import { deliveryOrderStatus, type DeliveryOrder, type DeliveryOrderLine } from "@/lib/delivery-order";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";

const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function wrapText(value: string, width: number) {
  return value.split("\n").flatMap(line => {
    const characters = Array.from(line);
    return characters.length ? Array.from({ length: Math.ceil(characters.length / width) }, (_, i) => characters.slice(i * width, (i + 1) * width).join("")) : [""];
  });
}

export function deliveryOrderPrintPages(items: DeliveryOrderLine[]) {
  const pages: { item: DeliveryOrderLine; height: number; continuation: boolean }[][] = [[]];
  let used = 0;
  for (const item of items) {
    const description = wrapText(`${item.desc}${item.remark ? `\n${item.remark}` : ""}`, 27);
    const code = wrapText(item.partNo || item.product?.code || "", 12);
    const unit = wrapText(item.unit || "", 6);
    const lines = Math.max(description.length, code.length, unit.length);
    // Split oversized descriptions without repeating quantities or monetary amounts.
    for (let offset = 0; offset < lines; offset += 20) {
      const height = Math.max(24, Math.min(20, lines - offset) * 17 + 6);
      if (used + height > 430 && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      pages[pages.length - 1].push({
        item: { ...item, desc: description.slice(offset, offset + 20).join("\n"), remark: "", partNo: code.slice(offset, offset + 20).join("\n"), unit: unit.slice(offset, offset + 20).join("\n"), product: null },
        height, continuation: offset > 0,
      });
      used += height;
    }
  }
  return pages;
}

export function DeliveryOrderDocument({ document: doc, company }: { document: DeliveryOrder; company: PurchaseOrderCompanySettings }) {
  const pages = deliveryOrderPrintPages(doc.items);
  return (
    <div id="so-print-doc" className="mx-auto min-w-[720px] max-w-[210mm] bg-white text-black">
      {pages.map((rows, pageIndex) => {
        const lastPage = pageIndex === pages.length - 1;
        return (
          <article className="so-paper" key={pageIndex}>
            <p className="so-page-number">หน้า {pageIndex + 1} / {pages.length}</p>
            <header className="so-company">
              <h1>{company.companyName || "-"}</h1>
              <p className="so-company-address">{company.address || "-"}</p>
              <p>โทร. {company.tel || "-"}　เลขประจำตัวผู้เสียภาษีอากร {company.taxId || "-"}</p>
            </header>
            <div className="so-title-row">
              <div className="so-title"><h2>ใบส่งของชั่วคราว</h2><strong>TEMPORARY INVOICE</strong></div>
              <table className="so-number"><tbody>
                <tr><th>เลขที่</th><td>{doc.soNo}</td></tr>
                <tr><th>วันที่</th><td>{formatAccountingDate(doc.docDate)}</td></tr>
              </tbody></table>
            </div>
            <p className="so-customer-code">รหัสลูกค้า　{doc.customer?.code || ""}</p>
            <section className="so-info">
              <div className="so-customer">
                <p><strong>ชื่อลูกค้า</strong>　{doc.customer?.name || ""} {doc.customerBranch ? `(${doc.customerBranch})` : ""}</p>
                <p className="so-address"><strong>ที่อยู่</strong>　{doc.shippingAddress || ""}</p>
                <div className="so-contact"><span>โทร.　{doc.customerTel || ""}</span><span>โทรสาร　{doc.customerFax || ""}</span></div>
              </div>
              <div className="so-terms">
                <div className="so-reservation"><span>ใบสั่งจอง</span><span>ลงวันที่</span></div>
                <p>วันที่กำหนดส่ง　{doc.deliveryDate ? formatAccountingDate(doc.deliveryDate) : ""}</p>
                <p>จำนวนวันเครดิต　{doc.creditTerm} วัน</p>
                <p>เงื่อนไขการวางบิล</p>
              </div>
            </section>
            <table className="so-lines">
              <colgroup>{["14%", "29%", "9%", "8%", "14%", "10%", "16%"].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
              <thead><tr>{["รหัสสินค้า", "รายการ", "จำนวน", "หน่วย", "ราคา/หน่วย", "ส่วนลด", "จำนวนเงิน"].map(label => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ item, height, continuation }, index) => <tr key={index} style={{ height }}>
                  <td>{item.partNo || item.product?.code || ""}</td>
                  <td className="so-description">{item.desc}{item.remark && <small>{item.remark}</small>}</td>
                  <td className="so-numeric">{continuation ? "" : Number(item.qty).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                  <td className="so-unit">{item.unit}</td>
                  <td className="so-numeric">{continuation ? "" : money(item.unitPrice)}</td>
                  <td className="so-numeric">{continuation ? "" : money(item.discount)}</td>
                  <td className="so-numeric">{continuation ? "" : money(item.amount ?? (Math.round(Number(item.unitPrice) * 100) * Number(item.qty) - Math.round(Number(item.discount) * 100)) / 100)}</td>
                </tr>)}
                <tr className="so-filler" style={{ height: Math.max(0, 430 - rows.reduce((sum, row) => sum + row.height, 0)) }} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <td key={index} />)}</tr>
              </tbody>
            </table>
            <section className="so-summary">
              <div className="so-notes">
                <strong>หมายเหตุ</strong>
                <p>{doc.remark}</p>
                {doc.workOrder?.woNo && <p>อ้างอิง WO: {doc.workOrder.woNo}</p>}
                {doc.receiver && <p>ผู้รับสินค้า: {doc.receiver}</p>}
                <p className="so-status">สถานะ: {deliveryOrderStatus(doc.status)} — ยังไม่ตัด Stock{!lastPage && " / ยอดรวมแสดงหน้าสุดท้าย"}</p>
              </div>
              <table className="so-totals"><tbody>
                {[
                  ["รวมเงิน", doc.subTotal], ["ส่วนลดการค้า", doc.discount],
                  ["เงินหลังหักส่วนลด", (Math.round(Number(doc.subTotal) * 100) - Math.round(Number(doc.discount) * 100)) / 100],
                  [doc.vatConfig === "NO_VAT" ? "ภาษีมูลค่าเพิ่ม (No VAT)" : "ภาษีมูลค่าเพิ่ม　7%", doc.vat],
                  ["จำนวนเงินทั้งสิ้น", doc.netAmount],
                ].map(([label, amount]) => <tr key={label}><th>{label}</th><td>{lastPage ? money(amount) : ""}</td></tr>)}
              </tbody></table>
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
    #so-print-doc { font-family: var(--font-noto-thai), Tahoma, sans-serif; font-size: 11px; line-height: 1.5; }
    #so-print-doc .so-paper { position: relative; padding: 9mm 8mm 8mm; }
    #so-print-doc .so-page-number { text-align: right; font-size: 10px; margin-bottom: 2mm; }
    #so-print-doc .so-company { text-align: center; margin-bottom: 5mm; }
    #so-print-doc h1 { font-size: 18px; font-weight: 700; }
    #so-print-doc .so-company-address { font-size: 12px; font-weight: 600; white-space: pre-wrap; }
    #so-print-doc .so-title-row { position: relative; min-height: 16mm; display: flex; align-items: center; justify-content: flex-end; }
    #so-print-doc .so-title { position: absolute; left: 50%; transform: translateX(-50%); text-align: center; }
    #so-print-doc h2 { font-size: 23px; font-weight: 700; margin-bottom: 2mm; }
    #so-print-doc .so-title strong { font-size: 13px; }
    #so-print-doc table { border-collapse: collapse; table-layout: fixed; min-width: 0; }
    #so-print-doc .so-number { width: 28%; font-size: 11px; }
    #so-print-doc .so-number th, #so-print-doc .so-number td { border: 1px solid black; padding: 3px; overflow-wrap: anywhere; }
    #so-print-doc .so-number th { width: 26%; font-weight: 500; }
    #so-print-doc .so-customer-code { margin: 2mm 0 1mm; }
    #so-print-doc .so-info { display: grid; grid-template-columns: 56% 44%; gap: 1mm; margin-bottom: 1mm; padding-right: 1mm; }
    #so-print-doc .so-customer, #so-print-doc .so-terms { border: 1px solid black; border-radius: 4px; padding: 5px; min-height: 26mm; overflow-wrap: anywhere; }
    #so-print-doc .so-address { min-height: 12mm; white-space: pre-wrap; }
    #so-print-doc .so-contact, #so-print-doc .so-reservation { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
    #so-print-doc .so-terms p { margin-top: 3px; }
    #so-print-doc .so-lines { width: 100%; border: 1px solid black; }
    #so-print-doc .so-lines th { border: 1px solid black; padding: 5px 2px; font-weight: 600; text-align: center; }
    #so-print-doc .so-lines td { border-left: 1px solid black; border-right: 1px solid black; padding: 3px 4px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
    #so-print-doc .so-description small { display: block; font-size: inherit; }
    #so-print-doc .so-numeric { text-align: right; font-variant-numeric: tabular-nums; }
    #so-print-doc .so-unit { text-align: center; }
    #so-print-doc .so-filler td { padding: 0; }
    #so-print-doc .so-summary { display: grid; grid-template-columns: 68% 32%; border: 1px solid black; border-top: 0; break-inside: avoid; }
    #so-print-doc .so-notes { padding: 5px; white-space: pre-wrap; overflow-wrap: anywhere; }
    #so-print-doc .so-status { font-size: 9px; margin-top: 3mm; }
    #so-print-doc .so-totals { width: 100%; }
    #so-print-doc .so-totals th, #so-print-doc .so-totals td { border-left: 1px solid black; border-bottom: 1px solid black; padding: 4px 3px; font-weight: 400; }
    #so-print-doc .so-totals th { width: 53%; text-align: left; font-size: 10px; }
    #so-print-doc .so-totals td { text-align: right; overflow-wrap: anywhere; }
    #so-print-doc .so-totals tr:last-child > * { border-bottom: 0; font-weight: 700; }
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
