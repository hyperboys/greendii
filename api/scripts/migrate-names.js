/**
 * One-time script: backfill firstName/lastName from fullName
 * and firstNameEn/lastNameEn from signatureText
 *
 * Usage: node scripts/migrate-names.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, signatureText: true, firstName: true, lastName: true, firstNameEn: true, lastNameEn: true },
  });

  console.log(`Found ${users.length} users`);
  let updated = 0;

  for (const u of users) {
    const data = {};

    // Split fullName → firstName / lastName (TH)
    if (u.fullName && (!u.firstName && !u.lastName)) {
      const parts = u.fullName.trim().split(/\s+/);
      data.firstName = parts[0] || null;
      data.lastName  = parts.slice(1).join(' ') || null;
    }

    // Split signatureText → firstNameEn / lastNameEn (EN)
    if (u.signatureText && (!u.firstNameEn && !u.lastNameEn)) {
      const parts = u.signatureText.trim().split(/\s+/);
      data.firstNameEn = parts[0] || null;
      data.lastNameEn  = parts.slice(1).join(' ') || null;
    }

    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: u.id }, data });
      console.log(`  ✓ ${u.fullName} → firstName="${data.firstName ?? '-'}" lastName="${data.lastName ?? '-'}" | firstNameEn="${data.firstNameEn ?? '-'}" lastNameEn="${data.lastNameEn ?? '-'}"`);
      updated++;
    }
  }

  console.log(`\nDone. Updated ${updated} / ${users.length} users.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
