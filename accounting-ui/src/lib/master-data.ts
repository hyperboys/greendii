export const masterEndpoints = {
  customers: "/api/account-customers", sales: "/api/account-sales", suppliers: "/api/suppliers",
  products: "/api/account-products", warehouses: "/api/warehouses", coa: "/api/chart-of-accounts",
  units: "/api/account-units",
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
export type ProductImportProduct = {
  code: string; name: string; unit: string; productType: "stored" | "manufactured" | "service"; vatConfig: "VAT7%";
  price: number; cost: number; active: true;
};
export function masterForm(row?: MasterRow): MasterDraft {
  return { code: row?.code ?? "", name: row?.name ?? "", active: row?.active ?? true, updatedAt: row?.updatedAt,
    tel: row?.tel ?? "", email: row?.email ?? "", category: row?.category ?? "", unit: row?.unit ?? "",
    productType: row?.productType ?? "stored", vatConfig: row?.vatConfig ?? "VAT7%",
    price: String(row?.price ?? "0"), cost: String(row?.cost ?? "0"), description: row?.description ?? "",
    location: row?.location ?? "", accountType: row?.accountType ?? "detail", accountMapping: row?.accountMapping ?? "" };
}
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("ไฟล์ CSV มีเครื่องหมายอัญประกาศไม่ครบ");
  row.push(field.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}
export function parseProductReportCsv(text: string): ProductImportProduct[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex(row => row[1] === "รหัสสินค้า" && row[4] === "ชื่อสินค้า" && row[7] === "หน่วยนับหลัก");
  if (headerIndex < 0) throw new Error("ไม่พบหัวตารางรายงานสินค้า: ต้องมีรหัสสินค้า, ชื่อสินค้า และหน่วยนับหลัก");
  const products: ProductImportProduct[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.slice(headerIndex + 1).entries()) {
    const code = row[1] ?? "", name = row[4] ?? "", unit = row[7] ?? "";
    if (!code && !name && !unit) continue;
    if (!code || !name) throw new Error(`แถว ${headerIndex + index + 2} ต้องมีรหัสและชื่อสินค้า`);
    if (code.length > 100 || name.length > 500 || unit.length > 100) throw new Error(`ข้อมูลสินค้าแถว ${headerIndex + index + 2} ยาวเกินกำหนด`);
    const key = code.toLocaleLowerCase("en");
    if (seen.has(key)) throw new Error(`รหัสสินค้า ${code} ซ้ำในไฟล์`);
    seen.add(key);
    products.push({ code, name, unit, productType: "stored", vatConfig: "VAT7%", price: 0, cost: 0, active: true });
  }
  if (!products.length || products.length > 2000) throw new Error("ไฟล์ต้องมีรายการสินค้า 1-2,000 รายการ");
  return products;
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
