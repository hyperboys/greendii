const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const beforeUsers = await prisma.user.findMany({
    where: { role: 'sales2' },
    select: { id: true, username: true, fullName: true },
  });

  const result = await prisma.user.updateMany({
    where: { role: 'sales2' },
    data: { role: 'sales' },
  });

  const afterCount = await prisma.user.count({ where: { role: 'sales2' } });

  console.log(
    JSON.stringify(
      {
        beforeCount: beforeUsers.length,
        updatedCount: result.count,
        afterCount,
        usersUpdated: beforeUsers,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
