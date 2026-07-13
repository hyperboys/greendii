'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ReportsAPI, UsersAPI } from '@/lib/api'
import type { User, WorkOrderNoPoReport, WorkOrderNoPoRow } from '@/types'
import { hasRole } from '@/lib/roleAliases'
import MultiSelectDropdown from '@/components/MultiSelectDropdown'
import { ChevronRight, FileSpreadsheet } from 'lucide-react'

type SortKey = 'woNo' | 'openedAt' | 'customerName' | 'project' | 'products' | 'amount' | 'ageDays' | 'status' | 'salesName'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function WorkOrdersNoPoBySalesPage() {
  const [sales, setSales] = useState<User[]>([])
  const [selectedSales, setSelectedSales] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [report, setReport] = useState<WorkOrderNoPoReport>({ summary: [], rows: [] })
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('openedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    UsersAPI.list({ active: 'true', forReport: 'true' })
      .then(list => setSales(list.filter(u => hasRole(u.role, ['sales', 'sale_mgr']))))
      .catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    ReportsAPI.workOrdersNoPoBySales({
      salesIds: selectedSales.join(',') || undefined,
      statuses: selectedStatuses.join(',') || undefined,
    })
      .then(setReport)
      .catch(() => toast.error('โหลดรายงานไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [selectedSales.join(','), selectedStatuses.join(',')])

  const rows = useMemo(() => {
    const data = [...report.rows]
    data.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return data
  }, [report.rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(v => (v === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  const salesOptions = useMemo(() => sales.map(s => ({ value: s.id, label: s.fullName })), [sales])
  const statusOptions = useMemo(
    () => [
      { value: 'draft', label: 'draft' },
      { value: 'pending', label: 'pending' },
      { value: 'approved', label: 'approved' },
      { value: 'rejected', label: 'rejected' },
      { value: 'cancelled', label: 'cancelled' },
    ],
    []
  )
  const grandTotal = useMemo(() => report.summary.reduce((sum, s) => sum + s.total, 0), [report.summary])

  const exportExcel = () => {
    const sheetRows = rows.map((r: WorkOrderNoPoRow) => ({
      'WO No.': r.woNo,
      'วันที่เปิด': fmtDate(r.openedAt),
      'ลูกค้า': r.customerName,
      'โครงการ': r.project || '-',
      'สินค้า': r.products || '-',
      'ยอดเงิน': r.amount,
      'อายุ WO (วัน)': r.ageDays,
      'สถานะ': r.status,
      'Sales': r.salesName,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'WO-No-PO')
    XLSX.writeFile(wb, `wo-no-po-by-sales-${Date.now()}.xlsx`)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden shadow-md"
           style={{ background: 'linear-gradient(135deg, #1B5E20 0%, #2d6a2e 60%, #388E3C 100%)' }}>
        <div className="px-6 pt-4 flex items-center gap-1.5 text-green-200/70 text-[11px] font-medium">
          <Link href="/dashboard" className="hover:text-white transition-colors">หน้าหลัก</Link>
          <ChevronRight size={11} />
          <Link href="/reports" className="hover:text-white transition-colors">รายงาน</Link>
          <ChevronRight size={11} />
          <span className="text-white/90">WO ที่ยังไม่มี PO</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Report: Work Order ที่ยังไม่มี PO
            </h1>
            <p className="text-green-200/75 text-sm mt-1.5">แยกตาม Sales พร้อมสรุปและรายละเอียด</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline flex items-center gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={exportExcel}>
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-all duration-150 whitespace-nowrap"
            >
              Back to Reports
            </Link>
          </div>
        </div>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="form-label">เลือก Sales (เลือกได้หลายคน)</label>
          <div className="max-w-md">
            <MultiSelectDropdown
              options={salesOptions}
              selected={selectedSales}
              onChange={setSelectedSales}
              placeholder="ทุก Sales"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">ไม่เลือก = แสดงทุก Sales</p>
        </div>

        <div>
          <label className="form-label">เลือกสถานะ Work Order (เลือกได้หลายสถานะ)</label>
          <div className="max-w-md">
            <MultiSelectDropdown
              options={statusOptions}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
              placeholder="ทุกสถานะ (ยกเว้น cancelled)"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">ไม่เลือก = แสดงทุกสถานะ ยกเว้น cancelled</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4 bg-red-50 border-red-100">
          <p className="text-sm text-gray-500">รวมทั้งหมด</p>
          <p className="text-2xl font-bold text-red-600">{grandTotal}</p>
          <p className="text-xs text-gray-500">WO ที่ยังไม่มี PO</p>
        </div>
        {report.summary.map(s => (
          <div key={s.salesId} className="card p-4">
            <p className="text-sm text-gray-500 truncate">{s.salesName}</p>
            <p className="text-2xl font-bold text-amber-600">{s.total}</p>
            <p className="text-xs text-gray-500">มี WO ที่ยังไม่มี PO</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-gray-400">กำลังโหลด…</div>
        ) : (
          <table className="data-table min-w-[1240px]">
            <thead>
              <tr>
                <th onClick={() => toggleSort('woNo')} className="cursor-pointer select-none">WO No.{sortIndicator('woNo')}</th>
                <th onClick={() => toggleSort('openedAt')} className="cursor-pointer select-none">วันที่เปิด{sortIndicator('openedAt')}</th>
                <th onClick={() => toggleSort('customerName')} className="cursor-pointer select-none">ลูกค้า{sortIndicator('customerName')}</th>
                <th onClick={() => toggleSort('project')} className="cursor-pointer select-none">โครงการ{sortIndicator('project')}</th>
                <th onClick={() => toggleSort('products')} className="cursor-pointer select-none">สินค้า{sortIndicator('products')}</th>
                <th onClick={() => toggleSort('amount')} className="cursor-pointer select-none text-right">ยอดเงิน{sortIndicator('amount')}</th>
                <th onClick={() => toggleSort('ageDays')} className="cursor-pointer select-none text-right">อายุ WO (วัน){sortIndicator('ageDays')}</th>
                <th onClick={() => toggleSort('status')} className="cursor-pointer select-none">สถานะ{sortIndicator('status')}</th>
                <th onClick={() => toggleSort('salesName')} className="cursor-pointer select-none">Sales{sortIndicator('salesName')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.woNo}</td>
                  <td>{fmtDate(r.openedAt)}</td>
                  <td>{r.customerName}</td>
                  <td>{r.project || '-'}</td>
                  <td>{r.products || '-'}</td>
                  <td className="text-right">฿{fmtMoney(r.amount)}</td>
                  <td className="text-right">{r.ageDays}</td>
                  <td>{r.status}</td>
                  <td>{r.salesName}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-gray-400 py-6">ไม่พบข้อมูล</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
