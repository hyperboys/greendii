/**
 * Script: reset-transactions-and-customers.js
 * ลบข้อมูล Transaction และข้อมูลลูกค้าทั้งหมด เพื่อเริ่มทดสอบใหม่
 *
 * Run:
 *   npm run db:reset:testdata
 *   # or
 *   node scripts/reset-transactions-and-customers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs/promises');
const path = require('path');
const prisma = require('../src/lib/prisma');
const { isR2Enabled, deleteFromR2 } = require('../src/lib/r2');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

function isRemoteFileUrl(fileUrl) {
  return /^https?:\/\//i.test(fileUrl || '');
}

async function getResetCounts() {
  const [
    approvalLogs,
    attachments,
    notifications,
    activityLogs,
    quotationItems,
    purchaseRequestItems,
    purchaseRequests,
    handOverJobs,
    workOrders,
    quotations,
    customers,
  ] = await prisma.$transaction([
    prisma.approvalLog.count(),
    prisma.attachment.count(),
    prisma.notification.count(),
    prisma.activityLog.count(),
    prisma.quotationItem.count(),
    prisma.purchaseRequestItem.count(),
    prisma.purchaseRequest.count(),
    prisma.handOverJob.count(),
    prisma.workOrder.count(),
    prisma.quotation.count(),
    prisma.customer.count(),
  ]);

  return {
    approvalLogs,
    attachments,
    notifications,
    activityLogs,
    quotationItems,
    purchaseRequestItems,
    purchaseRequests,
    handOverJobs,
    workOrders,
    quotations,
    customers,
  };
}

async function deleteAttachmentFiles() {
  const attachments = await prisma.attachment.findMany({
    select: { filename: true, fileUrl: true },
  });

  const uniqueAttachments = [
    ...new Map(
      attachments
        .filter((item) => item.filename)
        .map((item) => [`${item.filename}::${item.fileUrl || ''}`, item])
    ).values(),
  ];

  if (uniqueAttachments.length === 0) {
    console.log('No attachment records found. Skip file cleanup.');
    return { deletedRemote: 0, deletedLocal: 0, missingLocal: 0, warnings: [] };
  }

  console.log(`Cleaning up ${uniqueAttachments.length} attachment file(s)...`);

  const summary = {
    deletedRemote: 0,
    deletedLocal: 0,
    missingLocal: 0,
    warnings: [],
  };

  for (const attachment of uniqueAttachments) {
    const fileUrl = attachment.fileUrl || '';

    if (isRemoteFileUrl(fileUrl)) {
      if (!isR2Enabled) {
        summary.warnings.push(
          `Skipped remote file "${attachment.filename}" because R2 is not configured in this environment.`
        );
        continue;
      }

      try {
        await deleteFromR2(attachment.filename);
        summary.deletedRemote += 1;
      } catch (error) {
        summary.warnings.push(
          `Failed to delete remote file "${attachment.filename}": ${error?.message || error || 'unknown error'}`
        );
      }

      continue;
    }

    const filePath = path.join(UPLOAD_DIR, attachment.filename);

    try {
      await fs.unlink(filePath);
      summary.deletedLocal += 1;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        summary.missingLocal += 1;
        continue;
      }

      throw error;
    }
  }

  if (summary.deletedRemote > 0) {
    console.log(`Deleted ${summary.deletedRemote} remote attachment file(s).`);
  }
  if (summary.deletedLocal > 0) {
    console.log(`Deleted ${summary.deletedLocal} local attachment file(s).`);
  }
  if (summary.missingLocal > 0) {
    console.log(`${summary.missingLocal} local attachment file(s) were already missing.`);
  }
  if (summary.warnings.length > 0) {
    console.warn('Attachment cleanup warnings:');
    for (const warning of summary.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  return summary;
}

async function main() {
  console.log('Starting reset: transactions + customers + attachments...');

  const countsBefore = await getResetCounts();
  console.log('Rows before reset:', countsBefore);

  const fileCleanup = await deleteAttachmentFiles();

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

  const countsAfter = await getResetCounts();
  const remainingRows = Object.entries(countsAfter).filter(([, count]) => count !== 0);

  console.log('Deleted rows:', summary);
  console.log('Attachment cleanup:', {
    deletedRemote: fileCleanup.deletedRemote,
    deletedLocal: fileCleanup.deletedLocal,
    missingLocal: fileCleanup.missingLocal,
    warnings: fileCleanup.warnings.length,
  });
  console.log('Rows after reset:', countsAfter);

  if (remainingRows.length > 0) {
    throw new Error(
      `Reset incomplete. Remaining rows: ${remainingRows.map(([name, count]) => `${name}=${count}`).join(', ')}`
    );
  }

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
