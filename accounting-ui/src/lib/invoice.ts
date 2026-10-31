import { newDeliveryOrder, type DeliveryOrderLine, type DeliveryOrder } from "./delivery-order";

export type InvoiceInput = {
  ivDate: string; customerId: string; customerBranchId?: string; customerBranch: string;
  taxId: string; address: string; shippingAddress: string; customerPoNo: string;
  provisionalDeliveryOrderId: string | null; workOrderId: string | null;
  reuseInvoiceId?: string | null;
  creditTerm: number | string; vatConfig: "VAT7%" | "NO_VAT"; discount: number | string;
  remark: string; items: DeliveryOrderLine[]; updatedAt?: string;
};
export type ReusableInvoiceNumber = {
  id: string; ivNo: string; ivDate: string; customerName: string | null; customerCode: string | null;
};
export type Invoice = Omit<InvoiceInput, "items" | "updatedAt"> & {
  accountingApproval?: import("./accounting-approval").ApprovalSnapshot | null;
  id: string; ivNo: string; status: string; lifecycleVersion: number; updatedAt: string; dueDate: string;
  confirmedAt?: string | null; customerName?: string | null; customerCode?: string | null;
  customer?: DeliveryOrder["customer"]; provisionalDeliveryOrder?: { id: string; soNo: string } | null;
  reissuedFrom?: Pick<ReusableInvoiceNumber, "id" | "ivNo"> | null;
  reissuedAs?: (Pick<ReusableInvoiceNumber, "id" | "ivNo"> & { status: string }) | null;
  workOrder?: DeliveryOrder["workOrder"]; createdBy?: DeliveryOrder["createdBy"]; history?: DeliveryOrder["history"];
  responsibleSaleName?: string | null;
  items: (Omit<DeliveryOrderLine, "discount" | "partNo" | "unit" | "remark"> & {
    lineDiscount: number | string; partNo: string | null; unit: string | null; remark: string | null;
  })[];
  subTotal: number | string; vat: number | string; netAmount: number | string; outstandingAmount: number | string;
};
export type InvoiceSource = { id: string; soNo: string; customerId: string; customer?: { name: string } };
export function newInvoice(): InvoiceInput {
  const source = newDeliveryOrder();
  return {
    ivDate: source.docDate, customerId: "", customerBranchId: "", customerBranch: "",
    taxId: "", address: "", shippingAddress: "", customerPoNo: "", provisionalDeliveryOrderId: null, workOrderId: null,
    reuseInvoiceId: null, creditTerm: 30, vatConfig: "VAT7%", discount: 0, remark: "", items: source.items,
  };
}
export function invoiceForm(doc: Invoice): InvoiceInput {
  return {
    ivDate: doc.ivDate.slice(0, 10), customerId: doc.customerId, customerBranch: doc.customerBranch || "",
    taxId: doc.taxId || "", address: doc.address || "", shippingAddress: doc.shippingAddress || "",
    customerPoNo: doc.customerPoNo || "", provisionalDeliveryOrderId: doc.provisionalDeliveryOrderId,
    workOrderId: doc.workOrderId, creditTerm: doc.creditTerm, vatConfig: doc.vatConfig || "VAT7%", discount: doc.discount,
    remark: doc.remark || "", updatedAt: doc.updatedAt,
    items: doc.items.map(item => ({ ...item, partNo: item.partNo || "", unit: item.unit || "", remark: item.remark || "", discount: item.lineDiscount })),
  };
}
export const invoiceStatus = (doc: Pick<Invoice, "status" | "lifecycleVersion">) =>
  `${({ draft: "Draft", approved: "ยืนยันแล้ว", cancelled: "ยกเลิก", pending: "รออนุมัติ" }[doc.status] || doc.status)}${doc.lifecycleVersion !== 1 ? " (Legacy)" : ""}`;
