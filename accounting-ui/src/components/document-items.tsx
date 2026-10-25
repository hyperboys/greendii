"use client";

import { useState } from "react";
import { deliveryOrderAmounts, newDeliveryOrderLine, type DeliveryOrderLine, type DeliveryOrderProduct } from "@/lib/delivery-order";

const control = "w-full min-w-0 rounded-md border border-[#dfe5de] bg-white px-2 py-2";
const button = "rounded-md border border-[#dfe5de] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DocumentItems({ items, products, onChange, readOnly = false, title = "รายการส่งสินค้า" }: {
  items: DeliveryOrderLine[]; products: DeliveryOrderProduct[]; onChange: (items: DeliveryOrderLine[]) => void; readOnly?: boolean; title?: string;
}) {
  const [search, setSearch] = useState("");
  const totals = deliveryOrderAmounts(items, 0, "NO_VAT");
  function patch(index: number, change: Partial<DeliveryOrderLine>) {
    onChange(items.map((item, i) => i === index ? { ...item, ...change } : item));
  }
  const add = () => onChange([...items, newDeliveryOrderLine()]);
  return <section className="min-w-0 space-y-4 rounded-lg border bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="so-items-heading" className="text-lg font-bold">{title} <span className="text-sm font-normal text-gray-500">({items.length} รายการ)</span></h2>
      {!readOnly && <button className={button} type="button" onClick={add}>เพิ่มรายการ</button>}
    </div>
    {!readOnly && <label className="block max-w-md text-sm">ค้นหาสินค้าในตัวเลือก<input className={control} placeholder="รหัส / ชื่อสินค้า" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    <p id="so-items-help" className="text-sm text-gray-500">{readOnly ? "คัดลอกรายการทั้งหมดจาก SO ไม่สามารถเปลี่ยนรายการ ราคา หรือส่วนลดได้" : "เลือกสินค้าหรือกรอกรายการเองได้ ราคาไม่รวม VAT · รายละเอียดและหมายเหตุอยู่ด้านล่างของแต่ละรายการ"}</p>
    <fieldset disabled={readOnly} className="min-w-0">
      <div role="region" aria-labelledby="so-items-heading" aria-describedby="so-items-help" className="relative max-w-full rounded-md border">
        <table aria-label={`${title} แก้ไขข้อมูลแต่ละรายการในตาราง`} className="so-items-table block w-full table-fixed text-sm md:table">
          <colgroup className="hidden md:table-column-group"><col className="w-[5%]" /><col className="w-[24%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[19%]" /><col className="w-[8%]" /></colgroup>
          <thead className="hidden bg-gray-50 text-left md:table-header-group"><tr>{["ลำดับ", "สินค้า / รหัสสินค้า", "จำนวน", "หน่วย", "ราคา/หน่วย", "ส่วนลดรายการ (บาท)", "จำนวนเงิน (บาท)", "จัดการ"].map((title, index) => <th key={title} scope="col" className={`break-words border-b px-1.5 py-3 ${[2, 4, 5, 6].includes(index) ? "text-right" : ""}`}>{title}</th>)}</tr></thead>
          {items.map((item, index) => <tbody key={index} data-so-item={index + 1} className="block border-b last:border-b-0 focus-within:bg-blue-50/40 md:table-row-group">
            <tr className="grid grid-cols-2 items-start align-top md:table-row">
              <th scope="row" className="col-span-2 block px-1.5 py-3 text-left font-medium md:table-cell md:text-center"><span className="md:sr-only">รายการ </span>{index + 1}</th>
              <td className="col-span-2 block min-w-0 space-y-2 p-1.5 md:table-cell">
                <label className="block"><span className="sr-only">สินค้า รายการ {index + 1}</span><select className={control} value={item.productId || ""} onChange={event => {
                  const product = products.find(product => product.id === event.target.value);
                  patch(index, product ? { productId: product.id, partNo: product.code, desc: product.name, unit: product.unit || "", unitPrice: product.price ?? 0 } : { productId: null });
                }}>
                  <option value="">กรอกรายการเอง</option>
                  {item.productId && !products.some(product => product.id === item.productId) && <option value={item.productId}>{item.partNo || item.product?.code || "สินค้าเดิม"}{!readOnly && " (ปิดใช้งาน กรุณาเลือกใหม่)"}</option>}
                  {products.filter(product => product.id === item.productId || `${product.code} ${product.name}`.toLowerCase().includes(search.toLowerCase())).map(product => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}
                </select></label>
                <label className="block"><span className="sr-only">รหัสสินค้าบนเอกสาร รายการ {index + 1}</span><input className={control} placeholder="รหัสสินค้าบนเอกสาร" value={item.partNo} onChange={event => patch(index, { partNo: event.target.value })} /></label>
              </td>
              <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">จำนวน รายการ {index + 1}</span><input required className={`${control} text-right`} type="number" min="1" max="999999999" step="1" value={item.qty} onChange={event => patch(index, { qty: event.target.value })} /></label></td>
              <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">หน่วย รายการ {index + 1}</span><input required className={control} value={item.unit} onChange={event => patch(index, { unit: event.target.value })} /></label></td>
              <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">ราคา/หน่วย รายการ {index + 1}</span><input required type="number" min="0" max="9999999999.99" step="0.01" className={`${control} text-right`} value={item.unitPrice} onChange={event => patch(index, { unitPrice: event.target.value })} /></label></td>
              <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">ส่วนลดรายการ (บาท) รายการ {index + 1}</span><input required type="number" min="0" max={Math.round(Number(item.qty) * Number(item.unitPrice) * 100) / 100} step="0.01" className={`${control} text-right`} value={item.discount} onChange={event => patch(index, { discount: event.target.value })} /></label></td>
              <td className="block min-w-0 break-words px-1.5 py-3 text-right font-semibold tabular-nums md:table-cell"><span className="block text-xs font-normal md:sr-only">จำนวนเงิน (บาท)</span><output aria-label={`จำนวนเงินรายการ ${index + 1}`}>{money(totals.lineAmounts[index])}</output></td>
              <td className="block p-1.5 text-right md:table-cell">{!readOnly && <button className="rounded-md border border-red-200 px-2 py-2 text-red-700 hover:bg-red-50 disabled:opacity-40" type="button" aria-label={`ลบรายการ ${index + 1}`} disabled={items.length === 1} onClick={() => onChange(items.filter((_, i) => i !== index))}>ลบ</button>}</td>
            </tr>
            <tr className="block md:table-row"><td colSpan={8} className="block px-1.5 pb-4 pt-2 md:table-cell"><div className="grid min-w-0 gap-3 md:grid-cols-[2fr_1fr]">
              <label className="block text-xs text-gray-600"><span>รายละเอียด รายการ {index + 1}</span><textarea required rows={2} className={`${control} mt-1 text-sm text-[#17211b]`} placeholder="รายละเอียดสินค้า / งาน" value={item.desc} onChange={event => patch(index, { desc: event.target.value })} /></label>
              <label className="block text-xs text-gray-600"><span>หมายเหตุรายการ {index + 1}</span><input className={`${control} mt-1 text-sm text-[#17211b]`} placeholder="หมายเหตุรายการ (ถ้ามี)" value={item.remark} onChange={event => patch(index, { remark: event.target.value })} /></label>
            </div></td></tr>
          </tbody>)}
        </table>
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {!readOnly && <button className={button} type="button" onClick={add}>เพิ่มรายการ</button>}
      <p className="text-sm font-semibold">รวมเงินรายการ (ก่อนส่วนลดท้ายเอกสาร): <output aria-label="รวมเงินรายการ" className="tabular-nums">{money(totals.subTotal)}</output> บาท</p>
    </div>
  </section>;
}
