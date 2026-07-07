// ─── ENUMS ───────────────────────────────────────────────────────────────────

// UserRole is now a plain string — roles are managed dynamically via Admin UI
export type UserRole = string

export type DocStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

// ─── ROLE / PERMISSION TYPES ─────────────────────────────────────────────────

export interface RoleDef {
  key: string
  label: string
  description: string
}

export interface PermissionDef {
  key: string
  label: string
  roles: string[]
}

export interface RolePermissionsConfig {
  roles: RoleDef[]
  permissions: PermissionDef[]
}

// Default roles — kept as fallback when settings haven't loaded yet
export const DEFAULT_ROLES: RoleDef[] = [
  { key: 'admin',       label: 'System Admin',          description: 'ผู้ดูแลระบบสูงสุด เข้าถึงได้ทุกส่วน' },
  { key: 'sales',       label: 'พนักงานขาย',            description: 'ฝ่ายขาย สร้างและจัดการเอกสารขาย' },
  { key: 'sale_mgr',    label: 'ผู้จัดการฝ่ายขาย',       description: 'ผู้จัดการฝ่ายขาย อนุมัติใบเสนอราคา' },
  { key: 'admin_mgr',   label: 'ผู้จัดการฝ่ายบริหาร',    description: 'ผู้จัดการฝ่ายบริหาร อนุมัติเอกสารหลายประเภท' },
  { key: 'project_mgr', label: 'ผู้จัดการโครงการ',        description: 'ผู้จัดการโครงการ ดูแลการดำเนินงาน' },
  { key: 'director',    label: 'กรรมการผู้จัดการ',         description: 'กรรมการผู้จัดการ อนุมัติขั้นสุดท้าย' },
  { key: 'procurement', label: 'ฝ่ายจัดซื้อ',             description: 'ฝ่ายจัดซื้อ รับใบขอซื้อที่อนุมัติแล้ว' },
  { key: 'factory',     label: 'ฝ่ายโรงงาน/ผลิต',         description: 'ฝ่ายโรงงาน/ผลิต รับงานที่ผ่านการอนุมัติ' },
]

export const DEFAULT_PERMISSIONS: PermissionDef[] = [
  { key: 'dashboard_view', label: 'ดู Dashboard', roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'] },
  { key: 'quotations_view', label: 'ดูใบเสนอราคา', roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'quo_create',    label: 'สร้างใบเสนอราคา',   roles: ['admin','sales','sale_mgr'] },
  { key: 'quo_edit',      label: 'แก้ไขใบเสนอราคา',   roles: ['admin','sales','sale_mgr'] },
  { key: 'quo_approve',   label: 'อนุมัติใบเสนอราคา', roles: ['admin','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'workorders_view', label: 'ดูใบสั่งงาน',    roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'] },
  { key: 'workorder_email_view', label: 'ดูเมนูส่งอีเมล Work Order', roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'wo_create',     label: 'สร้างใบสั่งงาน',    roles: ['admin','sales','sale_mgr','admin_mgr'] },
  { key: 'wo_approve',    label: 'อนุมัติใบสั่งงาน',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'pr_view',       label: 'ดูใบขอซื้อ',       roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement'] },
  { key: 'pr_create',     label: 'สร้างใบขอซื้อ',     roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr'] },
  { key: 'pr_approve',    label: 'อนุมัติใบขอซื้อ',   roles: ['admin','admin_mgr','project_mgr','director','procurement'] },
  { key: 'handovers_view', label: 'ดูส่งมอบงาน',     roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'ho_create',     label: 'สร้างส่งมอบงาน',    roles: ['admin','sales','sale_mgr'] },
  { key: 'ho_approve',    label: 'อนุมัติส่งมอบงาน',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'approvals_view', label: 'ดูเมนูรออนุมัติ',  roles: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'] },
  { key: 'view_reports',  label: 'ดูรายงาน',          roles: ['admin','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'customers_view', label: 'ดูลูกค้า',         roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'products_view', label: 'ดูสินค้า',          roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'units_view',    label: 'ดูหน่วยนับ',        roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'manage_users',  label: 'จัดการผู้ใช้',       roles: ['admin','admin_mgr','director'] },
  { key: 'manage_master', label: 'จัดการข้อมูลหลัก',   roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'admin_settings',label: 'ตั้งค่าระบบ/Admin', roles: ['admin','director'] },
  { key: 'users_view',          label: 'ดูผู้ใช้งาน',              roles: ['admin','admin_mgr','director'] },
  { key: 'approval_flow_view',  label: 'ดูสายการอนุมัติ',          roles: ['admin','director'] },
  { key: 'pr_types_view',       label: 'ดูประเภทใบขอซื้อ',         roles: ['admin','director'] },
  { key: 'roles_view',          label: 'ดูบทบาท สิทธิ์ และเมนู',    roles: ['admin','director'] },
  { key: 'audit_log_view',      label: 'ดูบันทึกกิจกรรม',           roles: ['admin','admin_mgr','director'] },
  { key: 'activity_log_view',   label: 'ดู Activity Log',           roles: ['admin','director'] },
  { key: 'email_log_view',      label: 'ดู Email Log',              roles: ['admin','admin_mgr','director'] },
  { key: 'settings_view',       label: 'ดูตั้งค่าระบบ',             roles: ['admin','director'] },
]

// Fallback label lookup for when settings haven't loaded
export const ALL_ROLES: string[] = DEFAULT_ROLES.map(r => r.key)
export const ROLE_LABELS: Record<string, string> = Object.fromEntries(DEFAULT_ROLES.map(r => [r.key, r.label]))

// Default step→role mapping (matches api/src/lib/approvalFlow.js defaults)
// Keys are string numbers because JSON objects always have string keys
export const DEFAULT_STEP_ROLE: Record<string, string> = {
  '1': 'sales',
  '2': 'sale_mgr',
  '3': 'admin_mgr',
  '4': 'project_mgr',
  '5': 'director',
  '6': 'procurement',
  '7': 'factory',
}

export const APPROVAL_STEPS = [
  { step: 1, role: 'sales'       as UserRole, label: 'เซลล์ (ผู้อื่น)' },
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
  quotation: [],
  workOrder: [3, 4, 5],
  pr:        [3, 4, 5, 6],
  handover:  [3, 4, 5],
}

export const MENU_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'quotations', label: 'ใบเสนอราคา' },
  { key: 'workorders', label: 'ใบสั่งงาน' },
  { key: 'workorder-email', label: 'ส่งอีเมล WO' },
  { key: 'handovers',  label: 'ส่งมอบงาน' },
  { key: 'pr',         label: 'ใบขอซื้อ' },
  { key: 'approvals',  label: 'รออนุมัติ' },
  { key: 'reports',    label: 'รายงาน' },
  { key: 'customers',  label: 'ลูกค้า' },
  { key: 'products',   label: 'สินค้า' },
  { key: 'units',      label: 'หน่วยนับ' },
]

export const DEFAULT_MENU_ACCESS: Record<string, UserRole[]> = {
  dashboard:  ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'],
  quotations: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director'],
  workorders: ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'],
  'workorder-email': ['admin','sales','sale_mgr','admin_mgr','project_mgr','director'],
  handovers:  ['admin','sales','sale_mgr','admin_mgr','project_mgr','director'],
  pr:         ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement'],
  approvals:  ['admin','sales','sale_mgr','admin_mgr','project_mgr','director','procurement','factory'],
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
  firstName?: string
  lastName?: string
  firstNameEn?: string
  lastNameEn?: string
  lineUserId?: string
  signatureText?: string
  signatureUrl?: string | null
  active: boolean
  docCounters?: Record<string, number>
  createdAt: string
}

export interface AuthUser extends Omit<User, 'active' | 'createdAt'> {
  token?: string
  mustChangePassword?: boolean
}

// ─── MASTER DATA ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  salesId?: string
  sales?: { id: string; fullName: string; email?: string; phone?: string }
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

export interface PrType {
  id: string
  name: string
  approvalSteps: ApprovalFlowStages
  active: boolean
  sortOrder: number
  createdAt?: string
}

export type ApprovalStepStage = number | number[]
export type ApprovalFlowStages = ApprovalStepStage[]

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
  approvalFlowConfig?: {
    quotation?: number[]
    workOrder?: number[]
    pr?: number[]
    handover?: number[]
    prCurrencies?: string[]
    approvalBypassConfig?: {
      quotation?: string[]
      workOrder?: string[]
      pr?: string[]
      handover?: string[]
    }
    workOrderApprovedNotify?: {
      enabled?: boolean
      roles?: string[]
      userIds?: string[]
      messageTemplate?: string
    }
    workOrderCloseAccess?: {
      roles?: string[]
      userIds?: string[]
    }
    workOrderApprovedPoAttachRoles?: string[]
    [key: string]: unknown
  }
  menuAccessConfig?: Record<string, UserRole[]>
  rolePermissionsConfig?: {
    roles: { key: string; label: string; description: string }[]
    permissions: { key: string; label: string; roles: string[] }[]
  }
  stepRoleConfig?: Record<string, string>
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
  detailRows?: QuotationItemDetail[]
  qty: number
  unit: string
  materialPrice: number
  labourPrice: number
  price: number
  amount: number
  images?: string[]
}

export interface QuotationItemDetail {
  desc: string
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
  active?: boolean
  revisionNo?: number
  rootQuotationId?: string | null
  page?: number
  totalPages?: number
  salesId: string
  sales?: { id: string; fullName: string; initials: string; email?: string; phone?: string; signatureText?: string }
  customerId?: string
  customer?: { id: string; name: string }
  customerName: string
  attn?: string
  project: string
  address?: string
  tel?: string
  customerHp?: string
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
  active?: boolean
  revisionNo?: number
  rootWorkOrderId?: string | null
  quotationId?: string
  quotation?: { id: string; quoNo: string; items?: QuotationItem[] }
  handOverJobId?: string
  handOverJob?: { id: string; hoNo: string; quotationId?: string }
  handOverJobs?: Array<{ id: string; hoNo: string; quotationId?: string }>
  salesId: string
  sales?: { id: string; fullName: string; signatureText?: string }
  project: string
  location?: string
  products?: string
  items?: WorkOrderItem[]
  responsibility?: string
  customerName: string
  contactName?: string
  contactTel?: string
  teamAssignment?: string
  qcDate?: string
  installDate?: string
  remark?: string
  docChecklist: Record<string, boolean>
  hasPo?: boolean
  poAttachedDate?: string | null
  poStatus?: string
  status: DocStatus
  approvalStep: number
  isClosed: boolean
  closedAt?: string
  approvalLogs?: ApprovalLog[]
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

export interface WorkOrderNoPoSummary {
  salesId: string
  salesName: string
  total: number
}

export interface WorkOrderNoPoRow {
  id: string
  woNo: string
  openedAt: string
  customerName: string
  amount: number
  ageDays: number
  status: DocStatus
  salesId: string
  salesName: string
}

export interface WorkOrderNoPoReport {
  summary: WorkOrderNoPoSummary[]
  rows: WorkOrderNoPoRow[]
}

export interface WorkOrderPoOverviewRow {
  id: string
  woNo: string
  date: string
  salesId: string
  salesName: string
  customerName: string
  amount: number
  hasPo: boolean
  poStatus: string
  poAttachedDate?: string | null
  ageDays: number
  status: DocStatus
}

export interface WorkOrderPoOverviewReport {
  rows: WorkOrderPoOverviewRow[]
}

export interface WorkOrderItem {
  seq?: number
  desc: string
  note?: string
  detailRows?: WorkOrderDetailRow[]
  qty: number
  unit: string
  images?: string[]
}

export interface WorkOrderDetailRow {
  desc: string
  qty?: number | null
  unit?: string
}

// ─── HAND OVER JOB ────────────────────────────────────────────────────────────

export interface HandOverJob {
  id: string
  hoNo: string
  quotationId?: string
  quotation?: {
    id: string
    quoNo: string
    sales?: { id: string; fullName: string; email?: string; phone?: string }
    items?: QuotationItem[]
  }
  workOrderId?: string
  workOrder?: {
    id: string
    woNo: string
    quotation?: {
      id: string
      quoNo: string
      sales?: { id: string; fullName: string; email?: string; phone?: string }
      items?: QuotationItem[]
    } | null
  }
  salesId: string
  sales?: { id: string; fullName: string }
  project: string
  contractor?: string
  location?: string
  contactName?: string
  contactTel?: string
  product?: string
  items?: HandOverItem[]
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

export interface HandOverItem {
  seq?: number
  desc: string
  note?: string
  qty: number
  unit: string
  images?: string[]
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
  images?: string[]
}

export interface PurchaseRequest {
  id: string
  prNo: string
  active?: boolean
  revisionNo?: number
  rootPurchaseRequestId?: string | null
  workOrderId?: string
  workOrder?: { id: string; woNo: string }
  prTypeId?: string
  prType?: { id: string; name: string; approvalSteps?: ApprovalFlowStages }
  salesId: string
  sales?: { id: string; fullName: string; signatureText?: string }
  customer: string
  projectRef?: string
  dateIssue?: string
  dateRequired?: string
  currency?: string
  subTotal: number
  specialDiscount: number
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
  approver?: { id: string; fullName: string; role: string; signatureText?: string }
  step: number
  action: 'approve' | 'reject' | 'submit'
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
  poAmount?: number
  fileUrl?: string
  uploadedAt: string
}

export interface WorkOrderEmailAttachment extends Attachment {
  sourceType: 'workorder' | 'quotation' | 'handover'
  sourceDocNo: string
  sourceLabel: string
  virtualType?: 'workorder-pdf' | 'quotation-pdf' | 'handover-pdf'
}

export interface WorkOrderEmailCandidate extends WorkOrder {
  workflowStatus: 'Approved' | 'Completed'
}

export interface EmailHistoryEntry {
  id: string
  email: string
  name?: string
  lastUsedAt: string
  useCount: number
  customerId?: string | null
}

export interface WorkOrderEmailContext {
  workOrder: WorkOrder
  customerId?: string | null
  defaultSubject: string
  defaultBodyHtml: string
  attachments: WorkOrderEmailAttachment[]
}

export interface EmailLogEntry {
  id: string
  workOrderId?: string | null
  workOrder?: { id: string; woNo: string; project: string; customerName: string }
  quotation?: { id: string; quoNo: string } | null
  handOverJob?: { id: string; hoNo: string } | null
  sentById: string
  sentBy?: { id: string; fullName: string; role: string }
  toRecipients: string[]
  ccRecipients?: string[]
  bccRecipients?: string[]
  subject: string
  bodyHtml: string
  bodyText?: string | null
  attachments?: Array<{ filename: string; sourceType: string; sourceLabel: string; sourceDocNo: string; generated?: boolean }>
  status: 'sent' | 'failed' | string
  errorMessage?: string | null
  sentAt: string
  ipAddress?: string | null
  userAgent?: string | null
}

export interface EmailLogPage {
  rows: EmailLogEntry[]
  total: number
  page: number
  limit: number
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

export type SalesPerformanceStatus = 'all' | 'has_po' | 'qt_only' | 'no_document'

export interface SalesPerformanceRow {
  salesId: string
  salesName: string
  quotationId: string
  quotationNo: string
  qtDate: string
  customerName: string
  qtAmount: number
  poNo: string | null
  poRefName: string | null
  poWorkOrderId: string | null
  poAmount: number
  recognizedAmount: number
  source: 'QT' | 'PO' | 'None'
  statusKey: Exclude<SalesPerformanceStatus, 'all'>
}

export interface SalesPerformanceGroup {
  salesId: string
  salesName: string
  quotationCount: number
  poCount: number
  recognizedAmount: number
  conversionRate: number
}

export interface SalesPerformanceReport {
  dateRange: { from: string; to: string }
  summary: {
    totalRecognizedAmount: number
    totalQtCount: number
    conversionRate: number
    topSales: SalesPerformanceGroup[]
  }
  groupedBySales: SalesPerformanceGroup[]
  customers: string[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  rows: SalesPerformanceRow[]
}

export type WorkStatusPoFilter = 'all' | 'has' | 'pending'
export type WorkStatusAgingFilter = 'all' | '0-7' | '8-15' | '16-30' | '30+'

export interface WorkStatusRow {
  id: string
  workNo: string
  workDate: string
  customerName: string
  salesId: string
  salesName: string
  project: string
  quotationId: string | null
  quotationNo: string
  qtAmount: number
  poNo: string | null
  poAmount: number
  poStatus: 'Received' | 'Partial' | 'Pending'
  poStatusKey: 'has' | 'pending'
  agingDays: number
  agingRange: Exclude<WorkStatusAgingFilter, 'all'> | null
  expectedPoDate: string | null
}

export interface WorkStatusReport {
  dateRange: { from: string; to: string }
  summary: {
    totalWorks: number
    worksWithPo: number
    worksWithPoPct: number
    worksPendingPo: number
    worksPendingPoPct: number
    totalQtAmountAtRisk: number
    averagePendingAging: number
  }
  charts: {
    pendingBySales: Array<{ salesId: string; salesName: string; count: number }>
    poSplit: Array<{ key: 'has' | 'pending'; label: string; value: number }>
  }
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  rows: WorkStatusRow[]
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

// ─── QUOTATION SUMMARY REPORT ─────────────────────────────────────────────────

export interface QuoSummaryPipelineItem {
  id: string
  quoNo: string
  customerName: string
  salesName?: string
  grandTotal: number
  expiryDate: string
  status: DocStatus
}

export interface QuoSummaryReport {
  dateRange: { from: string; to: string }
  overview: {
    total: number
    totalValue: number
    byStatus: Record<DocStatus, number>
    expiredCount: number
    convertedCount: number
    winRate: number
    avgDealSize: number
    avgDiscountPct: number
  }
  statusDetails: Record<DocStatus, { count: number; totalValue: number }>
  bySalesperson: Array<{
    salesId: string
    salesName: string
    count: number
    totalValue: number
    wonCount: number
    winRate: number
    pipelineCount: number
    pipelineValue: number
    revisedCount: number
  }>
  customers: {
    top10: Array<{ customerName: string; customerId?: string; count: number; totalValue: number; wonCount: number; winRate: number }>
    newCount: number
    returningCount: number
    overdueCount: number
    overdue: QuoSummaryPipelineItem[]
    typeDistribution: Array<{ type: string; count: number }>
  }
  topItems: Array<{ desc: string; count: number; totalAmount: number }>
  discountAnalysis: {
    avgDiscountPct: number
    withDiscountCount: number
    noDiscountCount: number
    distribution: Array<{ range: string; count: number }>
  }
  monthlyTrend: Array<{ month: string; count: number; totalValue: number; wonCount: number }>
  revisionTracking: {
    activeRevisedCount: number
    totalRevisedPct: number
    avgRevisionNo: number
    deactivatedCount: number
  }
  pipeline: {
    openCount: number
    openValue: number
    expiringSoonCount: number
    expiringSoon: QuoSummaryPipelineItem[]
    overdueCount: number
    overdue: QuoSummaryPipelineItem[]
  }
}
