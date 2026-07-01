'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import WorkOrderPrint from '@/components/WorkOrderPrint'
import type { WorkOrder, Settings } from '@/types'
import { getTokenFromQuery, apiGet, signalPrintReady } from '../../_lib'
import { mapWorkOrderItems } from '@/lib/workOrderItems'

export default function PrintWorkOrderEmailPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<WorkOrder | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const token = getTokenFromQuery()
    Promise.all([
      apiGet<WorkOrder>(`/workorders/${id}`, token),
      apiGet<Settings>('/settings', token).catch(() => null),
    ])
      .then(([d, s]) => {
        // Email WorkOrder PDF must contain WorkOrder details ONLY:
        // - use the WorkOrder's own item snapshot (never fall back to quotation)
        // - drop the linked quotation so no quotation content leaks in
        // - drop attachments so no attached files (e.g. quotation PDFs) get embedded
        const workOrderOnlyDoc: WorkOrder = {
          ...d,
          items: mapWorkOrderItems(d.items),
          quotation: undefined,
          attachments: [],
        }
        setDoc(workOrderOnlyDoc)
        setSettings(s)
      })
      .catch((e) => setError(String(e)))
  }, [id])

  if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>
  if (!doc) return <div style={{ padding: 20 }}>Loading…</div>

  return <WorkOrderPrint doc={doc} settings={settings} embedPdfAttachments={false} onReady={() => { void signalPrintReady() }} />
}
