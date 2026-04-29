'use client'

import { useEffect, useState } from 'react'
import { CustomersAPI } from '@/lib/api'
import type { Customer } from '@/types'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY: Partial<Customer> = { name: '', contactPerson: '', tel: '', email: '', address: '', taxId: '', type: 'company' }

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.search = search
    CustomersAPI.list(params)
      .then(setRows)
      .catch(() => toast.error('โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.name) { toast.error('กรุณากรอกชื่อลูกค้า'); return }
    setSaving(true)
    try {
      if (editing.id) {
        await CustomersAPI.update(editing.id, editing)
        toast.success('อัปเดตสำเร็จ')
      } else {
        await CustomersAPI.create(editing)
        toast.success('เพิ่มลูกค้าสำเร็จ')
      }
      setEditing(null)
      load()
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const del = async (id: string) => {
    if (!confirm('ต้องการลบลูกค้านี้?')) return
    try {
      await CustomersAPI.delete(id)
      toast.success('ลบสำเร็จ')
      load()
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'ลบไม่สำเร็จ')
    }
  }

  const f = (key: keyof Customer) => ({
    value: (editing as Record<string, unknown>)?.[key] as string ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditing(prev => ({ ...prev, [key]: e.target.value })),
  })

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">ลูกค้า</h2><p className="page-sub">จัดการข้อมูลลูกค้า</p></div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
          <Plus size={16} /> เพิ่มลูกค้า
        </button>
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหาชื่อลูกค้า"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
      </div>

      {/* Edit form (inline) */}
      {editing && (
        <div className="card p-5 mb-4">
          <h3 className="font-semibold text-gray-800 mb-4">{editing.id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">ชื่อลูกค้า *</label>
              <input className="form-input" {...f('name')} />
            </div>
            <div>
              <label className="form-label">ผู้ติดต่อ</label>
              <input className="form-input" {...f('contactPerson')} />
            </div>
            <div>
              <label className="form-label">โทร</label>
              <input className="form-input" {...f('tel')} />
            </div>
            <div>
              <label className="form-label">อีเมล</label>
              <input type="email" className="form-input" {...f('email')} />
            </div>
            <div>
              <label className="form-label">เลขผู้เสียภาษี</label>
              <input className="form-input" {...f('taxId')} />
            </div>
            <div>
              <label className="form-label">ประเภท</label>
              <select className="form-input" {...f('type')}>
                <option value="company">บริษัท</option>
                <option value="individual">บุคคลธรรมดา</option>
                <option value="government">หน่วยงานรัฐ</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="form-label">ที่อยู่</label>
              <input className="form-input" {...f('address')} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
            <button className="btn-outline" onClick={() => setEditing(null)}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>ชื่อ</th><th>ผู้ติดต่อ</th><th>โทร</th><th>ประเภท</th><th>สถานะ</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(c => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>{c.contactPerson || '-'}</td>
                <td>{c.tel || '-'}</td>
                <td className="text-xs text-gray-500">{c.type}</td>
                <td>
                  <span className={`badge ${c.active ? 'badge-approved' : 'badge-draft'}`}>
                    {c.active ? 'ใช้งาน' : 'ปิดใช้'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1 justify-end">
                    <button className="btn-outline btn-sm" onClick={() => setEditing(c)}>
                      <Pencil size={12} />
                    </button>
                    <button className="btn-danger btn-sm" onClick={() => del(c.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
