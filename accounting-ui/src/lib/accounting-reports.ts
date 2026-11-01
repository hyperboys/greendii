import { csvCell } from "@/lib/master-data";
import { formatAccountingDate } from "@/lib/accounting-date";

export type ReceiptState = "not_received" | "partial" | "complete" | "cancelled" | "review_required";
export type AccountingReportLine = {
  poLineId: string; desc: string; unit: string;
  orderedQty: number; receivedQty: number; pendingQty: number; remainingQty: number;
};
export type AccountingReportRow = {
  documentNo: string; documentDate: string; partnerName: string; dueDate?: string;
  netAmount?: number; outstandingAmount?: number; settledAmount?: number;
  supplierInvoiceNo?: string; taxInvoiceNo?: string | null; diffDays?: number;
  current?: number; days1To30?: number; days31To60?: number; days61To90?: number; over90Days?: number;
  status?: string; receiptState?: ReceiptState; linkedDocuments?: string[];
  pendingDocuments?: string[]; cancelledDocuments?: string[]; reviewReasons?: string[]; lines?: AccountingReportLine[];
};
export type AccountingReport = {
  asOfDate?: string; from?: string | null; to?: string | null;
  basis: "current_ar_balance" | "supplier_bill_outstanding" | "po_commitment" | "current_document_state";
  warnings: string[]; rows: AccountingReportRow[];
};
export type ReportTab = "arAging" | "apAging" | "apPoCommitment" | "reconDelivery" | "reconPo";
export const agingReportTabs: ReportTab[] = ["arAging", "apAging", "apPoCommitment"];
export type ReportRange = { from?: string; to?: string };
export const receiptStateLabels: Record<ReceiptState, string> = {
  not_received: "ยังไม่รับ / ยังไม่ออกบิล", partial: "รับบางส่วน", complete: "ครบแล้ว",
  cancelled: "เอกสารต้นทางยกเลิก", review_required: "ต้องตรวจสอบข้อมูล",
};
export function isReceiptState(value: string): value is ReceiptState {
  return Object.hasOwn(receiptStateLabels, value);
}
export type ReportColumn = { key: keyof AccountingReportRow; label: string; format?: "date" | "money" | "list" | "state" };
export function reportColumns(tab: ReportTab): ReportColumn[] {
  const common: ReportColumn[] = [
    { key: "documentNo", label: "เลขที่เอกสาร" }, { key: "documentDate", label: "วันที่เอกสาร", format: "date" },
    { key: "partnerName", label: "คู่ค้า" },
  ];
  const buckets: ReportColumn[] = [
    { key: "current", label: tab === "apPoCommitment" ? "อายุไม่เกิน 0 วัน" : "ยังไม่ครบกำหนด", format: "money" },
    { key: "days1To30", label: "1–30 วัน", format: "money" },
    { key: "days31To60", label: "31–60 วัน", format: "money" },
    { key: "days61To90", label: "61–90 วัน", format: "money" },
    { key: "over90Days", label: "มากกว่า 90 วัน", format: "money" },
  ];
  if (tab === "arAging") return [...common, { key: "dueDate", label: "วันครบกำหนด", format: "date" },
    { key: "outstandingAmount", label: "ยอดคงค้างปัจจุบัน", format: "money" }, ...buckets];
  if (tab === "apAging") return [{ key: "documentNo", label: "เลขที่ตั้งหนี้" },
    { key: "supplierInvoiceNo", label: "เลขที่ใบแจ้งหนี้ผู้ขาย" }, { key: "taxInvoiceNo", label: "เลขที่ใบกำกับภาษี" },
    { key: "documentDate", label: "วันที่ใบแจ้งหนี้", format: "date" }, { key: "partnerName", label: "ผู้ขาย" },
    { key: "dueDate", label: "วันครบกำหนด", format: "date" }, { key: "netAmount", label: "ยอดตามบิล", format: "money" },
    { key: "settledAmount", label: "ตัดชำระแล้ว", format: "money" }, { key: "outstandingAmount", label: "ยอดคงค้าง", format: "money" }, ...buckets];
  if (tab === "apPoCommitment") return [...common, { key: "netAmount", label: "ยอด PO (ไม่หักจ่าย)", format: "money" }, ...buckets];
  return [...common,
    { key: "status", label: "สถานะต้นทาง" },
    { key: "linkedDocuments", label: "ปลายทางอนุมัติแล้ว", format: "list" },
    { key: "pendingDocuments", label: "ปลายทางรออนุมัติ", format: "list" },
    { key: "cancelledDocuments", label: "ปลายทางยกเลิก", format: "list" },
    { key: "receiptState", label: "สถานะกระทบยอด", format: "state" },
    { key: "reviewReasons", label: "ข้อควรตรวจสอบ", format: "list" },
  ];
}
export function reportValue(row: AccountingReportRow, column: ReportColumn) {
  const value = row[column.key];
  if (value === null || value === undefined) return "-";
  if (column.format === "state") return row.receiptState ? receiptStateLabels[row.receiptState] : "-";
  if (column.format === "date" && typeof value === "string") return formatAccountingDate(value);
  if (column.format === "money" && typeof value === "number") return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Array.isArray(value)) return value.join(", ") || "-";
  return String(value);
}
export function filterReportRows(rows: AccountingReportRow[], search: string, state: string) {
  const text = search.trim().toLocaleLowerCase();
  return rows.filter(row => (!state || row.receiptState === state) &&
    (!text || [row.documentNo, row.partnerName, row.supplierInvoiceNo, row.taxInvoiceNo, ...(row.linkedDocuments || []),
      ...(row.pendingDocuments || []), ...(row.cancelledDocuments || [])]
      .some(value => typeof value === "string" && value.toLocaleLowerCase().includes(text))));
}
export function accountingReportCsv(report: AccountingReport, rows: AccountingReportRow[], tab: ReportTab) {
  const columns = reportColumns(tab);
  const content: (string | number)[][] = [
    ["ฐานข้อมูลรายงาน", report.basis],
    ["วันที่อ้างอิง", report.asOfDate ? formatAccountingDate(report.asOfDate) : "-"],
    ["ช่วงวันที่เอกสารต้นทาง", report.from ? formatAccountingDate(report.from) : "-", report.to ? formatAccountingDate(report.to) : "-"],
    ...report.warnings.map(warning => ["ข้อควรทราบ", warning]),
    columns.map(column => column.label),
    ...rows.map(row => columns.map(column => reportValue(row, column))),
  ];
  if (tab === "reconPo") {
    content.push([], ["เลขที่ PO", "รายการ", "หน่วย", "สั่งซื้อ", "รับอนุมัติแล้ว", "รออนุมัติ", "ยังไม่รับ"]);
    for (const row of rows) for (const line of row.lines || []) {
      content.push([row.documentNo, line.desc, line.unit, line.orderedQty, line.receivedQty, line.pendingQty, line.remainingQty]);
    }
  }
  return "\ufeff" + content.map(line => line.map(csvCell).join(",")).join("\r\n");
}
export function exportAccountingReport(report: AccountingReport, rows: AccountingReportRow[], tab: ReportTab) {
  const url = URL.createObjectURL(new Blob([accountingReportCsv(report, rows, tab)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `accounting-${tab}-${report.asOfDate?.slice(0, 10) || report.to?.slice(0, 10) || "report"}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
