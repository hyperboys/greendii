const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok", calendar: "gregory",
  day: "2-digit", month: "2-digit", year: "numeric",
});
const documentDateFormatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", calendar: "buddhist", numberingSystem: "latn",
  day: "2-digit", month: "2-digit", year: "numeric",
});
const periodFormatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", calendar: "buddhist", numberingSystem: "latn",
  month: "long", year: "numeric",
});

export function formatAccountingPeriod(date: Date) {
  return periodFormatter.format(date);
}

export function formatAccountingDate(value?: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function formatAccountingDocumentDate(value?: string | null) {
  return value ? documentDateFormatter.format(new Date(value)) : "-";
}

function formatDateTime(value: string, formatter: Intl.DateTimeFormat) {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
  return `${formatter.format(date)} ${time}`;
}

export function formatAccountingDateTime(value: string) {
  return formatDateTime(value, dateFormatter);
}

export function formatAccountingDocumentDateTime(value: string) {
  return formatDateTime(value, documentDateFormatter);
}

export function parseAccountingDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}
