export const masterEndpoints = {
  customers: "/api/account-customers", sales: "/api/account-sales", suppliers: "/api/suppliers",
  products: "/api/account-products", warehouses: "/api/warehouses", coa: "/api/chart-of-accounts",
} as const;
export type MasterKind = keyof typeof masterEndpoints;
export type MasterMode = "list" | "new" | "view" | "edit";
export type MasterRow = {
  id: string; code: string; name: string; active: boolean; updatedAt?: string; createdAt?: string;
  tel?: string | null; email?: string | null; category?: string | null; unit?: string | null;
  productType?: string; vatConfig?: string | null; price?: string | number; cost?: string | number;
  description?: string | null; location?: string | null; accountType?: string; accountMapping?: string | null;
};
export type MasterDraft = {
  code: string; name: string; active: boolean; updatedAt?: string; tel: string; email: string;
  category: string; unit: string; productType: string; vatConfig: string; price: string; cost: string;
  description: string; location: string; accountType: string; accountMapping: string;
};
export function masterForm(row?: MasterRow): MasterDraft {
  return { code: row?.code ?? "", name: row?.name ?? "", active: row?.active ?? true, updatedAt: row?.updatedAt,
    tel: row?.tel ?? "", email: row?.email ?? "", category: row?.category ?? "", unit: row?.unit ?? "",
    productType: row?.productType ?? "stored", vatConfig: row?.vatConfig ?? "VAT7%",
    price: String(row?.price ?? "0"), cost: String(row?.cost ?? "0"), description: row?.description ?? "",
    location: row?.location ?? "", accountType: row?.accountType ?? "detail", accountMapping: row?.accountMapping ?? "" };
}
export function csvCell(value: unknown): string {
  const raw = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function masterCsv(rows: object[]): string {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return "\ufeff" + [columns.map(csvCell).join(","), ...rows.map(row => {
    const values = new Map(Object.entries(row));
    return columns.map(key => csvCell(values.get(key))).join(",");
  })].join("\r\n");
}
export function exportMasterCsv(kind: string, rows: object[]) {
  const url = URL.createObjectURL(new Blob([masterCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `accounting-${kind}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
