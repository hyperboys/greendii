import Image from "next/image";
import { formatAccountingDate as formatDate } from "@/lib/accounting-date";
import { poStatusLabels } from "@/lib/accounting-purchase-orders";
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
  const supplier = document.supplierSnapshot ?? document.supplier;
  const approval = document.history?.find(row => row.action === "approve");

  return (
    <article id="po-print-doc" className="mx-auto min-w-[720px] max-w-[210mm] bg-white p-5 text-[11px] leading-5 text-black sm:p-6">
      <header className="grid grid-cols-[82px_1fr_172px] items-center gap-2 text-center">
        <div className="flex h-16 items-center justify-center border border-gray-300 p-1">
          {company.logoUrl ? <Image unoptimized width={160} height={56} src={fileHref(company.logoUrl)} alt="โลโก้บริษัท" className="max-h-14 max-w-full object-contain" /> : <strong className="text-green-700">GREEN Dii</strong>}
        </div>
        <div>
          <h1 className="text-base font-bold">{company.companyName || "บริษัท กรีนดี จำกัด"}</h1>
          {company.companyNameEn && <p className="text-[10px]">{company.companyNameEn}</p>}
          <p>{company.address || "-"}</p>
          <p>โทร. {company.tel || "-"}　เลขประจำตัวผู้เสียภาษี {company.taxId || "-"}</p>
          <h2 className="mt-1 text-lg font-semibold">ใบสั่งซื้อ</h2>
          <p className="text-[10px]">PURCHASE ORDER</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] border border-blue-700 text-left leading-5">
          <dt className="border-b border-r border-blue-700 p-1 font-semibold">เลขที่เอกสาร</dt>
          <dd className="border-b border-blue-700 p-1">{document.poNo}</dd>
          <dt className="border-r border-blue-700 p-1 font-semibold">วันที่เอกสาร</dt>
          <dd className="p-1">{formatDate(document.poDate)}</dd>
        </dl>
      </header>

      <section className="po-print-keep mt-2 grid grid-cols-2 gap-1">
        <div>
          <p className="mb-1"><strong>รหัสผู้ขาย</strong>　{supplier?.code || "-"}</p>
          <div className="min-h-24 border border-blue-700 p-2">
            <p><strong>ชื่อผู้ขาย</strong>　{supplier?.name || "-"}</p>
            <p><strong>ที่อยู่</strong>　{document.address || "-"}</p>
            {document.supplierBranch && <p><strong>สาขา</strong>　{document.supplierBranch}</p>}
            <p><strong>โทร.</strong>　{supplier?.tel || "-"}　<strong>เลขประจำตัวผู้เสียภาษี</strong>　{supplier?.taxId || "-"}</p>
          </div>
        </div>
        <div className="min-h-24 border border-blue-700 p-2">
          <p><strong>ผู้ติดต่อ</strong>　{document.contactPerson || "-"}</p>
          <p><strong>จำนวนวันเครดิต</strong>　{document.paymentTerm} วัน</p>
          <p><strong>ประเภทจัดซื้อ</strong>　{document.purchaseType === "overseas" ? "ต่างประเทศ" : "ในประเทศ"}</p>
          {document.deliveryLocation && <p><strong>ที่อยู่จัดส่ง</strong>　{document.deliveryLocation}</p>}
          {document.deliveryDate && <p><strong>กำหนดส่ง</strong>　{formatDate(document.deliveryDate)}</p>}
          <p><strong>สถานะ</strong>　{poStatusLabels[document.status] || document.status}</p>
        </div>
      </section>

      <section className="mt-2 border border-blue-700">
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
            {Array.from({ length: Math.max(0, 12 - document.items.length) }).map((_, index) => (
              <tr key={`blank-${index}`} aria-hidden="true">
                {Array.from({ length: 7 }).map((__, cell) => <td key={cell} className="h-9 border-x border-blue-700" />)}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-[1fr_43%] border-t border-blue-700">
          <div className="min-h-16 border-r border-blue-700 p-2">
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

      <section className="po-print-keep mt-2 grid grid-cols-[1.2fr_1fr] border border-blue-700">
        <div className="border-r border-blue-700 p-2">
          <strong>เงื่อนไขอื่น ๆ</strong>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] leading-4">
            <li>โปรดระบุเลขที่ใบสั่งซื้อข้างต้นในใบส่งของทุกฉบับ</li>
            <li>การวางบิลและการรับเช็คเป็นไปตามกำหนดเวลาที่บริษัทกำหนดไว้</li>
            <li>ในการวางบิลเพื่อเรียกเก็บ ให้แนบสำเนาใบสั่งซื้อกำกับมาด้วย</li>
          </ol>
        </div>
        <div className="grid grid-cols-2 text-center">
          <div data-po-signature-role="creator" className="min-h-16 border-b border-r border-blue-700 p-1">
            <strong>ผู้จัดทำ</strong>
            {signature && <Image unoptimized width={96} height={32} src={fileHref(signature)} alt="ลายเซ็นผู้จัดทำ" className="mx-auto h-8 max-w-24 object-contain" />}
            <p>{document.createdBy?.signatureText || document.createdBy?.fullName || "-"}</p>
          </div>
          <div className="min-h-16 border-b border-blue-700 p-1">
            <strong>ในนาม</strong>
            <p className="mt-1">{company.companyName || "บริษัท กรีนดี จำกัด"}</p>
          </div>
          <div data-po-signature-role="reviewer" className="min-h-16 border-r border-blue-700 p-1">
            <strong>ผู้ตรวจสอบ</strong>
            <p className="mt-1">{approval
              ? `${document.status === "cancelled" ? "เคยอนุมัติ" : "อนุมัติ"}โดย ${approval.performedBy?.fullName || "-"} · ${formatDate(approval.createdAt)}`
              : document.status === "approved" ? "อนุมัติเดิม (ไม่มีประวัติผู้อนุมัติ)" : "ยังไม่มีข้อมูลการอนุมัติ"}</p>
            <p className="mt-1">ลงชื่อ __________________</p>
            <p>วันที่ ____/____/________</p>
          </div>
          <div data-po-signature-role="signatory" className="min-h-16 p-1">
            <strong>ผู้มีอำนาจลงนาม</strong>
            <p className="mt-1">ลงชื่อ __________________</p>
            <p>วันที่ ____/____/________</p>
          </div>
        </div>
      </section>

      {(prAttachments.length > 0 || (document.attachments || []).length > 0) && (
        <section className="mt-2 grid grid-cols-2 border border-blue-700 text-[10px]">
          {prAttachments.length > 0 && <div className="border-r border-blue-700 p-1"><strong>เอกสารแนบจาก PR</strong><div><AttachmentList attachments={prAttachments} /></div></div>}
          {(document.attachments || []).length > 0 && <div className="p-1"><strong>เอกสารแนบประกอบ PO</strong><div><AttachmentList attachments={document.attachments || []} /></div></div>}
        </section>
      )}
      <p className="mt-1 text-center text-[10px]">เอกสารสถานะ {poStatusLabels[document.status] || document.status} · ช่องลงนามเว้นว่าง ไม่ใช่ลายเซ็นดิจิทัล</p>
    </article>
  );
}

export function PurchaseOrderPrintStyles() {
  return (
    <style jsx global>{`
      @page { size: A4; margin: 12mm; }
      @media print {
        .po-document-preview { overflow: visible !important; }
        #po-print-doc { break-inside: auto; }
        #po-print-doc header, #po-print-doc .po-print-keep, #po-print-doc tbody tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }
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
