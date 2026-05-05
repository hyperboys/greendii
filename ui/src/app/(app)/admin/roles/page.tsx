'use client'

import { ALL_ROLES, ROLE_LABELS, type UserRole } from '@/types'

interface Permission {
  key: string
  label: string
  roles: UserRole[]
}

const PERMISSIONS: Permission[] = [
  // เอกสาร
  { key: 'quo_create',  label: 'สร้างใบเสนอราคา',   roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'quo_edit',    label: 'แก้ไขใบเสนอราคา',   roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'quo_approve', label: 'อนุมัติใบเสนอราคา', roles: ['admin','sales2','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'wo_create',   label: 'สร้างใบสั่งงาน',    roles: ['admin','sales','sales2','sale_mgr','admin_mgr'] },
  { key: 'wo_approve',  label: 'อนุมัติใบสั่งงาน',  roles: ['admin','admin_mgr','project_mgr','director'] },
  { key: 'pr_create',   label: 'สร้างใบขอซื้อ',     roles: ['admin','sales','sales2','sale_mgr','admin_mgr','project_mgr'] },
  { key: 'pr_approve',  label: 'อนุมัติใบขอซื้อ',   roles: ['admin','admin_mgr','project_mgr','director','procurement'] },
  { key: 'ho_create',   label: 'สร้างส่งมอบงาน',    roles: ['admin','sales','sales2','sale_mgr'] },
  { key: 'ho_approve',  label: 'อนุมัติส่งมอบงาน',  roles: ['admin','admin_mgr','project_mgr','director'] },
  // ข้อมูล
  { key: 'view_reports', label: 'ดูรายงาน',          roles: ['admin','sale_mgr','admin_mgr','project_mgr','director'] },
  { key: 'manage_users', label: 'จัดการผู้ใช้',       roles: ['admin','admin_mgr','director'] },
  { key: 'manage_master',label: 'จัดการข้อมูลหลัก',   roles: ['admin','sale_mgr','admin_mgr','director'] },
  { key: 'admin_settings',label: 'ตั้งค่าระบบ/Admin', roles: ['admin','director'] },
]

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin:       'ผู้ดูแลระบบสูงสุด เข้าถึงได้ทุกส่วน',
  sales:       'ฝ่ายขาย สร้างและจัดการเอกสารขาย',
  sales2:      'ฝ่ายขาย 2 รับผิดชอบขั้นตอนแรกของการอนุมัติ',
  sale_mgr:    'ผู้จัดการฝ่ายขาย อนุมัติใบเสนอราคา',
  admin_mgr:   'ผู้จัดการฝ่ายบริหาร อนุมัติเอกสารหลายประเภท',
  project_mgr: 'ผู้จัดการโครงการ ดูแลการดำเนินงาน',
  director:    'กรรมการผู้จัดการ อนุมัติขั้นสุดท้าย',
  procurement: 'ฝ่ายจัดซื้อ รับใบขอซื้อที่อนุมัติแล้ว',
  factory:     'ฝ่ายโรงงาน/ผลิต รับงานที่ผ่านการอนุมัติ',
}

export default function RolesPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="page-title">บทบาท & สิทธิ์</h2>
        <p className="page-sub">ภาพรวมสิทธิ์การใช้งานของแต่ละ Role ในระบบ</p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ALL_ROLES.map(role => (
          <div key={role} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-green-pale text-green-dark text-xs font-bold rounded">
                {role}
              </span>
            </div>
            <p className="font-semibold text-gray-800 text-sm">{ROLE_LABELS[role]}</p>
            <p className="text-xs text-gray-500 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
        ))}
      </div>

      {/* Permissions matrix */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-700">Matrix สิทธิ์การใช้งาน</h3>
          <p className="text-xs text-gray-500 mt-0.5">✓ = มีสิทธิ์  &nbsp;–  = ไม่มีสิทธิ์</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-green-dark text-white">
                <th className="text-left px-3 py-2.5 font-semibold min-w-44">สิทธิ์</th>
                {ALL_ROLES.map(r => (
                  <th key={r} className="px-2 py-2.5 font-semibold text-center whitespace-nowrap">
                    {ROLE_LABELS[r].split('').length > 6
                      ? r
                      : ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((perm, i) => (
                <tr key={perm.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-medium text-gray-700">{perm.label}</td>
                  {ALL_ROLES.map(r => (
                    <td key={r} className="px-2 py-2 text-center">
                      {perm.roles.includes(r)
                        ? <span className="text-green-600 font-bold text-sm">✓</span>
                        : <span className="text-gray-300">–</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
