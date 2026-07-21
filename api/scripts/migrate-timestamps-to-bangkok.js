/**
 * Convert legacy PostgreSQL `timestamp without time zone` columns to
 * `timestamp with time zone`, then make Asia/Bangkok the database default.
 *
 * The conversion preserves the represented instant. Existing values are
 * interpreted in SOURCE_TIMEZONE (UTC by default), so an old 10:00 UTC value
 * will display as 17:00 after the application starts rendering Asia/Bangkok.
 *
 * Usage:
 *   npm run db:timezone:dry
 *   npm run db:timezone:apply
 *   SOURCE_TIMEZONE=Asia/Bangkok npm run db:timezone:apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const sourceTimezone = process.env.SOURCE_TIMEZONE || 'UTC';

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const [database] = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp without time zone'
    ORDER BY table_name, ordinal_position
  `);

  if (columns.length === 0) {
    console.log('No legacy timestamp without time zone columns found.');
    return;
  }

  console.log(`Source timezone: ${sourceTimezone}`);
  console.log(`Target timezone: Asia/Bangkok (UTC+7)`);
  console.log(`Database: ${database.name}`);
  console.log('Columns to convert:');
  columns.forEach(({ tableName, columnName }) => console.log(`  - ${tableName}.${columnName}`));

  if (!apply) {
    console.log('\nDry run only. Review the list, back up the database, then run npm run db:timezone:apply.');
    return;
  }

  // Do this first so missing ALTER DATABASE permission cannot leave converted columns behind.
  await prisma.$executeRawUnsafe(
    `ALTER DATABASE ${quoteIdentifier(database.name)} SET TimeZone TO 'Asia/Bangkok'`,
  );

  await prisma.$transaction(async (tx) => {
    for (const { tableName, columnName } of columns) {
      const table = quoteIdentifier(tableName);
      const column = quoteIdentifier(columnName);
      await tx.$executeRawUnsafe(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TIMESTAMP(3) WITH TIME ZONE USING ${column} AT TIME ZONE $1`,
        sourceTimezone,
      );
    }
  });

  await prisma.$executeRawUnsafe("SET TIME ZONE 'Asia/Bangkok'");

  console.log(`\nConverted ${columns.length} column(s) and set the database default timezone to Asia/Bangkok.`);
  console.log('Restart the API so all pooled connections pick up the new database timezone.');
}

main()
  .catch((error) => {
    console.error('Timezone migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());