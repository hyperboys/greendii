'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PRPrint from '@/components/PRPrint'
import type { PurchaseRequest, Settings } from '@/types'
import { getTokenFromQuery, apiGet, signalPrintReady } from '../../_lib'

export default function PrintPRPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<PurchaseRequest | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string>('')
  const [pdfMode, setPdfMode] = useState(false)

  useEffect(() => {
    const token = getTokenFromQuery()
    if (typeof window !== 'undefined') {
      setPdfMode(new URLSearchParams(window.location.search).get('mode') === 'pdf')
    }
    Promise.all([
      apiGet<PurchaseRequest>(`/pr/${id}`, token),
      apiGet<Settings>('/settings', token).catch(() => null),
    ])
      .then(([d, s]) => { setDoc(d); setSettings(s) })
      .catch((e) => setError(String(e)))
  }, [id])

  useEffect(() => { if (doc) void signalPrintReady() }, [doc])

  if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>
  if (!doc) return <div style={{ padding: 20 }}>Loading…</div>

  return <PRPrint doc={doc} settings={settings} embedPdfAttachments={!pdfMode} />
}
