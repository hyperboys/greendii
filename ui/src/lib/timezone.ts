export const BANGKOK_TIME_ZONE = 'Asia/Bangkok'

const dateOnlyOptions: Intl.DateTimeFormatOptions = {
  timeZone: BANGKOK_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}

export function formatBangkokDate(value?: string | Date | null, locale = 'en-GB'): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, dateOnlyOptions)
}

export function formatBangkokDateTime(value?: string | Date | null, locale = 'en-GB'): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale, {
    ...dateOnlyOptions,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBangkokTime(value?: string | Date | null, locale = 'en-GB'): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(locale, {
    timeZone: BANGKOK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getBangkokDateParts(value?: string | Date | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value
  const year = get('year')
  const month = get('month')
  const day = get('day')
  return year && month && day ? { year, month, day } : null
}