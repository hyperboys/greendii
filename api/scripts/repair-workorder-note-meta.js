require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const targets = process.argv.slice(2).filter(Boolean);
if (targets.length === 0) {
  console.error('Usage: node scripts/repair-workorder-note-meta.js <WO_NO> [WO_NO ...]');
  process.exit(1);
}

function sanitizeText(value, options = {}) {
  const trim = options.trim !== false;
  const raw = String(value ?? '');
  const unescaped = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u00A0\u2007\u202F]/g, ' ');
  const normalized = unescaped.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return trim ? normalized.trim() : normalized;
}

function parseMetaNote(note) {
  const token = '__WO_NOTE_META__';
  const safeNote = sanitizeText(note, { trim: false });
  const index = safeNote.indexOf(token);
  if (index < 0) return null;

  const detailNote = safeNote.slice(0, index).replace(/[\n\r\s]*$/, '');
  const rawMeta = safeNote.slice(index + token.length).replace(/^[\n\r\s]*/, '');

  try {
    const parsed = JSON.parse(rawMeta || '{}');
    const noteBlocks = Array.isArray(parsed.noteBlocks)
      ? parsed.noteBlocks.map((block) => sanitizeText(block, { trim: false }))
      : [];
    return { detailNote, noteBlocks };
  } catch {
    return null;
  }
}

function rebuildNote(item) {
  const parsed = parseMetaNote(item?.note);
  if (!parsed) return { changed: false, next: item };

  const detailRows = Array.isArray(item?.detailRows) ? item.detailRows : [];
  const rows = detailRows.length > 0
    ? detailRows.map((row) => ({
        desc: sanitizeText(row?.desc),
        qty: row?.qty == null || row?.qty === '' ? null : Number(row.qty),
        unit: sanitizeText(row?.unit),
      })).filter((row) => row.desc || row.qty != null || row.unit)
    : parsed.detailNote
      .split('\n')
      .map((line) => sanitizeText(line))
      .filter(Boolean)
      .map((desc) => ({ desc, qty: null, unit: '' }));

  const noteBlocks = parsed.noteBlocks;
  const meta = noteBlocks.length > 0 ? `\n\n__WO_NOTE_META__\n\n${JSON.stringify({ noteBlocks })}` : '';
  const detailNote = rows.map((row) => row.desc).join('\n');
  const nextNote = `${detailNote}${meta}`;

  const nextItem = {
    ...item,
    desc: sanitizeText(item?.desc),
    unit: sanitizeText(item?.unit),
    note: nextNote,
    detailRows: rows,
    images: Array.isArray(item?.images) ? item.images.map((url) => sanitizeText(url)).filter(Boolean) : [],
  };

  const changed = JSON.stringify(item) !== JSON.stringify(nextItem);
  return { changed, next: nextItem };
}

async function main() {
  for (const woNo of targets) {
    const wo = await prisma.workOrder.findFirst({
      where: { woNo },
      select: { id: true, woNo: true, items: true },
    });

    if (!wo) {
      console.log(`NOT_FOUND ${woNo}`);
      continue;
    }

    if (!Array.isArray(wo.items)) {
      console.log(`SKIP ${woNo} items is not array`);
      continue;
    }

    let changed = false;
    const nextItems = wo.items.map((item) => {
      const result = rebuildNote(item);
      if (result.changed) changed = true;
      return result.next;
    });

    if (!changed) {
      console.log(`NO_CHANGE ${woNo}`);
      continue;
    }

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { items: nextItems },
    });

    console.log(`UPDATED ${woNo} (${wo.id})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
