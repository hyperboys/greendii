export function decodeDisplayFileName(name?: string | null): string {
  const raw = String(name || '').trim()
  if (!raw) return ''

  if (/[\u0E00-\u0E7F]/.test(raw)) return raw

  try {
    const decoded = decodeLatin1AsUtf8(raw).trim()
    if (!decoded) return raw
    if (decoded.includes('\uFFFD')) return raw

    const decodedHasThai = /[\u0E00-\u0E7F]/.test(decoded)
    const looksMojibake = /(?:Ã.|à¸|à¹|â.)/.test(raw)
    return decodedHasThai || looksMojibake ? decoded : raw
  } catch {
    return raw
  }
}

function decodeLatin1AsUtf8(input: string): string {
  if (typeof TextDecoder !== 'undefined') {
    const bytes = Uint8Array.from(input, ch => ch.charCodeAt(0) & 0xff)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }

  return input
}
