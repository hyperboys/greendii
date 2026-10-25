import Image from "next/image";
import { formatAccountingDate as formatDate } from "@/lib/accounting-date";
import type {
  PurchaseOrderCompanySettings, PurchaseOrderDocument, PurchaseOrderAttachment,
} from "@/lib/accounting-purchase-orders";

function formatMoney(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fileHref(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (/^(https?:)?\/\//i.test(fileUrl)) return fileUrl;
  return fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
}

function AttachmentList({ attachments }: { attachments: PurchaseOrderAttachment[] }) {
  if (attachments.length === 0) return <span>-</span>;
  return (
    <ul className="space-y-1">
      {attachments.map(file => (
        <li key={file.id}>
          {file.fileUrl ? (
            <a className="text-blue-700 underline" href={fileHref(file.fileUrl)} target="_blank" rel="noreferrer">
              {file.originalName}
            </a>
          ) : file.originalName}
        </li>
      ))}
    </ul>
  );
}

export function PurchaseOrderDocumentView({
  document,
  company,
}: {
  document: PurchaseOrderDocument;
  company: PurchaseOrderCompanySettings;
}) {
  const references = document.purchaseRequestReferences?.map(reference => reference.purchaseRequest)
    ?? (document.pr ? [{ ...document.pr, status: "" }] : []);
  const prAttachments = references.flatMap(reference => reference.attachments || []);
  const subtotal = Number(document.subTotal || 0);
  const discount = Number(document.discount || 0);
  const taxableAmount = subtotal - discount;
  const signature = document.createdBy?.signatureUrl;

  return (
    <article id="po-print-doc" className="mx-auto min-w-[720px] max-w-[210mm] bg-white p-6 text-[12px] leading-5 text-black sm:p-8">
      <header className="grid grid-cols-[92px_1fr_92px] items-center gap-3 border-b-2 border-gray-800 pb-3 text-center">
        <div className="flex h-16 items-center justify-center border border-gray-300 p-1">
          {company.logoUrl ? <Image unoptimized width={160} height={56} src={fileHref(company.logoUrl)} alt="โลโก้บริษัท" className="max-h-14 max-w-full object-contain" /> : <strong className="text-green-700">GREEN Dii</strong>}
        </div>
        <div>
          <h1 className="text-lg font-bold">{company.companyName || "บริษัท กรีนดี จำกัด"}</h1>
          {company.companyNameEn && <p className="text-xs">{company.companyNameEn}</p>}
          <p>{company.address || "-"}</p>
          <p>โทร. {company.tel || "-"}　เลขประจำตัวผู้เสียภาษี {company.taxId || "-"}</p>
          <h2 className="mt-1 text-lg font-semibold">ใบสั่งซื้อ</h2>
          <p className="text-xs">PURCHASE ORDER</p>
        </div>
        <div />
      </header>

      <section className="mt-3 grid grid-cols-2 gap-2">
        <div className="min-h-24 rounded border border-blue-700 p-2">
          <p><strong>รหัสผู้ขาย</strong>　{document.supplier?.code || "-"}</p>
          <p><strong>ชื่อผู้ขาย</strong>　{document.supplier?.name || "-"}</p>
          <p><strong>ที่อยู่</strong>　{document.address || "-"}</p>
          <p><strong>ผู้ติดต่อ</strong>　{document.contactPerson || "-"}　โทร. {document.supplier?.tel || "-"}</p>
          <p><strong>เลขประจำตัวผู้เสียภาษี</strong>　{document.supplier?.taxId || "-"}</p>
        </div>
        <div className="min-h-24 rounded border border-blue-700 p-2">
          <p><strong>เลขที่เอกสาร</strong>　{document.poNo}</p>
          <p><strong>วันที่เอกสาร</strong>　{formatDate(document.poDate)}</p>
          <p><strong>ประเภทจัดซื้อ</strong>　{document.purchaseType === "overseas" ? "ต่างประเทศ" : "ในประเทศ"}</p>
          <p><strong>ที่อยู่จัดส่ง</strong>　{document.deliveryLocation || "-"}</p>
          <p><strong>กำหนดส่ง</strong>　{formatDate(document.deliveryDate)}</p>
          <p><strong>เครดิต/เงื่อนไขชำระ</strong>　{document.paymentTerm} วัน</p>
        </div>
      </section>

      <section className="mt-3 rounded border border-blue-700">
        {references.length > 0 && (
          <div className="border-b border-blue-700 px-2 py-1">
            <strong>อ้างอิง PR:</strong> {references.map(reference => reference.prNo).join(", ")}
          </div>
        )}
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-gray-100 text-center">
              <th className="w-[13%] border border-blue-700 p-1">รหัสสินค้า</th>
              <th className="w-[32%] border border-blue-700 p-1">รายการ</th>
              <th className="w-[11%] border border-blue-700 p-1">จำนวน</th>
              <th className="w-[9%] border border-blue-700 p-1">หน่วยนับ</th>
              <th className="w-[12%] border border-blue-700 p-1">ราคา/หน่วย</th>
              <th className="w-[10%] border border-blue-700 p-1">ส่วนลด</th>
              <th className="w-[13%] border border-blue-700 p-1">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {document.items.map((item, index) => (
              <tr key={item.id || index} className="align-top">
                <td className="border-x border-blue-700 p-1">{item.partNo || "-"}</td>
                <td className="border-x border-blue-700 p-1 whitespace-pre-wrap">{item.desc}{item.remark ? <small className="block">{item.remark}</small> : null}</td>
                <td className="border-x border-blue-700 p-1 text-right">{Number(item.qty).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                <td className="border-x border-blue-700 p-1 text-center">{item.unit || "-"}</td>
                <td className="border-x border-blue-700 p-1 text-right">{formatMoney(item.unitPrice)}</td>
                <td className="border-x border-blue-700 p-1 text-right">{formatMoney(item.discount)}</td>
                <td className="border-x border-blue-700 p-1 text-right">{formatMoney(item.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 5 - document.items.length) }).map((_, index) => (
              <tr key={`blank-${index}`} aria-hidden="true">
                {Array.from({ length: 7 }).map((__, cell) => <td key={cell} className="h-8 border-x border-blue-700" />)}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-[1fr_43%] border-t border-blue-700">
          <div className="min-h-24 border-r border-blue-700 p-2">
            <strong>หมายเหตุ</strong>
            <p className="mt-1 whitespace-pre-wrap">{document.remarks || "-"}</p>
          </div>
          <dl className="divide-y divide-blue-700">
            <div className="flex justify-between gap-2 p-1"><dt>รวมเงิน</dt><dd>{formatMoney(subtotal)}</dd></div>
            <div className="flex justify-between gap-2 p-1"><dt>ส่วนลดสินค้า (เป็นเงิน)</dt><dd>{formatMoney(discount)}</dd></div>
            <div className="flex justify-between gap-2 p-1"><dt>เงินหลังหักส่วนลด</dt><dd>{formatMoney(taxableAmount)}</dd></div>
            <div className="flex justify-between gap-2 p-1"><dt>ภาษีมูลค่าเพิ่ม ({document.vatConfig === "NO_VAT" ? "ไม่มี VAT" : "7%"})</dt><dd>{formatMoney(document.vat)}</dd></div>
            <div className="flex justify-between gap-2 p-1 font-bold"><dt>จำนวนเงินทั้งสิ้น</dt><dd>{formatMoney(document.netAmount)}</dd></div>
          </dl>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-[1.4fr_0.8fr_1.2fr] rounded border border-blue-700 text-center">
        <div className="p-2 text-left"><strong>เอกสารแนบจาก PR</strong><div className="mt-1"><AttachmentList attachments={prAttachments} /></div></div>
        <div className="border-x border-blue-700 p-2">
          <p className="font-semibold">ผู้จัดทำ</p>
          {signature && <Image unoptimized width={96} height={32} src={fileHref(signature)} alt="ลายเซ็นผู้จัดทำ" className="mx-auto mt-2 h-8 max-w-24 object-contain" />}
          <p className="mt-1">{document.createdBy?.signatureText || document.createdBy?.fullName || "-"}</p>
        </div>
        <div className="p-2">
          <p className="font-semibold">ผู้ตรวจสอบ / ผู้มีอำนาจลงนาม</p>
          <div className="mt-5 border-b border-gray-700" />
          <p className="mt-1">ยังไม่มีข้อมูลการอนุมัติ</p>
        </div>
      </section>
      <section className="mt-3 rounded border border-gray-400 p-2">
        <strong>เอกสารแนบประกอบ PO</strong>
        <div className="mt-1"><AttachmentList attachments={document.attachments || []} /></div>
      </section>
      <p className="mt-2 text-center text-[10px]">เอกสารสถานะ {document.status === "draft" ? "Draft" : document.status}</p>
    </article>
  );
}

export function PurchaseOrderPrintStyles() {
  return (
    <style jsx global>{`
      @page { size: A4; margin: 12mm; }
      @media print {
        .po-document-preview { overflow: visible !important; }
        body * { visibility: hidden !important; }
        #po-print-doc, #po-print-doc * { visibility: visible !important; }
        #po-print-doc {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: none !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
        }
        .po-no-print { display: none !important; }
      }
    `}</style>
  );
}
