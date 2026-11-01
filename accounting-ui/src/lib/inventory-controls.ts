import { apiFetch } from "./api";
export type InventoryBalance = {
  id: string; warehouseId: string; productId: string; updatedAt: string;
  product?: { code: string; name: string; unit: string }; warehouse?: { code: string; name: string };
  onHand: string | number; reserved: string | number; available: string | number;
  lowStockThreshold: string | number | null; lowStock: boolean; valuationStatus: "valued" | "unvalued" | "blocked";
  totalValue: string | null; averageCost: string | null;
};
export type TransferInput = {
  sourceWarehouseId: string; destinationWarehouseId: string; transferDate: string; remark: string;
  items: { productId: string; quantity: string; productSnapshot?: { code: string; name: string; unit: string } }[];
};
export type Transfer = TransferInput & {
  id: string; transferNo: string; requestKey: string; revision: number; status: string; createdById: string;
  snapshot: { source: { code: string; name: string }; destination: { code: string; name: string } };
  movements?: { id: string; warehouseId: string; productId: string; qtyIn: string; qtyOut: string; costStatus: string; valueIn: string | null; valueOut: string | null; costProvenance: unknown }[];
  history?: { id: string; action: string; reason: string | null; createdAt: string; performedBy?: { fullName: string } }[];
};
export type CostInitialization = {
  id: string; warehouseId: string; productId: string; quantity: string; totalValue: string; evidence: string; asOf: string;
  status: string; createdById: string; revision: number; snapshot: { product: { code: string; name: string } };
};
export const inventoryCostPolicy = "ต้นทุนรับเข้า = สุทธิหลังส่วนลด ไม่รวม VAT รวมค่าขนส่ง/ค่าใช้จ่ายที่เป็นต้นทุนสินค้าซึ่งจัดสรรและตรวจสอบแล้ว ต้องระบุที่มา ไม่จัดสรรหรือเดาอัตโนมัติ";
export function transferActions(doc: Transfer, can: { create: boolean; approve: boolean; cancel: boolean }, userId?: string) {
  const actions: string[] = [];
  if (can.create && ["draft", "returned"].includes(doc.status)) actions.push("submit");
  if (can.approve && doc.status === "pending") {
    if (userId && userId !== doc.createdById) actions.push("approve");
    actions.push("return", "reject");
  }
  if (can.cancel && ["draft", "returned", "pending", "approved"].includes(doc.status)) actions.push("cancel");
  return actions;
}
const base = "/api/inventory";
export const InventoryControlsApi = {
  balances: () => apiFetch<InventoryBalance[]>(`${base}/valuations`),
  lookups: () => apiFetch<{ products: { id: string; code: string; name: string; unit: string; productType?: string }[]; warehouses: { id: string; code: string; name: string }[] }>(`${base}/stock-card/lookups`),
  threshold: (input: { warehouseId: string; productId: string; lowStockThreshold: string | null; updatedAt?: string }) =>
    apiFetch(`${base}/thresholds`, { method: "PUT", body: JSON.stringify(input) }),
  initializations: () => apiFetch<CostInitialization[]>(`${base}/cost-initializations`),
  initialize: (input: { requestKey: string; warehouseId: string; productId: string; quantity: string; totalValue: string; evidence: string; asOf: string; updatedAt: string }) =>
    apiFetch<CostInitialization>(`${base}/cost-initializations`, { method: "POST", body: JSON.stringify(input) }),
  initializationAction: (doc: CostInitialization, action: string, reason: string) => apiFetch(`${base}/cost-initializations/${encodeURIComponent(doc.id)}/${action}`,
    { method: "POST", body: JSON.stringify({ revision: doc.revision, reason }) }),
  transfers: (query: { q: string; status: string; page: string; pageSize: string }) =>
    apiFetch<{ data: Transfer[]; totalPages: number; total: number }>(`${base}/transfers?${new URLSearchParams(query)}`),
  transfer: (id: string) => apiFetch<Transfer>(`${base}/transfers/${encodeURIComponent(id)}`),
  createTransfer: (input: TransferInput & { requestKey: string }) => apiFetch<Transfer>(`${base}/transfers`, { method: "POST", body: JSON.stringify(input) }),
  updateTransfer: (doc: Transfer, input: TransferInput) => apiFetch<Transfer>(`${base}/transfers/${encodeURIComponent(doc.id)}`,
    { method: "PUT", body: JSON.stringify({ ...input, revision: doc.revision }) }),
  transferAction: (doc: Transfer, action: string, reason: string, cancellationDate: string, physicalReturnConfirmed: boolean) =>
    apiFetch<Transfer>(`${base}/transfers/${encodeURIComponent(doc.id)}/${action}`, { method: "POST",
      body: JSON.stringify({ revision: doc.revision, reason, cancellationDate, physicalReturnConfirmed }) }),
};
