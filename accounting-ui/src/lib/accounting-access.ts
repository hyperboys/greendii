import { apiFetch } from "./api";

export type AccountingModule = "ar" | "ap" | "inventory" | "master" | "reports";
export type AccountingAction = "view" | "create" | "update" | "delete" | "approve" | "cancel" | "pay";
export type AccountingPermission = `${AccountingModule}.${AccountingAction}`;

export type AccountingAccess = {
  allowed: boolean;
  isAdmin: boolean;
  role: { id: string; name: string } | null;
  permissions: AccountingPermission[];
};

export type AccountingRole = {
  id: string;
  name: string;
  permissions: AccountingPermission[];
  _count?: { assignments: number };
};

export type AccountingUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  active: boolean;
  accountingAssignment: { roleId: string } | null;
};

export type NewAccountingUser = {
  username: string;
  password: string;
  fullName: string;
  initials: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  lineUserId: string;
  roleId: string;
};

export type PermissionModule = {
  key: AccountingModule;
  label: string;
  actions: AccountingAction[];
};

export function canUseAccounting(access: AccountingAccess | null, module: AccountingModule, action: AccountingAction = "view") {
  return Boolean(access?.allowed && access.permissions.includes(`${module}.view`) &&
    access.permissions.includes(`${module}.${action}`));
}

export function canOpenAccountingPath(access: AccountingAccess, pathname: string) {
  if (!access.allowed) return false;
  if (pathname.startsWith("/settings")) return access.isAdmin;
  const paths: [string, AccountingModule][] = [
    ["/ar", "ar"],
    ["/ap", "ap"],
    ["/inventory", "inventory"],
    ["/master", "master"],
    ["/reports", "reports"],
  ];
  const resource = paths.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  return !resource || canUseAccounting(access, resource);
}

const BASE = "/api/accounting-access";
export const AccountingAccessApi = {
  me: () => apiFetch<AccountingAccess>(`${BASE}/me`),
  roles: () => apiFetch<{ modules: PermissionModule[]; roles: AccountingRole[] }>(`${BASE}/roles`),
  users: () => apiFetch<AccountingUser[]>(`${BASE}/users`),
  createUser: (data: NewAccountingUser) =>
    apiFetch<AccountingUser>(`${BASE}/users`, { method: "POST", body: JSON.stringify(data) }),
  createRole: (data: { name: string; permissions: AccountingPermission[] }) =>
    apiFetch<AccountingRole>(`${BASE}/roles`, { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: string, data: { name: string; permissions: AccountingPermission[] }) =>
    apiFetch<AccountingRole>(`${BASE}/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRole: (id: string) => apiFetch(`${BASE}/roles/${id}`, { method: "DELETE" }),
  assignRole: (userId: string, roleId: string | null) =>
    apiFetch(`${BASE}/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ roleId }) }),
};
