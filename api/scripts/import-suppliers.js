const fs = require('fs');
const path = require('path');
const { parseCsv, buildImportPlan, partitionSuppliers, applyImportPlan } = require('../src/lib/supplierImport');

function options(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--(file|report|performed-by)=(.+)$|^--(apply|check-db)$|^--confirm=(IMPORT_SUPPLIERS)$/);
    if (!match) throw new Error(`Unknown or invalid argument: ${arg}`);
    const key = match[1] || match[3] || 'confirm';
    if (Object.hasOwn(args, key)) throw new Error(`Duplicate argument: --${key}`);
    args[key] = match[2] || match[4] || true;
  }
  if (args.apply && args.confirm !== 'IMPORT_SUPPLIERS') throw new Error('ต้องระบุ --confirm=IMPORT_SUPPLIERS');
  if (args.apply && args['check-db']) throw new Error('ใช้ --apply และ --check-db พร้อมกันไม่ได้');
  if (args.confirm && !args.apply) throw new Error('--confirm ต้องใช้ร่วมกับ --apply');
  const file = path.resolve(args.file || path.join(__dirname, '../../Data/Supplier.csv'));
  const report = args.report ? path.resolve(args.report) : null;
  if (report && report.toLowerCase() === file.toLowerCase()) throw new Error('Report must not overwrite the source CSV');
  return { ...args, file, report };
}

async function assertSchema(prisma) {
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'suppliers'
      AND column_name IN ('fax', 'group_code', 'group_name', 'credit_limit')`;
  const textColumns = ['fax', 'group_code', 'group_name'];
  const credit = columns.find(c => c.column_name === 'credit_limit');
  if (!textColumns.every(name => columns.some(c => c.column_name === name && c.data_type === 'text'))
    || !credit || credit.data_type !== 'numeric' || credit.numeric_precision !== 14 || credit.numeric_scale !== 2) {
    throw new Error('ฐานข้อมูลยังไม่พร้อม: กรุณารัน scripts/sql/supplier-import-support.sql และ npm run db:generate ก่อน');
  }
  if (!prisma.supplier.fields?.groupCode || !prisma.supplier.fields?.creditLimit) {
    throw new Error('Prisma Client ยังไม่รองรับ Supplier import: กรุณารัน npm run db:generate');
  }
}

async function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  const plan = buildImportPlan(parseCsv(fs.readFileSync(opts.file, 'utf8')));
  const report = { mode: opts.apply ? 'apply' : opts['check-db'] ? 'check-db' : 'dry-run', source: path.basename(opts.file), plan };
  console.log('Import plan:', JSON.stringify({ ...plan.summary, groups: plan.groups, defaults: plan.defaults }, null, 2));
  for (const warning of plan.warnings) console.log(`WARNING: ${warning}`);
  if (opts.apply || opts['check-db']) {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    const prisma = require('../src/lib/prisma');
    try {
      if (opts.apply) {
        await assertSchema(prisma);
        report.result = await prisma.$transaction(tx => applyImportPlan(tx, plan, {
          source: path.basename(opts.file), performedById: opts['performed-by'] || null,
        }), { timeout: 300000, isolationLevel: 'Serializable' });
        console.log(`Imported: ${report.result.created.length}; skipped: ${report.result.skipped.length}`);
      } else {
        // A read-only collision check; does not require the new columns or generate writes.
        const existing = await prisma.supplier.findMany({ select: { code: true } });
        const { toCreate, skipped } = partitionSuppliers(plan, existing.map(s => s.code));
        report.result = { wouldCreate: toCreate.map(s => s.code), skipped };
        console.log(`DB check (read-only): would create ${toCreate.length}; skipped ${skipped.length}`);
      }
      for (const item of report.result.skipped) console.log(`SKIP ${item.code}: ${item.reason}`);
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log('Dry run only. No database connection was made. Existing database codes have not been checked.');
  }
  if (opts.report) {
    fs.writeFileSync(opts.report, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
    console.log(`Report written: ${opts.report}`);
  }
  return report;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { options, main };
