import Link from "next/link";
import { AccountingDocumentInformation } from "./accounting-document-information";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import type { GoodsReceipt } from "@/lib/goods-receipt";
import type { StockIssue } from "@/lib/stock-issue";
import type { StockReturn } from "@/lib/stock-return";
import type { StockOpeningBalance } from "@/lib/stock-opening-balance";
import type { Transfer } from "@/lib/inventory-controls";

const qty = (value: number | string | null | undefined) => value == null ? "-" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export function GoodsReceiptInformation({ document: doc }: { document: GoodsReceipt }) {
  return <AccountingDocumentInformation groups={[
    { title: "ข้อมูลผู้ขายและต้นทาง", fields: [
      { label: "ผู้ขาย", value: doc.supplierSnapshot?.name || "-" }, { label: "รหัสผู้ขาย", value: doc.supplierSnapshot?.code || "-" },
      { label: "เลขผู้เสียภาษี", value: doc.supplierSnapshot?.taxId || "-" },
      { label: "PO อ้างอิง", value: <Link className="text-blue-700 underline" href={`/ap/vouchers/${doc.poId}`}>{doc.poNo || doc.poId}</Link> },
    ] },
    { title: "ข้อมูลการตรวจรับ", fields: [
      { label: "วันที่รับ", value: date(doc.receiptDate) }, { label: "คลัง", value: doc.warehouseSnapshot ? `${doc.warehouseSnapshot.code} — ${doc.warehouseSnapshot.name}` : "-" },
      { label: "ผู้ส่ง", value: doc.sender || "-" }, { label: "ผู้รับ", value: doc.receiver || "-" },
      { label: "ยกเลิกวันที่", value: date(doc.cancelledAt) }, { label: "เหตุผลยกเลิก", value: doc.cancellationReason || "-" },
    ] },
  ]} columns={[{ label: "สินค้า / บริการ" }, { label: "สั่ง", align: "right" }, { label: "รับก่อน", align: "right" }, { label: "รอตรวจอื่น", align: "right" }, { label: "รับครั้งนี้", align: "right" }, { label: "เหลือ ณ บันทึก", align: "right" }, { label: "หน่วย" }]}
    rows={doc.items.map(row => ({ key: row.id, cells: [
      <div key="product"><strong>{row.desc || row.productSnapshot?.name || row.productId}</strong><p className="text-xs text-gray-500">{row.productSnapshot?.code || "-"} · {row.productSnapshot?.productType === "service" ? "บริการ ไม่เพิ่ม Stock" : "สินค้า"}</p></div>,
      qty(row.orderedQty), qty(row.previouslyReceivedQty), qty(row.pendingQty), qty(row.currentReceiptQty), qty(row.remainingQty), row.unit,
    ] }))} itemsTitle="รายการตรวจรับ / จำนวน ณ บันทึก" notes={doc.remark} />;
}

export function StockIssueInformation({ document: doc }: { document: StockIssue }) {
  return <AccountingDocumentInformation groups={[
    { title: "ข้อมูลการเบิก", fields: [
      { label: "วันที่เบิก", value: date(doc.issueDate) }, { label: "คลัง", value: doc.warehouseSnapshot ? `${doc.warehouseSnapshot.code} — ${doc.warehouseSnapshot.name}` : "-" },
      { label: "ผู้ขอเบิก", value: doc.requester || "-" }, { label: "ผู้รับ", value: doc.receiver || "-" },
    ] },
    { title: "งานอ้างอิง", fields: [
      { label: "Work Order", value: doc.workOrderSnapshot?.woNo || "-" }, { label: "โครงการ", value: doc.workOrderSnapshot?.project || "-" },
      { label: "วันที่ยกเลิก", value: date(doc.cancelledAt) }, { label: "เหตุผลยกเลิก", value: doc.cancellationReason || "-" },
    ] },
  ]} columns={[{ label: "สินค้า" }, { label: "ขอเบิก", align: "right" }, { label: "จ่ายจริง", align: "right" }, { label: "ยกเลิกจำนวน", align: "right" }, { label: "หน่วย" }]}
    rows={doc.items.map(row => ({ key: row.id, cells: [
      <div key="product"><strong>{row.productSnapshot?.name || row.productId}</strong><p className="text-xs text-gray-500">{row.productSnapshot?.code || "-"}</p></div>,
      qty(row.requestedQty), qty(row.issuedQty), qty(row.cancelledQty), row.productSnapshot?.unit,
    ] }))} itemsTitle={["draft", "pending", "returned"].includes(doc.status) ? "รายการเบิกสินค้า (ยังไม่จ่าย)" : "รายการเบิกสินค้า"} notes={doc.remark} />;
}

export function StockReturnInformation({ document: doc }: { document: StockReturn }) {
  return <AccountingDocumentInformation groups={[
    { title: "ข้อมูลการคืน", fields: [
      { label: "วันที่คืน", value: date(doc.returnDate) }, { label: "คลัง", value: doc.warehouseSnapshot ? `${doc.warehouseSnapshot.code} — ${doc.warehouseSnapshot.name}` : "-" },
      { label: "ผู้ส่งคืน", value: doc.sender || "-" }, { label: "ผู้รับคืน", value: doc.receiver || "-" },
      { label: "เหตุผลการคืน", value: doc.returnReason || "-" }, { label: "สภาพสินค้า", value: doc.condition === "good" ? "ของดี" : doc.condition || "-" },
    ] },
    { title: "เอกสารต้นทาง", fields: [
      { label: "IS อ้างอิง", value: <Link className="text-blue-700 underline" href={`/inventory/issues/${doc.stockIssueId}`}>{doc.issueSnapshot?.issueNo || doc.stockIssueId}</Link> },
      { label: "วันที่เบิก", value: date(doc.issueSnapshot?.issueDate) }, { label: "Work Order", value: doc.workOrderSnapshot?.woNo || "-" },
      { label: "โครงการ", value: doc.workOrderSnapshot?.project || "-" },
      { label: "วันที่ยกเลิก", value: date(doc.cancelledAt) }, { label: "เหตุผลยกเลิก", value: doc.cancellationReason || "-" },
    ] },
  ]} columns={[{ label: "สินค้า" }, { label: "เบิกจริง", align: "right" }, { label: "คืนก่อน", align: "right" }, { label: "รอรับคืนอื่น", align: "right" }, { label: "คืนครั้งนี้", align: "right" }, { label: "คงเหลือ ณ บันทึก", align: "right" }, { label: "หน่วย" }]}
    rows={doc.items.map(row => ({ key: row.id, cells: [
      <div key="product"><strong>{row.productSnapshot?.name || row.productId}</strong><p className="text-xs text-gray-500">{row.productSnapshot?.code || "-"}</p></div>,
      qty(row.issuedQty), qty(row.previouslyReturnedQty), qty(row.pendingQty), qty(row.returnedQty), qty(row.remainingQty), row.productSnapshot?.unit,
    ] }))} itemsTitle={["draft", "pending", "returned"].includes(doc.status) ? "รายการรับคืนสินค้า (ยังไม่เพิ่ม Stock)" : "รายการรับคืนสินค้า"} notes={doc.remark} />;
}

export function StockOpeningInformation({ document: doc }: { document: StockOpeningBalance }) {
  return <AccountingDocumentInformation groups={[
    { title: "ข้อมูลยอดยกมา", fields: [
      { label: "เลขที่เอกสาร", value: doc.openingNo }, { label: "วันเริ่มใช้", value: date(doc.cutoverDate) },
      { label: "คลัง", value: doc.warehouseSnapshot?.name || doc.warehouseId },
    ] },
  ]} columns={[{ label: "สินค้า" }, { label: "หน่วย" }, { label: "ยอดตาม Movement", align: "right" }, { label: "ยอดตรวจนับ", align: "right" }, { label: "ผลต่าง", align: "right" }]}
    rows={doc.items.map(row => ({ key: row.id, cells: [
      `${row.productSnapshot.code} — ${row.productSnapshot.name}`, row.productSnapshot.unit,
      qty(row.bookQtyAtCutover), qty(row.countedQty), `${Number(row.deltaQty) > 0 ? "+" : ""}${qty(row.deltaQty)}`,
    ] }))} itemsTitle="รายการตรวจนับ / ผลต่างยอดยกมา" notes={doc.remark} />;
}

export function StockTransferInformation({ document: doc }: { document: Transfer }) {
  return <AccountingDocumentInformation groups={[
    { title: "ข้อมูลใบโอน", fields: [{ label: "เลขที่ใบโอน", value: doc.transferNo }, { label: "วันที่โอน", value: date(doc.transferDate) }] },
    { title: "คลังต้นทางและปลายทาง", fields: [
      { label: "คลังต้นทาง", value: `${doc.snapshot.source.code} — ${doc.snapshot.source.name}` },
      { label: "คลังปลายทาง", value: `${doc.snapshot.destination.code} — ${doc.snapshot.destination.name}` },
    ] },
  ]} columns={[{ label: "สินค้า" }, { label: "จำนวนโอน", align: "right" }, { label: "หน่วย" }]}
    rows={doc.items.map((row, i) => ({ key: `${row.productId}-${i}`, cells: [
      row.productSnapshot ? `${row.productSnapshot.code} — ${row.productSnapshot.name}` : row.productId,
      qty(row.quantity), row.productSnapshot?.unit,
    ] }))} itemsTitle="รายการโอนสินค้า" notes={doc.remark} />;
}
