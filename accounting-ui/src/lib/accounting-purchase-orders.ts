import type { PurchaseOrderLineDraft } from "./purchase-order";
import type { SupplierBranch } from "./account-suppliers";

export type PurchaseOrderSupplier = {
  id: string;
  code: string;
  name: string;
  taxId?: string | null;
  branch?: string | null;
  address?: string | null;
  billingAddress?: string | null;
  contactPerson?: string | null;
  tel?: string | null;
  email?: string | null;
  vatConfig?: string | null;
  paymentTerm?: number | null;
  supplierType?: string;
  branches?: SupplierBranch[];
};

export type PurchaseOrderAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  fileUrl?: string | null;
  uploadedAt?: string;
};

export type PurchaseRequestReference = {
  id: string;
  prNo: string;
  status: string;
  customer?: string | null;
  projectRef?: string | null;
  workOrder?: { woNo: string } | null;
  attachments?: PurchaseOrderAttachment[];
};

export type PurchaseOrderDocument = {
  id: string;
  poNo: string;
  poDate: string;
  purchaseType: string;
  supplierId: string;
  supplierBranch?: string | null;
  supplierSnapshot?: Pick<PurchaseOrderSupplier, "code" | "name" | "taxId" | "tel"> | null;
  address?: string | null;
  contactPerson?: string | null;
  remarks?: string | null;
  prId?: string | null;
  pr?: { id: string; prNo: string } | null;
  purchaseRequestReferences?: { purchaseRequest: PurchaseRequestReference }[];
  subTotal: number | string;
  discount: number | string;
  vat: number | string;
  vatConfig: string;
  netAmount: number | string;
  paymentTerm: number;
  deliveryDate?: string | null;
  deliveryLocation?: string | null;
  status: string;
  createdBy?: {
    fullName?: string | null;
    position?: string | null;
    signatureText?: string | null;
    signatureUrl?: string | null;
  } | null;
  supplier?: PurchaseOrderSupplier | null;
  items: (PurchaseOrderLineDraft & { id?: string; amount?: number | string })[];
  attachments?: PurchaseOrderAttachment[];
};

export type PurchaseOrderInput = {
  poDate: string;
  purchaseType: string;
  supplierId: string;
  supplierBranch: string;
  address: string;
  contactPerson: string;
  remarks: string;
  purchaseRequestIds: string[];
  vatConfig: "VAT7%" | "NO_VAT";
  paymentTerm: number;
  deliveryDate: string;
  deliveryLocation: string;
  items: PurchaseOrderLineDraft[];
};

export type PurchaseOrderCompanySettings = {
  companyName?: string;
  companyNameEn?: string;
  address?: string;
  taxId?: string;
  tel?: string;
  logoUrl?: string | null;
};
