export type DeliveryOrderProduct = { id: string; code: string; name: string; unit?: string | null; productType?: string; price?: number | string };
export type DeliveryOrderWorkOrder = { id: string; woNo: string; project?: string };
export type DeliveryOrderLine = {
  id?: string; productId: string | null; desc: string; qty: number | string; unit: string; remark: string;
  product?: { code: string } | null;
  partNo: string; unitPrice: number | string; discount: number | string; amount?: number | string;
};
export type DeliveryOrderInput = {
  docDate: string; customerId: string; customerBranchId?: string; customerBranch: string;
  shippingAddress: string; receiver: string; workOrderId: string | null; remark: string;
  items: DeliveryOrderLine[]; updatedAt?: string;
  customerTel: string; customerFax: string; deliveryDate: string; creditTerm: number | string;
  vatConfig: "VAT7%" | "NO_VAT"; discount: number | string;
};
export type DeliveryOrder = Omit<DeliveryOrderInput, "updatedAt" | "deliveryDate"> & {
  id: string; soNo: string; status: string; updatedAt: string;
  deliveryDate: string | null;
  customer?: { id: string; code?: string | null; name: string } | null;
  workOrder?: DeliveryOrderWorkOrder | null;
  createdBy?: { fullName?: string | null } | null;
  subTotal: number | string; vat: number | string; netAmount: number | string;
  history?: { id: string; action: string; reason?: string | null; createdAt: string; performedById?: string | null; performedBy?: { fullName: string } | null }[];
};
export const deliveryOrderStatus = (status: string) => ({
  draft: "Draft", cancelled: "ยกเลิก", approved: "อนุมัติแล้ว", pending: "รออนุมัติ", rejected: "ไม่อนุมัติ",
}[status] || status);
export const newDeliveryOrderLine = (): DeliveryOrderLine => ({ productId: null, partNo: "", desc: "", qty: 1, unit: "", remark: "", unitPrice: 0, discount: 0 });
export function deliveryOrderAmounts(items: Pick<DeliveryOrderLine, "qty" | "unitPrice" | "discount">[], discount: number | string, vatConfig: "VAT7%" | "NO_VAT") {
  const lineAmounts = items.map(item => (Math.round(Number(item.unitPrice) * 100) * Number(item.qty) - Math.round(Number(item.discount) * 100)) / 100);
  const subTotalCents = lineAmounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0);
  const taxableCents = subTotalCents - Math.round(Number(discount) * 100);
  const vatCents = vatConfig === "NO_VAT" ? 0 : Math.round(taxableCents * 7 / 100);
  return { lineAmounts, subTotal: subTotalCents / 100, taxableAmount: taxableCents / 100, vat: vatCents / 100, netAmount: (taxableCents + vatCents) / 100 };
}
export function newDeliveryOrder(): DeliveryOrderInput {
  return {
    docDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }),
    customerId: "", customerBranchId: "", customerBranch: "", shippingAddress: "", receiver: "",
    workOrderId: null, remark: "", items: [newDeliveryOrderLine()],
    customerTel: "", customerFax: "", deliveryDate: "", creditTerm: 30, vatConfig: "VAT7%", discount: 0,
  };
}
