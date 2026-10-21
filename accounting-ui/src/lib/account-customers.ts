export type VatConfig = "VAT7%" | "NO_VAT";
export type AccountSale = {
  id: string; code: string; name: string; tel: string | null; email: string | null;
  active: boolean; updatedAt: string;
};
export type CustomerAddress = {
  id?: string; label: string; kind: "billing" | "shipping" | "both"; address: string;
};
export type CustomerBranch = {
  id?: string; code: string; name: string; contactPerson?: string | null; tel?: string | null;
  fax?: string | null; email?: string | null; addresses: CustomerAddress[];
};
export type CustomerInput = {
  code: string; name: string; taxId: string; type: string; contactPerson: string;
  tel: string; fax: string; email: string; responsibleSaleId: string; secondarySaleIds: string[]; vatConfig: VatConfig;
  creditTerm: number; active: boolean; branches: CustomerBranch[]; updatedAt?: string;
};
export type AccountCustomer = Omit<CustomerInput, "code" | "taxId" | "contactPerson" | "tel" | "fax" | "email" | "responsibleSaleId" | "secondarySaleIds"> & {
  id: string; code: string | null; taxId: string | null; contactPerson: string | null;
  tel: string | null; fax?: string | null; email: string | null; responsibleSaleId: string | null;
  responsibleSale: AccountSale | null; secondarySales?: { saleId: string; position: number; sale: AccountSale | null }[];
  branch?: string | null; address?: string | null;
  billingAddress?: string | null; shippingAddress?: string | null;
};

export function newBranch(): CustomerBranch {
  return { code: "", name: "", contactPerson: "", tel: "", fax: "", email: "", addresses: [{ label: "ที่อยู่หลัก", kind: "both", address: "" }] };
}
export function customerForm(customer?: AccountCustomer): CustomerInput {
  return {
    code: customer?.code ?? "", name: customer?.name ?? "", taxId: customer?.taxId ?? "",
    type: customer?.type ?? "นิติบุคคล", contactPerson: customer?.contactPerson ?? "",
    tel: customer?.tel ?? "", fax: customer?.fax ?? "", email: customer?.email ?? "", responsibleSaleId: customer?.responsibleSaleId ?? "",
    secondarySaleIds: customer?.secondarySales?.map(s => s.saleId) ?? [],
    vatConfig: customer?.vatConfig ?? "VAT7%", creditTerm: customer?.creditTerm ?? 30,
    active: customer?.active ?? true, updatedAt: customer?.updatedAt,
    branches: customer?.branches.length ? customer.branches.map(b => ({
      ...b, contactPerson: b.contactPerson ?? "", tel: b.tel ?? "", fax: b.fax ?? "", email: b.email ?? "",
      addresses: b.addresses.map(a => ({ ...a })),
    }))
      : [{
        code: customer ? "LEGACY" : "", name: customer?.branch ?? "สำนักงานใหญ่",
        addresses: customer ? [
          ...(customer.address ? [{ label: "ที่อยู่ทั่วไป", kind: "both" as const, address: customer.address }] : []),
          ...(customer.billingAddress ? [{ label: "ที่อยู่วางบิล", kind: "billing" as const, address: customer.billingAddress }] : []),
          ...(customer.shippingAddress ? [{ label: "ที่อยู่จัดส่ง", kind: "shipping" as const, address: customer.shippingAddress }] : []),
        ] : newBranch().addresses,
      }],
  };
}

export function branchDefaults(customer: AccountCustomer, branchId?: string) {
  const branch = customer.branches.find(b => b.id === branchId) ?? customer.branches[0];
  const billing = branch?.addresses.find(a => a.kind === "billing") ?? branch?.addresses.find(a => a.kind === "both");
  const shipping = branch?.addresses.find(a => a.kind === "shipping") ?? branch?.addresses.find(a => a.kind === "both");
  return {
    customerBranchId: branch?.id ?? "", customerBranch: branch?.name ?? customer.branch ?? "",
    billingAddressId: billing?.id ?? "", shippingAddressId: shipping?.id ?? "",
    address: billing?.address ?? (branch ? "" : customer.billingAddress ?? customer.address ?? ""),
    shippingAddress: shipping?.address ?? (branch ? "" : customer.shippingAddress ?? ""),
  };
}
export function invoiceDefaults(customer: AccountCustomer) {
  return {
    customerId: customer.id, ...branchDefaults(customer), taxId: customer.taxId ?? "",
    vatConfig: customer.vatConfig ?? "VAT7%", creditTerm: customer.creditTerm ?? 30,
  };
}
export function invoiceAmounts(items: { qty: number | string; unitPrice: number | string }[], vatConfig: VatConfig) {
  const subTotal = Math.round(items.reduce((sum, item) => sum + Number(item.qty) * Number(item.unitPrice), 0) * 100) / 100;
  const vat = vatConfig === "NO_VAT" ? 0 : Math.round(subTotal * 7) / 100;
  return { subTotal, vat, netAmount: Math.round((subTotal + vat) * 100) / 100 };
}
export function invoiceDueDate(date: string, creditTerm: number) {
  if (!date || !Number.isSafeInteger(creditTerm) || creditTerm < 0) return "";
  const due = new Date(`${date}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + creditTerm);
  return Number.isNaN(due.getTime()) ? "" : due.toISOString().slice(0, 10);
}
