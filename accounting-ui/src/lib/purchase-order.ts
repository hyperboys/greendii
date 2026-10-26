export type PurchaseOrderLineDraft = {
  productId?: string | null;
  partNo: string;
  desc: string;
  qty: number | string;
  unit: string;
  unitPrice: number | string;
  discount: number | string;
  remark: string;
};

export type PurchaseOrderTotals = {
  subTotal: number;
  discount: number;
  taxableAmount: number;
  vat: number;
  netAmount: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function purchaseOrderLineAmount(item: PurchaseOrderLineDraft) {
  const qty = Number(item.qty) || 0;
  const price = Number(item.unitPrice) || 0;
  const discount = Number(item.discount) || 0;
  return roundMoney(Math.max(0, qty * price - discount));
}

export function purchaseOrderTotals(items: PurchaseOrderLineDraft[], vatConfig: string): PurchaseOrderTotals {
  const subTotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0), 0));
  const discount = roundMoney(items.reduce((sum, item) => sum + (Number(item.discount) || 0), 0));
  const taxableAmount = roundMoney(Math.max(0, subTotal - discount));
  const vat = vatConfig === "NO_VAT" ? 0 : roundMoney(taxableAmount * 0.07);
  return { subTotal, discount, taxableAmount, vat, netAmount: roundMoney(taxableAmount + vat) };
}

export function emptyPurchaseOrderLine(): PurchaseOrderLineDraft {
  return { partNo: "", desc: "", qty: 1, unit: "", unitPrice: 0, discount: 0, remark: "" };
}
