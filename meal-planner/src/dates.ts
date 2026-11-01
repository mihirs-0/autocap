// All dates are local calendar dates as "YYYY-MM-DD" strings.
// This avoids time-zone shifts that happen with Date objects and UTC.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function isValidISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(fromISO(s)) === s;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Every date from start to end, both included. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatLong(s: string, locale?: string): string {
  return fromISO(s).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShort(s: string): string {
  return fromISO(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function monthStart(s: string): string {
  return s.slice(0, 8) + '01';
}

export function addMonths(monthFirstDay: string, n: number): string {
  const d = fromISO(monthFirstDay);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

export function monthEnd(monthFirstDay: string): string {
  return addDays(addMonths(monthFirstDay, 1), -1);
}

export function formatMonth(monthFirstDay: string): string {
  return fromISO(monthFirstDay).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
