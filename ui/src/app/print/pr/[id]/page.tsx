'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PRPrint from '@/components/PRPrint'
import WorkOrderPrint from '@/components/WorkOrderPrint'
import type { PurchaseRequest, Settings, WorkOrder } from '@/types'
import { mapWorkOrderItems } from '@/lib/workOrderItems'
import { getTokenFromQuery, apiGet, signalPrintReady } from '../../_lib'

function buildLinkedWorkOrderPreview(workOrder: PurchaseRequest['workOrder']): WorkOrder | null {
  if (!workOrder) return null

  const approvalLogs = (workOrder.approvalLogs || []).map((log) => ({
    ...log,
    docType: 'workorder',
  }))

  return {
    ...workOrder,
    items: mapWorkOrderItems(workOrder.items ?? []),
    approvalLogs,
    quotation: undefined,
    handOverJob: undefined,
    handOverJobs: [],
    attachments: [],
  }
}

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

        const linkedWorkOrder = buildLinkedWorkOrderPreview(d.workOrder)
        setWorkOrderDoc(linkedWorkOrder)
        setWorkOrderResolved(true)
      })
      .catch((e) => setError(String(e)))
  }, [id])

  useEffect(() => {
    if (!doc) return
    const shouldWaitWorkOrder = Boolean(doc.workOrder)
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
      {workOrderDoc && (
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
