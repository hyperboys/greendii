import type { PurchaseOrderDocument } from "@/lib/accounting-purchase-orders";
import { formatAccountingDate } from "@/lib/accounting-date";
import { purchaseOrderLineAmount } from "@/lib/purchase-order";

const money = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cardClass = "min-w-0 rounded-xl border border-[#dfe5de] bg-white p-5";
const labelClass = "text-xs font-medium text-[#657069]";
const valueClass = "mt-1 whitespace-pre-wrap break-words text-sm text-[#17211b]";

export function PurchaseOrderInformation({ document }: { document: PurchaseOrderDocument }) {
  const supplier = document.supplierSnapshot ?? document.supplier;
  const references = document.purchaseRequestReferences?.map(reference => reference.purchaseRequest)
    ?? (document.pr ? [document.pr] : []);

  return (
    <div className="po-no-print grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <section aria-labelledby="po-supplier-title" className={cardClass}>
            <h2 id="po-supplier-title" className="mb-4 text-base font-bold">ผู้ขาย / ผู้รับเหมา</h2>
            <p className="text-xs font-semibold text-blue-700">{supplier?.code || "-"}</p>
            <p className="mt-1 break-words text-base font-semibold">{supplier?.name || "-"}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#566159]">{document.address || "ไม่ได้ระบุที่อยู่"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#edf0ed] pt-4">
              <div><dt className={labelClass}>สาขา</dt><dd className={valueClass}>{document.supplierBranch || "-"}</dd></div>
              <div><dt className={labelClass}>ผู้ติดต่อ</dt><dd className={valueClass}>{document.contactPerson || "-"}</dd></div>
              <div><dt className={labelClass}>โทรศัพท์</dt><dd className={valueClass}>{supplier?.tel || "-"}</dd></div>
              <div><dt className={labelClass}>เลขประจำตัวผู้เสียภาษี</dt><dd className={valueClass}>{supplier?.taxId || "-"}</dd></div>
            </dl>
          </section>
          <section aria-labelledby="po-delivery-title" className={cardClass}>
            <h2 id="po-delivery-title" className="mb-4 text-base font-bold">ข้อมูลการสั่งซื้อและจัดส่ง</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div><dt className={labelClass}>วันที่เอกสาร</dt><dd className={valueClass}>{formatAccountingDate(document.poDate)}</dd></div>
              <div><dt className={labelClass}>ประเภทจัดซื้อ</dt><dd className={valueClass}>{document.purchaseType === "overseas" ? "ต่างประเทศ" : "ในประเทศ"}</dd></div>
              <div><dt className={labelClass}>เครดิต / เงื่อนไขชำระ</dt><dd className={valueClass}>{document.paymentTerm} วัน</dd></div>
              <div><dt className={labelClass}>กำหนดส่งสินค้า</dt><dd className={valueClass}>{document.deliveryDate ? formatAccountingDate(document.deliveryDate) : "-"}</dd></div>
              <div className="col-span-2"><dt className={labelClass}>สถานที่จัดส่ง</dt><dd className={valueClass}>{document.deliveryLocation || "-"}</dd></div>
              <div className="col-span-2">
                <dt className={labelClass}>PR อ้างอิง</dt>
                <dd className="mt-2 flex flex-wrap gap-2 text-sm">
                  {references.length ? references.map(reference => (
                    <span key={reference.id} className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-800">{reference.prNo}</span>
                  )) : <span className="text-[#657069]">ไม่อ้างอิง PR</span>}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section aria-labelledby="po-items-title" className="min-w-0 overflow-hidden rounded-xl border border-[#dfe5de] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[#dfe5de] px-5 py-4">
            <h2 id="po-items-title" className="text-base font-bold">รายการสั่งซื้อ</h2>
            <span className="shrink-0 rounded-full bg-[#f0f3ef] px-3 py-1 text-xs font-medium">{document.items.length} รายการ</span>
          </div>
          <p className="px-5 pt-3 text-xs text-[#657069] sm:hidden">เลื่อนตารางซ้าย–ขวาเพื่อดูราคาและจำนวนเงิน</p>
          <div role="region" aria-label="รายการสินค้า PO" tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f8faf7] text-xs text-[#566159]">
                <tr>
                  <th scope="col" className="px-4 py-3">#</th>
                  <th scope="col" className="px-4 py-3">สินค้า / รายละเอียด</th>
                  <th scope="col" className="px-4 py-3 text-right">จำนวน</th>
                  <th scope="col" className="px-4 py-3">หน่วย</th>
                  <th scope="col" className="px-4 py-3 text-right">ราคา/หน่วย</th>
                  <th scope="col" className="px-4 py-3 text-right">ส่วนลด</th>
                  <th scope="col" className="px-4 py-3 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ed]">
                {document.items.map((item, index) => (
                  <tr key={item.id || index} className="align-top">
                    <td className="px-4 py-4 text-[#657069]">{index + 1}</td>
                    <td className="min-w-[220px] px-4 py-4">
                      <p className="whitespace-pre-wrap break-words font-medium">{item.desc || "-"}</p>
                      <p className="mt-1 text-xs text-[#657069]">{item.partNo || "-"}</p>
                      {item.remark && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#657069]">{item.remark}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{Number(item.qty).toLocaleString("th-TH", { maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-4">{item.unit || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{money(item.unitPrice)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{money(item.discount)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{money(item.amount ?? purchaseOrderLineAmount(item))}</td>
                  </tr>
                ))}
                {!document.items.length && <tr><td colSpan={7} className="p-6 text-center text-[#657069]">ไม่มีรายการสินค้า</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        {document.remarks && <section aria-labelledby="po-remarks-title" className={cardClass}>
          <h2 id="po-remarks-title" className="mb-2 text-base font-bold">หมายเหตุ</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#566159]">{document.remarks}</p>
        </section>}
      </div>

      <aside aria-labelledby="po-total-title" className={`${cardClass} xl:sticky xl:top-5`}>
        <h2 id="po-total-title" className="mb-4 text-base font-bold">สรุปยอดสั่งซื้อ</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-[#657069]">รวมเงิน</dt><dd className="tabular-nums">{money(document.subTotal)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#657069]">ส่วนลด</dt><dd className="tabular-nums">{money(document.discount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#657069]">เงินหลังหักส่วนลด</dt><dd className="tabular-nums">{money(Number(document.subTotal) - Number(document.discount))}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#657069]">{document.vatConfig === "NO_VAT" ? "ไม่มี VAT" : "VAT 7%"}</dt><dd className="tabular-nums">{money(document.vat)}</dd></div>
          <div className="border-t border-[#dfe5de] pt-4">
            <dt className="font-semibold">ยอดสุทธิ (บาท)</dt>
            <dd className="mt-1 break-words text-3xl font-bold tabular-nums text-blue-700">{money(document.netAmount)}</dd>
          </div>
        </dl>
        <p className="mt-5 border-t border-[#edf0ed] pt-3 text-xs leading-5 text-[#657069]">ผู้จัดทำ: {document.createdBy?.fullName || "-"}</p>
      </aside>
    </div>
  );
}
