import Link from "next/link";
import { AccountingDocumentInformation, type InformationGroup } from "./accounting-document-information";
import { formatAccountingDate as date } from "@/lib/accounting-date";
import type { ContractorPayment } from "@/lib/contractor-payment";
import { methodLabels, type PaymentVoucher } from "@/lib/payment-voucher";
import type { ChequePayment } from "@/lib/cheque-payment";
import { supplierBillVatLabels, type SupplierBill } from "@/lib/supplier-bill";

const money = (value: number | string | null | undefined) => value == null ? "-" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function supplierGroup(supplier?: { code?: string | null; name?: string | null; address?: string | null; taxId?: string | null; branch?: string | null; contactPerson?: string | null } | null): InformationGroup {
  return { title: "ข้อมูลผู้ขาย / ผู้รับเหมา", fields: [
    { label: "ชื่อผู้ขาย", value: supplier?.name || "-" }, { label: "รหัสผู้ขาย", value: supplier?.code || "-" },
    { label: "เลขผู้เสียภาษี", value: supplier?.taxId || "-" }, { label: "สาขา", value: supplier?.branch || "-" },
    { label: "ที่อยู่", value: supplier?.address || "-" }, { label: "ผู้ติดต่อ", value: supplier?.contactPerson || "-" },
  ] };
}
const columns = [{ label: "รายละเอียด" }, { label: "จำนวนเงิน", align: "right" as const }];

export function ContractorPaymentInformation({ document: doc }: { document: ContractorPayment }) {
  return <AccountingDocumentInformation groups={[supplierGroup(doc.supplierSnapshot), { title: "ข้อมูลการเบิกจ่าย", fields: [
    { label: "วันที่", value: date(doc.docDate) },
    { label: "PO อ้างอิง", value: <Link className="text-blue-700 underline" href={`/ap/vouchers/${doc.poId}`}>{doc.poNo || doc.poId}</Link> },
    { label: "งวดที่", value: doc.paymentRound }, { label: "มูลค่า PO", value: money(doc.poAmount) },
    { label: "เบิกก่อนหน้า", value: money(doc.previouslyRequestedAmount) }, { label: "คงเหลือ ณ บันทึก", value: money(doc.remainingAmount) },
    { label: "ประกันสะสมก่อนหน้า", value: money(doc.previouslyRetainedAmount) },
    { label: "อัตรา WHT", value: `${doc.whtRate}%` }, { label: "อัตราประกัน", value: `${doc.retentionRate}%` },
  ] }]} columns={[...columns, { label: "หมายเหตุรายการ" }]} rows={doc.items.map((row, i) => ({ key: String(i), cells: [row.desc, money(row.amount), row.remark || "-"] }))}
    itemsTitle="รายการเบิกจ่าย" summary={[
      { label: "ยอดเบิกก่อน VAT", value: money(doc.currentRequestAmount) }, { label: "VAT", value: money(doc.vat) },
      { label: "WHT", value: money(doc.wht) }, { label: "ประกัน", value: money(doc.retention) }, { label: "ยอดสุทธิ (บาท)", value: money(doc.netAmount) },
    ]} notes={doc.remark} />;
}

export function PaymentVoucherInformation({ document: doc }: { document: PaymentVoucher }) {
  return <AccountingDocumentInformation groups={[supplierGroup(doc.supplierSnapshot), { title: "ข้อมูลการจ่าย", fields: [
    { label: "วันที่เอกสาร", value: date(doc.pvDate) },
    { label: "PS อ้างอิง", value: doc.lifecycleVersion === 1 ? <Link className="text-blue-700 underline" href={`/ap/vouchers/ps/${doc.sourceDocId}`}>{doc.sourceNo || doc.sourceDocId}</Link> : doc.sourceNo || "-" },
    { label: "วันที่ต้นทาง", value: date(doc.sourceDate) }, { label: "PO อ้างอิง", value: doc.poNo || "-" },
    { label: "วิธีจ่าย", value: methodLabels[doc.paymentMethod] || doc.paymentMethod },
    { label: "ประเภทผู้ถูกหัก WHT", value: doc.taxpayerType === "company" ? "นิติบุคคล" : doc.taxpayerType === "individual" ? "บุคคลธรรมดา" : "-" },
    { label: "รายละเอียดภาษี", value: doc.taxDescription || "-" },
    ...(doc.paidAt ? [
      { label: "วันที่จ่าย", value: date(doc.paidAt) }, { label: "ผู้รับเงิน", value: doc.recipient || "-" },
      { label: "ธนาคารผู้จ่าย", value: doc.payerBank || "-" }, { label: "ธนาคารผู้รับ", value: doc.payeeBank || "-" },
      { label: "อ้างอิงการจ่าย", value: doc.paymentReference || "-" },
    ] : []),
    ...(doc.reversedAt ? [
      { label: "วันที่กลับรายการ", value: date(doc.reversedAt) }, { label: "อ้างอิงกลับรายการ", value: doc.reversalReference || "-" },
    ] : []),
  ] }]} columns={columns} rows={doc.items.map((row, i) => ({ key: String(i), cells: [row.desc, money(row.amount)] }))}
    itemsTitle="รายการจ่ายจาก PS" summary={[
      { label: "ก่อน VAT", value: money(doc.amountBeforeTax) }, { label: "VAT", value: money(doc.vat) },
      { label: "WHT", value: money(doc.wht) }, { label: "หักอื่น ๆ", value: money(doc.otherDeduction) }, { label: "จ่ายสุทธิ (บาท)", value: money(doc.netPayment) },
    ]} notes={doc.remark} />;
}

export function ChequePaymentInformation({ document: doc }: { document: ChequePayment }) {
  return <AccountingDocumentInformation groups={[supplierGroup(doc.voucherSnapshot?.supplier), { title: "ข้อมูลเช็ค", fields: [
    { label: "วันที่เอกสาร", value: date(doc.docDate) }, { label: "ผู้รับเช็ค", value: doc.payee },
    { label: "PV อ้างอิง", value: <Link className="text-blue-700 underline" href={`/ap/vouchers/pv/${doc.paymentVoucherId}`}>{doc.pvNo || doc.paymentVoucherId}</Link> },
    { label: "PS อ้างอิง", value: doc.voucherSnapshot?.sourceNo || "-" }, { label: "PO อ้างอิง", value: doc.voucherSnapshot?.poNo || "-" },
    { label: "ธนาคาร / สาขา", value: `${doc.bankName || "-"} / ${doc.bankBranch || "-"}` },
    { label: "เลขบัญชี", value: doc.bankAccountNo || doc.bankAccount }, { label: "เลขเช็ค", value: doc.chequeNo },
    { label: "วันที่บนเช็ค", value: date(doc.chequeDate) },
    ...(doc.printedAt ? [{ label: "วันที่พิมพ์เช็ค", value: date(doc.printedAt) }] : []),
    ...(doc.signedAt ? [{ label: "วันที่ลงนาม", value: date(doc.signedAt) }, { label: "ผู้ลงนาม", value: doc.signer || "-" }] : []),
    ...(doc.releaseDate ? [{ label: "ส่งมอบวันที่", value: date(doc.releaseDate) }, { label: "ผู้รับมอบ", value: doc.recipient || "-" }] : []),
    ...(doc.clearedAt ? [{ label: "ตัดบัญชีวันที่", value: date(doc.clearedAt) }, { label: "อ้างอิงตัดบัญชี", value: doc.clearingReference || "-" }] : []),
    ...(doc.cancelledAt ? [
      { label: "ยกเลิกวันที่", value: date(doc.cancelledAt) }, { label: "เหตุผลยกเลิก", value: doc.cancellationReason || "-" },
      { label: "อ้างอิงกลับรายการ", value: doc.reversalReference || "-" },
    ] : []),
  ] }]} summary={[{ label: "จำนวนเงินเช็ค (บาท)", value: money(doc.amount) }]} notes={doc.remark} />;
}

export function SupplierBillInformation({ document: doc }: { document: SupplierBill }) {
  return <AccountingDocumentInformation groups={[supplierGroup(doc.supplierSnapshot), { title: "ข้อมูลใบแจ้งหนี้ผู้ขาย", fields: [
    { label: "เลขที่ตั้งหนี้", value: `${doc.billNo} (rev ${doc.revision})` },
    { label: "เลขที่ใบแจ้งหนี้", value: doc.supplierInvoiceNo }, { label: "วันที่ใบแจ้งหนี้", value: date(doc.supplierInvoiceDate) },
    { label: "เลขใบกำกับภาษี", value: doc.taxInvoiceNo || "-" }, { label: "วันที่ใบกำกับภาษี", value: date(doc.taxInvoiceDate) },
    { label: "ครบกำหนด", value: date(doc.dueDate) }, { label: "เครดิต", value: `${doc.creditTermDays} วัน${doc.dueDateManual ? " (แก้ไขเอง)" : ""}` },
    { label: "อ้างอิง", value: doc.reference || "-" }, { label: "เหตุผลยกเลิก", value: doc.cancelReason || "-" },
  ] }]} columns={columns} rows={doc.items.map(row => ({ key: row.id, cells: [row.desc, money(row.amount)] }))}
    itemsTitle="รายการตั้งหนี้" summary={[
      { label: "ก่อน VAT", value: money(doc.subTotal) }, { label: supplierBillVatLabels[doc.vatMode], value: money(doc.vat) },
      { label: "ยอดตามบิล", value: money(doc.netAmount) }, { label: "ตัดชำระแล้ว", value: money(doc.settledAmount) }, { label: "ยอดคงค้าง (บาท)", value: money(doc.outstandingAmount) },
    ]} notes={doc.remark} />;
}
