/**
 * API client for accounting-ui
 * Handles authentication headers, error parsing, and structured requests.
 */

import type { AccountCustomer, AccountSale, CustomerInput } from "./account-customers";
import type { AccountSupplier, SupplierInput } from "./account-suppliers";
import type { DeliveryOrder, DeliveryOrderInput, DeliveryOrderProduct, DeliveryOrderWorkOrder } from "./delivery-order";
import type { Invoice, InvoiceInput, InvoiceSource, ReusableInvoiceNumber } from "./invoice";
import type { BillingNote, BillingInput, BillingSource } from "./billing-note";
import type { ReceiptVoucher, ReceiptInput, ReceiptSources, ReceiptAttachment } from "./receipt-voucher";
import type { CreditNote, CreditInput, CreditSource } from "./credit-note";
import type {
  PurchaseOrderCompanySettings, PurchaseOrderDocument, PurchaseOrderInput,
  PurchaseOrderSupplier, PurchaseRequestReference, PurchaseOrderAction, PurchaseOrderAttachment,
} from "./accounting-purchase-orders";

const TOKEN_KEY = "gd_token";

export function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || `เกิดข้อผิดพลาดในการร้องขอข้อมูล (${res.status})`);
  }

  return data as T;
}

// ─── MASTER DATA ─────────────────────────────────────────────────────────────
export const AccountingLookupApi = {
  getCustomers: () => apiFetch<AccountCustomer[]>("/api/accounting-access/lookups/customers"),
  getSuppliers: () => apiFetch<PurchaseOrderSupplier[]>("/api/accounting-access/lookups/suppliers"),
  getProducts: () => apiFetch<DeliveryOrderProduct[]>("/api/accounting-access/lookups/products"),
  getWarehouses: () => apiFetch("/api/accounting-access/lookups/warehouses"),
};

export const MasterApi = {
  getCustomers: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<AccountCustomer[]>(`/api/account-customers${q ? `?${q}` : ""}`);
  },
  getCustomer: (id: string) => apiFetch<AccountCustomer>(`/api/account-customers/${encodeURIComponent(id)}`),
  createCustomer: (data: CustomerInput) => apiFetch<AccountCustomer>("/api/account-customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: CustomerInput) => apiFetch<AccountCustomer>(`/api/account-customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getSales: () => apiFetch<AccountSale[]>("/api/account-sales"),
  createSale: (data: Omit<AccountSale, "id" | "updatedAt">) => apiFetch<AccountSale>("/api/account-sales", { method: "POST", body: JSON.stringify(data) }),
  updateSale: (id: string, data: Omit<AccountSale, "id">) => apiFetch<AccountSale>(`/api/account-sales/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  getSuppliers: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<AccountSupplier[]>(`/api/suppliers${q ? `?${q}` : ""}`);
  },
  getSupplier: (id: string) => apiFetch<AccountSupplier>(`/api/suppliers/${encodeURIComponent(id)}`),
  createSupplier: (data: SupplierInput) => apiFetch<AccountSupplier>("/api/suppliers", { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: Partial<SupplierInput> & { active?: boolean }) =>
    apiFetch<AccountSupplier>(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deactivateSupplier: (id: string, updatedAt?: string) => apiFetch<{ message: string; updatedAt: string }>(`/api/suppliers/${id}`, { method: "DELETE", body: JSON.stringify({ updatedAt }) }),

  getProducts: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/account-products${q ? `?${q}` : ""}`);
  },
  createProduct: (data: any) => apiFetch("/api/account-products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) => apiFetch(`/api/account-products/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  getWarehouses: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/warehouses${q ? `?${q}` : ""}`);
  },
  createWarehouse: (data: any) => apiFetch("/api/warehouses", { method: "POST", body: JSON.stringify(data) }),
  updateWarehouse: (id: string, data: any) => apiFetch(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  getChartOfAccounts: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/chart-of-accounts${q ? `?${q}` : ""}`);
  },
  createChartOfAccount: (data: any) => apiFetch("/api/chart-of-accounts", { method: "POST", body: JSON.stringify(data) }),
  updateChartOfAccount: (id: string, data: any) => apiFetch(`/api/chart-of-accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};

// ─── ACCOUNTS RECEIVABLE (AR) ────────────────────────────────────────────────
export const ArApi = {
  getDeliveryOrders: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<DeliveryOrder[]>(`/api/ar/delivery-orders${q ? `?${q}` : ""}`);
  },
  getDeliveryOrder: (id: string) => apiFetch<DeliveryOrder>(`/api/ar/delivery-orders/${encodeURIComponent(id)}`),
  createDeliveryOrder: (data: DeliveryOrderInput) => apiFetch<DeliveryOrder>("/api/ar/delivery-orders", { method: "POST", body: JSON.stringify(data) }),
  updateDeliveryOrder: (id: string, data: DeliveryOrderInput) => apiFetch<DeliveryOrder>(`/api/ar/delivery-orders/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  cancelDeliveryOrder: (id: string, reason: string) => apiFetch<DeliveryOrder>(`/api/ar/delivery-orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  getDeliveryWorkOrders: (q: string) => apiFetch<DeliveryOrderWorkOrder[]>(`/api/ar/delivery-orders/work-orders?q=${encodeURIComponent(q)}`),

  getInvoices: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<Invoice[] | { items: Invoice[] }>(`/api/ar/invoices${q ? `?${q}` : ""}`);
  },
  getInvoice: (id: string) => apiFetch<Invoice>(`/api/ar/invoices/${encodeURIComponent(id)}`),
  getInvoiceSources: (q: string, exceptId?: string) => apiFetch<InvoiceSource[]>(`/api/ar/invoices/sources?q=${encodeURIComponent(q)}${exceptId ? `&exceptId=${encodeURIComponent(exceptId)}` : ""}`),
  getReusableInvoiceNumbers: (month: string) => apiFetch<ReusableInvoiceNumber[]>(`/api/ar/invoices/reusable-numbers?month=${encodeURIComponent(month)}`),
  createInvoice: (data: InvoiceInput) => apiFetch<Invoice>("/api/ar/invoices", { method: "POST", body: JSON.stringify(data) }),
  updateInvoice: (id: string, data: InvoiceInput) => apiFetch<Invoice>(`/api/ar/invoices/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  confirmInvoice: (id: string, updatedAt: string) => apiFetch<Invoice>(`/api/ar/invoices/${encodeURIComponent(id)}/confirm`, { method: "POST", body: JSON.stringify({ updatedAt }) }),
  cancelInvoice: (id: string, updatedAt: string, reason: string) => apiFetch<Invoice>(`/api/ar/invoices/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ updatedAt, reason }) }),

  getBillingNotes: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<BillingNote[]>(`/api/ar/billing-notes${q ? `?${q}` : ""}`);
  },
  getBillingNote: (id: string) => apiFetch<BillingNote>(`/api/ar/billing-notes/${encodeURIComponent(id)}`),
  getBillingSources: (params: Record<string, string>) => apiFetch<BillingSource[]>(`/api/ar/billing-notes/sources?${new URLSearchParams(params)}`),
  createBillingNote: (data: BillingInput) => apiFetch<BillingNote>("/api/ar/billing-notes", { method: "POST", body: JSON.stringify(data) }),
  updateBillingNote: (id: string, data: BillingInput) => apiFetch<BillingNote>(`/api/ar/billing-notes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  confirmBillingNote: (id: string, updatedAt: string) => apiFetch<BillingNote>(`/api/ar/billing-notes/${encodeURIComponent(id)}/confirm`, { method: "POST", body: JSON.stringify({ updatedAt }) }),
  cancelBillingNote: (id: string, updatedAt: string, reason: string) => apiFetch<BillingNote>(`/api/ar/billing-notes/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ updatedAt, reason }) }),

  getCreditNotes: (params?: Record<string, string>) => apiFetch<CreditNote[]>(`/api/ar/credit-notes?${new URLSearchParams(params)}`),
  getCreditNote: (id: string) => apiFetch<CreditNote>(`/api/ar/credit-notes/${encodeURIComponent(id)}`),
  getCreditSources: (q: string) => apiFetch<CreditSource[]>(`/api/ar/credit-notes/sources?q=${encodeURIComponent(q)}`),
  getCreditSource: (id: string) => apiFetch<CreditSource>(`/api/ar/credit-notes/sources/${encodeURIComponent(id)}`),
  createCreditNote: (data: CreditInput) => apiFetch<CreditNote>("/api/ar/credit-notes", { method: "POST", body: JSON.stringify(data) }),
  updateCreditNote: (id: string, data: CreditInput) => apiFetch<CreditNote>(`/api/ar/credit-notes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  confirmCreditNote: (id: string, updatedAt: string) => apiFetch<CreditNote>(`/api/ar/credit-notes/${encodeURIComponent(id)}/confirm`, { method: "POST", body: JSON.stringify({ updatedAt }) }),
  cancelCreditNote: (id: string, updatedAt: string, reason: string) => apiFetch<CreditNote>(`/api/ar/credit-notes/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ updatedAt, reason }) }),

  getReceiptVouchers: (params?: Record<string, string>) => apiFetch<ReceiptVoucher[]>(`/api/ar/receipt-vouchers?${new URLSearchParams(params)}`),
  getReceiptVoucher: (id: string) => apiFetch<ReceiptVoucher>(`/api/ar/receipt-vouchers/${encodeURIComponent(id)}`),
  getReceiptSources: (params: Record<string, string>) => apiFetch<ReceiptSources>(`/api/ar/receipt-vouchers/sources?${new URLSearchParams(params)}`),
  createReceiptVoucher: (data: ReceiptInput) => apiFetch<ReceiptVoucher>("/api/ar/receipt-vouchers", { method: "POST", body: JSON.stringify(data) }),
  updateReceiptVoucher: (id: string, data: ReceiptInput) => apiFetch<ReceiptVoucher>(`/api/ar/receipt-vouchers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  confirmReceiptVoucher: (id: string, updatedAt: string) => apiFetch<ReceiptVoucher>(`/api/ar/receipt-vouchers/${encodeURIComponent(id)}/confirm`, { method: "POST", body: JSON.stringify({ updatedAt }) }),
  cancelReceiptVoucher: (id: string, updatedAt: string, reason: string) => apiFetch<ReceiptVoucher>(`/api/ar/receipt-vouchers/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ updatedAt, reason }) }),
  uploadReceiptFiles: async (id: string, updatedAt: string, files: File[]): Promise<ReceiptAttachment[]> => {
    const form = new FormData();
    form.set("receiptVoucherId", id); form.set("updatedAt", updatedAt);
    files.forEach(file => form.append("files", file));
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    const response = await fetch("/api/upload", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `อัปโหลดไม่สำเร็จ (${response.status})`);
    return data;
  },
  deleteReceiptFile: (id: string, updatedAt: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt }) }),
};

// ─── ACCOUNTS PAYABLE (AP) ───────────────────────────────────────────────────
export const ApApi = {
  getPurchaseRequests: (q = "") => apiFetch<PurchaseRequestReference[]>(`/api/ap/purchase-requests${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getPurchaseOrders: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<PurchaseOrderDocument[]>(`/api/ap/purchase-orders${q ? `?${q}` : ""}`);
  },
  getPurchaseOrder: (id: string) => apiFetch<PurchaseOrderDocument>(`/api/ap/purchase-orders/${encodeURIComponent(id)}`),
  createPurchaseOrder: (data: PurchaseOrderInput) => apiFetch<PurchaseOrderDocument>("/api/ap/purchase-orders", { method: "POST", body: JSON.stringify(data) }),
  updatePurchaseOrder: (id: string, data: PurchaseOrderInput & { updatedAt: string }) => apiFetch<PurchaseOrderDocument>(`/api/ap/purchase-orders/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  purchaseOrderAction: (id: string, action: PurchaseOrderAction, updatedAt: string, reason?: string) =>
    apiFetch<PurchaseOrderDocument>(`/api/ap/purchase-orders/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify({ updatedAt, reason }) }),
  deletePurchaseOrderFile: (id: string, updatedAt: string) => apiFetch(`/api/upload/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ updatedAt }) }),
  uploadPurchaseOrderFiles: async (id: string, files: File[], updatedAt: string): Promise<PurchaseOrderAttachment[]> => {
    const form = new FormData();
    form.set("category", "accounting-po");
    form.set("purchaseOrderId", id);
    form.set("updatedAt", updatedAt);
    files.forEach(file => form.append("files", file));
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `อัปโหลดไฟล์ไม่สำเร็จ (${response.status})`);
    return data;
  },

  createContractorPayment: (data: import("./contractor-payment").PaymentInput) => apiFetch<import("./contractor-payment").ContractorPayment>("/api/ap/contractor-payments", { method: "POST", body: JSON.stringify(data) }),

  createGoodsReceipt: (data: import("./goods-receipt").ReceiptInput) =>
    apiFetch<import("./goods-receipt").GoodsReceipt>("/api/ap/goods-receipts", { method: "POST", body: JSON.stringify(data) }),

  createPaymentVoucher: (data: import("./payment-voucher").VoucherInput) => apiFetch<import("./payment-voucher").PaymentVoucher>("/api/ap/payment-vouchers", { method: "POST", body: JSON.stringify(data) }),

  createChequePayment: (data: import("./cheque-payment").ChequeInput) => apiFetch<import("./cheque-payment").ChequePayment>("/api/ap/cheque-payments", { method: "POST", body: JSON.stringify(data) }),
  updateChequeStatus: (id: string, data: import("./cheque-payment").ChequeActionInput & { status: import("./cheque-payment").ChequeStatus; updatedAt: string }) =>
    apiFetch<import("./cheque-payment").ChequePayment>(`/api/ap/cheque-payments/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify(data) }),
};

// ─── INVENTORY ───────────────────────────────────────────────────────────────
export const InventoryApi = {
  getIssues: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/inventory/issues${q ? `?${q}` : ""}`);
  },
  createIssue: (data: import("./stock-issue").IssueInput) =>
    apiFetch<import("./stock-issue").StockIssue>("/api/inventory/issues", { method: "POST", body: JSON.stringify(data) }),

  createReturn: (data: import("./stock-return").ReturnInput) =>
    apiFetch<import("./stock-return").StockReturn>("/api/inventory/returns", { method: "POST", body: JSON.stringify(data) }),

  getMovements: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/inventory/movements${q ? `?${q}` : ""}`);
  },
  getStockCard: (params: import("./stock-card").StockCardFilters) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch<import("./stock-card").StockCardReport>(`/api/inventory/stock-card?${q}`);
  },
  getStockCardLookups: () => apiFetch<import("./stock-card").StockCardLookups>("/api/inventory/stock-card/lookups"),
  getBalances: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/inventory/balances${q ? `?${q}` : ""}`);
  },
};

// ─── REPORTS ─────────────────────────────────────────────────────────────────
export const ReportsApi = {
  getArAging: (asOfDate?: string) => apiFetch(`/api/accounting-reports/ar/aging${asOfDate ? `?asOfDate=${asOfDate}` : ""}`),
  getApAging: (asOfDate?: string) => apiFetch(`/api/accounting-reports/ap/aging${asOfDate ? `?asOfDate=${asOfDate}` : ""}`),
  getReconDeliveryToInvoice: () => apiFetch("/api/accounting-reports/recon/delivery-to-invoice"),
  getReconPoToGoodsReceipt: () => apiFetch("/api/accounting-reports/recon/po-to-goods-receipt"),
};

export const AccountingSettingsApi = {
  get: () => apiFetch<PurchaseOrderCompanySettings>("/api/settings"),
};
