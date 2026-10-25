export type CreditSource = {
  id: string; ivNo: string; ivDate: string; customerName: string | null; customerCode: string | null;
  customerBranch: string | null; address: string | null; taxId: string | null; vatConfig: string;
  netAmount: number | string; vat: number | string; outstandingAmount: number | string;
  capacity?: { before: number; vat: number; net: number }; activeBilling?: boolean;
};
export type CreditLine = {
  desc: string; partNo: string; unit: string; qty: number | string; unitPrice: number | string;
  amountBeforeVat?: number | string; vat?: number | string; netAmount?: number | string;
};
export type CreditInput = {
  cnDate: string; invoiceId: string; reason: string; contactPerson: string; remark: string; items: CreditLine[]; updatedAt?: string;
};
export type CreditNote = CreditInput & {
  id: string; cnNo: string; lifecycleVersion: number; status: string; updatedAt: string; confirmedAt: string | null;
  customerName: string | null; customerCode: string | null; customerBranch: string | null; address: string | null; taxId: string | null;
  invoiceNo: string | null; invoiceDate: string | null; vatConfig: string;
  originalBeforeVat: number | string | null; correctedBeforeVat: number | string | null;
  amountBeforeVat: number | string; vat: number | string; netAmount: number | string;
  invoice?: { id: string; ivNo: string; outstandingAmount: number | string };
  customer?: { name: string; code: string | null };
  history?: { id: string; action: string; reason: string | null; performedBy?: { fullName: string }; createdAt: string }[];
};
export function newCreditLine(): CreditLine {
  return { desc: "", partNo: "", unit: "รายการ", qty: 1, unitPrice: 0 };
}
export function newCredit(): CreditInput {
  return { cnDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }), invoiceId: "", reason: "", contactPerson: "", remark: "", items: [newCreditLine()] };
}
export function creditForm(doc: CreditNote): CreditInput {
  return { ...newCredit(), ...doc, cnDate: doc.cnDate.slice(0, 10), reason: doc.reason || "", contactPerson: doc.contactPerson || "", remark: doc.remark || "",
    items: doc.items.map(row => ({ ...row, partNo: row.partNo || "", unit: row.unit || "" })) };
}
export function creditAmounts(items: CreditLine[], vatConfig: string) {
  const lineAmounts = items.map(row => Math.round(Number(row.unitPrice || 0) * 100) * Number(row.qty || 0));
  const before = lineAmounts.reduce((sum, amount) => sum + amount, 0);
  const vat = vatConfig === "VAT7%" ? Math.round(before * 7 / 100) : 0;
  return { before: before / 100, vat: vat / 100, net: (before + vat) / 100, lineAmounts: lineAmounts.map(amount => amount / 100) };
}
export function creditStatus(doc: Pick<CreditNote, "status" | "lifecycleVersion">) {
  const label = ({ draft: "Draft", approved: "ยืนยันลดหนี้แล้ว", cancelled: "ยกเลิก" } as Record<string, string>)[doc.status] || doc.status;
  return doc.lifecycleVersion === 1 ? label : `${label} (Legacy)`;
}
