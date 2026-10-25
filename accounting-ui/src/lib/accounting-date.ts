const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok", calendar: "gregory",
  day: "2-digit", month: "2-digit", year: "numeric",
});

export function formatAccountingDate(value?: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function formatAccountingDateTime(value: string) {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
  return `${dateFormatter.format(date)} ${time}`;
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
