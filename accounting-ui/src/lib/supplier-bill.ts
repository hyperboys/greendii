export type SupplierBillStatus = "draft" | "confirmed" | "cancelled";
export type SupplierBillVatMode = "VAT7" | "NO_VAT";
export type SupplierBillPaymentState = "unpaid" | "partial" | "paid";
export type SupplierBillLine = { id: string; seq: number; desc: string; amount: number };
export type SupplierBillVoucher = {
  id: string; pvNo: string; pvDate: string; status: string; lifecycleVersion: number;
  paidAt: string | null; reversedAt: string | null; netPayment: number; wht: number;
};
export type SupplierBillSettlement = {
  id: string; billId: string; paymentVoucherId: string; amount: number; status: "active" | "voided"; effective: boolean;
  createdAt: string; voidedAt?: string | null; voidReason?: string | null; paymentVoucher?: SupplierBillVoucher | null;
};
export type SupplierBillSnapshot = { id: string; code: string; name: string; taxId: string | null; branch: string | null; address: string | null };
export type SupplierBill = {
  id: string; billNo: string; status: SupplierBillStatus; revision: number;
  supplierId: string; supplierSnapshot: SupplierBillSnapshot;
  supplierInvoiceNo: string; supplierInvoiceDate: string; taxInvoiceNo: string | null; taxInvoiceDate: string | null;
  creditTermDays: number; dueDate: string; dueDateManual: boolean; vatMode: SupplierBillVatMode;
  subTotal: number; vat: number; netAmount: number; settledAmount: number; outstandingAmount: number; ineffectiveSettlementAmount: number;
  paymentState: SupplierBillPaymentState | null; reference: string | null; remark: string | null;
  createdById: string; confirmedAt?: string | null; cancelledAt?: string | null; cancelReason?: string | null;
  items: SupplierBillLine[]; settlements: SupplierBillSettlement[]; createdAt: string; updatedAt: string;
};
export type SupplierBillHistory = { id: string; action: string; reason: string | null; performedBy: { fullName: string } | null; createdAt: string };
export type SupplierBillDetail = SupplierBill & { history: SupplierBillHistory[] };
export type SettlementVoucher = {
  id: string; pvNo: string; pvDate: string; paidAt: string; sourceNo: string | null; netPayment: number; wht: number;
  settlementCapacity: number; allocatedAmount: number; availableAmount: number;
};
export type SupplierBillInput = {
  supplierId: string; supplierInvoiceNo: string; supplierInvoiceDate: string; taxInvoiceNo: string | null; taxInvoiceDate: string | null;
  vatMode: SupplierBillVatMode; creditTermDays: number | null; dueDate: string | null; items: { desc: string; amount: string }[];
  reference: string | null; remark: string | null;
};
export type SupplierBillForm = {
  supplierId: string; supplierInvoiceNo: string; supplierInvoiceDate: string; taxInvoiceNo: string; taxInvoiceDate: string;
  vatMode: SupplierBillVatMode; creditTermDays: string; manualDueDate: boolean; dueDate: string;
  items: { desc: string; amount: string }[]; reference: string; remark: string;
};

export const supplierBillStatusLabels: Record<SupplierBillStatus, string> = { draft: "ร่าง", confirmed: "ตั้งหนี้แล้ว", cancelled: "ยกเลิก" };
export const supplierBillPaymentLabels: Record<SupplierBillPaymentState, string> = { unpaid: "ยังไม่ชำระ", partial: "ชำระบางส่วน", paid: "ชำระครบ" };
export const supplierBillVatLabels: Record<SupplierBillVatMode, string> = { VAT7: "VAT 7% (แยกนอก)", NO_VAT: "ไม่มี VAT" };
export const supplierBillHistoryLabels: Record<string, string> = {
  create: "สร้างร่าง", update: "แก้ไขร่าง", confirm: "ยืนยันตั้งหนี้", cancel: "ยกเลิก", due_date: "แก้วันครบกำหนด",
  settle: "ตัดชำระด้วย PV", unsettle: "ยกเลิกรายการตัดชำระ",
};

export function moneyCents(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function centsText(value: number) {
  return (value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function vatCents(subTotal: number, vatMode: SupplierBillVatMode) {
  return vatMode === "VAT7" ? Math.floor((subTotal * 7 + 50) / 100) : 0;
}
export function billPreview(items: { amount: string }[], vatMode: SupplierBillVatMode) {
  const amounts = items.map(item => moneyCents(item.amount));
  const valid = amounts.every(value => value !== null && value > 0);
  const subTotal = amounts.reduce<number>((sum, value) => sum + (value || 0), 0), vat = vatCents(subTotal, vatMode);
  return { valid, subTotal, vat, net: subTotal + vat };
}
export function addDaysIso(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)) return "";
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return "";
  return new Date(value.getTime() + days * 86400000).toISOString().slice(0, 10);
}
export function creditTermValue(value: string): number | null {
  return /^\d{1,3}$/.test(value.trim()) && Number(value) <= 365 ? Number(value) : null;
}
export function computedDueDate(form: Pick<SupplierBillForm, "supplierInvoiceDate" | "creditTermDays">) {
  const days = creditTermValue(form.creditTermDays);
  return days === null ? "" : addDaysIso(form.supplierInvoiceDate, days);
}
export function newSupplierBillForm(today: string): SupplierBillForm {
  return { supplierId: "", supplierInvoiceNo: "", supplierInvoiceDate: today, taxInvoiceNo: "", taxInvoiceDate: today, vatMode: "VAT7",
    creditTermDays: "", manualDueDate: false, dueDate: "", items: [{ desc: "", amount: "" }], reference: "", remark: "" };
}
const day = (value: string | null | undefined) => value ? value.slice(0, 10) : "";
export function supplierBillForm(bill: SupplierBill): SupplierBillForm {
  return { supplierId: bill.supplierId, supplierInvoiceNo: bill.supplierInvoiceNo, supplierInvoiceDate: day(bill.supplierInvoiceDate),
    taxInvoiceNo: bill.taxInvoiceNo || "", taxInvoiceDate: day(bill.taxInvoiceDate), vatMode: bill.vatMode,
    creditTermDays: String(bill.creditTermDays), manualDueDate: bill.dueDateManual, dueDate: day(bill.dueDate),
    items: bill.items.map(item => ({ desc: item.desc, amount: item.amount.toFixed(2) })), reference: bill.reference || "", remark: bill.remark || "" };
}
export function supplierBillPayload(form: SupplierBillForm): SupplierBillInput {
  const text = (value: string) => value.trim() || null, taxInvoiceNo = text(form.taxInvoiceNo);
  return {
    supplierId: form.supplierId, supplierInvoiceNo: form.supplierInvoiceNo.trim(), supplierInvoiceDate: form.supplierInvoiceDate,
    taxInvoiceNo, taxInvoiceDate: taxInvoiceNo ? form.taxInvoiceDate || null : null, vatMode: form.vatMode,
    creditTermDays: creditTermValue(form.creditTermDays), dueDate: form.manualDueDate ? form.dueDate || null : null,
    items: form.items.map(item => ({ desc: item.desc.trim(), amount: item.amount.trim().replace(/,/g, "") })),
    reference: text(form.reference), remark: text(form.remark),
  };
}
export function supplierBillFormError(form: SupplierBillForm) {
  if (!form.supplierId) return "กรุณาเลือกผู้ขาย";
  if (!form.supplierInvoiceNo.trim()) return "กรุณาระบุเลขที่ใบแจ้งหนี้ผู้ขาย";
  if (!form.supplierInvoiceDate) return "กรุณาระบุวันที่ใบแจ้งหนี้ผู้ขาย";
  if (form.vatMode === "VAT7" && (!form.taxInvoiceNo.trim() || !form.taxInvoiceDate)) return "บิลที่มี VAT ต้องระบุเลขที่/วันที่ใบกำกับภาษี";
  if (form.creditTermDays.trim() && creditTermValue(form.creditTermDays) === null) return "เครดิตต้องเป็นจำนวนเต็ม 0-365 วัน";
  if (form.manualDueDate && (!form.dueDate || form.dueDate < form.supplierInvoiceDate)) return "วันครบกำหนดต้องไม่ก่อนวันที่ใบแจ้งหนี้";
  if (!form.items.length || form.items.some(item => !item.desc.trim())) return "กรุณาระบุรายละเอียดทุกรายการ";
  if (!billPreview(form.items, form.vatMode).valid) return "จำนวนเงินต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง";
  return "";
}
export function defaultSettlementAmount(bill: Pick<SupplierBill, "outstandingAmount">, voucher?: Pick<SettlementVoucher, "availableAmount">) {
  if (!voucher) return "";
  return (Math.min(Math.round(bill.outstandingAmount * 100), Math.round(voucher.availableAmount * 100)) / 100).toFixed(2);
}