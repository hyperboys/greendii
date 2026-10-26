export const invoiceTabs = [
  { id: "invoices", label: "ใบแจ้งหนี้ / ใบกำกับภาษี" },
  { id: "so", label: "ใบส่งของชั่วคราว" },
  { id: "billingNotes", label: "ใบวางบิล" },
] as const;

export const payableTabs = [
  { id: "po", label: "ใบสั่งซื้อ (PO)" },
  { id: "ps", label: "ใบเบิกจ่ายผู้รับเหมา (PS)" },
  { id: "gr", label: "ใบตรวจรับ (GR)" },
  { id: "pv", label: "ใบสำคัญจ่าย (PV)" },
  { id: "cq", label: "การจ่ายเงิน / เช็คจ่าย" },
] as const;

export const inventoryTabs = [
  { id: "balances", label: "ยอดสินค้าคงเหลือ" },
  { id: "movements", label: "ประวัติการเคลื่อนย้ายสินค้า" },
  { id: "issues", label: "เบิกสินค้า (IS)" },
] as const;

export const masterTabs = [
  { id: "customers", label: "ลูกค้า (Customer)" },
  { id: "sales", label: "Sale บัญชี" },
  { id: "suppliers", label: "ผู้จำหน่าย / ผู้รับเหมา" },
  { id: "products", label: "สินค้า & บริการ" },
  { id: "warehouses", label: "คลังสินค้า" },
  { id: "coa", label: "ผังบัญชี" },
] as const;

export const reportTabs = [
  { id: "arAging", label: "วิเคราะห์อายุลูกหนี้" },
  { id: "apAging", label: "วิเคราะห์อายุเจ้าหนี้" },
  { id: "reconDelivery", label: "กระทบยอดส่งของ / ใบแจ้งหนี้" },
  { id: "reconPo", label: "กระทบยอดใบสั่งซื้อ / รับสินค้า" },
] as const;

export type AccountingSearchParams = { tab?: string | string[] };

export function selectedTab<T extends string>(tabs: readonly { id: T }[], value?: string | string[]): T {
  return tabs.find(tab => tab.id === value)?.id ?? tabs[0].id;
}

export function isPublicAccountingPath(pathname: string) {
  return ["/login", "/forgot-password", "/change-password"].includes(pathname);
}
