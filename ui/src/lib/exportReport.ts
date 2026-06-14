/**
 * Export utilities for QuoSummaryReport
 * Supports: Excel (xlsx / SheetJS), PDF (jspdf + jspdf-autotable)
 */
import type { QuoSummaryReport } from '@/types'
import { STATUS_LABELS } from '@/types'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function statusLabel(s: string) { return STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s }

// ─── EXCEL EXPORT ───────────────────────────────────────────────────────────

export async function exportExcel(d: QuoSummaryReport, filename = 'quotation-summary') {
  const XLSX = await import('xlsx')

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Overview ──
  const overviewRows = [
    ['รายงานสรุปใบเสนอราคา'],
    [`ช่วงวันที่: ${fmtDate(d.dateRange.from)} – ${fmtDate(d.dateRange.to)}`],
    [],
    ['ภาพรวม (Executive Summary)', ''],
    ['ใบเสนอราคาทั้งหมด', d.overview.total],
    ['มูลค่ารวม (บาท)', d.overview.totalValue],
    ['มูลค่าเฉลี่ยต่อใบ (บาท)', d.overview.avgDealSize],
    ['Win Rate (มีใบสั่งงาน)', fmtPct(d.overview.winRate)],
    ['จำนวนที่ Convert เป็น WO', d.overview.convertedCount],
    ['ส่วนลดเฉลี่ย (%)', fmtPct(d.overview.avgDiscountPct)],
    ['หมดอายุ (Expired)', d.overview.expiredCount],
    [],
    ['รายละเอียดตามสถานะ'],
    ['สถานะ', 'จำนวน', 'มูลค่ารวม (บาท)', 'มูลค่าเฉลี่ย (บาท)', 'สัดส่วน (%)'],
    ...Object.entries(d.statusDetails).map(([status, info]) => [
      statusLabel(status),
      info.count,
      info.totalValue,
      info.count > 0 ? +(info.totalValue / info.count).toFixed(2) : 0,
      d.overview.total > 0 ? +((info.count / d.overview.total) * 100).toFixed(1) : 0,
    ]),
    [],
    ['Pipeline (เปิดอยู่)', d.pipeline.openCount, d.pipeline.openValue],
    ['ใกล้หมดอายุ (7 วัน)', d.pipeline.expiringSoonCount],
    ['Revision: ใบที่ถูก Revise', d.revisionTracking.activeRevisedCount],
    ['Revision: เฉลี่ยต่อใบ', d.revisionTracking.avgRevisionNo],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(overviewRows)
  ws1['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'ภาพรวม')

  // ── Sheet 2: By Salesperson ──
  const salesRows = [
    ['วิเคราะห์ตามพนักงานขาย'],
    ['พนักงานขาย', 'จำนวนใบ', 'มูลค่ารวม (บาท)', 'Win Rate (%)', 'มี WO', 'Pipeline (ใบ)', 'มูลค่า Pipeline', 'Revised'],
    ...d.bySalesperson.map(s => [
      s.salesName, s.count, s.totalValue, s.winRate, s.wonCount,
      s.pipelineCount, s.pipelineValue, s.revisedCount,
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(salesRows)
  ws2['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'ตามพนักงานขาย')

  // ── Sheet 3: Customers ──
  const custRows = [
    ['วิเคราะห์ตามลูกค้า (Top ' + d.customers.top10.length + ')'],
    [`ลูกค้าใหม่: ${d.customers.newCount}  ลูกค้าเดิม: ${d.customers.returningCount}`],
    [],
    ['ลูกค้า', 'จำนวนใบ', 'มูลค่ารวม (บาท)', 'มีWO (Won)', 'Win Rate (%)'],
    ...d.customers.top10.map(c => [c.customerName, c.count, c.totalValue, c.wonCount, c.winRate]),
    [],
    ['ประเภทลูกค้า', 'จำนวน'],
    ...d.customers.typeDistribution.map(t => [t.type, t.count]),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(custRows)
  ws3['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'ลูกค้า')

  // ── Sheet 4: Top Items ──
  const itemRows = [
    ['สินค้า/บริการที่เสนอราคาบ่อย'],
    ['#', 'รายการ', 'ถูกเสนอ (ครั้ง)', 'มูลค่ารวม (บาท)'],
    ...d.topItems.map((item, i) => [i + 1, item.desc, item.count, item.totalAmount]),
  ]
  const ws4 = XLSX.utils.aoa_to_sheet(itemRows)
  ws4['!cols'] = [{ wch: 5 }, { wch: 50 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'สินค้า_บริการ')

  // ── Sheet 5: Monthly Trend ──
  const trendRows = [
    ['แนวโน้มรายเดือน'],
    ['เดือน', 'จำนวนใบ', 'มูลค่ารวม (บาท)', 'มีWO (Won)'],
    ...d.monthlyTrend.map(m => {
      const [yr, mm] = m.month.split('-')
      return [`${mm}/${yr}`, m.count, m.totalValue, m.wonCount]
    }),
  ]
  const ws5 = XLSX.utils.aoa_to_sheet(trendRows)
  ws5['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws5, 'แนวโน้มรายเดือน')

  // ── Sheet 6: Discount ──
  const discRows = [
    ['วิเคราะห์ส่วนลด'],
    ['ส่วนลดเฉลี่ย (%)', d.discountAnalysis.avgDiscountPct],
    ['ใบที่มีส่วนลด', d.discountAnalysis.withDiscountCount],
    ['ใบที่ไม่มีส่วนลด', d.discountAnalysis.noDiscountCount],
    [],
    ['ช่วงส่วนลด', 'จำนวนใบ'],
    ...d.discountAnalysis.distribution.map(b => [b.range, b.count]),
  ]
  const ws6 = XLSX.utils.aoa_to_sheet(discRows)
  ws6['!cols'] = [{ wch: 20 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws6, 'ส่วนลด')

  // ── Sheet 7: Pipeline ──
  const pipeRows = [
    ['Pipeline & Expiring Soon'],
    [`ใบเปิดอยู่: ${d.pipeline.openCount}   มูลค่า: ${fmtMoney(d.pipeline.openValue)} บาท`],
    [],
    ['ใกล้หมดอายุ (7 วัน)'],
    ['เลขที่', 'ลูกค้า', 'พนักงานขาย', 'มูลค่า (บาท)', 'วันหมดอายุ', 'สถานะ'],
    ...d.pipeline.expiringSoon.map(q => [
      q.quoNo, q.customerName, q.salesName ?? '', q.grandTotal, fmtDate(q.expiryDate), statusLabel(q.status),
    ]),
    [],
    ['ค้างเกินกำหนด (Overdue)'],
    ['เลขที่', 'ลูกค้า', 'พนักงานขาย', 'มูลค่า (บาท)', 'วันหมดอายุ', 'สถานะ'],
    ...d.pipeline.overdue.map(q => [
      q.quoNo, q.customerName, q.salesName ?? '', q.grandTotal, fmtDate(q.expiryDate), statusLabel(q.status),
    ]),
  ]
  const ws7 = XLSX.utils.aoa_to_sheet(pipeRows)
  ws7['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws7, 'Pipeline')

  // ── Write file ──
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── PDF EXPORT ─────────────────────────────────────────────────────────────

export async function exportPdf(d: QuoSummaryReport, filename = 'quotation-summary') {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Thai-compatible font support — jsPDF's built-in fonts don't support Thai.
  // We use a latin fallback with transliterated headers for PDF; for full Thai
  // display you'd need to embed a Thai TTF font (e.g. Sarabun) via addFileToVFS.
  // The Excel export already handles Thai correctly.

  const rangeLabel = `${fmtDate(d.dateRange.from)} - ${fmtDate(d.dateRange.to)}`
  const pageW = doc.internal.pageSize.getWidth()

  // ── Title ──
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Quotation Summary Report', pageW / 2, 14, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(rangeLabel, pageW / 2, 20, { align: 'center' })

  let y = 26

  // ── Executive Summary ──
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('1. Executive Summary', 10, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Quotations', String(d.overview.total)],
      ['Total Value (THB)', fmtMoney(d.overview.totalValue)],
      ['Avg Deal Size (THB)', fmtMoney(d.overview.avgDealSize)],
      ['Win Rate (has WO)', fmtPct(d.overview.winRate)],
      ['Converted to WO', String(d.overview.convertedCount)],
      ['Avg Discount', fmtPct(d.overview.avgDiscountPct)],
      ['Expired (in pipeline)', String(d.overview.expiredCount)],
      ['Open Pipeline', `${d.pipeline.openCount} pcs / ${fmtMoney(d.pipeline.openValue)} THB`],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [27, 94, 32], textColor: 255 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 80 } },
    margin: { left: 10 },
    tableWidth: 140,
  })

  // Status breakdown beside
  const statusBody = Object.entries(d.statusDetails).map(([status, info]) => [
    statusLabel(status),
    String(info.count),
    fmtMoney(info.totalValue),
    d.overview.total > 0 ? fmtPct((info.count / d.overview.total) * 100) : '0%',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Status', 'Count', 'Value (THB)', '%']],
    body: statusBody,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [45, 106, 46], textColor: 255 },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 16 }, 2: { cellWidth: 36 }, 3: { cellWidth: 16 } },
    margin: { left: 160 },
    tableWidth: 130,
  })

  // ── Per Salesperson ──
  doc.addPage()
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('2. Performance by Salesperson', 10, 14)

  autoTable(doc, {
    startY: 18,
    head: [['Salesperson', 'Count', 'Total Value (THB)', 'Win Rate', 'Won (WO)', 'Pipeline', 'Pipeline Value', 'Revised']],
    body: d.bySalesperson.map(s => [
      s.salesName, String(s.count), fmtMoney(s.totalValue),
      fmtPct(s.winRate), String(s.wonCount),
      String(s.pipelineCount), fmtMoney(s.pipelineValue), String(s.revisedCount),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [27, 94, 32], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 247, 240] },
    margin: { left: 10, right: 10 },
  })

  // ── Top Customers ──
  const salesLastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 100
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('3. Top Customers', 10, salesLastY + 8)

  autoTable(doc, {
    startY: salesLastY + 12,
    head: [['Customer', 'Count', 'Total Value (THB)', 'Won (WO)', 'Win Rate']],
    body: d.customers.top10.map(c => [
      c.customerName, String(c.count), fmtMoney(c.totalValue), String(c.wonCount), fmtPct(c.winRate),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [45, 106, 46], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 247, 240] },
    margin: { left: 10, right: 10 },
  })

  // ── Monthly Trend ──
  doc.addPage()
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('4. Monthly Trend', 10, 14)

  autoTable(doc, {
    startY: 18,
    head: [['Month', 'Count', 'Total Value (THB)', 'Won (WO)']],
    body: d.monthlyTrend.map(m => {
      const [yr, mm] = m.month.split('-')
      return [`${mm}/${yr}`, String(m.count), fmtMoney(m.totalValue), String(m.wonCount)]
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [27, 94, 32], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 247, 240] },
    margin: { left: 10 },
    tableWidth: 130,
  })

  // ── Top Items ──
  const trendLastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 100
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('5. Top Quoted Items', 10, trendLastY + 8)

  autoTable(doc, {
    startY: trendLastY + 12,
    head: [['#', 'Item Description', 'Times Quoted', 'Total Amount (THB)']],
    body: d.topItems.slice(0, 15).map((item, i) => [
      String(i + 1), item.desc.length > 70 ? item.desc.slice(0, 70) + '…' : item.desc,
      String(item.count), fmtMoney(item.totalAmount),
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [45, 106, 46], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 247, 240] },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 130 }, 2: { cellWidth: 26 }, 3: { cellWidth: 36 } },
    margin: { left: 10, right: 10 },
  })

  // ── Pipeline ──
  if (d.pipeline.expiringSoon.length > 0 || d.pipeline.overdue.length > 0) {
    doc.addPage()
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('6. Pipeline - Expiring Soon & Overdue', 10, 14)
    let pipeY = 18

    if (d.pipeline.expiringSoon.length > 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Expiring within 7 days:', 10, pipeY)
      pipeY += 4
      autoTable(doc, {
        startY: pipeY,
        head: [['Quo No.', 'Customer', 'Salesperson', 'Value (THB)', 'Expiry', 'Status']],
        body: d.pipeline.expiringSoon.map(q => [
          q.quoNo, q.customerName, q.salesName ?? '', fmtMoney(q.grandTotal), fmtDate(q.expiryDate), statusLabel(q.status),
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [220, 80, 40], textColor: 255 },
        alternateRowStyles: { fillColor: [255, 243, 240] },
        margin: { left: 10, right: 10 },
      })
      pipeY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? pipeY) + 8
    }

    if (d.pipeline.overdue.length > 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Overdue (past validity, still open):', 10, pipeY)
      pipeY += 4
      autoTable(doc, {
        startY: pipeY,
        head: [['Quo No.', 'Customer', 'Salesperson', 'Value (THB)', 'Expiry', 'Status']],
        body: d.pipeline.overdue.map(q => [
          q.quoNo, q.customerName, q.salesName ?? '', fmtMoney(q.grandTotal), fmtDate(q.expiryDate), statusLabel(q.status),
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [160, 80, 0], textColor: 255 },
        alternateRowStyles: { fillColor: [255, 248, 240] },
        margin: { left: 10, right: 10 },
      })
    }
  }

  // ── Footer on each page ──
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    doc.text(
      `Quotation Summary Report  |  ${rangeLabel}  |  Page ${i} of ${totalPages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    )
    doc.setTextColor(0)
  }

  doc.save(`${filename}.pdf`)
}
