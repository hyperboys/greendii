export type SupplierType = "domestic" | "overseas" | "contractor";
export type SupplierBank = {
  bankName: string; bankBranch?: string | null; bankAccountNo: string; bankAccountName: string; isDefault: boolean;
};
export type SupplierBranch = {
  code: string; name: string; address?: string | null; billingAddress?: string | null;
  contactPerson?: string | null; tel?: string | null; fax?: string | null; email?: string | null;
  isDefault: boolean; banks: SupplierBank[];
};
export function newSupplierBranch(): SupplierBranch {
  return { code: "", name: "", address: "", billingAddress: "", contactPerson: "", tel: "", fax: "", email: "", isDefault: false, banks: [] };
}

export type AccountSupplier = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  branch: string | null;
  address: string | null;
  billingAddress: string | null;
  contactPerson: string | null;
  tel: string | null;
  fax: string | null;
  groupCode: string | null;
  groupName: string | null;
  creditLimit: number | string | null;
  email: string | null;
  vatConfig: string | null;
  paymentTerm: number;
  supplierType: SupplierType;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  branches?: SupplierBranch[];
};

export type SupplierInput = {
  code: string;
  name: string;
  taxId: string;
  branch: string;
  address: string;
  billingAddress: string;
  contactPerson: string;
  tel: string;
  fax: string;
  groupCode: string;
  groupName: string;
  creditLimit: number | null;
  email: string;
  vatConfig: string;
  paymentTerm: number;
  supplierType: SupplierType;
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankAccountName: string;
  active: boolean;
  updatedAt?: string;
  branches: SupplierBranch[];
};

export function supplierForm(supplier?: AccountSupplier): SupplierInput {
  return {
    code: supplier?.code ?? "",
    name: supplier?.name ?? "",
    taxId: supplier?.taxId ?? "",
    branch: supplier?.branch ?? "สำนักงานใหญ่",
    address: supplier?.address ?? "",
    billingAddress: supplier?.billingAddress ?? "",
    contactPerson: supplier?.contactPerson ?? "",
    tel: supplier?.tel ?? "",
    fax: supplier?.fax ?? "",
    groupCode: supplier?.groupCode ?? "",
    groupName: supplier?.groupName ?? "",
    creditLimit: supplier?.creditLimit == null ? null : Number(supplier.creditLimit),
    email: supplier?.email ?? "",
    vatConfig: supplier?.vatConfig ?? "VAT7%",
    paymentTerm: supplier?.paymentTerm ?? 30,
    supplierType: supplier?.supplierType ?? "domestic",
    bankName: supplier?.bankName ?? "",
    bankBranch: supplier?.bankBranch ?? "",
    bankAccountNo: supplier?.bankAccountNo ?? "",
    bankAccountName: supplier?.bankAccountName ?? "",
    active: supplier?.active ?? true,
    updatedAt: supplier?.updatedAt,
    branches: supplier?.branches?.length ? supplier.branches.map(branch => ({ ...branch, banks: branch.banks.map(bank => ({ ...bank })) }))
      : [{ ...newSupplierBranch(), code: "00000", name: supplier?.branch || "สำนักงานใหญ่", isDefault: true,
        address: supplier?.address ?? "", billingAddress: supplier?.billingAddress ?? "",
        contactPerson: supplier?.contactPerson ?? "", tel: supplier?.tel ?? "", fax: supplier?.fax ?? "", email: supplier?.email ?? "",
        banks: supplier?.bankAccountNo ? [{ bankName: supplier.bankName ?? "", bankBranch: supplier.bankBranch ?? "",
          bankAccountNo: supplier.bankAccountNo, bankAccountName: supplier.bankAccountName ?? "", isDefault: true }] : [] }],
  };
}
