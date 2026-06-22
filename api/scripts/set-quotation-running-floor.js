/**
 * Seed per-sales quotation running floors for mid-year go-live.
 *
 * Run:
 *   node scripts/set-quotation-running-floor.js
 *
 * Optional env:
 *   MMYY=0626 node scripts/set-quotation-running-floor.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const now = new Date()
const defaultMmyy = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(2)}`
const targetMmyy = process.env.MMYY || defaultMmyy

const seedData = [
  { firstName: 'ณัฐนรีภัทร', initials: 'NS', nextSeq: 261 },
  { firstName: 'อนงภรณ์', initials: 'AY', nextSeq: 166 },
  { firstName: 'กุลนิษฐ์', initials: 'KC', nextSeq: 163 },
  { firstName: 'สิริญา', initials: 'SA', nextSeq: 189 },
  { firstName: 'หาญชัย', initials: 'HS', nextSeq: 30 },
  { firstName: 'วิไลลักษณ์', initials: 'WK', nextSeq: 95 },
]

function buildPreviewNo(mmyy, initials, seq) {
  return `QGD-${mmyy}-${initials}${String(seq).padStart(3, '0')}`
}

async function resolveUserByFirstName(firstName) {
  const found = await prisma.user.findMany({
    where: {
      OR: [
        { firstName },
        { fullName: { startsWith: firstName } },
      ],
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      firstName: true,
      initials: true,
      docCounters: true,
    },
  })

  if (found.length === 0) return null
  if (found.length === 1) return found[0]

  const exactFirstName = found.find((u) => u.firstName === firstName)
  if (exactFirstName) return exactFirstName

  return found[0]
}

async function main() {
  if (!/^\d{4}$/.test(targetMmyy)) {
    throw new Error(`MMYY must be 4 digits, received: ${targetMmyy}`)
  }

  console.log(`Seeding quotation running floors for MMYY=${targetMmyy}`)

  for (const item of seedData) {
    const user = await resolveUserByFirstName(item.firstName)

    if (!user) {
      console.log(`SKIP  ${item.firstName}: user not found`)
      continue
    }

    const counters = (user.docCounters && typeof user.docCounters === 'object')
      ? { ...user.docCounters }
      : {}

    counters[targetMmyy] = item.nextSeq
    counters.quotationSeqFloor = item.nextSeq

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        initials: item.initials,
        docCounters: counters,
      },
      select: {
        username: true,
        fullName: true,
        initials: true,
        docCounters: true,
      },
    })

    const preview = buildPreviewNo(targetMmyy, item.initials, item.nextSeq)
    console.log(`OK    ${updated.fullName} (${updated.username}) -> next ${preview}`)
  }

  console.log('Done.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
