import axios from 'axios'
import type {
  User, Customer, Product, Unit, PrType, Settings,
  Quotation, WorkOrder, HandOverJob, PurchaseRequest,
  PendingApprovals, ReportOverview, ReportSales, ReportApprovalPerf,
  WorkOrderNoPoReport, WorkOrderPoOverviewReport,
  Attachment, AuditPage, UserRole, ActivityLogPage, EmailLogPage,
  WorkOrderEmailCandidate, WorkOrderEmailContext, EmailHistoryEntry,
} from '@/types'

// ─── AXIOS INSTANCE ──────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
const API_ORIGIN = BASE.replace(/\/api\/?$/, '')

export const http = axios.create({ baseURL: BASE })

/** Resolve API-managed file URLs (e.g. /uploads/...) to absolute URLs. */
export function resolveFileUrl(fileUrl?: string): string {
  if (!fileUrl) return ''
  if (/^(https?:)?\/\//i.test(fileUrl) || fileUrl.startsWith('data:') || fileUrl.startsWith('blob:')) {
    return fileUrl
  }
  const path = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`
  return `${API_ORIGIN}${path}`
}

/** Trigger browser download of a Blob with the given filename. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Attach token to every request
http.interceptors.request.use((cfg) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('gd_token')
    if (token) cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

// Handle 401 → try refresh token once, then retry; otherwise redirect to login
let isRefreshing = false
let refreshWaiters: Array<(token: string | null) => void> = []

function onRefreshed(token: string | null) {
  refreshWaiters.forEach((cb) => cb(token))
  refreshWaiters = []
}

function clearSessionAndRedirect() {
  localStorage.removeItem('gd_token')
  localStorage.removeItem('gd_user')
  localStorage.removeItem('gd_refresh')
  if (typeof window !== 'undefined') window.location.href = '/login'
}

http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {}
    const status = err.response?.status
    const url: string = original.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh')

    if (status === 401 && !isAuthEndpoint && !original._retry && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('gd_refresh')
      if (!refreshToken) {
        clearSessionAndRedirect()
        return Promise.reject(err.response?.data?.message || err.message || 'Request failed')
      }
      original._retry = true

      // If a refresh is already in flight, queue this request until it resolves.
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshWaiters.push((token) => {
            if (!token) return reject('Session expired')
            original.headers = original.headers || {}
            original.headers.Authorization = `Bearer ${token}`
            resolve(http(original))
          })
        })
      }

      isRefreshing = true
      try {
        const { data } = await axios.post<{ token: string; refreshToken: string }>(
          `${BASE}/auth/refresh`,
          { refreshToken }
        )
        localStorage.setItem('gd_token', data.token)
        localStorage.setItem('gd_refresh', data.refreshToken)
        onRefreshed(data.token)
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${data.token}`
        return http(original)
      } catch (refreshErr) {
        onRefreshed(null)
        clearSessionAndRedirect()
        return Promise.reject('Session expired')
      } finally {
        isRefreshing = false
      }
    }

    const data = err.response?.data
    const requestId = data?.requestId
    const fieldErrors = Array.isArray(data?.errors)
      ? data.errors
          .map((e: { field?: string; message?: string }) => `${e.field || 'field'}: ${e.message || 'invalid'}`)
          .join(', ')
      : ''

    const baseMessage = (typeof data?.message === 'string' && data.message.trim())
      ? data.message.trim()
      : (err.message || 'Request failed')

    const hasFieldErrorsAlready = fieldErrors && baseMessage.includes(fieldErrors)
    const withFieldErrors = fieldErrors && !hasFieldErrorsAlready
      ? `${baseMessage} (${fieldErrors})`
      : baseMessage

    const finalMessage = requestId
      ? `${withFieldErrors} [Request ID: ${requestId}]`
      : withFieldErrors

    return Promise.reject(finalMessage)
  }
)

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const AuthAPI = {
  login: (username: string, password: string) =>
    http.post<{ token: string; refreshToken: string; user: User; mustChangePassword: boolean }>('/auth/login', { username, password }).then(r => r.data),
  forgotPassword: (identifier: string) =>
    http.post('/auth/forgot-password', { identifier }).then(r => r.data),
  refresh: (refreshToken: string) =>
    http.post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken }).then(r => r.data),
  logout: (refreshToken: string) =>
    http.post('/auth/logout', { refreshToken }).then(r => r.data),
  me: () => http.get<User>('/auth/me').then(r => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.post('/auth/change-password', { oldPassword, newPassword }).then(r => r.data),
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export const UsersAPI = {
  list: (params?: Record<string, string>) =>
    http.get<User[]>('/users', { params }).then(r => r.data),
  create: (data: Partial<User> & { password: string }) =>
    http.post<User>('/users', data).then(r => r.data),
  update: (id: string, data: Partial<User>) =>
    http.put<User>(`/users/${id}`, data).then(r => r.data),
  setPassword: (id: string, newPassword: string) =>
    http.put(`/users/${id}/password`, { newPassword }).then(r => r.data),
  toggleActive: (id: string, active: boolean) =>
    http.put<User>(`/users/${id}`, { active }).then(r => r.data),
  forceChangePassword: (id: string) =>
    http.put(`/users/${id}/force-change-password`).then(r => r.data),
  deactivate: (id: string) => http.delete(`/users/${id}`).then(r => r.data),
  uploadSignature: (id: string, file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return http.post<User>(`/users/${id}/signature`, fd).then(r => r.data)
  },
  deleteSignature: (id: string) =>
    http.delete<User>(`/users/${id}/signature`).then(r => r.data),
  setDocCounter: (id: string, mmyy: string, nextSeq: number) =>
    http.put<User>(`/users/${id}/doc-counter`, { mmyy, nextSeq }).then(r => r.data),
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

// ─── PR TYPES ─────────────────────────────────────────────────────────────────

export const PrTypesAPI = {
  list: (params?: Record<string, string>) =>
    http.get<PrType[]>('/pr-types', { params }).then(r => r.data),
  create: (data: { name: string; approvalSteps?: number[]; sortOrder?: number }) =>
    http.post<PrType>('/pr-types', data).then(r => r.data),
  update: (id: string, data: Partial<PrType>) =>
    http.put<PrType>(`/pr-types/${id}`, data).then(r => r.data),
  delete: (id: string) => http.delete(`/pr-types/${id}`).then(r => r.data),
}

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────

export const QuotationsAPI = {
  list: (params?: Record<string, string>) =>
    http.get<Quotation[]>('/quotations', { params }).then(r => r.data),
  get: (id: string) => http.get<Quotation>(`/quotations/${id}`).then(r => r.data),
  create: (data: Partial<Quotation>) => http.post<Quotation>('/quotations', data).then(r => r.data),
  update: (id: string, data: Partial<Quotation>) =>
    http.put<Quotation>(`/quotations/${id}`, data).then(r => r.data),
  revise: (id: string) =>
    http.post<Quotation>(`/quotations/${id}/revise`, {}).then(r => r.data),
  submit: (id: string, comment?: string) =>
    http.post<Quotation>(`/quotations/${id}/submit`, { comment }).then(r => r.data),
  approve: (id: string, comment?: string) =>
    http.post<Quotation>(`/quotations/${id}/approve`, { comment }).then(r => r.data),
  reject: (id: string, comment?: string) =>
    http.post<Quotation>(`/quotations/${id}/reject`, { comment }).then(r => r.data),
  cancel: (id: string) => http.delete(`/quotations/${id}`).then(r => r.data),  pdf: (id: string) => http.get(`/quotations/${id}/pdf`, { responseType: 'blob' }).then(r => r.data as Blob),}

// ─── WORK ORDERS ──────────────────────────────────────────────────────────────

export const WorkOrdersAPI = {
  list: (params?: Record<string, string>) =>
    http.get<WorkOrder[]>('/workorders', { params }).then(r => r.data),
  previousByQuotation: (quotationId: string) =>
    http.get<WorkOrder | null>(`/workorders/by-quotation/${quotationId}/previous`).then(r => r.data),
  get: (id: string) => http.get<WorkOrder>(`/workorders/${id}`).then(r => r.data),
  create: (data: Partial<WorkOrder>) => http.post<WorkOrder>('/workorders', data).then(r => r.data),
  update: (id: string, data: Partial<WorkOrder>) =>
    http.put<WorkOrder>(`/workorders/${id}`, data).then(r => r.data),
  submit: (id: string, comment?: string) =>
    http.post<WorkOrder>(`/workorders/${id}/submit`, { comment }).then(r => r.data),
  approve: (id: string, comment?: string, docChecklist?: Record<string, boolean>) =>
    http.post<WorkOrder>(`/workorders/${id}/approve`, { comment, docChecklist }).then(r => r.data),
  reject: (id: string, comment?: string) =>
    http.post<WorkOrder>(`/workorders/${id}/reject`, { comment }).then(r => r.data),
  cancel: (id: string) => http.delete(`/workorders/${id}`).then(r => r.data),
  pdf: (id: string) => http.get(`/workorders/${id}/pdf`, { responseType: 'blob' }).then(r => r.data as Blob),
}

// ─── WORK ORDER EMAILS ───────────────────────────────────────────────────────

export const WorkOrderEmailsAPI = {
  listApprovedWorkOrders: (params?: { woNo?: string; customerName?: string; dateFrom?: string; dateTo?: string }) =>
    http.get<WorkOrderEmailCandidate[]>('/workorder-emails/workorders', { params }).then(r => r.data),
  getContext: (workOrderId: string) =>
    http.get<WorkOrderEmailContext>(`/workorder-emails/workorders/${workOrderId}/context`).then(r => r.data),
  history: (params?: { q?: string; customerId?: string; limit?: number }) =>
    http.get<EmailHistoryEntry[]>('/workorder-emails/history', { params }).then(r => r.data),
  send: (payload: FormData) =>
    http.post<{ ok: boolean; message: string; recipientCount: number; historySynced?: boolean }>('/workorder-emails/send', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
}

// ─── HAND OVER JOBS ───────────────────────────────────────────────────────────

export const HandoversAPI = {
  list: (params?: Record<string, string>) =>
    http.get<HandOverJob[]>('/handovers', { params }).then(r => r.data),
  get: (id: string) => http.get<HandOverJob>(`/handovers/${id}`).then(r => r.data),
  create: (data: Partial<HandOverJob>) => http.post<HandOverJob>('/handovers', data).then(r => r.data),
  update: (id: string, data: Partial<HandOverJob>) =>
    http.put<HandOverJob>(`/handovers/${id}`, data).then(r => r.data),
  submit: (id: string, comment?: string) =>
    http.post<HandOverJob>(`/handovers/${id}/submit`, { comment }).then(r => r.data),
  approve: (id: string, comment?: string) =>
    http.post<HandOverJob>(`/handovers/${id}/approve`, { comment }).then(r => r.data),
  reject: (id: string, comment?: string) =>
    http.post<HandOverJob>(`/handovers/${id}/reject`, { comment }).then(r => r.data),
  cancel: (id: string) => http.delete(`/handovers/${id}`).then(r => r.data),
  pdf: (id: string) => http.get(`/handovers/${id}/pdf`, { responseType: 'blob' }).then(r => r.data as Blob),
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
  cancel: (id: string) => http.delete(`/pr/${id}`).then(r => r.data),
  pdf: (id: string) => http.get(`/pr/${id}/pdf`, { responseType: 'blob' }).then(r => r.data as Blob),
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
  quotationSummary: (params?: { from?: string; to?: string; salesId?: string }) =>
    http.get<import('@/types').QuoSummaryReport>('/reports/quotation-summary', { params }).then(r => r.data),
  workOrdersNoPoBySales: (params?: { salesIds?: string; from?: string; to?: string }) =>
    http.get<WorkOrderNoPoReport>('/reports/workorders/no-po-by-sales', { params }).then(r => r.data),
  workOrdersPoOverview: (params?: { salesIds?: string; from?: string; to?: string; customer?: string; poStatus?: 'all' | 'has_po' | 'no_po' }) =>
    http.get<WorkOrderPoOverviewReport>('/reports/workorders/po-overview', { params }).then(r => r.data),
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

// ─── SETTINGS ────────────────────────────────────────────────────────────────────────────────

export const SettingsAPI = {
  get: () => http.get<Settings>('/settings').then(r => r.data),
  update: (data: Partial<Settings>) => http.put<Settings>('/settings', data).then(r => r.data),
  setDocCounter: (prefix: string, nextSeq: number) =>
    http.post('/settings/doc-counter', { prefix, nextSeq }).then(r => r.data),
}

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────────────

export const NotificationsAPI = {
  list: () => http.get<{ notifications: import('@/types').AppNotification[]; unreadCount: number }>('/notifications').then(r => r.data),
  markRead: (id: string) => http.patch(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: () => http.patch('/notifications/read-all').then(r => r.data),
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────────────────

export const AdminAPI = {
  getAuditLog: (params?: Record<string, string>) =>
    http.get<AuditPage>('/audit', { params }).then(r => r.data),
  getActivityLogs: (params?: Record<string, string>) =>
    http.get<ActivityLogPage>('/activity-logs', { params }).then(r => r.data),
  getEmailLogs: (params?: Record<string, string>) =>
    http.get<EmailLogPage>('/workorder-emails/logs', { params }).then(r => r.data),
  resyncEmailHistory: (logId: string) =>
    http.post<{ ok: boolean; logId: string; recipients: number; historySynced: boolean }>(`/workorder-emails/logs/${logId}/resync-history`, {}).then(r => r.data),
  bulkResyncEmailHistory: (ids?: string[], limit?: number) =>
    http.post<{ ok: boolean; total: number; synced: number; failed: number; failures: Array<{ id: string; message: string }> }>(
      '/workorder-emails/logs/resync-history',
      { ids, limit }
    ).then(r => r.data),
  updateApprovalFlow: (config: Record<string, unknown>) =>
    http.put<Settings>('/settings', { approvalFlowConfig: config }).then(r => r.data),
  updateMenuAccess: (config: Record<string, UserRole[]>) =>
    http.put<Settings>('/settings', { menuAccessConfig: config }).then(r => r.data),
}
