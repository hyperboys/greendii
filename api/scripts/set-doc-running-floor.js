/**
 * Seed global running floors for PR/WO/HO.
 *
 * Defaults in this script:
 *   PR26170  => PR26 floor = 170
 *   WO26457  => WO26 floor = 457
 *   HO26239  => HO26 floor = 239
 *
 * Run:
 *   node scripts/set-doc-running-floor.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const targetFloors = {
  PR26: 170,
  WO26: 457,
  HO26: 239,
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function main() {
  const existing = await prisma.settings.findUnique({
    where: { id: 'main' },
    select: { approvalFlowConfig: true },
  })

  const approvalFlowConfig = asObject(existing?.approvalFlowConfig)
  const currentFloors = asObject(approvalFlowConfig.docNoFloors)

  const mergedFloors = {
    ...currentFloors,
    ...targetFloors,
  }

  const updated = await prisma.settings.upsert({
    where: { id: 'main' },
    update: {
      approvalFlowConfig: {
        ...approvalFlowConfig,
        docNoFloors: mergedFloors,
      },
    },
    create: {
      id: 'main',
      approvalFlowConfig: {
        docNoFloors: mergedFloors,
      },
    },
    select: { approvalFlowConfig: true },
  })

  console.log('Saved doc number floors:')
  console.log(updated.approvalFlowConfig?.docNoFloors || {})
  console.log('Expected next numbers: PR26170, WO26457, HO26239')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
