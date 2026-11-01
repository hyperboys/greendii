import { apiFetch } from "@/lib/api";

export type GlMapping = { role: string; accountId: string; code?: string; name?: string };
export type GlConfiguration = {
  revision: number; fiscalYearStartMonth: number; mappings: GlMapping[]; policyNotes: string;
  updatedAt: string | null; postingEnabled: false; closingEnabled: false;
};
export type GlSettings = {
  config: GlConfiguration; roles: Record<string, string>; accounts: { id: string; code: string; name: string }[];
};
export const AccountingGlApi = {
  get: () => apiFetch<GlSettings>("/api/accounting-gl"),
  save: (config: Pick<GlConfiguration, "revision" | "fiscalYearStartMonth" | "policyNotes"> & { mappings: { role: string; accountId: string }[] }) =>
    apiFetch<GlConfiguration>("/api/accounting-gl", { method: "PUT", body: JSON.stringify(config) }),
};
