export type AuthUser = {
  id: string;
  username: string;
  fullName?: string;
  role: string;
  mustChangePassword?: boolean;
};

type LoginResponse = {
  token: string;
  refreshToken: string;
  user: AuthUser;
  mustChangePassword?: boolean;
};

const TOKEN_KEY = "gd_token";
const REFRESH_KEY = "gd_refresh";
const USER_KEY = "gd_user";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "ไม่สามารถเชื่อมต่อระบบได้");
  }
  return data as T;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null") as AuthUser | null;
  } catch {
    return null;
  }
}

export function hasSession() {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(TOKEN_KEY));
}

export async function login(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseResponse<LoginResponse>(response);
  const user = {
    ...data.user,
    mustChangePassword: data.user.mustChangePassword ?? data.mustChangePassword,
  };
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  await parseResponse(response);
  const user = getStoredUser();
  if (user) localStorage.setItem(USER_KEY, JSON.stringify({ ...user, mustChangePassword: false }));
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function logout() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (refreshToken) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}