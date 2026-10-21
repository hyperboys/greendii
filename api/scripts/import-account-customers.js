/**
 * Import Accounting customers from a CSV export (insert-only, never touches Sales data).
 *
 * Usage:
 *   node scripts/import-account-customers.js --file=../Data/customer.csv [--report=report.json]           (dry run, no DB access)
 *   node scripts/import-account-customers.js --file=... --check-db                                         (rehearsal inside a transaction that is always rolled back)
 *   node scripts/import-account-customers.js --file=... --apply --confirm=IMPORT_ACCOUNT_CUSTOMERS [--performed-by=<userId>]
 *
 * Tax IDs shared by different companies become separate customers: --separate-tax=ID1,ID2 (defaults to the known groups).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { parseCsv, buildImportPlan, applyImportPlan, DEFAULT_SEPARATE_TAX_IDS } = require('../src/lib/accountCustomerImport');

const CONFIRM = 'IMPORT_ACCOUNT_CUSTOMERS';

function options() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : true];
  }));
  return {
    file: path.resolve(process.cwd(), args.file || path.join(__dirname, '../../Data/customer.csv')),
    report: args.report ? path.resolve(process.cwd(), args.report) : null,
    apply: Boolean(args.apply), checkDb: Boolean(args['check-db']), confirm: args.confirm,
    performedById: typeof args['performed-by'] === 'string' ? args['performed-by'] : null,
    separateTaxIds: typeof args['separate-tax'] === 'string' ? args['separate-tax'].split(',').map(v => v.trim()).filter(Boolean) : DEFAULT_SEPARATE_TAX_IDS,
  };
}

async function assertSchema(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND ((table_name = 'account_customers' AND column_name = 'fax')
        OR (table_name = 'account_customer_branches' AND column_name IN ('contact_person', 'tel', 'fax', 'email'))
        OR (table_name = 'account_customer_secondary_sales' AND column_name = 'sale_id'))`);
  if (rows.length !== 6) {
    throw new Error('ฐานข้อมูลยังไม่มีโครงสร้างสำหรับนำเข้า กรุณารัน scripts/sql/account-customer-import-support.sql ก่อน');
  }
}

async function main() {
  const opts = options();
  const plan = buildImportPlan(parseCsv(fs.readFileSync(opts.file, 'utf8')), { separateTaxIds: opts.separateTaxIds });
  console.log('Import plan:', JSON.stringify(plan.summary, null, 2));
  console.log('Accounting Sales:', plan.sales.join(', '));
  for (const item of plan.skipped) console.log(`SKIP ${item.codes.join(', ')}: ${item.reason}`);
  if (opts.report) {
    fs.writeFileSync(opts.report, JSON.stringify(plan, null, 2), 'utf8');
    console.log(`Report written: ${opts.report}`);
  }
  if (!opts.apply && !opts.checkDb) {
    console.log('Dry run only. No database connection was made.');
    return;
  }
  if (opts.apply && opts.confirm !== CONFIRM) throw new Error(`ต้องระบุ --confirm=${CONFIRM} เพื่อนำเข้าข้อมูลจริง`);

  const prisma = require('../src/lib/prisma');
  try {
    await assertSchema(prisma);
    if (!opts.apply) {
      // Run the insert-only plan in a transaction that is always rolled back.
      const rollback = new Error('rollback');
      let preview;
      await prisma.$transaction(async tx => { preview = await applyImportPlan(tx, plan); throw rollback; }, { timeout: 300000 })
        .catch(error => { if (error !== rollback) throw error; });
      console.log(`DB check (rolled back): would create ${preview.created.length} customers, ${preview.createdSales.length} sales, skip ${preview.skipped.length}`);
      for (const item of preview.skipped) console.log(`SKIP ${item.codes.join(', ')}: ${item.reason}`);
      return;
    }
    const result = await prisma.$transaction(tx => applyImportPlan(tx, plan, {
      performedById: opts.performedById, source: path.basename(opts.file),
    }), { timeout: 300000, isolationLevel: 'Serializable' });
    console.log(`Imported ${result.created.length} customers, created ${result.createdSales.length} Accounting Sales, skipped ${result.skipped.length}`);
    for (const item of result.skipped) console.log(`SKIP ${item.codes.join(', ')}: ${item.reason}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
