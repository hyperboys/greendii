'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QuotationPrint from '@/components/QuotationPrint'
import type { Quotation, Settings } from '@/types'
import { getTokenFromQuery, apiGet, signalPrintReady } from '../../_lib'

export default function PrintQuotationPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<Quotation | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const token = getTokenFromQuery()
    Promise.all([
      apiGet<Quotation>(`/quotations/${id}`, token),
      apiGet<Settings>('/settings', token).catch(() => null),
    ])
      .then(([d, s]) => { setDoc(d); setSettings(s) })
      .catch((e) => setError(String(e)))
  }, [id])

  if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>
  if (!doc) return <div style={{ padding: 20 }}>Loading…</div>

  // Signal Puppeteer only after QuotationPrint finishes measuring & paginating.
  return <QuotationPrint doc={doc} settings={settings} onReady={() => { void signalPrintReady() }} />
}
