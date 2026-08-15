import { parseColoredLine, stringifyColoredLine } from '@/lib/coloredText'

export type PRDescriptionBlockType = 'item' | 'remark' | 'line' | 'image'

export interface PRDescriptionBlock {
  type: PRDescriptionBlockType
  text?: string
  color?: string
  imageIndex?: number
}

const PR_DESCRIPTION_BLOCKS_MARKER = '__PR_DESCRIPTION_BLOCKS__'
const DETAIL_ROWS_MARKER = '__PR_DETAIL_ROWS__'

function normalizeBlock(value: unknown): PRDescriptionBlock | null {
  if (!value || typeof value !== 'object') return null
  const block = value as Partial<PRDescriptionBlock>
  if (!['item', 'remark', 'line', 'image'].includes(String(block.type))) return null
  if (block.type === 'image') {
    const imageIndex = Number(block.imageIndex)
    return Number.isInteger(imageIndex) && imageIndex >= 0 ? { type: 'image', imageIndex } : null
  }
  if (block.type !== 'item' && block.type !== 'remark' && block.type !== 'line') return null
  const parsed = parseColoredLine(String(block.text ?? ''))
  return { type: block.type, text: parsed.text, color: block.color || parsed.color }
}

export function parsePRDescription(note?: string, imageCount = 0): PRDescriptionBlock[] {
  const raw = String(note ?? '')
  const markerIndex = raw.indexOf(PR_DESCRIPTION_BLOCKS_MARKER)
  let blocks: PRDescriptionBlock[] = []

  if (markerIndex >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(markerIndex + PR_DESCRIPTION_BLOCKS_MARKER.length).replace(/^\n/, ''))
      blocks = Array.isArray(parsed) ? parsed.map(normalizeBlock).filter((block): block is PRDescriptionBlock => Boolean(block)) : []
    } catch {
      blocks = []
    }
  } else {
    const detailIndex = raw.indexOf(DETAIL_ROWS_MARKER)
    const noteText = detailIndex >= 0 ? raw.slice(0, detailIndex).replace(/\n$/, '') : raw
    const detailText = detailIndex >= 0 ? raw.slice(detailIndex + DETAIL_ROWS_MARKER.length).replace(/^\n/, '') : ''
    if (noteText) blocks.push({ type: 'remark', ...parseColoredLine(noteText) })
    if (detailIndex >= 0 && detailText) {
      detailText.split('\n').forEach(text => blocks.push({ type: 'line', ...parseColoredLine(text) }))
    }
  }

  const referencedImages = new Set(blocks.filter(block => block.type === 'image').map(block => block.imageIndex))
  for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
    if (!referencedImages.has(imageIndex)) blocks.push({ type: 'image', imageIndex })
  }
  return blocks
}

export function stringifyPRDescription(blocks: PRDescriptionBlock[]): string {
  if (blocks.length === 0) return ''
  const normalized = blocks.map(normalizeBlock).filter((block): block is PRDescriptionBlock => Boolean(block))
  return `${PR_DESCRIPTION_BLOCKS_MARKER}\n${JSON.stringify(normalized)}`
}

export function compactPRDescription(note?: string): string {
  const blocks = parsePRDescription(note).filter(block => block.type === 'image' || Boolean(block.text?.trim()))
  return stringifyPRDescription(blocks)
}

export function blockText(block: PRDescriptionBlock): string {
  return String(block.text ?? '')
}

export function coloredBlockValue(block: PRDescriptionBlock, text: string): string {
  return stringifyColoredLine({ text, color: block.color })
}
