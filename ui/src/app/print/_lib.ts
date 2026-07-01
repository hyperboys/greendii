'use client'

/**
 * Shared helpers for print routes loaded headlessly by Puppeteer.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

export function getTokenFromQuery(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('token') || ''
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Signal Puppeteer the page is ready: data loaded, images decoded, fonts loaded.
 */
export async function signalPrintReady() {
  if (typeof window === 'undefined') return
  try {
    // Wait for any <img> currently in DOM to finish decoding
    const imgs = Array.from(document.images)
    await Promise.all(imgs.map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true })
        img.addEventListener('error', () => res(), { once: true })
      })
    ))
    // Wait for web fonts to load
    if (document.fonts && document.fonts.ready) await document.fonts.ready
  } catch { /* noop */ }
  // Let layout settle without fixed sleep so preview becomes responsive faster.
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0)
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  ;(window as any).__printReady = true
}
