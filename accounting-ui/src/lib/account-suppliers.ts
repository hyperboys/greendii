export type SupplierType = "domestic" | "overseas" | "contractor";

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
  };
}
