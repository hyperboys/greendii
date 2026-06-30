/**
 * Script: merge-duplicate-customers.js
 * รวมลูกค้าที่ชื่อซ้ำ (case-insensitive + ตัดช่องว่างซ้ำ)
 * ภายใต้ salesperson เดียวกัน แล้วโยกความสัมพันธ์ไปยัง customer หลัก
 *
 * สิ่งที่จะย้าย:
 * - quotations.customerId
 * - email_history.customerId
 *
 * Usage:
 *   node scripts/merge-duplicate-customers.js --dry-run
 *   node scripts/merge-duplicate-customers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/lib/prisma');

function getOptions() {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has('--dry-run'),
  };
}

function normalizeCustomerName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function choosePrimaryCustomer(customers) {
  return [...customers].sort((a, b) => {
    if (Number(Boolean(b.active)) !== Number(Boolean(a.active))) {
      return Number(Boolean(b.active)) - Number(Boolean(a.active));
    }
    const aRefs = (a._count?.quotations || 0) + (a._count?.emailHistory || 0);
    const bRefs = (b._count?.quotations || 0) + (b._count?.emailHistory || 0);
    if (bRefs !== aRefs) return bRefs - aRefs;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function buildPrimaryPatch(primary, duplicates) {
  const patch = {};

  const fallbackFields = ['contactPerson', 'tel', 'email', 'address', 'taxId'];
  for (const field of fallbackFields) {
    if (!isBlank(primary[field])) continue;
    const donor = duplicates.find((item) => !isBlank(item[field]));
    if (donor) patch[field] = donor[field];
  }

  if (!primary.active && duplicates.some((item) => item.active)) {
    patch.active = true;
  }

  if (isBlank(primary.type)) {
    const donor = duplicates.find((item) => !isBlank(item.type));
    if (donor) patch.type = donor.type;
  }

  return patch;
}

async function mergeEmailHistory(tx, sourceCustomerId, targetCustomerId) {
  const rows = await tx.emailHistory.findMany({
    where: { customerId: sourceCustomerId },
    select: { id: true, email: true, name: true, useCount: true, lastUsedAt: true },
  });

  let moved = 0;
  let merged = 0;

  for (const row of rows) {
    const existing = await tx.emailHistory.findUnique({
      where: {
        email_customerId: {
          email: row.email,
          customerId: targetCustomerId,
        },
      },
      select: { id: true, useCount: true, lastUsedAt: true, name: true },
    });

    if (!existing) {
      await tx.emailHistory.update({
        where: { id: row.id },
        data: { customerId: targetCustomerId },
      });
      moved += 1;
      continue;
    }

    const nextUseCount = Number(existing.useCount || 0) + Number(row.useCount || 0);
    const nextLastUsedAt = new Date(
      Math.max(new Date(existing.lastUsedAt).getTime(), new Date(row.lastUsedAt).getTime())
    );

    await tx.emailHistory.update({
      where: { id: existing.id },
      data: {
        useCount: nextUseCount,
        lastUsedAt: nextLastUsedAt,
        name: existing.name || row.name || null,
      },
    });

    await tx.emailHistory.delete({ where: { id: row.id } });
    merged += 1;
  }

  return { moved, merged };
}

async function mergeDuplicateGroup(primary, duplicates, options) {
  const duplicateIds = duplicates.map((item) => item.id);

  if (options.dryRun) {
    const quotationCount = await prisma.quotation.count({
      where: { customerId: { in: duplicateIds } },
    });

    const emailHistoryCount = await prisma.emailHistory.count({
      where: { customerId: { in: duplicateIds } },
    });

    return {
      mergedCustomers: duplicates.length,
      movedQuotations: quotationCount,
      movedEmailHistory: emailHistoryCount,
      mergedEmailHistory: 0,
      updatedPrimary: 0,
      deletedCustomers: 0,
    };
  }

  return prisma.$transaction(async (tx) => {
    const patch = buildPrimaryPatch(primary, duplicates);
    if (Object.keys(patch).length > 0) {
      await tx.customer.update({ where: { id: primary.id }, data: patch });
    }

    let movedQuotations = 0;
    let movedEmailHistory = 0;
    let mergedEmailHistory = 0;

    for (const duplicate of duplicates) {
      const quotationUpdate = await tx.quotation.updateMany({
        where: { customerId: duplicate.id },
        data: { customerId: primary.id },
      });
      movedQuotations += quotationUpdate.count;

      const emailResult = await mergeEmailHistory(tx, duplicate.id, primary.id);
      movedEmailHistory += emailResult.moved;
      mergedEmailHistory += emailResult.merged;

      await tx.customer.delete({ where: { id: duplicate.id } });
    }

    return {
      mergedCustomers: duplicates.length,
      movedQuotations,
      movedEmailHistory,
      mergedEmailHistory,
      updatedPrimary: Object.keys(patch).length > 0 ? 1 : 0,
      deletedCustomers: duplicates.length,
    };
  });
}

async function main() {
  const options = getOptions();

  if (options.dryRun) {
    console.log('Dry run mode: no data will be changed.');
  }

  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      salesId: true,
      name: true,
      contactPerson: true,
      tel: true,
      email: true,
      address: true,
      taxId: true,
      type: true,
      active: true,
      createdAt: true,
      _count: {
        select: {
          quotations: true,
          emailHistory: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map();
  for (const customer of customers) {
    const normalizedName = normalizeCustomerName(customer.name);
    if (!normalizedName) continue;
    const key = `${customer.salesId || '__null__'}::${normalizedName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(customer);
  }

  const duplicateGroups = [...groups.values()].filter((items) => items.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('No duplicate customers found.');
    return;
  }

  console.log(`Found ${duplicateGroups.length} duplicate group(s).`);

  const summary = {
    groups: duplicateGroups.length,
    mergedCustomers: 0,
    movedQuotations: 0,
    movedEmailHistory: 0,
    mergedEmailHistory: 0,
    updatedPrimary: 0,
    deletedCustomers: 0,
  };

  for (const group of duplicateGroups) {
    const primary = choosePrimaryCustomer(group);
    const duplicates = group.filter((item) => item.id !== primary.id);

    const sampleName = primary.name;
    console.log(`- Group "${sampleName}" salesId=${primary.salesId || 'null'}: keep=${primary.id} merge=${duplicates.length}`);

    const result = await mergeDuplicateGroup(primary, duplicates, options);
    summary.mergedCustomers += result.mergedCustomers;
    summary.movedQuotations += result.movedQuotations;
    summary.movedEmailHistory += result.movedEmailHistory;
    summary.mergedEmailHistory += result.mergedEmailHistory;
    summary.updatedPrimary += result.updatedPrimary;
    summary.deletedCustomers += result.deletedCustomers;
  }

  console.log('\nSummary:');
  console.log(summary);

  if (options.dryRun) {
    console.log('\nDry run complete. Re-run without --dry-run to apply changes.');
  } else {
    console.log('\nMerge complete.');
  }
}

main()
  .catch((error) => {
    console.error('Merge failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
