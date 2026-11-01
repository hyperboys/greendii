import { apiFetch } from "@/lib/api";

export type AccountingNotification = {
  id: string; docType: string; documentId: string; docNo: string | null; action: string;
  text: string; createdAt: string; readAt: string | null; href: string;
};
export type NotificationPage = {
  data: AccountingNotification[]; total: number; page: number; pageSize: number; totalPages: number; unreadCount: number;
};
export const AccountingNotificationsApi = {
  list: (page = 1) => apiFetch<NotificationPage>(`/api/accounting-notifications?page=${page}&pageSize=25`),
  read: (id: string) => apiFetch<{ message: string }>(`/api/accounting-notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
  readAll: () => apiFetch<{ message: string }>("/api/accounting-notifications/read-all", { method: "PATCH" }),
};
