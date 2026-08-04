require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const woNo = process.argv[2];
  if (!woNo) {
    console.error('Usage: node scripts/dump-workorder-items.js <WO_NO>');
    process.exit(1);
  }

  const wo = await prisma.workOrder.findFirst({
    where: { woNo },
    select: { id: true, woNo: true, items: true },
  });

  if (!wo) {
    console.log('NOT_FOUND');
    return;
  }

  console.log(`WO ${wo.woNo} (${wo.id})`);
  if (!Array.isArray(wo.items)) {
    console.log('items is not array');
    return;
  }

  wo.items.forEach((item, idx) => {
    console.log(`\n[ITEM ${idx}]`);
    console.log('seq:', item?.seq);
    console.log('desc:', JSON.stringify(item?.desc));
    console.log('unit:', JSON.stringify(item?.unit));
    console.log('note:', JSON.stringify(item?.note));
    console.log('images:', JSON.stringify(item?.images));
    console.log('detailRows:', JSON.stringify(item?.detailRows));
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
