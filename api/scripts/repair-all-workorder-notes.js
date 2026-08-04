/**
 * Full repair: scan ALL workorders for:
 * 1. note fields with stripped newlines causing __WO_NOTE_META__ to leak as visible text
 * 2. detailRows.desc containing literal \u00A0 escape sequences
 *
 * Usage:
 *   node scripts/repair-all-workorder-notes.js --dry-run
 *   node scripts/repair-all-workorder-notes.js --apply --confirm=REPAIR_ALL_WO_NOTES
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const CONFIRM_TOKEN = process.argv.find(a => a.startsWith('--confirm='))?.split('=')[1] || '';
const REQUIRED_TOKEN = 'REPAIR_ALL_WO_NOTES';
const BACKUP_DIR = path.join(__dirname, '../logs/forensics');
const META_TOKEN = '__WO_NOTE_META__';

// ─── sanitize: decode escaped unicode, convert NBSP, preserve newlines ────────
function sanitize(value, trim = false) {
  const raw = String(value ?? '');
  let next = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    // strip non-printable control chars BUT keep \n (0x0A) and \t (0x09)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return trim ? next.trim() : next;
}

// ─── extract detail-note text and meta JSON from a note string ───────────────
function parseNote(note) {
  const safe = sanitize(note, false);
  const idx = safe.indexOf(META_TOKEN);
  if (idx < 0) return { detailNote: safe, noteBlocks: null };

  const detailNote = safe.slice(0, idx).replace(/\s+$/, '');
  const rawMeta = safe.slice(idx + META_TOKEN.length).replace(/^\s+/, '');
  try {
    const parsed = JSON.parse(rawMeta || '{}');
    const noteBlocks = Array.isArray(parsed.noteBlocks)
      ? parsed.noteBlocks.map(b => sanitize(b, false))
      : [];
    return { detailNote, noteBlocks };
  } catch {
    return { detailNote, noteBlocks: null };
  }
}

// ─── rebuild note with proper separator ──────────────────────────────────────
function buildNote(detailRows, noteBlocks) {
  const detailNote = detailRows.map(r => r.desc).filter(Boolean).join('\n');
  if (!noteBlocks || noteBlocks.length === 0) return detailNote;
  return `${detailNote}\n\n${META_TOKEN}\n\n${JSON.stringify({ noteBlocks })}`;
}

// ─── rebuild a single item ────────────────────────────────────────────────────
function repairItem(item) {
  const desc = sanitize(item?.desc ?? '', true);
  const unit = sanitize(item?.unit ?? '', true);

  const sourceRows = Array.isArray(item?.detailRows)
    ? item.detailRows
        .map(row => ({
          desc: sanitize(row?.desc ?? '', true),
          qty: row?.qty == null || row?.qty === '' ? null : Number(row.qty),
          unit: sanitize(row?.unit ?? '', true),
        }))
        .filter(row => row.desc || row.qty != null || row.unit)
    : [];

  const { detailNote, noteBlocks } = parseNote(item?.note);

  const detailRows = sourceRows.length > 0
    ? sourceRows
    : detailNote
        .split('\n')
        .map(line => sanitize(line, true))
        .filter(Boolean)
        .map(d => ({ desc: d, qty: null, unit: '' }));

  const note = buildNote(detailRows, noteBlocks);

  const images = Array.isArray(item?.images)
    ? item.images.map(u => sanitize(u, true)).filter(Boolean)
    : [];

  return {
    seq: Number.isFinite(Number(item?.seq)) ? Number(item.seq) : 0,
    desc,
    note,
    detailRows,
    qty: Number.isFinite(Number(item?.qty)) ? Number(item.qty) : 0,
    unit,
    images,
  };
}

// ─── check whether an item needs repair ──────────────────────────────────────
function needsRepair(item) {
  const itemStr = JSON.stringify(item);
  // literal \u00A0 escape sequence in any string field
  if (/\\u00a0/i.test(itemStr)) return 'escaped-nbsp';
  // actual NBSP character in any string field
  if (/\u00a0/.test(itemStr)) return 'nbsp-char';
  // __WO_NOTE_META__ token exists but lacks proper newline separators
  const note = String(item?.note ?? '');
  if (note.includes(META_TOKEN) && !note.includes(`\n\n${META_TOKEN}\n\n`)) return 'broken-meta-separator';
  return null;
}

async function main() {
  if (APPLY && CONFIRM_TOKEN !== REQUIRED_TOKEN) {
    throw new Error(`Must pass --confirm=${REQUIRED_TOKEN} to apply`);
  }

  const workOrders = await prisma.workOrder.findMany({
    select: { id: true, woNo: true, items: true },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`[repair-all] mode=${DRY_RUN ? 'dry-run' : 'apply'} total=${workOrders.length}`);

  const toRepair = [];

  for (const wo of workOrders) {
    if (!Array.isArray(wo.items) || wo.items.length === 0) continue;

    let hasIssue = false;
    const reasons = new Set();

    for (const item of wo.items) {
      const reason = needsRepair(item);
      if (reason) { hasIssue = true; reasons.add(reason); }
    }

    if (!hasIssue) continue;

    const repairedItems = wo.items.map(repairItem).filter(it => it.desc);

    if (JSON.stringify(wo.items) === JSON.stringify(repairedItems)) continue;

    toRepair.push({ id: wo.id, woNo: wo.woNo, before: wo.items, after: repairedItems, reasons: [...reasons] });
    console.log(`NEEDS_REPAIR ${wo.woNo} (${[...reasons].join(', ')})`);
  }

  console.log(`\nTotal to repair: ${toRepair.length}`);

  if (DRY_RUN || toRepair.length === 0) return;

  // backup
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `repair-all-wo-notes-${ts}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    rows: toRepair.map(r => ({ id: r.id, woNo: r.woNo, before: r.before })),
  }, null, 2), 'utf8');
  console.log(`\nBackup: ${backupPath}`);

  for (const row of toRepair) {
    await prisma.workOrder.update({ where: { id: row.id }, data: { items: row.after } });
    console.log(`UPDATED ${row.woNo}`);
  }

  console.log(`\nDone. Updated ${toRepair.length} workorders.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
