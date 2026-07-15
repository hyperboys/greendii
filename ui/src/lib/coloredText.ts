export interface ColoredTextLine {
  text: string
  color?: string
}

const COLOR_TAG = /^\[color=(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\]([\s\S]*)$/
const QUOTATION_NOTE_BLOCK_TOKEN = /^_+Q[OQ]_NOTE_BLOCK_+$/i
const QUOTATION_NOTE_EMPTY_TOKEN = /^_+QO_NOTE_EMPTY_+$/i

export function normalizeColorHex(input?: string | null): string | undefined {
  const value = String(input || '').trim()
  if (!value) return undefined
  const match = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) return undefined
  const raw = match[1].toLowerCase()
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  return `#${raw}`
}

export function parseColoredLine(value?: string | null): ColoredTextLine {
  const raw = String(value ?? '')
  const match = raw.match(COLOR_TAG)
  if (!match) return { text: raw, color: undefined }
  return {
    text: match[2] ?? '',
    color: normalizeColorHex(match[1]),
  }
}

export function stringifyColoredLine(line: ColoredTextLine): string {
  const text = String(line.text ?? '')
  const color = normalizeColorHex(line.color)
  if (!color) return text
  return `[color=${color}]${text}`
}

export function parseColoredMultiline(value?: string | null): ColoredTextLine[] {
  if (value == null) return []
  return String(value)
    .split('\n')
    .map(line => parseColoredLine(line))
}

export function parseQuotationNoteMultiline(value?: string | null): ColoredTextLine[] {
  if (value == null) return []

  let activeColor: string | undefined
  const result: ColoredTextLine[] = []

  for (const rawLine of String(value).split('\n')) {
    const line = parseColoredLine(rawLine)
    const text = line.text.trim()

    if (QUOTATION_NOTE_BLOCK_TOKEN.test(text)) {
      activeColor = undefined
      continue
    }
    if (QUOTATION_NOTE_EMPTY_TOKEN.test(text)) {
      result.push({ text: '' })
      activeColor = undefined
      continue
    }

    if (line.color) activeColor = line.color
    result.push({ text: line.text, color: line.color || activeColor })
  }

  return result
}

export function stringifyColoredMultiline(lines: ColoredTextLine[]): string {
  return lines
    .map(line => stringifyColoredLine({ text: String(line.text ?? ''), color: line.color }))
    .join('\n')
}

export function toPlainColoredLine(value?: string | null): string {
  return parseColoredLine(value).text
}

export function toPlainColoredMultiline(value?: string | null): string {
  return parseColoredMultiline(value)
    .map(line => line.text)
    .join('\n')
}
