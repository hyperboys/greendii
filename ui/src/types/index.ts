// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type UserRole =
  | 'admin'
  | 'sales' | 'sales2' | 'sale_mgr' | 'admin_mgr'
  | 'project_mgr' | 'director' | 'procurement' | 'factory'

export type DocStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export const ALL_ROLES: UserRole[] = [
  'admin', 'sales', 'sales2', 'sale_mgr', 'admin_mgr',
  'project_mgr', 'director', 'procurement', 'factory',
]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin:       'System Admin',
  sales:       'เซลล์',
  sales2:      'เซลล์ 2',
  sale_mgr:    'ผู้จัดการฝ่ายขาย',
  admin_mgr:   'ผู้จัดการฝ่ายบริหาร',
  project_mgr: 'ผู้จัดการโครงการ',
  director:    'กรรมการผู้จัดการ',
  procurement: 'จัดซื้อ',
  factory:     'โรงงาน/ผลิต',
}

export const APPROVAL_STEPS = [
  { step: 1, role: 'sales2'      as UserRole, label: 'เซลล์ 2' },
  { step: 2, role: 'sale_mgr'    as UserRole, label: 'ผู้จัดการฝ่ายขาย' },
  { step: 3, role: 'admin_mgr'   as UserRole, label: 'ผู้จัดการฝ่ายบริหาร' },
  { step: 4, role: 'project_mgr' as UserRole, label: 'ผู้จัดการโครงการ' },
  { step: 5, role: 'director'    as UserRole, label: 'กรรมการผู้จัดการ' },
  { step: 6, role: 'procurement' as UserRole, label: 'จัดซื้อ' },
  { step: 7, role: 'factory'     as UserRole, label: 'โรงงาน/ผลิต' },
]

export const DOC_TYPES = [
  { key: 'quotation', label: 'ใบเสนอราคา' },
  { key: 'workOrder', label: 'ใบสั่งงาน' },
  { key: 'pr',        label: 'ใบขอซื้อ' },
  { key: 'handover',  label: 'ส่งมอบงาน' },
]

export const DEFAULT_APPROVAL_FLOW: Record<string, number[]> = {
  quotation: [1, 2, 3, 4, 5],
  workOrder: [3, 4, 5],
  pr:        [3, 4, 5, 6],
  handover:  [3, 4, 5],
}

export const MENU_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'quotations', label: 'ใบเสนอราคา' },
  { key: 'workorders', label: 'ใบสั่งงาน' },
  { key: 'handovers',  label: 'ส่งมอบงาน' },
  { key: 'pr',         label: 'ใบขอซื้อ' },
  { key: 'approvals',  label: 'รออนุมัติ' },
  { key: 'reports',    label: 'รายงาน' },
  { key: 'customers',  label: 'ลูกค้า' },
  { key: 'products',   label: 'สินค้า' },
  { key: 'units',      label: 'หน่วยนับ' },
]

export const DEFAULT_MENU_ACCESS: Record<string, UserRole[]> = {
  dashboard:  ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'],
  quotations: ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr','director'],
  workorders: ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'],
  handovers:  ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr','director'],
  pr:         ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr','director','procurement'],
  approvals:  ['admin','sales2','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'],
  reports:    ['admin','sale_mgr','admin_mgr','project_mgr','director'],
  customers:  ['admin','sale_mgr','admin_mgr','director'],
  products:   ['admin','sale_mgr','admin_mgr','director'],
  units:      ['admin','sale_mgr','admin_mgr','director'],
}

// ─── USER ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  username: string
  fullName: string
  initials: string
  role: UserRole
  email?: string
  phone?: string
  department?: string
  position?: string
  lineUserId?: string
  signatureText?: string
  active: boolean
  createdAt: string
}

export interface AuthUser extends Omit<User, 'active' | 'createdAt'> {
  token?: string
  mustChangePassword?: boolean
}

// ─── MASTER DATA ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  name: string
  contactPerson?: string
  tel?: string
  email?: string
  address?: string
  taxId?: string
  type: string
  active: boolean
  createdAt: string
}

export interface Product {
  id: string
  code: string
  name: string
  category?: string
  unit?: string
  price: number
  cost: number
  description?: string
  active: boolean
  createdAt: string
}

export interface Unit {
  id: string
  name: string
  active: boolean
  createdAt: string
}

export interface Settings {
  id: string
  companyName: string
  companyNameEn: string
  address: string
  taxId: string
  tel: string
  email: string
  website: string
  logoUrl: string
  approvalFlowConfig?: Record<string, number[]>
  menuAccessConfig?: Record<string, UserRole[]>
  rolePermissionsConfig?: {
    roles: { key: string; label: string; description: string }[]
    permissions: { key: string; label: string; roles: string[] }[]
  }
  updatedAt: string
}

export interface ApprovalLogEntry {
  id: string
  docType: string
  quotationId?: string
  workOrderId?: string
  handOverJobId?: string
  prId?: string
  approverId: string
  approver?: { fullName: string; role: string }
  quotation?: { quoNo: string }
  workOrder?: { woNo: string }
  handOverJob?: { hoNo: string }
  pr?: { prNo: string }
  step: number
  action: 'submit' | 'approve' | 'reject'
  comment?: string
  actedAt: string
}

export interface AuditPage {
  rows: ApprovalLogEntry[]
  total: number
  page: number
  limit: number
}

// ─── QUOTATION ────────────────────────────────────────────────────────────────

export interface QuotationItem {
  id?: string
  seq?: number
  desc: string
  note?: string
  qty: number
  unit: string
  materialPrice: number
  labourPrice: number
  price: number
  amount: number
}

export interface Quotation {
  id: string
  quoNo: string
  salesId: string
  sales?: { id: string; fullName: string; initials: string }
  customerId?: string
  customer?: { id: string; name: string }
  customerName: string
  attn?: string
  project: string
  address?: string
  tel?: string
  conditionTerm?: string
  validityDays: number
  leadTime?: string
  paymentTerm?: string
  subTotal: number
  specialDiscount: number
  vat: number
  grandTotal: number
  status: DocStatus
  approvalStep: number
  remark?: string
  items: QuotationItem[]
  approvalLogs?: ApprovalLog[]
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

// ─── WORK ORDER ───────────────────────────────────────────────────────────────

export interface WorkOrder {
  id: string
  woNo: string
  quotationId?: string
  quotation?: { id: string; quoNo: string }
  salesId: string
  sales?: { id: string; fullName: string }
  project: string
  location?: string
  products?: string
  responsibility?: string
  customerName: string
  contactName?: string
  contactTel?: string
  teamAssignment?: string
  qcDate?: string
  installDate?: string
  remark?: string
  docChecklist: Record<string, boolean>
  status: DocStatus
  approvalStep: number
  isClosed: boolean
  closedAt?: string
  approvalLogs?: ApprovalLog[]
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

// ─── HAND OVER JOB ────────────────────────────────────────────────────────────

export interface HandOverJob {
  id: string
  hoNo: string
  workOrderId?: string
  workOrder?: { id: string; woNo: string }
  salesId: string
  sales?: { id: string; fullName: string }
  project: string
  contractor?: string
  location?: string
  contactName?: string
  contactTel?: string
  product?: string
  responsibility?: string
  serviceDate?: string
  qualityProduct: number
  qualitySales: number
  qualityInstall: number
  comment?: string
  status: DocStatus
  approvalStep: number
  approvalLogs?: ApprovalLog[]
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

// ─── PURCHASE REQUEST ─────────────────────────────────────────────────────────

export interface PRItem {
  id?: string
  seq?: number
  partNo?: string
  desc: string
  note?: string
  qty: number
  unit: string
  price: number
  amount: number
}

export interface PurchaseRequest {
  id: string
  prNo: string
  workOrderId?: string
  workOrder?: { id: string; woNo: string }
  salesId: string
  sales?: { id: string; fullName: string }
  customer: string
  projectRef?: string
  dateIssue?: string
  dateRequired?: string
  subTotal: number
  vat: number
  netTotal: number
  remarks?: string
  status: DocStatus
  approvalStep: number
  items: PRItem[]
  approvalLogs?: ApprovalLog[]
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

// ─── APPROVAL ─────────────────────────────────────────────────────────────────

export interface ApprovalLog {
  id: string
  docType: string
  approverId: string
  approver?: { id: string; fullName: string; role: string }
  step: number
  action: 'approve' | 'reject'
  comment?: string
  actedAt: string
}

export interface PendingApprovals {
  quotations: Quotation[]
  workOrders: WorkOrder[]
  prs: PurchaseRequest[]
  handovers: HandOverJob[]
}

// ─── ATTACHMENT ───────────────────────────────────────────────────────────────

export interface Attachment {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  category?: string
  fileUrl?: string
  uploadedAt: string
}

// ─── NOTIFICATION ────────────────────────────────────────────────────────

export interface AppNotification {
  id: string
  userId: string
  text: string
  read: boolean
  createdAt: string
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────

export interface ReportOverview {
  quotations: { total: number; approved: number; grandTotal: number }
  workOrders: { total: number; approved: number; pending: number }
  handOverJobs: { total: number }
  purchaseRequests: { total: number }
  recentLogs: Array<ApprovalLog & { approver?: { fullName: string } }>
}

export interface ReportSales {
  customer: string
  total: number
  approved: number
  count: number
}

export interface ReportApprovalPerf {
  id: string
  name: string
  role: string
  approve: number
  reject: number
}

// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string
  userId: string | null
  username: string | null
  method: string
  path: string
  statusCode: number
  ipAddress: string | null
  userAgent: string | null
  durationMs: number
  createdAt: string
  user?: { fullName: string; role: string } | null
}

export interface ActivityLogPage {
  rows: ActivityLog[]
  total: number
  page: number
  limit: number
}

// ─── APPROVAL STEPS ───────────────────────────────────────────────────────────

export const HANDOVER_APPROVAL_STEPS = [
  { role: 'project_mgr', label: 'Project Manager', step: 1 },
] as const

export const STATUS_LABELS: Record<DocStatus, string> = {
  draft:     'แบบร่าง',
  pending:   'รออนุมัติ',
  approved:  'อนุมัติแล้ว',
  rejected:  'ปฏิเสธ',
  cancelled: 'ยกเลิก',
}
