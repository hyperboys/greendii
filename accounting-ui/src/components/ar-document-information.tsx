import Link from "next/link";
import { AccountingDocumentInformation, type InformationGroup, type InformationField } from "./accounting-document-information";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import type { Invoice } from "@/lib/invoice";
import type { DeliveryOrder } from "@/lib/delivery-order";
import type { BillingNote } from "@/lib/billing-note";
import type { ReceiptVoucher } from "@/lib/receipt-voucher";
import type { CreditNote } from "@/lib/credit-note";

const money = (value: number | string | null | undefined) => value == null ? "-" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value: number | string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
function customerGroup(doc: {
  customerName?: string | null; customerCode?: string | null; customer?: { name: string; code?: string | null } | null;
  customerBranch?: string | null; address?: string | null; taxId?: string | null;
}): InformationGroup {
  return { title: "ข้อมูลลูกค้า", fields: [
    { label: "ลูกค้า", value: doc.customerName || doc.customer?.name || "-" },
    { label: "รหัสลูกค้า", value: doc.customerCode || doc.customer?.code || "-" },
    { label: "สาขา", value: doc.customerBranch || "-" },
    { label: "เลขผู้เสียภาษี", value: doc.taxId || "-" },
    { label: "ที่อยู่", value: doc.address || "-" },
  ] };
}
const itemColumns = [
  { label: "สินค้า / รายละเอียด" }, { label: "จำนวน", align: "right" as const }, { label: "หน่วย" },
  { label: "ราคา/หน่วย", align: "right" as const }, { label: "ส่วนลด", align: "right" as const },
  { label: "จำนวนเงิน", align: "right" as const },
];
function amountSummary(doc: { subTotal: number | string; discount: number | string; vat: number | string; netAmount: number | string }): InformationField[] {
  return [{ label: "รวมเงิน", value: money(doc.subTotal) }, { label: "ส่วนลดท้ายเอกสาร", value: money(doc.discount) },
    { label: "VAT", value: money(doc.vat) }, { label: "ยอดสุทธิ (บาท)", value: money(doc.netAmount) }];
}

export function DeliveryOrderInformation({ document: doc }: { document: DeliveryOrder }) {
  return <AccountingDocumentInformation groups={[
    customerGroup({ ...doc, address: doc.shippingAddress }),
    { title: "ข้อมูลการจัดส่ง", fields: [
      { label: "วันที่เอกสาร", value: date(doc.docDate) }, { label: "กำหนดส่ง", value: date(doc.deliveryDate) },
      { label: "ผู้รับสินค้า", value: doc.receiver || "-" }, { label: "โทรศัพท์", value: doc.customerTel || "-" },
      { label: "แฟกซ์", value: doc.customerFax || "-" }, { label: "เครดิต", value: `${doc.creditTerm} วัน` },
      { label: "Work Order", value: doc.workOrder?.woNo || "-" }, { label: "โครงการ", value: doc.workOrder?.project || "-" },
      { label: "VAT", value: doc.vatConfig === "NO_VAT" ? "ไม่มี VAT" : "VAT 7%" },
    ] },
  ]} columns={itemColumns} rows={doc.items.map((row, i) => ({ key: row.id || String(i), cells: [
    <div key="description"><strong>{row.desc}</strong><p className="text-xs text-gray-500">{row.partNo || row.product?.code || "-"}</p>{row.remark && <p className="mt-1 text-xs">{row.remark}</p>}</div>,
    quantity(row.qty), row.unit, money(row.unitPrice), money(row.discount), money(row.amount),
  ] }))} itemsTitle="รายการจัดส่ง" summary={amountSummary(doc)} notes={doc.remark} />;
}

export function InvoiceInformation({ document: doc }: { document: Invoice }) {
  return <AccountingDocumentInformation groups={[customerGroup(doc), { title: "ข้อมูลใบแจ้งหนี้", fields: [
    { label: "วันที่เอกสาร", value: date(doc.ivDate) }, { label: "ครบกำหนด", value: date(doc.dueDate) },
    { label: "เครดิต", value: `${doc.creditTerm} วัน` }, { label: "เลข PO ลูกค้า", value: doc.customerPoNo || "-" },
    { label: "SO อ้างอิง", value: doc.provisionalDeliveryOrder ? <Link className="text-blue-700 underline" href={`/ar/delivery-orders/${doc.provisionalDeliveryOrder.id}`}>{doc.provisionalDeliveryOrder.soNo}</Link> : "-" },
    { label: "Work Order", value: doc.workOrder?.woNo || "-" }, { label: "ที่อยู่จัดส่ง", value: doc.shippingAddress || "-" },
    { label: "ผู้รับผิดชอบการขาย", value: doc.responsibleSaleName || "-" },
    { label: "VAT", value: doc.vatConfig === "NO_VAT" ? "ไม่มี VAT" : "VAT 7%" },
  ] }]} columns={itemColumns} rows={doc.items.map((row, i) => ({ key: row.id || String(i), cells: [
    <div key="description"><strong>{row.desc}</strong><p className="text-xs text-gray-500">{row.partNo || "-"}</p>{row.remark && <p className="mt-1 text-xs">{row.remark}</p>}</div>,
    quantity(row.qty), row.unit, money(row.unitPrice), money(row.lineDiscount), money(row.amount),
  ] }))} itemsTitle="รายการ Invoice" summary={[...amountSummary(doc), { label: "ยอดค้างรับ (บาท)", value: money(doc.outstandingAmount) }]} notes={doc.remark} />;
}

export function BillingInformation({ document: doc }: { document: BillingNote }) {
  return <AccountingDocumentInformation groups={[customerGroup(doc), { title: "ข้อมูลการวางบิล", fields: [
    { label: "วันที่วางบิล", value: date(doc.billingDate) }, { label: "นัดชำระ", value: date(doc.expectedPaymentDate) },
    { label: "ผู้ติดต่อ", value: doc.contactPerson || "-" }, { label: "เงื่อนไขการชำระ", value: doc.paymentTerms || "-" },
  ] }]} columns={[{ label: "Invoice" }, { label: "วันที่" }, { label: "ครบกำหนด" }, { label: "ยอดใบกำกับ", align: "right" }, { label: "คงค้าง ณ บันทึก", align: "right" }, { label: "ยอดวางบิล", align: "right" }]}
    rows={doc.invoices.map((row, i) => ({ key: `${row.invoiceId}-${i}`, cells: [
      <Link key="invoice" className="text-blue-700 underline" href={`/ar/invoices/${row.invoiceId}`}>{row.invoiceNo || row.invoice?.ivNo || "-"}</Link>,
      date(row.invoiceDate), date(row.invoiceDueDate), money(row.invoiceNetAmount), money(row.outstandingAmount), money(row.billingAmount),
    ] }))} itemsTitle="Invoice ที่วางบิล" summary={[{ label: "ยอดวางบิล (บาท)", value: money(doc.totalAmount) }]} notes={doc.remark} />;
}

export function ReceiptInformation({ document: doc }: { document: ReceiptVoucher }) {
  return <AccountingDocumentInformation groups={[customerGroup(doc), { title: "ข้อมูลการรับชำระ", fields: [
    { label: "วันที่รับชำระ", value: date(doc.receiptDate) },
    { label: "วิธีรับชำระ", value: doc.paymentMethod === "cash" ? "เงินสด" : doc.paymentMethod === "cheque" ? "เช็ค" : "โอนเงิน" },
    { label: "ธนาคาร", value: doc.bankName || "-" }, { label: "เลขอ้างอิง", value: doc.refNo || "-" },
    { label: "เลขเช็ค", value: doc.chequeNo || "-" }, { label: "วันที่เช็ค", value: date(doc.chequeDate) },
    { label: "เลขหนังสือรับรองหัก ณ ที่จ่าย", value: doc.whtCertificateNo || "-" },
  ] }]} columns={[{ label: "Invoice" }, { label: "BI อ้างอิง" }, { label: "คงค้างก่อนรับ", align: "right" }, { label: "เงินรับ", align: "right" }, { label: "WHT", align: "right" }, { label: "ค่าธรรมเนียม", align: "right" }]}
    rows={doc.allocations.map((row, i) => ({ key: `${row.invoiceId}-${i}`, cells: [
      <Link key="invoice" className="text-blue-700 underline" href={`/ar/invoices/${row.invoiceId}`}>{row.invoiceNo || row.invoice?.ivNo || "-"}</Link>,
      row.billingNoteId ? <Link key="billing" className="text-blue-700 underline" href={`/ar/billing-notes/${row.billingNoteId}`}>{row.billingNote?.biNo || row.biNo || "-"}</Link> : "-",
      money(row.outstandingBefore), money(row.receivedAmount), money(row.whtAmount), money(row.bankFee),
    ] }))} itemsTitle="รายการรับชำระ" summary={[
      { label: "WHT", value: money(doc.whtAmount) }, { label: "ค่าธรรมเนียม", value: money(doc.bankFee) },
      { label: "เงินเข้าสุทธิ (บาท)", value: money(doc.totalReceived) },
    ]} notes={doc.remark} />;
}

export function CreditInformation({ document: doc }: { document: CreditNote }) {
  return <AccountingDocumentInformation groups={[customerGroup(doc), { title: "ข้อมูลการลดหนี้", fields: [
    { label: "วันที่เอกสาร", value: date(doc.cnDate) },
    { label: "Invoice อ้างอิง", value: <Link className="text-blue-700 underline" href={`/ar/invoices/${doc.invoiceId}`}>{doc.invoiceNo || doc.invoice?.ivNo || "-"}</Link> },
    { label: "วันที่ Invoice", value: date(doc.invoiceDate) }, { label: "ผู้ติดต่อ", value: doc.contactPerson || "-" },
    { label: "เหตุผล", value: doc.reason }, { label: "มูลค่าเดิมก่อน VAT", value: money(doc.originalBeforeVat) },
    { label: "มูลค่าที่ถูกต้องก่อน VAT", value: money(doc.correctedBeforeVat) },
  ] }]} columns={[{ label: "รายการ" }, { label: "จำนวน", align: "right" }, { label: "หน่วย" }, { label: "ราคา/หน่วย", align: "right" }, { label: "ก่อน VAT", align: "right" }, { label: "VAT", align: "right" }, { label: "สุทธิ", align: "right" }]}
    rows={doc.items.map((row, i) => ({ key: String(i), cells: [
      <div key="description"><strong>{row.desc}</strong><p className="text-xs text-gray-500">{row.partNo || "-"}</p></div>,
      quantity(row.qty), row.unit, money(row.unitPrice), money(row.amountBeforeVat), money(row.vat), money(row.netAmount),
    ] }))} itemsTitle="รายการลดหนี้" summary={[
      { label: "ก่อน VAT", value: money(doc.amountBeforeVat) }, { label: "VAT", value: money(doc.vat) }, { label: "ยอดลดหนี้สุทธิ (บาท)", value: money(doc.netAmount) },
    ]} notes={doc.remark} />;
}
