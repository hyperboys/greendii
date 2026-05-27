/**
 * Script: reset-transactions-and-customers.js
 * ลบข้อมูล Transaction และข้อมูลลูกค้าทั้งหมด เพื่อเริ่มทดสอบใหม่
 *
 * Run:
 *   node scripts/reset-transactions-and-customers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { isR2Enabled, deleteFromR2 } = require('../src/lib/r2');

const prisma = new PrismaClient();

async function deleteAttachmentFilesFromR2() {
  if (!isR2Enabled) {
    console.log('R2 is not enabled. Skip R2 file deletion.');
    return;
  }

  const attachments = await prisma.attachment.findMany({
    select: { filename: true },
    where: { filename: { not: null } },
  });

  const keys = [...new Set(attachments.map((item) => item.filename).filter(Boolean))];
  if (keys.length === 0) {
    console.log('No attachment keys found in DB. Skip R2 file deletion.');
    return;
  }

  console.log(`Deleting ${keys.length} file(s) from R2...`);

  const batchSize = 20;
  let deleted = 0;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((key) => deleteFromR2(key)));

    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === 'fulfilled') {
        deleted += 1;
      } else {
        const key = batch[j];
        throw new Error(`Failed to delete R2 key: ${key}. ${settled[j].reason?.message || settled[j].reason || ''}`);
      }
    }
  }

  console.log(`Deleted ${deleted} file(s) from R2.`);
}

async function main() {
  console.log('Starting reset: transactions + customers (+R2 files)...');

  await deleteAttachmentFilesFromR2();

  const countsBefore = {
    approvalLogs: await prisma.approvalLog.count(),
    attachments: await prisma.attachment.count(),
    notifications: await prisma.notification.count(),
    activityLogs: await prisma.activityLog.count(),
    purchaseRequests: await prisma.purchaseRequest.count(),
    handOverJobs: await prisma.handOverJob.count(),
    workOrders: await prisma.workOrder.count(),
    quotations: await prisma.quotation.count(),
    customers: await prisma.customer.count(),
  };

  console.log('Rows before reset:', countsBefore);

  const result = await prisma.$transaction([
    prisma.approvalLog.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.purchaseRequest.deleteMany(),
    prisma.handOverJob.deleteMany(),
    prisma.workOrder.deleteMany(),
    prisma.quotation.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  const summary = {
    approvalLogs: result[0].count,
    attachments: result[1].count,
    notifications: result[2].count,
    activityLogs: result[3].count,
    purchaseRequests: result[4].count,
    handOverJobs: result[5].count,
    workOrders: result[6].count,
    quotations: result[7].count,
    customers: result[8].count,
  };

  console.log('Deleted rows:', summary);
  console.log('Reset complete. Ready for fresh user testing.');
}

main()
  .catch((error) => {
    console.error('Reset failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
