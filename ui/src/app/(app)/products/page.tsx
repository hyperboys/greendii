'use client'

import { useEffect, useState } from 'react'
import { ProductsAPI } from '@/lib/api'
import type { Product } from '@/types'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY: Partial<Product> = { code: '', name: '', category: '', unit: '', price: 0, cost: 0, description: '' }

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.search = search
    ProductsAPI.list(params)
      .then(setRows)
      .catch(() => toast.error('โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.name) { toast.error('กรุณากรอกชื่อสินค้า'); return }
    setSaving(true)
    try {
      if (editing.id) {
        await ProductsAPI.update(editing.id, editing)
        toast.success('อัปเดตสำเร็จ')
      } else {
        await ProductsAPI.create(editing)
        toast.success('เพิ่มสินค้าสำเร็จ')
      }
      setEditing(null)
      load()
    } catch (err) { toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('ต้องการลบสินค้านี้?')) return
    try { await ProductsAPI.delete(id); toast.success('ลบสำเร็จ'); load() }
    catch (err) { toast.error(typeof err === 'string' ? err : 'ลบไม่สำเร็จ') }
  }

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n)

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">สินค้า</h2><p className="page-sub">จัดการรายการสินค้าและบริการ</p></div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
          <Plus size={16} /> เพิ่มสินค้า
        </button>
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input pl-8 py-1.5" placeholder="ค้นหาชื่อ / รหัสสินค้า"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
      </div>

      {editing && (
        <div className="card p-5 mb-4">
          <h3 className="font-semibold text-gray-800 mb-4">{editing.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">รหัสสินค้า</label>
              <input className="form-input" value={editing.code ?? ''}
                onChange={e => setEditing(v => v ? { ...v, code: e.target.value } : v)} />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">ชื่อสินค้า *</label>
              <input className="form-input" value={editing.name ?? ''}
                onChange={e => setEditing(v => v ? { ...v, name: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">หมวดหมู่</label>
              <input className="form-input" value={editing.category ?? ''}
                onChange={e => setEditing(v => v ? { ...v, category: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">หน่วย</label>
              <input className="form-input" value={editing.unit ?? ''}
                onChange={e => setEditing(v => v ? { ...v, unit: e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ราคาขาย</label>
              <input type="number" min={0} step="any" className="form-input" value={editing.price ?? 0}
                onChange={e => setEditing(v => v ? { ...v, price: +e.target.value } : v)} />
            </div>
            <div>
              <label className="form-label">ต้นทุน</label>
              <input type="number" min={0} step="any" className="form-input" value={editing.cost ?? 0}
                onChange={e => setEditing(v => v ? { ...v, cost: +e.target.value } : v)} />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">รายละเอียด</label>
              <input className="form-input" value={editing.description ?? ''}
                onChange={e => setEditing(v => v ? { ...v, description: e.target.value } : v)} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            <button className="btn-outline" onClick={() => setEditing(null)}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>รหัส</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th className="text-right">ราคาขาย</th><th>สถานะ</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : rows.map(p => (
              <tr key={p.id}>
                <td className="font-mono text-xs text-gray-500">{p.code || '-'}</td>
                <td className="font-medium">{p.name}</td>
                <td className="text-xs text-gray-500">{p.category || '-'}</td>
                <td className="text-right">฿{fmt(p.price)}</td>
                <td><span className={`badge ${p.active ? 'badge-approved' : 'badge-draft'}`}>{p.active ? 'ใช้งาน' : 'ปิดใช้'}</span></td>
                <td>
                  <div className="flex gap-1 justify-end">
                    <button className="btn-outline btn-sm" onClick={() => setEditing(p)}><Pencil size={12} /></button>
                    <button className="btn-danger btn-sm" onClick={() => del(p.id)}><Trash2 size={12} /></button>
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
