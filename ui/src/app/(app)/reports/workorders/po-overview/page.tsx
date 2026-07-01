'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ReportsAPI, UsersAPI } from '@/lib/api'
import type { User, WorkOrderPoOverviewRow } from '@/types'
import { hasRole } from '@/lib/roleAliases'
import DateInput from '@/components/DateInput'
import MultiSelectDropdown from '@/components/MultiSelectDropdown'
import { ChevronRight, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react'

function fmtDate(iso?: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function WorkOrdersPoOverviewPage() {
  const [sales, setSales] = useState<User[]>([])
  const [selectedSales, setSelectedSales] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customer, setCustomer] = useState('')
  const [poStatus, setPoStatus] = useState<'all' | 'has_po' | 'no_po'>('all')
  const [rows, setRows] = useState<WorkOrderPoOverviewRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    UsersAPI.list({ active: 'true', forReport: 'true' })
      .then(list => setSales(list.filter(u => hasRole(u.role, ['sales', 'sale_mgr']))))
      .catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    ReportsAPI.workOrdersPoOverview({
      salesIds: selectedSales.join(',') || undefined,
      from: from || undefined,
      to: to || undefined,
      customer: customer || undefined,
      poStatus,
    })
      .then(data => setRows(data.rows))
      .catch(() => toast.error('โหลดรายงานไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [selectedSales.join(','), from, to, customer, poStatus])

  const resetFilters = () => {
    setSelectedSales([])
    setFrom('')
    setTo('')
    setCustomer('')
    setPoStatus('all')
  }

  const salesOptions = useMemo(() => sales.map(s => ({ value: s.id, label: s.fullName })), [sales])

  const stats = useMemo(() => {
    const total = rows.length
    const hasPo = rows.filter(r => r.hasPo).length
    const noPo = total - hasPo
    const overdue = rows.filter(r => !r.hasPo && r.ageDays > 7).length
    return { total, hasPo, noPo, overdue }
  }, [rows])

  const exportExcel = () => {
    const data = rows.map(r => ({
      'WO No.': r.woNo,
      'วันที่': fmtDate(r.date),
      'Sales': r.salesName,
      'ลูกค้า': r.customerName,
      'ยอดเงิน': r.amount,
      'สถานะ PO': r.poStatus,
      'วันที่แนบ PO': fmtDate(r.poAttachedDate),
      'อายุ WO (วัน)': r.ageDays,
      'สถานะเอกสาร': r.status,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'WO-PO-Overview')
    XLSX.writeFile(wb, `wo-po-overview-${Date.now()}.xlsx`)
  }

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    autoTable(doc, {
      head: [['WO No.', 'Date', 'Sales', 'Customer', 'Amount', 'PO Status', 'PO Date', 'Age (days)', 'Status']],
      body: rows.map(r => [
        r.woNo,
        fmtDate(r.date),
        r.salesName,
        r.customerName,
        fmtMoney(r.amount),
        r.poStatus,
        fmtDate(r.poAttachedDate),
        String(r.ageDays),
        r.status,
      ]),
      styles: { fontSize: 8 },
    })
    doc.save(`wo-po-overview-${Date.now()}.pdf`)
  }

  const viewRows = useMemo(() => rows, [rows])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden shadow-md"
           style={{ background: 'linear-gradient(135deg, #1B5E20 0%, #2d6a2e 60%, #388E3C 100%)' }}>
        <div className="px-6 pt-4 flex items-center gap-1.5 text-green-200/70 text-[11px] font-medium">
          <Link href="/dashboard" className="hover:text-white transition-colors">หน้าหลัก</Link>
          <ChevronRight size={11} />
          <Link href="/reports" className="hover:text-white transition-colors">รายงาน</Link>
          <ChevronRight size={11} />
          <span className="text-white/90">WO ภาพรวม PO</span>
        </div>
        <div className="px-6 pt-3 pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Report: Work Order ภาพรวม PO
            </h1>
            <p className="text-green-200/75 text-sm mt-1.5">ตรวจสอบสถานะ PO ของ Work Order ทั้งหมด (กรองตามวันที่ / Sales / ลูกค้า / สถานะ PO)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline flex items-center gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={exportExcel}>
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
            <button className="btn-outline flex items-center gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={exportPdf}>
              <FileText className="w-4 h-4" /> Export PDF
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500">WO ทั้งหมด</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">มี PO แล้ว</p>
          <p className="text-2xl font-bold text-green-600">{stats.hasPo}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">ยังไม่มี PO</p>
          <p className="text-2xl font-bold text-amber-600">{stats.noPo}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">เกิน 7 วัน ยังไม่มี PO</p>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="form-label">จากวันที่</label>
            <DateInput value={from} onChange={setFrom} placeholder="dd/mm/yyyy" />
          </div>
          <div>
            <label className="form-label">ถึงวันที่</label>
            <DateInput value={to} onChange={setTo} placeholder="dd/mm/yyyy" />
          </div>
          <div>
            <label className="form-label">ลูกค้า</label>
            <input className="form-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="ค้นหาลูกค้า" />
          </div>
          <div>
            <label className="form-label">สถานะ PO</label>
            <select className="form-input" value={poStatus} onChange={e => setPoStatus(e.target.value as 'all' | 'has_po' | 'no_po')}>
              <option value="all">ทั้งหมด</option>
              <option value="has_po">มี PO แล้ว</option>
              <option value="no_po">ยังไม่มี PO</option>
            </select>
          </div>
          <div>
            <label className="form-label">Sales (เลือกได้หลายคน)</label>
            <MultiSelectDropdown
              options={salesOptions}
              selected={selectedSales}
              onChange={setSelectedSales}
              placeholder="ทุก Sales"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1" onClick={resetFilters}>
            <RotateCcw className="w-3.5 h-3.5" /> ล้างตัวกรอง
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-gray-400">กำลังโหลด…</div>
        ) : (
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th>WO No.</th>
                <th>วันที่</th>
                <th>Sales</th>
                <th>ลูกค้า</th>
                <th className="text-right">ยอดเงิน</th>
                <th>สถานะ PO</th>
                <th>วันที่แนบ PO</th>
                <th className="text-right">อายุ WO (วัน)</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.map(r => {
                const overdue = !r.hasPo && r.ageDays > 7
                return (
                  <tr key={r.id} className={overdue ? 'bg-red-50' : ''}>
                    <td className="font-medium">{r.woNo}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.salesName}</td>
                    <td>{r.customerName}</td>
                    <td className="text-right">฿{fmtMoney(r.amount)}</td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.hasPo ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {r.poStatus}
                      </span>
                    </td>
                    <td>{fmtDate(r.poAttachedDate)}</td>
                    <td className={`text-right ${overdue ? 'text-red-600 font-semibold' : ''}`}>{r.ageDays}</td>
                    <td>{r.status}</td>
                  </tr>
                )
              })}
              {viewRows.length === 0 && (
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
