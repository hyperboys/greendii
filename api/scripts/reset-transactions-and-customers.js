/**
 * Script: reset-transactions-and-customers.js
 * ลบข้อมูล Transaction และข้อมูลลูกค้าทั้งหมด เพื่อเริ่มทดสอบใหม่
 *
 * Run:
 *   node scripts/reset-transactions-and-customers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting reset: transactions + customers...');

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
