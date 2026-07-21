const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const BANGKOK_OFFSET = '+07:00';

function parseBangkokDate(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
  const parsed = new Date(`${date}T${time}${BANGKOK_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function bangkokDateRange(from, to) {
  const range = {};
  const start = parseBangkokDate(from);
  const end = parseBangkokDate(to, { endOfDay: true });
  if (start) range.gte = start;
  if (end) range.lte = end;
  return Object.keys(range).length > 0 ? range : undefined;
}

module.exports = { BANGKOK_TIME_ZONE, parseBangkokDate, bangkokDateRange };