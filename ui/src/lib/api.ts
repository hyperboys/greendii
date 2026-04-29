import axios from 'axios'
import type {
  User, Customer, Product, Unit,
  Quotation, WorkOrder, HandOverJob, PurchaseRequest,
  PendingApprovals, ReportOverview, ReportSales, ReportApprovalPerf,
  Attachment,
} from '@/types'

// ─── AXIOS INSTANCE ──────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

export const http = axios.create({ baseURL: BASE })

// Attach token to every request
http.interceptors.request.use((cfg) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('gd_token')
    if (token) cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

// Handle 401 → redirect to login
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('gd_token')
      localStorage.removeItem('gd_user')
      window.location.href = '/login'
    }
    return Promise.reject(err.response?.data?.message || err.message || 'Request failed')
  }
)

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const AuthAPI = {
  login: (username: string, password: string) =>
    http.post<{ token: string; user: User; mustChangePassword: boolean }>('/auth/login', { username, password }).then(r => r.data),
  me: () => http.get<User>('/auth/me').then(r => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.post('/auth/change-password', { oldPassword, newPassword }).then(r => r.data),
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export const UsersAPI = {
  list: () => http.get<User[]>('/users').then(r => r.data),
  create: (data: Partial<User> & { password: string }) =>
    http.post<User>('/users', data).then(r => r.data),
  update: (id: string, data: Partial<User>) =>
    http.put<User>(`/users/${id}`, data).then(r => r.data),
  setPassword: (id: string, newPassword: string) =>
    http.put(`/users/${id}/password`, { newPassword }).then(r => r.data),
  deactivate: (id: string) => http.delete(`/users/${id}`).then(r => r.data),
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

export const CustomersAPI = {
  list: (params?: Record<string, string>) =>
    http.get<Customer[]>('/customers', { params }).then(r => r.data),
  get: (id: string) => http.get<Customer>(`/customers/${id}`).then(r => r.data),
  create: (data: Partial<Customer>) => http.post<Customer>('/customers', data).then(r => r.data),
  update: (id: string, data: Partial<Customer>) =>
    http.put<Customer>(`/customers/${id}`, data).then(r => r.data),
  delete: (id: string) => http.delete(`/customers/${id}`).then(r => r.data),
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export const ProductsAPI = {
  list: (params?: Record<string, string>) =>
    http.get<Product[]>('/products', { params }).then(r => r.data),
  get: (id: string) => http.get<Product>(`/products/${id}`).then(r => r.data),
  create: (data: Partial<Product>) => http.post<Product>('/products', data).then(r => r.data),
  update: (id: string, data: Partial<Product>) =>
    http.put<Product>(`/products/${id}`, data).then(r => r.data),
  delete: (id: string) => http.delete(`/products/${id}`).then(r => r.data),
}

// ─── UNITS ────────────────────────────────────────────────────────────────────

export const UnitsAPI = {
  list: (params?: Record<string, string>) =>
    http.get<Unit[]>('/units', { params }).then(r => r.data),
  create: (data: { name: string }) => http.post<Unit>('/units', data).then(r => r.data),
  update: (id: string, data: Partial<Unit>) =>
    http.put<Unit>(`/units/${id}`, data).then(r => r.data),
  delete: (id: string) => http.delete(`/units/${id}`).then(r => r.data),
}

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────

export const QuotationsAPI = {
  list: (params?: Record<string, string>) =>
    http.get<Quotation[]>('/quotations', { params }).then(r => r.data),
  get: (id: string) => http.get<Quotation>(`/quotations/${id}`).then(r => r.data),
  create: (data: Partial<Quotation>) => http.post<Quotation>('/quotations', data).then(r => r.data),
  update: (id: string, data: Partial<Quotation>) =>
    http.put<Quotation>(`/quotations/${id}`, data).then(r => r.data),
  submit: (id: string, comment?: string) =>
    http.post<Quotation>(`/quotations/${id}/submit`, { comment }).then(r => r.data),
  approve: (id: string, comment?: string) =>
    http.post<Quotation>(`/quotations/${id}/approve`, { comment }).then(r => r.data),
  reject: (id: string, comment?: string) =>
    http.post<Quotation>(`/quotations/${id}/reject`, { comment }).then(r => r.data),
  cancel: (id: string) => http.delete(`/quotations/${id}`).then(r => r.data),
}

// ─── WORK ORDERS ──────────────────────────────────────────────────────────────

export const WorkOrdersAPI = {
  list: (params?: Record<string, string>) =>
    http.get<WorkOrder[]>('/workorders', { params }).then(r => r.data),
  get: (id: string) => http.get<WorkOrder>(`/workorders/${id}`).then(r => r.data),
  create: (data: Partial<WorkOrder>) => http.post<WorkOrder>('/workorders', data).then(r => r.data),
  update: (id: string, data: Partial<WorkOrder>) =>
    http.put<WorkOrder>(`/workorders/${id}`, data).then(r => r.data),
  submit: (id: string, comment?: string) =>
    http.post<WorkOrder>(`/workorders/${id}/submit`, { comment }).then(r => r.data),
  approve: (id: string, comment?: string) =>
    http.post<WorkOrder>(`/workorders/${id}/approve`, { comment }).then(r => r.data),
  reject: (id: string, comment?: string) =>
    http.post<WorkOrder>(`/workorders/${id}/reject`, { comment }).then(r => r.data),
}

// ─── HAND OVER JOBS ───────────────────────────────────────────────────────────

export const HandoversAPI = {
  list: (params?: Record<string, string>) =>
    http.get<HandOverJob[]>('/handovers', { params }).then(r => r.data),
  get: (id: string) => http.get<HandOverJob>(`/handovers/${id}`).then(r => r.data),
  create: (data: Partial<HandOverJob>) => http.post<HandOverJob>('/handovers', data).then(r => r.data),
  update: (id: string, data: Partial<HandOverJob>) =>
    http.put<HandOverJob>(`/handovers/${id}`, data).then(r => r.data),
}

// ─── PURCHASE REQUESTS ────────────────────────────────────────────────────────

export const PRAPI = {
  list: (params?: Record<string, string>) =>
    http.get<PurchaseRequest[]>('/pr', { params }).then(r => r.data),
  get: (id: string) => http.get<PurchaseRequest>(`/pr/${id}`).then(r => r.data),
  create: (data: Partial<PurchaseRequest>) =>
    http.post<PurchaseRequest>('/pr', data).then(r => r.data),
  update: (id: string, data: Partial<PurchaseRequest>) =>
    http.put<PurchaseRequest>(`/pr/${id}`, data).then(r => r.data),
  submit: (id: string) => http.post<PurchaseRequest>(`/pr/${id}/submit`, {}).then(r => r.data),
  approve: (id: string, comment?: string) =>
    http.post<PurchaseRequest>(`/pr/${id}/approve`, { comment }).then(r => r.data),
  reject: (id: string, comment?: string) =>
    http.post<PurchaseRequest>(`/pr/${id}/reject`, { comment }).then(r => r.data),
}

// ─── APPROVALS ────────────────────────────────────────────────────────────────

export const ApprovalsAPI = {
  pending: () => http.get<PendingApprovals>('/approvals/pending').then(r => r.data),
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────

export const ReportsAPI = {
  overview: () => http.get<ReportOverview>('/reports/overview').then(r => r.data),
  sales: () => http.get<ReportSales[]>('/reports/sales').then(r => r.data),
  approvalPerformance: () =>
    http.get<ReportApprovalPerf[]>('/reports/approval-performance').then(r => r.data),
}

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────

export const UploadAPI = {
  upload: (files: File[], meta?: Record<string, string>) => {
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    if (meta) Object.entries(meta).forEach(([k, v]) => v && form.append(k, v))
    return http.post<Attachment[]>('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  delete: (id: string) => http.delete(`/upload/${id}`).then(r => r.data),
}
