/**
 * Green Dii API Client
 * Replaces localStorage with real HTTP calls to the backend API.
 * Usage: include this script before app logic.
 */

const API_BASE = window.API_BASE || 'http://localhost:4000/api';

// ─── TOKEN MANAGEMENT ────────────────────────────────────────────────────────

const Auth = {
  getToken: () => localStorage.getItem('gd_token'),
  setToken: (t) => localStorage.setItem('gd_token', t),
  clear: () => { localStorage.removeItem('gd_token'); localStorage.removeItem('gd_user'); },
  getUser: () => {
    const u = localStorage.getItem('gd_user');
    return u ? JSON.parse(u) : null;
  },
  setUser: (u) => localStorage.setItem('gd_user', JSON.stringify(u)),
};

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });

  if (res.status === 401) {
    Auth.clear();
    window.location.reload();
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

const api = {
  get:    (path)         => apiFetch(path, { method: 'GET' }),
  post:   (path, body)   => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)   => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)         => apiFetch(path, { method: 'DELETE' }),
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────

const AuthAPI = {
  async login(username, password) {
    const data = await api.post('/auth/login', { username, password });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data.user;
  },
  logout() {
    Auth.clear();
  },
  me: () => api.get('/auth/me'),
  changePassword: (oldPassword, newPassword) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
};

// ─── USERS ────────────────────────────────────────────────────────────────────

const UsersAPI = {
  list: ()           => api.get('/users'),
  create: (data)     => api.post('/users', data),
  update: (id, data) => api.put('/users/' + id, data),
  setPassword: (id, newPassword) => api.put('/users/' + id + '/password', { newPassword }),
  deactivate: (id)   => api.delete('/users/' + id),
};

// ─── MASTER DATA ──────────────────────────────────────────────────────────────

const CustomersAPI = {
  list: (params = {}) => api.get('/customers?' + new URLSearchParams(params)),
  get: (id)           => api.get('/customers/' + id),
  create: (data)      => api.post('/customers', data),
  update: (id, data)  => api.put('/customers/' + id, data),
  delete: (id)        => api.delete('/customers/' + id),
};

const ProductsAPI = {
  list: (params = {}) => api.get('/products?' + new URLSearchParams(params)),
  get: (id)           => api.get('/products/' + id),
  create: (data)      => api.post('/products', data),
  update: (id, data)  => api.put('/products/' + id, data),
  delete: (id)        => api.delete('/products/' + id),
};

const UnitsAPI = {
  list: (params = {}) => api.get('/units?' + new URLSearchParams(params)),
  create: (data)      => api.post('/units', data),
  update: (id, data)  => api.put('/units/' + id, data),
  delete: (id)        => api.delete('/units/' + id),
};

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────

const QuotationsAPI = {
  list: (params = {}) => api.get('/quotations?' + new URLSearchParams(params)),
  get: (id)           => api.get('/quotations/' + id),
  create: (data)      => api.post('/quotations', data),
  update: (id, data)  => api.put('/quotations/' + id, data),
  submit: (id, comment) => api.post('/quotations/' + id + '/submit', { comment }),
  approve: (id, comment) => api.post('/quotations/' + id + '/approve', { comment }),
  reject: (id, comment)  => api.post('/quotations/' + id + '/reject',  { comment }),
  cancel: (id)        => api.delete('/quotations/' + id),
};

// ─── WORK ORDERS ──────────────────────────────────────────────────────────────

const WorkOrdersAPI = {
  list: (params = {}) => api.get('/workorders?' + new URLSearchParams(params)),
  get: (id)           => api.get('/workorders/' + id),
  create: (data)      => api.post('/workorders', data),
  update: (id, data)  => api.put('/workorders/' + id, data),
  submit: (id, comment) => api.post('/workorders/' + id + '/submit', { comment }),
  approve: (id, comment) => api.post('/workorders/' + id + '/approve', { comment }),
  reject: (id, comment)  => api.post('/workorders/' + id + '/reject',  { comment }),
};

// ─── HAND OVER JOBS ───────────────────────────────────────────────────────────

const HandoversAPI = {
  list: (params = {}) => api.get('/handovers?' + new URLSearchParams(params)),
  get: (id)           => api.get('/handovers/' + id),
  create: (data)      => api.post('/handovers', data),
  update: (id, data)  => api.put('/handovers/' + id, data),
};

// ─── PURCHASE REQUESTS ────────────────────────────────────────────────────────

const PRAPI = {
  list: (params = {}) => api.get('/pr?' + new URLSearchParams(params)),
  get: (id)           => api.get('/pr/' + id),
  create: (data)      => api.post('/pr', data),
  update: (id, data)  => api.put('/pr/' + id, data),
  submit: (id)        => api.post('/pr/' + id + '/submit', {}),
  approve: (id, comment) => api.post('/pr/' + id + '/approve', { comment }),
  reject: (id, comment)  => api.post('/pr/' + id + '/reject',  { comment }),
};

// ─── APPROVALS ────────────────────────────────────────────────────────────────

const ApprovalsAPI = {
  pending: () => api.get('/approvals/pending'),
};

// ─── REPORTS ─────────────────────────────────────────────────────────────────

const ReportsAPI = {
  overview:           () => api.get('/reports/overview'),
  sales:              () => api.get('/reports/sales'),
  approvalPerformance:() => api.get('/reports/approval-performance'),
};

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────

const UploadAPI = {
  async upload(files, meta = {}) {
    const token = Auth.getToken();
    const form = new FormData();
    for (const file of files) form.append('files', file);
    for (const [k, v] of Object.entries(meta)) if (v) form.append(k, v);
    const res = await fetch(API_BASE + '/upload', {
      method: 'POST',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Upload failed ${res.status}`);
    return data;
  },
  delete: (id) => api.delete('/upload/' + id),
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────

window.GD = {
  Auth, AuthAPI, UsersAPI,
  CustomersAPI, ProductsAPI, UnitsAPI,
  QuotationsAPI, WorkOrdersAPI, HandoversAPI,
  PRAPI, ApprovalsAPI, ReportsAPI, UploadAPI,
};
