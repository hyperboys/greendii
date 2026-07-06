'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QuotationsAPI, CustomersAPI, UnitsAPI, UploadAPI, resolveFileUrl } from '@/lib/api'
import { EDITABLE_APPROVAL_DOC_MESSAGE, isEditableApprovalDocStatus } from '@/lib/approvalFlowRules'
import { parseColoredLine, stringifyColoredLine, toPlainColoredMultiline } from '@/lib/coloredText'
import type { Customer, Unit, QuotationItem, QuotationItemDetail } from '@/types'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, Plus, Trash2, ImagePlus, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface FormData {
  customerId: string
  customerName: string
  attn: string
  project: string
  address: string
  tel: string
  customerHp: string
  conditionTerm: string
  validityDays: number
  leadTime: string
  paymentTerm: string
  remark: string
  items: QuotationItem[]
}

const emptyDetailRow = (): QuotationItemDetail => ({ desc: '', qty: 0, unit: '', materialPrice: 0, labourPrice: 0, price: 0, amount: 0 })
const emptyItem = (): QuotationItem => ({
  desc: '',
  note: '',
  qty: 0,
  unit: '',
  materialPrice: 0,
  labourPrice: 0,
  price: 0,
  amount: 0,
  detailRows: [],
  images: [],
})

const VAT_RATE = 0.07
const roundMoney = (value: number) => Math.round(value * 100) / 100
const LEAD_TIME_OPTIONS = ['7 Days', '15 Days', '30 Days', '60 Days', '90 Days'] as const
const CUSTOM_LEAD_TIME = '__custom_lead_time__'
const DEFAULT_LINE_COLOR = '#000000'
const NOTE_BLOCK_SEPARATOR = '\n\n__QO_NOTE_BLOCK__\n\n'
const MAIN_ITEM_COLORS = [
  { value: '#000000', label: 'ดำ (Default)' },
  { value: '#dc2626', label: 'แดง' },
  { value: '#2563eb', label: 'น้ำเงิน' },
  { value: '#16a34a', label: 'เขียว' },
] as const

const getSelectValue = (value: string, options: readonly string[], customValue: string) => {
  if (!value) return ''
  return options.includes(value) ? value : customValue
}

const getLeadTimeDays = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(\d+)(?:\s*(?:วัน|days?))?$/i)
  return match ? match[1] : ''
}

const calcLinePrice = (row: Pick<QuotationItem | QuotationItemDetail, 'materialPrice' | 'labourPrice'>) =>
  Number(row.materialPrice) + Number(row.labourPrice)

const emptyWhenZero = (value: number) => (Number(value) === 0 ? '' : value)

const normalizeDetailRow = (row: Partial<QuotationItemDetail> | undefined): QuotationItemDetail => {
  const detail = { ...emptyDetailRow(), ...(row || {}) }
  detail.desc = String(detail.desc || '')
  detail.qty = Number(detail.qty) || 0
  detail.unit = String(detail.unit || '')
  detail.materialPrice = Number(detail.materialPrice) || 0
  detail.labourPrice = Number(detail.labourPrice) || 0
  detail.price = calcLinePrice(detail)
  detail.amount = Number(detail.qty) * detail.price
  return detail
}

const normalizeItem = (item: QuotationItem): QuotationItem => {
  const detailRows = (Array.isArray(item.detailRows) && item.detailRows.length > 0)
    ? item.detailRows.map(normalizeDetailRow)
    : []
  const normalized = { ...item, detailRows }
  normalized.desc = String(normalized.desc || '')
  normalized.note = String(normalized.note || '')
  normalized.qty = Number(normalized.qty) || 0
  normalized.materialPrice = Number(normalized.materialPrice) || 0
  normalized.labourPrice = Number(normalized.labourPrice) || 0
  normalized.price = calcLinePrice(normalized)
  normalized.amount = Number(normalized.qty) * normalized.price
  return normalized
}

const calcItemTotal = (item: QuotationItem) => {
  const normalized = normalizeItem(item)
  const detailRows = normalized.detailRows || []
  const detailTotal = detailRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  return normalized.amount + detailTotal
}

function parseNoteBlocks(note?: string): string[] {
  const raw = toPlainColoredMultiline(note)
  if (!raw.trim()) return []
  if (!raw.includes(NOTE_BLOCK_SEPARATOR)) return [raw]
  return raw.split(NOTE_BLOCK_SEPARATOR)
}

function stringifyNoteBlocks(blocks: string[]): string {
  const normalized = blocks.map(v => String(v ?? ''))
  if (normalized.length === 0) return ''
  return normalized.join(NOTE_BLOCK_SEPARATOR)
}

function hasNoteContent(note?: string): boolean {
  return toPlainColoredMultiline(note).trim().length > 0
}

function hasDetailRowContent(row: Partial<QuotationItemDetail> | undefined): boolean {
  if (!row) return false
  return Boolean(String(row.desc || '').trim())
    || Number(row.qty || 0) !== 0
    || Boolean(String(row.unit || '').trim())
    || Number(row.materialPrice || 0) !== 0
    || Number(row.labourPrice || 0) !== 0
}

function hasDetailContent(item: QuotationItem): boolean {
  return Array.isArray(item.detailRows) && item.detailRows.some(row => hasDetailRowContent(row))
}

export default function QuotationFormPage() {
  const router = useRouter()
  const params = useParams<{ id?: string }>()
  // id = 'new' for create, or uuid for edit
  const isEdit = params.id && params.id !== 'new'
  const { user } = useAuthStore()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isCustomLeadTime, setIsCustomLeadTime] = useState(false)
  const [itemUi, setItemUi] = useState<Array<{ showNote: boolean; showDetails: boolean }>>([{ showNote: false, showDetails: false }])
  const [editable, setEditable] = useState(true)
  const [activeItemIdx, setActiveItemIdx] = useState(0)
  const [activeColorPickerIdx, setActiveColorPickerIdx] = useState<number | null>(null)
  const [activeDetailColorPickerKey, setActiveDetailColorPickerKey] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const [form, setForm] = useState<FormData & { specialDiscount: number; includeVat: boolean }>({
    customerId: '', customerName: '', attn: '', project: '',
    address: '', tel: '', customerHp: '', conditionTerm: '', validityDays: 30,
    leadTime: '', paymentTerm: '', remark: '', items: [emptyItem()], specialDiscount: 0, includeVat: true,
  })

  useEffect(() => {
    const customerParams = { active: 'true', ...(user?.id ? { salesId: user.id } : {}) }
    Promise.all([
      CustomersAPI.list(customerParams),
      UnitsAPI.list(),
    ]).then(([c, u]) => { setCustomers(c); setUnits(u) })

    if (isEdit) {
      setLoading(true)
      QuotationsAPI.get(params.id!)
        .then(doc => {
          if (!isEditableApprovalDocStatus(doc.status)) {
            setEditable(false)
            toast.error(EDITABLE_APPROVAL_DOC_MESSAGE)
            router.replace(`/quotations/${params.id!}`)
            return
          }
          const leadTime = doc.leadTime ?? ''
          const paymentTerm = doc.paymentTerm ?? ''
          setForm({
            customerId: doc.customerId ?? '',
            customerName: doc.customerName,
            attn: doc.attn ?? '',
            project: doc.project,
            address: doc.address ?? '',
            tel: doc.tel ?? '',
            customerHp: doc.customerHp ?? '',
            conditionTerm: doc.conditionTerm ?? '',
            validityDays: doc.validityDays,
            leadTime,
            paymentTerm,
            remark: doc.remark ?? '',
            items: doc.items.length > 0 ? doc.items.map(it => ({
              ...it,
              detailRows: Array.isArray(it.detailRows) && it.detailRows.length > 0 ? it.detailRows.map(row => normalizeDetailRow(row as Partial<QuotationItemDetail>)) : [],
              qty: Number(it.qty),
              materialPrice: Number(it.materialPrice),
              labourPrice: Number(it.labourPrice),
              price: Number(it.price),
              amount: Number(it.amount),
              images: Array.isArray(it.images) ? it.images : [],
            })).map(normalizeItem) : [emptyItem()],
            specialDiscount: Number(doc.specialDiscount ?? 0),
            includeVat: Number(doc.vat ?? 0) !== 0,
          })
          const nextItems = doc.items.length > 0 ? doc.items.map(it => ({
            ...it,
            detailRows: Array.isArray(it.detailRows) && it.detailRows.length > 0 ? it.detailRows.map(row => normalizeDetailRow(row as Partial<QuotationItemDetail>)) : [],
          })) : [emptyItem()]
          setItemUi(nextItems.map(item => ({ showNote: hasNoteContent(item.note), showDetails: hasDetailContent(item as QuotationItem) })))
          setIsCustomLeadTime(Boolean(leadTime) && !LEAD_TIME_OPTIONS.includes(leadTime as typeof LEAD_TIME_OPTIONS[number]))
        })
        .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
        .finally(() => setLoading(false))
    }
  }, [isEdit, params.id, user?.id])

  const subTotal = roundMoney(form.items.reduce((s, i) => s + calcItemTotal(i), 0))
  const afterDiscount = roundMoney(subTotal - Number(form.specialDiscount))
  const vat = form.includeVat ? roundMoney(afterDiscount * VAT_RATE) : 0
  const grandTotal = roundMoney(afterDiscount + vat)
  const leadTimeSelectValue = isCustomLeadTime ? CUSTOM_LEAD_TIME : getSelectValue(form.leadTime, LEAD_TIME_OPTIONS, CUSTOM_LEAD_TIME)
  const customLeadTimeDays = getLeadTimeDays(form.leadTime)

  const setItem = (idx: number, key: keyof QuotationItem, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = normalizeItem({ ...items[idx], [key]: val })
      return { ...f, items }
    })
  }

  const setItemDescriptionText = (idx: number, text: string) => {
    setForm(f => {
      const items = [...f.items]
      const descLine = parseColoredLine(items[idx].desc)
      items[idx] = normalizeItem({
        ...items[idx],
        desc: stringifyColoredLine({ text, color: descLine.color }),
      })
      return { ...f, items }
    })
  }

  const setItemDescriptionColor = (idx: number, color: string) => {
    setForm(f => {
      const items = [...f.items]
      const descLine = parseColoredLine(items[idx].desc)
      items[idx] = normalizeItem({
        ...items[idx],
        desc: stringifyColoredLine({ text: descLine.text, color }),
      })
      return { ...f, items }
    })
  }

  const setItemNoteBlock = (itemIdx: number, noteIdx: number, text: string) => {
    setForm(f => {
      const items = [...f.items]
      const blocks = parseNoteBlocks(items[itemIdx].note)
      const nextBlocks = blocks.length > 0 ? [...blocks] : ['']
      nextBlocks[noteIdx] = text
      items[itemIdx] = normalizeItem({ ...items[itemIdx], note: stringifyNoteBlocks(nextBlocks) })
      return { ...f, items }
    })
  }

  const addNoteBlock = (itemIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const blocks = parseNoteBlocks(items[itemIdx].note)
      const nextBlocks = [...blocks, '']
      items[itemIdx] = normalizeItem({ ...items[itemIdx], note: stringifyNoteBlocks(nextBlocks) })
      return { ...f, items }
    })
  }

  const removeNoteBlock = (itemIdx: number, noteIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const blocks = parseNoteBlocks(items[itemIdx].note)
      blocks.splice(noteIdx, 1)
      items[itemIdx] = normalizeItem({ ...items[itemIdx], note: stringifyNoteBlocks(blocks) })
      return { ...f, items }
    })
  }

  const setDetailRow = (itemIdx: number, rowIdx: number, key: keyof QuotationItemDetail, val: string | number) => {
    setForm(f => {
      const items = [...f.items]
      const detailRows = [...(items[itemIdx].detailRows || [emptyDetailRow()])]
      detailRows[rowIdx] = normalizeDetailRow({ ...detailRows[rowIdx], [key]: val })
      items[itemIdx] = normalizeItem({ ...items[itemIdx], detailRows })
      return { ...f, items }
    })
  }

  const addDetailRow = (itemIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const detailRows = [...(items[itemIdx].detailRows || []), normalizeDetailRow({ qty: 1, materialPrice: 0, labourPrice: 0, unit: '' })]
      items[itemIdx] = normalizeItem({ ...items[itemIdx], detailRows })
      return { ...f, items }
    })
  }

  const removeDetailRow = (itemIdx: number, rowIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const detailRows = [...(items[itemIdx].detailRows || [])]
      detailRows.splice(rowIdx, 1)
      items[itemIdx] = normalizeItem({ ...items[itemIdx], detailRows: detailRows.length > 0 ? detailRows : [] })
      return { ...f, items }
    })
  }

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
    setItemUi(prev => [...prev, { showNote: false, showDetails: false }])
    setActiveItemIdx(form.items.length)
  }

  const removeItem = (idx: number) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
    setItemUi(prev => prev.filter((_, i) => i !== idx))
  }

  const revealNote = (idx: number) => {
    setItemUi(prev => prev.map((ui, i) => (i === idx ? { ...ui, showNote: true } : ui)))
    addNoteBlock(idx)
  }

  const revealDetails = (idx: number) => {
    setItemUi(prev => prev.map((ui, i) => (i === idx ? { ...ui, showDetails: true } : ui)))
    if (!(form.items[idx].detailRows && form.items[idx].detailRows.length > 0)) {
      addDetailRow(idx)
    }
  }

  const triggerActiveImageUpload = () => {
    if (!form.items[activeItemIdx]) return
    uploadInputRef.current?.click()
  }

  const triggerItemImageUpload = (itemIdx: number) => {
    if (!form.items[itemIdx]) return
    setActiveItemIdx(itemIdx)
    uploadInputRef.current?.click()
  }

  const uploadItemImages = async (itemIdx: number, files: FileList | null) => {
    if (!editable) return
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return toast.error('รองรับเฉพาะไฟล์รูปภาพ')
    const tId = toast.loading('กำลังอัปโหลดรูป...')
    try {
      const saved = await UploadAPI.upload(imageFiles, {
        category: 'quotation-item',
        ...(isEdit ? { quotationId: params.id! } : {}),
      })
      const urls = saved.map((a: any) => a.fileUrl).filter(Boolean)
      setForm(f => {
        const items = [...f.items]
        items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...urls] }
        return { ...f, items }
      })
      toast.success('อัปโหลดรูปสำเร็จ', { id: tId })
    } catch {
      toast.error('อัปโหลดไม่สำเร็จ', { id: tId })
    }
  }

  const removeItemImage = (itemIdx: number, urlIdx: number) => {
    setForm(f => {
      const items = [...f.items]
      const imgs = [...(items[itemIdx].images || [])]
      imgs.splice(urlIdx, 1)
      items[itemIdx] = { ...items[itemIdx], images: imgs }
      return { ...f, items }
    })
  }

  const handleCustomer = (id: string) => {
    const c = customers.find(x => x.id === id)
    setForm(f => ({
      ...f,
      customerId: id,
      customerName: c?.name ?? f.customerName,
      attn: c?.contactPerson ?? f.attn,
      address: c?.address ?? f.address,
      tel: c?.tel ?? f.tel,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editable) return
    if (!form.customerName || !form.project) {
      toast.error('กรุณากรอกลูกค้าและโครงการ')
      return
    }
    if (form.items.some(i => !parseColoredLine(i.desc).text.trim())) {
      toast.error('กรุณากรอกรายการสินค้า')
      return
    }
    if (form.items.some(i => !Number.isFinite(Number(i.qty)) || !Number.isFinite(Number(i.materialPrice)) || !Number.isFinite(Number(i.labourPrice)))) {
      toast.error('Q\'ty และ Price ต้องเป็นตัวเลข')
      return
    }
    if (form.items.some(i => (i.detailRows || []).some(r => !Number.isFinite(Number(r.materialPrice))))) {
      toast.error('ราคาในบรรทัดย่อยต้องเป็นตัวเลข')
      return
    }
    setSaving(true)
    try {
      // 1) Save any new units used by items (ignore duplicates)
      const existingUnitNames = new Set(units.map(u => u.name.trim().toLowerCase()))
      const newUnitNames = Array.from(new Set(
        form.items
          .map(i => (i.unit || '').trim())
          .filter(n => n && !existingUnitNames.has(n.toLowerCase()))
      ))
      for (const name of newUnitNames) {
        try { await UnitsAPI.create({ name }) } catch { /* duplicate or other - ignore */ }
      }

      // 2) Resolve customer: create new if none selected, else update changed fields
      let customerId = form.customerId
      if (!customerId) {
        try {
          const created = await CustomersAPI.create({
            name: form.customerName.trim(),
            contactPerson: form.attn || undefined,
            tel: form.tel || undefined,
            address: form.address || undefined,
          })
          customerId = created.id
        } catch { /* fall through — backend QO still accepts customerName */ }
      } else {
        const orig = customers.find(c => c.id === customerId)
        if (orig) {
          const patch: Partial<Customer> = {}
          if ((orig.name || '') !== (form.customerName || '')) patch.name = form.customerName
          if ((orig.contactPerson || '') !== (form.attn || '')) patch.contactPerson = form.attn
          if ((orig.tel || '') !== (form.tel || '')) patch.tel = form.tel
          if ((orig.address || '') !== (form.address || '')) patch.address = form.address
          if (Object.keys(patch).length > 0) {
            try { await CustomersAPI.update(customerId, patch) } catch { /* ignore */ }
          }
        }
      }

      const payload = {
        ...form,
        customerId,
        subTotal,
        vat,
        grandTotal,
        items: form.items.map((item, i) => ({ ...normalizeItem(item), seq: i + 1 })),
      }
      if (isEdit) {
        await QuotationsAPI.update(params.id!, payload)
      } else {
        const created = await QuotationsAPI.create(payload)
        router.replace(`/quotations/${created.id}`)
        toast.success('สร้างใบเสนอราคาสำเร็จ')
        return
      }
      toast.success('บันทึกสำเร็จ')
      router.back()
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="page-title">{isEdit ? 'แก้ไขใบเสนอราคา (QO)' : 'สร้างใบเสนอราคา (QO) ใหม่'}</h2>
      </div>

      {/* Header info */}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="form-label">ลูกค้า (เลือกจากรายการ)</label>
          <select
            className="form-input"
            value={form.customerId}
            onChange={e => handleCustomer(e.target.value)}
          >
            <option value="">— เลือกลูกค้า —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">ชื่อลูกค้า *</label>
          <input className="form-input" value={form.customerName}
            onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
        </div>
        <div>
          <label className="form-label">ผู้ติดต่อ</label>
          <input className="form-input" value={form.attn}
            onChange={e => setForm(f => ({ ...f, attn: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">โทร</label>
          <input className="form-input" value={form.tel}
            onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">HP ลูกค้า</label>
          <input className="form-input" value={form.customerHp}
            onChange={e => setForm(f => ({ ...f, customerHp: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ชื่อโครงการ *</label>
          <input className="form-input" value={form.project}
            onChange={e => setForm(f => ({ ...f, project: e.target.value }))} required />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">ที่อยู่</label>
          <input className="form-input" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">การชำระเงิน</label>
          <input
            className="form-input"
            value={form.paymentTerm}
            placeholder="ระบุการชำระเงิน"
            onChange={e => setForm(f => ({ ...f, paymentTerm: e.target.value }))}
          />
        </div>
        <div>
          <label className="form-label">Lead Time</label>
          <select
            className="form-input"
            value={leadTimeSelectValue}
            onChange={e => {
              const selected = e.target.value
              setIsCustomLeadTime(selected === CUSTOM_LEAD_TIME)
              setForm(f => ({
                ...f,
                leadTime: selected === CUSTOM_LEAD_TIME ? (LEAD_TIME_OPTIONS.includes(f.leadTime as typeof LEAD_TIME_OPTIONS[number]) ? '' : f.leadTime) : selected,
              }))
            }}
          >
            <option value="">— เลือก Lead Time —</option>
            {LEAD_TIME_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
            <option value={CUSTOM_LEAD_TIME}>ระบุเอง</option>
          </select>
          {isCustomLeadTime && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                className="form-input"
                value={customLeadTimeDays}
                placeholder="จำนวนวัน"
                onChange={e => {
                  const days = e.target.value.replace(/[^0-9]/g, '')
                  setForm(f => ({ ...f, leadTime: days ? `${days} Days` : '' }))
                }}
              />
              <span className="text-sm text-gray-600">วัน</span>
            </div>
          )}
        </div>
        <div>
          <label className="form-label">อายุใบเสนอราคา (วัน)</label>
          <input type="number" className="form-input" min={1} value={form.validityDays}
            onChange={e => setForm(f => ({ ...f, validityDays: +e.target.value }))} />
        </div>
        <div>
          <label className="form-label">เงื่อนไขอื่นๆ</label>
          <input className="form-input" value={form.conditionTerm}
            onChange={e => setForm(f => ({ ...f, conditionTerm: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="form-label">หมายเหตุ</label>
          <textarea className="form-input" rows={2} value={form.remark}
            onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
        </div>
      </div>

      {/* Items */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">รายการสินค้า/บริการ</h3>
          <button type="button" className="btn-outline btn-sm" onClick={addItem}>
            <Plus size={14} /> เพิ่มรายการ
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="border border-gray-100 rounded-lg">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-green-dark to-[#2f6a34] text-white shadow-sm [text-shadow:0_1px_0_rgba(0,0,0,0.28)]">
                <tr>
                  <th rowSpan={2} className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-10 align-middle border-b border-white/20">#</th>
                  <th rowSpan={2} className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white align-middle border-b border-white/20">Description</th>
                  <th rowSpan={2} className="text-right py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-20 align-middle border-b border-white/20">Q&apos;ty</th>
                  <th rowSpan={2} className="text-left py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-24 align-middle border-b border-white/20">Unit</th>
                  <th colSpan={2} className="text-center py-3 px-3 text-[12px] md:text-[13px] font-semibold tracking-[0.06em] text-white/90 border-b border-white/20">Pricing / Unit</th>
                  <th rowSpan={2} className="text-right py-3.5 px-3 text-[13px] md:text-[14px] font-bold tracking-[0.02em] text-white w-32 align-middle border-b border-white/20">Total Amount</th>
                  <th rowSpan={2} className="w-9 border-b border-white/20"></th>
                </tr>
                <tr>
                  <th className="text-right py-2.5 px-3 text-[13px] md:text-[14px] font-bold text-white w-32">Material Price</th>
                  <th className="text-right py-2.5 px-3 text-[13px] md:text-[14px] font-bold text-white w-32">Labour Price</th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, i) => {
                  const showNoteSection = Boolean(itemUi[i]?.showNote) || hasNoteContent(item.note)
                  const showDetailSection = Boolean(itemUi[i]?.showDetails) || hasDetailContent(item)
                  const noteBlocks = parseNoteBlocks(item.note)
                  return (
                  <Fragment key={i}>
                    <tr className={`border-t align-top ${activeItemIdx === i ? 'border-green-400 bg-green-50/40' : 'border-gray-100'}`}>
                      <td className="py-2.5 px-2 text-gray-400 text-xs pt-3.5">{i + 1}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-start gap-2">
                          <input
                            className="form-input py-1 w-full"
                            value={parseColoredLine(item.desc).text}
                            onFocus={() => setActiveItemIdx(i)}
                            onChange={e => setItemDescriptionText(i, e.target.value)}
                            placeholder="ชื่อสินค้า/บริการ *"
                            required
                          />
                          <div className="relative shrink-0" onBlurCapture={e => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiveColorPickerIdx(null)
                          }}>
                            <button
                              type="button"
                              className="form-input flex h-9 w-11 items-center justify-center gap-1 rounded-md px-0"
                              onClick={() => setActiveColorPickerIdx(activeColorPickerIdx === i ? null : i)}
                              title="สีข้อความรายการ"
                              aria-label="สีข้อความรายการ"
                            >
                              <span
                                aria-hidden="true"
                                className="h-3.5 w-3.5 rounded-full border border-white shadow-sm"
                                style={{ backgroundColor: parseColoredLine(item.desc).color || DEFAULT_LINE_COLOR }}
                              />
                              <span aria-hidden="true" className="text-[10px] leading-none text-gray-500">▾</span>
                            </button>
                            {activeColorPickerIdx === i ? (
                              <div className="absolute left-0 top-full z-20 mt-1 min-w-36 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                                {MAIN_ITEM_COLORS.map(color => {
                                  const selected = (parseColoredLine(item.desc).color || DEFAULT_LINE_COLOR) === color.value
                                  return (
                                    <button
                                      key={color.value}
                                      type="button"
                                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-green-50 ${selected ? 'bg-green-50 font-medium text-green-700' : 'text-gray-700'}`}
                                      onClick={() => {
                                        setItemDescriptionColor(i, color.value)
                                        setActiveColorPickerIdx(null)
                                      }}
                                    >
                                      <span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color.value }} />
                                      <span>{color.label}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {showNoteSection ? (
                          <div className="mt-2 space-y-2">
                            {(noteBlocks.length > 0 ? noteBlocks : ['']).map((noteText, noteIdx) => (
                              <div key={`${i}-note-${noteIdx}`} className="flex items-start gap-2">
                                <textarea
                                  className="form-input py-1 text-xs w-full"
                                  rows={3}
                                  value={noteText}
                                  onFocus={() => setActiveItemIdx(i)}
                                  onChange={e => setItemNoteBlock(i, noteIdx, e.target.value)}
                                  placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
                                />
                                <button
                                  type="button"
                                  className="mt-1 p-1 text-red-400 hover:text-red-600"
                                  onClick={() => removeNoteBlock(i, noteIdx)}
                                  title="ลบหมายเหตุ"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() => addNoteBlock(i)}
                            >
                              <Plus size={14} /> เพิ่มหมายเหตุ
                            </button>
                          </div>
                        ) : null}
                        <div className="mt-2">
                          {item.images && item.images.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {item.images.map((url, imgIdx) => (
                                <div key={imgIdx} className="relative group">
                                  <img
                                    src={resolveFileUrl(url)}
                                    alt=""
                                    className="w-14 h-14 object-cover rounded border border-gray-200"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeItemImage(i, imgIdx)}
                                    className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="ลบรูป"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => triggerItemImageUpload(i)}
                          >
                            <ImagePlus size={14} /> เพิ่มรูปภาพ
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number" min={0} max={99999} step="any"
                          className="form-input py-1 text-right"
                          value={emptyWhenZero(item.qty)}
                          onFocus={() => setActiveItemIdx(i)}
                          onChange={e => {
                            const raw = e.target.value.trim()
                            setItem(i, 'qty', raw === '' ? 0 : Number(raw))
                          }}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          list="units-datalist"
                          className="form-input py-1"
                          value={item.unit}
                          onFocus={() => setActiveItemIdx(i)}
                          onChange={e => setItem(i, 'unit', e.target.value)}
                          placeholder="-"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number" min={0} step="any"
                          className="form-input py-1 text-right"
                          value={item.materialPrice}
                          onFocus={() => setActiveItemIdx(i)}
                          onChange={e => setItem(i, 'materialPrice', +e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number" min={0} step="any"
                          className="form-input py-1 text-right"
                          value={item.labourPrice}
                          onFocus={() => setActiveItemIdx(i)}
                          onChange={e => setItem(i, 'labourPrice', +e.target.value)}
                        />
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium pr-2 pt-3.5">
                        {new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(normalizeItem(item).amount)}
                      </td>
                      <td className="py-2.5 px-2 pt-3">
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)}
                            className="p-1 text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {showDetailSection && (item.detailRows || []).map((detail, detailIdx) => (
                      <tr key={`${i}-${detailIdx}`} className="border-t border-gray-100 bg-white/60 align-top">
                        <td className="py-1.5 px-2" />
                        <td className="py-1.5 px-2">
                          <div className="flex items-start gap-2">
                            <input
                              className="form-input py-1 text-xs w-full text-gray-700"
                              value={parseColoredLine(detail.desc).text}
                              onFocus={() => setActiveItemIdx(i)}
                              onChange={e => {
                                const prev = parseColoredLine(detail.desc)
                                setDetailRow(i, detailIdx, 'desc', stringifyColoredLine({ text: e.target.value, color: prev.color }))
                              }}
                              placeholder={`รายละเอียดบรรทัดที่ ${detailIdx + 1} (ไม่บังคับ)`}
                            />
                            <div
                              className="relative shrink-0"
                              onBlurCapture={e => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiveDetailColorPickerKey(null)
                              }}
                            >
                              <button
                                type="button"
                                className="form-input flex h-8 w-11 items-center justify-center gap-1 rounded-md px-0"
                                onFocus={() => setActiveItemIdx(i)}
                                onClick={() => {
                                  const key = `${i}-${detailIdx}`
                                  setActiveDetailColorPickerKey(activeDetailColorPickerKey === key ? null : key)
                                }}
                                title="สีข้อความรายละเอียด"
                                aria-label="สีข้อความรายละเอียด"
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-3 w-3 rounded-full border border-white shadow-sm"
                                  style={{ backgroundColor: parseColoredLine(detail.desc).color || DEFAULT_LINE_COLOR }}
                                />
                                <span aria-hidden="true" className="text-[10px] leading-none text-gray-500">▾</span>
                              </button>
                              {activeDetailColorPickerKey === `${i}-${detailIdx}` ? (
                                <div className="absolute left-0 top-full z-20 mt-1 min-w-36 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                                  {MAIN_ITEM_COLORS.map(color => {
                                    const selected = (parseColoredLine(detail.desc).color || DEFAULT_LINE_COLOR) === color.value
                                    return (
                                      <button
                                        key={color.value}
                                        type="button"
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-green-50 ${selected ? 'bg-green-50 font-medium text-green-700' : 'text-gray-700'}`}
                                        onClick={() => {
                                          const prev = parseColoredLine(detail.desc)
                                          setDetailRow(i, detailIdx, 'desc', stringifyColoredLine({ text: prev.text, color: color.value }))
                                          setActiveDetailColorPickerKey(null)
                                        }}
                                      >
                                        <span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color.value }} />
                                        <span>{color.label}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min={0}
                            max={99999}
                            step="any"
                            className="form-input py-1 text-xs text-right"
                            value={emptyWhenZero(detail.qty)}
                            onFocus={() => setActiveItemIdx(i)}
                            onChange={e => {
                              const raw = e.target.value.trim()
                              setDetailRow(i, detailIdx, 'qty', raw === '' ? 0 : Number(raw))
                            }}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            list="units-datalist"
                            className="form-input py-1 text-xs"
                            value={detail.unit || ''}
                            onFocus={() => setActiveItemIdx(i)}
                            onChange={e => setDetailRow(i, detailIdx, 'unit', e.target.value)}
                            placeholder="-"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="form-input py-1 text-xs text-right"
                            value={emptyWhenZero(detail.materialPrice)}
                            onFocus={() => setActiveItemIdx(i)}
                            onChange={e => setDetailRow(i, detailIdx, 'materialPrice', Number(e.target.value || 0))}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="form-input py-1 text-xs text-right"
                            value={emptyWhenZero(detail.labourPrice)}
                            onFocus={() => setActiveItemIdx(i)}
                            onChange={e => setDetailRow(i, detailIdx, 'labourPrice', Number(e.target.value || 0))}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right pr-2">
                          <span className="inline-block min-w-[72px] rounded bg-gray-100 px-2 py-1 text-right text-xs font-semibold text-gray-700">
                            {(() => {
                              const detailAmount = Number(detail.qty || 0) * (Number(detail.materialPrice || 0) + Number(detail.labourPrice || 0))
                              return detailAmount === 0
                                ? ''
                                : new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(detailAmount)
                            })()}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <button
                            type="button"
                            className="p-1 text-red-400 hover:text-red-600 transition-colors"
                            onClick={() => removeDetailRow(i, detailIdx)}
                            title="ลบรายละเอียด"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {showDetailSection ? (
                      <tr className="border-t border-gray-100 bg-white/60">
                        <td className="py-2 px-2" />
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => addDetailRow(i)}
                          >
                            <Plus size={14} /> เพิ่มบรรทัด
                          </button>
                        </td>
                        <td colSpan={6} className="py-2 px-2" />
                      </tr>
                    ) : null}
                  </Fragment>
                  )
                })}
                <tr className="border-t border-gray-100 bg-white/70">
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-outline btn-sm" onClick={addItem}>
                        <Plus size={14} /> เพิ่มรายการ
                      </button>
                      <button type="button" className="btn-outline btn-sm" onClick={() => revealNote(activeItemIdx)} disabled={!form.items[activeItemIdx]}>
                        <Plus size={14} /> เพิ่มหมายเหตุ
                      </button>
                      <button type="button" className="btn-outline btn-sm" onClick={() => revealDetails(activeItemIdx)} disabled={!form.items[activeItemIdx]}>
                        <Plus size={14} /> เพิ่มบรรทัด
                      </button>
                      <div className="flex flex-nowrap items-center gap-2">
                        <button type="button" className="btn-outline btn-sm whitespace-nowrap shrink-0" onClick={triggerActiveImageUpload} disabled={!form.items[activeItemIdx]}>
                          <ImagePlus size={14} /> เพิ่มรูปภาพ
                        </button>
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={e => {
                            uploadItemImages(activeItemIdx, e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td colSpan={6} className="px-2 py-2" />
                </tr>
              </tbody>
              <tfoot className="sticky bottom-0 bg-white shadow-[0_-1px_0_0_#e5e7eb]">
                <tr className="bg-gray-50">
                  <td colSpan={6} className="text-right font-semibold px-2 py-2">ยอดรวม</td>
                  <td className="text-right font-semibold pr-2">
                    {new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(subTotal)}
                  </td>
                  <td></td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={6} className="text-right text-gray-500 px-2 py-1">ส่วนลดพิเศษ</td>
                  <td className="text-right pr-2">
                    <input type="number" min={0} step="any" className="form-input py-0.5 text-right w-24 inline-block"
                      value={form.specialDiscount} onChange={e => setForm(f => ({ ...f, specialDiscount: +e.target.value }))} />
                  </td>
                  <td></td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={6} className="text-right text-gray-500 px-2 py-1">ยอดรวมหลังหักส่วนลด</td>
                  <td className="text-right text-gray-500 pr-2">
                    {new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(afterDiscount)}
                  </td>
                  <td></td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={6} className="text-right text-gray-500 px-2 py-1">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.includeVat}
                        onChange={e => setForm(f => ({ ...f, includeVat: e.target.checked }))}
                      />
                      <span>คิด VAT 7%</span>
                    </label>
                  </td>
                  <td className="text-right text-gray-500 pr-2">
                    {form.includeVat
                      ? new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(vat)
                      : '-'}
                  </td>
                  <td></td>
                </tr>
                <tr className="bg-green-pale">
                  <td colSpan={6} className="text-right font-bold text-green-dark px-2 py-2">ยอดรวมทั้งสิ้น</td>
                  <td className="text-right font-bold text-green-dark pr-2 text-base">
                    ฿{new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grandTotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Datalist for Unit autocomplete (shared by all rows) */}
      <datalist id="units-datalist">
        {units.map(u => <option key={u.id} value={u.name} />)}
      </datalist>

      {/* Submit */}
      <div className="sticky bottom-0 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-200 flex justify-end gap-3 z-20">
        <button type="button" className="btn-outline" onClick={() => router.back()}>ยกเลิก</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : isEdit ? 'บันทึกการแก้ไข' : 'สร้างใบเสนอราคา'}
        </button>
      </div>
    </form>
  )
}
