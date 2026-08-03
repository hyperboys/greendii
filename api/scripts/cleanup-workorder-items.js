/**
 * One-time cleanup: sanitize malformed WorkOrder items JSON.
 *
 * Fixes escaped unicode placeholders like "\\u00A0" in existing WorkOrder.items
 * while preserving original JSON structure.
 *
 * Usage:
 *   node scripts/cleanup-workorder-items.js --dry-run
 *   node scripts/cleanup-workorder-items.js --apply --confirm=APPLY_WORKORDER_ITEMS_CLEANUP
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const CONFIRM_TOKEN = process.argv.find((arg) => arg.startsWith('--confirm='))?.split('=')[1] || '';
const REQUIRED_CONFIRM_TOKEN = 'APPLY_WORKORDER_ITEMS_CLEANUP';
const BACKUP_DIR = path.join(__dirname, '../logs/forensics');

function sanitizeStringConservative(value) {
  const raw = String(value ?? '');

  // Decode escaped unicode sequences only when they are present.
  let next = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Normalize special spaces into regular space.
  next = next.replace(/[\u00A0\u2007\u202F]/g, ' ');

  // Remove only invisible zero-width chars that often appear from copy/paste corruption.
  next = next.replace(/[\u200B-\u200D\uFEFF]/g, '');

  return next;
}

function deepSanitize(value) {
  if (typeof value === 'string') return sanitizeStringConservative(value);
  if (Array.isArray(value)) return value.map((item) => deepSanitize(item));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = deepSanitize(nested);
    }
    return output;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createBackupFilePath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(BACKUP_DIR, `workorder-items-cleanup-${timestamp}.json`);
}

async function main() {
  if (APPLY && CONFIRM_TOKEN !== REQUIRED_CONFIRM_TOKEN) {
    throw new Error(
      `Refusing to apply without explicit confirmation. Run with --confirm=${REQUIRED_CONFIRM_TOKEN}`,
    );
  }

  const workOrders = await prisma.workOrder.findMany({
    select: {
      id: true,
      woNo: true,
      items: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  let scanned = 0;
  let changed = 0;
  const changedRows = [];

  console.log(`[cleanup-workorder-items] mode=${DRY_RUN ? 'dry-run' : 'apply'} total=${workOrders.length}`);

  for (const wo of workOrders) {
    scanned += 1;

    const before = wo.items;
    const after = deepSanitize(before);

    if (stableStringify(before) === stableStringify(after)) continue;

    changed += 1;
    console.log(`- ${wo.woNo} (${wo.id}) items changed`);
    changedRows.push({ id: wo.id, woNo: wo.woNo, before, after });

    if (DRY_RUN && changedRows.length <= 3) {
      const beforePreview = stableStringify(before).slice(0, 180);
      const afterPreview = stableStringify(after).slice(0, 180);
      console.log(`  before: ${beforePreview}${beforePreview.length === 180 ? '...' : ''}`);
      console.log(`  after : ${afterPreview}${afterPreview.length === 180 ? '...' : ''}`);
    }
  }

  if (!DRY_RUN && changedRows.length > 0) {
    ensureBackupDir();
    const backupPath = createBackupFilePath();
    const backupPayload = {
      createdAt: new Date().toISOString(),
      type: 'workorder-items-cleanup-backup',
      totalScanned: scanned,
      changedCount: changedRows.length,
      rows: changedRows.map((row) => ({
        id: row.id,
        woNo: row.woNo,
        items: row.before,
      })),
    };

    fs.writeFileSync(backupPath, `${JSON.stringify(backupPayload, null, 2)}\n`, 'utf8');
    console.log(`\n[cleanup-workorder-items] backup written: ${backupPath}`);

    for (const row of changedRows) {
      await prisma.workOrder.update({
        where: { id: row.id },
        data: { items: row.after },
      });
    }

    console.log(`[cleanup-workorder-items] applied updates: ${changedRows.length}`);
  } else if (!DRY_RUN) {
    console.log('[cleanup-workorder-items] no changes detected; no write performed');
  }

  console.log('');
  console.log(`[cleanup-workorder-items] scanned=${scanned} changed=${changed} ${DRY_RUN ? '(no write)' : '(updated)'}`);
}

main()
  .catch((error) => {
    console.error('[cleanup-workorder-items] failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
