export type BillingSource = {
  id: string; ivNo: string; ivDate: string; dueDate: string | null;
  netAmount: number | string; outstandingAmount: number | string;
};
export type BillingLine = {
  invoiceId: string; billingAmount: number | string; outstandingAmount: number | string;
  invoiceNo: string | null; invoiceDate: string | null; invoiceDueDate: string | null;
  invoiceNetAmount: number | string | null; invoice?: BillingSource | null;
};
export type BillingInput = {
  billingDate: string; customerId: string; customerBranchId?: string; customerBranch: string;
  address: string; taxId: string; contactPerson: string; expectedPaymentDate: string;
  paymentTerms: string; remark: string; invoices: BillingLine[]; updatedAt?: string;
};
export type BillingNote = Omit<BillingInput, "expectedPaymentDate"> & {
  id: string; biNo: string; lifecycleVersion: number; status: string; updatedAt: string;
  expectedPaymentDate: string | null; totalAmount: number | string; confirmedAt?: string | null;
  completedAt?: string | null;
  customerName: string | null; customerCode: string | null; customer?: { name: string; code: string | null } | null;
  history?: { id: string; action: string; reason: string | null; performedBy?: { fullName: string } | null; createdAt: string }[];
};
export function newBillingNote(): BillingInput {
  return { billingDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }), customerId: "",
    customerBranch: "", customerBranchId: "", address: "", taxId: "", contactPerson: "",
    expectedPaymentDate: "", paymentTerms: "", remark: "", invoices: [] };
}
export function billingForm(doc: BillingNote): BillingInput {
  return { ...newBillingNote(), ...doc, billingDate: doc.billingDate.slice(0, 10),
    expectedPaymentDate: doc.expectedPaymentDate?.slice(0, 10) || "",
    address: doc.address || "", taxId: doc.taxId || "", customerBranch: doc.customerBranch || "",
    contactPerson: doc.contactPerson || "", paymentTerms: doc.paymentTerms || "", remark: doc.remark || "",
    invoices: doc.invoices.map(row => ({ ...row, outstandingAmount: row.invoice?.outstandingAmount ?? row.outstandingAmount })) };
}
export function billingTotal(rows: Pick<BillingLine, "billingAmount">[]) {
  return rows.reduce((sum, row) => sum + Math.round(Number(row.billingAmount || 0) * 100), 0) / 100;
}
export function billingStatus(doc: Pick<BillingNote, "status" | "lifecycleVersion" | "completedAt">) {
  const label = doc.status === "approved" && doc.completedAt ? "รับชำระครบส่วนวางบิลแล้ว" : ({ draft: "Draft", approved: "ยืนยันวางบิลแล้ว", cancelled: "ยกเลิก" } as Record<string, string>)[doc.status] || doc.status;
  return doc.lifecycleVersion === 1 ? label : `${label} (Legacy)`;
}
