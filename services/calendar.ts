import { dayStart } from './holdings';

/**
 * Days, as the app writes them down and as a calendar lays them out.
 *
 * A trade date is a *day*, not an instant — it decides which dividends are
 * yours, and the exchange does not care what time you pressed the button. So
 * everything here works in the device's own timezone and never touches UTC:
 * `new Date(ms).getFullYear()` and friends, not `toISOString()`, which would
 * hand back yesterday for anyone east of Greenwich late in the evening.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** A timestamp as the "YYYY-MM-DD" the app stores and passes around. */
export const toInputDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * "YYYY-MM-DD" back to the local midnight of that day. Anything unreadable
 * falls back to today rather than to 1970, which would silently backdate a
 * trade by fifty years.
 */
export const fromInputDate = (text: string) => {
  const [y, m, d] = text.split('-').map(Number);
  if (!y || !m || !d) return dayStart(Date.now());
  return new Date(y, m - 1, d).getTime();
};

/**
 * The day `delta` days from this one. Done through the calendar rather than by
 * subtracting 24 hours, so a daylight-saving boundary cannot land it on the
 * wrong date.
 */
export const addDays = (key: string, delta: number) => {
  const d = new Date(fromInputDate(key));
  return toInputDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta).getTime());
};

/** The month `delta` months from this one, rolling the year over as needed. */
export const addMonths = (year: number, month: number, delta: number) => {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** Sunday first, matching the calendar the phone itself draws. */
export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** "Fri, 19 Jun 2026" — the date as a person reads it. */
export const readableDate = (key: string) =>
  new Date(fromInputDate(key)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * A month as six rows of seven, blanks padded with null.
 *
 * Always six rows, even for a February that only needs four: a grid that
 * changed height would make the sheet jump every time you stepped a month,
 * and the arrows sit above it.
 */
export const monthGrid = (year: number, month: number): (number | null)[][] => {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length < 42) cells.push(null);

  return Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
};
