'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PRPrint from '@/components/PRPrint'
import WorkOrderPrint from '@/components/WorkOrderPrint'
import type { PurchaseRequest, Settings, WorkOrder } from '@/types'
import { mapWorkOrderItems } from '@/lib/workOrderItems'
import { getTokenFromQuery, apiGet, signalPrintReady } from '../../_lib'

export default function PrintPRPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<PurchaseRequest | null>(null)
  const [workOrderDoc, setWorkOrderDoc] = useState<WorkOrder | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string>('')
  const [pdfMode, setPdfMode] = useState(false)
  const [workOrderResolved, setWorkOrderResolved] = useState(false)
  const [workOrderReady, setWorkOrderReady] = useState(false)

  useEffect(() => {
    const token = getTokenFromQuery()
    const isPdfMode = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('mode') === 'pdf'
      : false
    setWorkOrderResolved(false)
    setWorkOrderReady(false)
    setWorkOrderDoc(null)
    setPdfMode(isPdfMode)
    Promise.all([
      apiGet<PurchaseRequest>(`/pr/${id}`, token),
      apiGet<Settings>('/settings', token).catch(() => null),
    ])
      .then(async ([d, s]) => {
        setDoc(d)
        setSettings(s)

        const shouldLoadWorkOrderPreview = !isPdfMode && Boolean(d.workOrderId)
        if (!shouldLoadWorkOrderPreview) {
          setWorkOrderResolved(true)
          return
        }

        try {
          const wo = await apiGet<WorkOrder>(`/workorders/${d.workOrderId}`, token)
          const workOrderOnlyDoc: WorkOrder = {
            ...wo,
            items: mapWorkOrderItems(wo.items),
            quotation: undefined,
            attachments: [],
          }
          setWorkOrderDoc(workOrderOnlyDoc)
        } catch {
          setWorkOrderDoc(null)
        } finally {
          setWorkOrderResolved(true)
        }
      })
      .catch((e) => setError(String(e)))
  }, [id])

  useEffect(() => {
    if (!doc) return
    const shouldWaitWorkOrder = !pdfMode && Boolean(doc.workOrderId)
    if (!shouldWaitWorkOrder) {
      void signalPrintReady()
      return
    }
    if (!workOrderResolved) return
    if (workOrderDoc && !workOrderReady) return
    void signalPrintReady()
  }, [doc, pdfMode, workOrderDoc, workOrderReady, workOrderResolved])

  if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>
  if (!doc) return <div style={{ padding: 20 }}>Loading…</div>

  return (
    <>
      <PRPrint doc={doc} settings={settings} embedPdfAttachments={!pdfMode} />
      {!pdfMode && workOrderDoc && (
        <>
          <div className="pr-linked-workorder-break" aria-hidden />
          <div className="pr-linked-workorder" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
            <WorkOrderPrint
              doc={workOrderDoc}
              settings={settings}
              embedPdfAttachments={false}
              onReady={() => setWorkOrderReady(true)}
            />
          </div>
        </>
      )}
    </>
  )
}
