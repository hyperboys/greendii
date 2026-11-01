import { apiFetch } from "./api";

type LogUser = { fullName: string; role: string };
export type AuditLogRow = {
  id: string; createdAt: string; entityType: string; entityId: string; docNo: string | null;
  action: string; performedById: string | null; performedBy: (LogUser & { username: string }) | null;
  reason: string | null; changedFields: string[] | null; oldValue: unknown; newValue: unknown;
  requestId: string | null; ipAddress: string | null;
};
export type ActivityLogRow = {
  id: string; createdAt: string; username: string | null; user: LogUser | null;
  method: string; path: string; statusCode: number; durationMs: number; ipAddress: string | null;
};
export type LogFilters = {
  page: string; limit: string; search: string; user: string; from: string; to: string;
  entityType: string; action: string; method: string; status: string;
};
type LogResult<T> = { rows: T[]; total: number; page: number; limit: number };
export const AccountingLogsApi = {
  audit: (filters: LogFilters) => apiFetch<LogResult<AuditLogRow> & { entityTypes: Record<string, string> }>(
    `/api/accounting-logs?${new URLSearchParams(filters)}`),
  activity: (filters: LogFilters) => apiFetch<LogResult<ActivityLogRow>>(
    `/api/accounting-logs/activity?${new URLSearchParams(filters)}`),
};
export function logDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}
export function activityPath(value: string) {
  return {
    path: value.replace(/\s*\[(?:rid|act|err):[^\]]+\]/g, "").trim(),
    requestId: value.match(/\[rid:([^\]]+)\]/)?.[1],
    action: value.match(/\[act:([^\]]+)\]/)?.[1],
    error: value.match(/\[err:([^\]]+)\]/)?.[1],
  };
}
