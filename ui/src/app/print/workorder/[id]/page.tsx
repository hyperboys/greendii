'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import WorkOrderPrint from '@/components/WorkOrderPrint'
import type { WorkOrder, Settings } from '@/types'
import { getTokenFromQuery, apiGet, signalPrintReady } from '../../_lib'

export default function PrintWorkOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<WorkOrder | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string>('')
  // Puppeteer requests with ?mode=pdf so PDF attachments are skipped here and
  // merged server-side instead. On-screen preview omits the flag and embeds PDFs.
  const [pdfMode, setPdfMode] = useState(false)

  useEffect(() => {
    const token = getTokenFromQuery()
    if (typeof window !== 'undefined') {
      setPdfMode(new URLSearchParams(window.location.search).get('mode') === 'pdf')
    }
    Promise.all([
      apiGet<WorkOrder>(`/workorders/${id}`, token),
      apiGet<Settings>('/settings', token).catch(() => null),
    ])
      .then(([d, s]) => { setDoc(d); setSettings(s) })
      .catch((e) => setError(String(e)))
  }, [id])

  if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>
  if (!doc) return <div style={{ padding: 20 }}>Loading…</div>

  return <WorkOrderPrint doc={doc} settings={settings} embedPdfAttachments={!pdfMode} onReady={() => { void signalPrintReady() }} />
}
