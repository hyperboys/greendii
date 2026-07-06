const prisma = require('./prisma');

const DEFAULT_PR_CURRENCIES = ['THB', 'USD'];

function normalizeCurrencyCode(code) {
  return String(code || '').trim().toUpperCase();
}

function sanitizePrCurrencies(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_PR_CURRENCIES];

  const cleaned = raw
    .map(normalizeCurrencyCode)
    .filter(code => /^[A-Z]{3}$/.test(code));

  const deduped = [...new Set(cleaned)];
  return deduped.length > 0 ? deduped : [...DEFAULT_PR_CURRENCIES];
}

async function getPrCurrencies() {
  const settings = await prisma.settings.findUnique({ where: { id: 'main' } });
  const cfg = settings?.approvalFlowConfig;
  const configured = cfg && typeof cfg === 'object' ? cfg.prCurrencies : undefined;
  return sanitizePrCurrencies(configured);
}

module.exports = {
  DEFAULT_PR_CURRENCIES,
  normalizeCurrencyCode,
  sanitizePrCurrencies,
  getPrCurrencies,
};
