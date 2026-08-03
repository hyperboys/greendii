require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function scanSuspiciousStrings(value, path = '$', findings = []) {
  if (typeof value === 'string') {
    if (/\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}|\\[A-Za-z]/.test(value)) {
      findings.push({ path, value });
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSuspiciousStrings(entry, `${path}[${index}]`, findings));
    return findings;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => scanSuspiciousStrings(entry, `${path}.${key}`, findings));
    return findings;
  }
  return findings;
}

async function main() {
  const woNo = process.argv[2];
  if (!woNo) {
    console.error('Usage: node scripts/inspect-workorder-item-text.js <WO_NO>');
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

  const text = JSON.stringify(wo.items);
  const hasEscaped = /\\\\u00a0|\\u00a0/i.test(text);
  const hasNbsp = /\u00a0/i.test(text);

  console.log(JSON.stringify({
    id: wo.id,
    woNo: wo.woNo,
    hasEscaped,
    hasNbsp,
    itemCount: Array.isArray(wo.items) ? wo.items.length : 0,
  }, null, 2));

  if (!Array.isArray(wo.items)) return;

  wo.items.forEach((item, idx) => {
    const payload = JSON.stringify(item);
    if (/\\\\u00a0|\\u00a0/i.test(payload)) {
      console.log(`MATCH_ITEM_INDEX ${idx}`);
      console.log(payload);
    }
  });

  const findings = scanSuspiciousStrings(wo.items);
  if (findings.length > 0) {
    console.log('SUSPICIOUS_STRINGS');
    findings.forEach((f) => console.log(`${f.path}: ${f.value}`));
  } else {
    console.log('SUSPICIOUS_STRINGS none');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
