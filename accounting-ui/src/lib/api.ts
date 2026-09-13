/**
 * API client for accounting-ui
 * Handles authentication headers, error parsing, and structured requests.
 */

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
export const MasterApi = {
  getCustomers: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/account-customers${q ? `?${q}` : ""}`);
  },
  createCustomer: (data: any) => apiFetch("/api/account-customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: any) => apiFetch(`/api/account-customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  getSuppliers: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/suppliers${q ? `?${q}` : ""}`);
  },
  createSupplier: (data: any) => apiFetch("/api/suppliers", { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: any) => apiFetch(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),

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
    return apiFetch(`/api/ar/delivery-orders${q ? `?${q}` : ""}`);
  },
  createDeliveryOrder: (data: any) => apiFetch("/api/ar/delivery-orders", { method: "POST", body: JSON.stringify(data) }),

  getInvoices: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/ar/invoices${q ? `?${q}` : ""}`);
  },
  createInvoice: (data: any) => apiFetch("/api/ar/invoices", { method: "POST", body: JSON.stringify(data) }),

  getBillingNotes: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/ar/billing-notes${q ? `?${q}` : ""}`);
  },
  createBillingNote: (data: any) => apiFetch("/api/ar/billing-notes", { method: "POST", body: JSON.stringify(data) }),

  createCreditNote: (data: any) => apiFetch("/api/ar/credit-notes", { method: "POST", body: JSON.stringify(data) }),

  createReceiptVoucher: (data: any) => apiFetch("/api/ar/receipt-vouchers", { method: "POST", body: JSON.stringify(data) }),
};

// ─── ACCOUNTS PAYABLE (AP) ───────────────────────────────────────────────────
export const ApApi = {
  getPurchaseOrders: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/ap/purchase-orders${q ? `?${q}` : ""}`);
  },
  createPurchaseOrder: (data: any) => apiFetch("/api/ap/purchase-orders", { method: "POST", body: JSON.stringify(data) }),

  createContractorPayment: (data: any) => apiFetch("/api/ap/contractor-payments", { method: "POST", body: JSON.stringify(data) }),

  createGoodsReceipt: (data: any) => apiFetch("/api/ap/goods-receipts", { method: "POST", body: JSON.stringify(data) }),

  createPaymentVoucher: (data: any) => apiFetch("/api/ap/payment-vouchers", { method: "POST", body: JSON.stringify(data) }),

  createChequePayment: (data: any) => apiFetch("/api/ap/cheque-payments", { method: "POST", body: JSON.stringify(data) }),
  updateChequeStatus: (id: string, data: any) => apiFetch(`/api/ap/cheque-payments/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),
};

// ─── INVENTORY ───────────────────────────────────────────────────────────────
export const InventoryApi = {
  getIssues: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/inventory/issues${q ? `?${q}` : ""}`);
  },
  createIssue: (data: any) => apiFetch("/api/inventory/issues", { method: "POST", body: JSON.stringify(data) }),

  createReturn: (data: any) => apiFetch("/api/inventory/returns", { method: "POST", body: JSON.stringify(data) }),

  getMovements: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/inventory/movements${q ? `?${q}` : ""}`);
  },
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
