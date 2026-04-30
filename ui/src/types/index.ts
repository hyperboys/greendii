// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type UserRole =
  | 'admin'
  | 'sales' | 'sales2' | 'sale_mgr' | 'admin_mgr'
  | 'project_mgr' | 'director' | 'procurement' | 'factory'

export type DocStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

// ─── USER ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  username: string
  fullName: string
  initials: string
  role: UserRole
  lineUserId?: string
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
  updatedAt: string
}

// ─── QUOTATION ────────────────────────────────────────────────────────────────

export interface QuotationItem {
  id?: string
  seq?: number
  desc: string
  qty: number
  unit: string
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
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

// ─── PURCHASE REQUEST ─────────────────────────────────────────────────────────

export interface PRItem {
  id?: string
  seq?: number
  desc: string
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
}

// ─── ATTACHMENT ───────────────────────────────────────────────────────────────

export interface Attachment {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  category?: string
  uploadedAt: string
  url?: string
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

// ─── APPROVAL STEPS ───────────────────────────────────────────────────────────

export const APPROVAL_STEPS = [
  { role: 'sales',       label: 'เซลล์คนที่ 1',    step: 1 },
  { role: 'sales2',      label: 'เซลล์คนที่ 2',    step: 2 },
  { role: 'sale_mgr',    label: 'Sales Manager',    step: 3 },
  { role: 'admin_mgr',   label: 'Admin Manager',    step: 4 },
  { role: 'project_mgr', label: 'Project Manager',  step: 5 },
  { role: 'director',    label: 'Managing Director', step: 6 },
  { role: 'procurement', label: 'Procurement',       step: 7 },
  { role: 'factory',     label: 'ทีมโรงงาน',        step: 8 },
] as const

export const ROLE_LABELS: Record<UserRole, string> = {
  admin:       'System Admin',
  sales:       'เซลล์คนที่ 1',
  sales2:      'เซลล์คนที่ 2',
  sale_mgr:    'Sales Manager',
  admin_mgr:   'Admin Manager',
  project_mgr: 'Project Manager',
  director:    'Managing Director',
  procurement: 'Procurement',
  factory:     'ทีมโรงงาน',
}

export const STATUS_LABELS: Record<DocStatus, string> = {
  draft:     'แบบร่าง',
  pending:   'รออนุมัติ',
  approved:  'อนุมัติแล้ว',
  rejected:  'ปฏิเสธ',
  cancelled: 'ยกเลิก',
}
