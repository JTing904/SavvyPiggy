import type { Frequency, Schedule } from '../types';
import { m } from '../i18n';

/** Guards against a runaway loop if a schedule was left dormant for years. */
const MAX_CATCH_UP = 60;

/*
  Which day a rule fires on is decided in Malaysia, never on the phone's clock.

  Occurrences used to be the device's local midnights, stored and compared as
  instants. Posted in Malaysia, lastRunAt was Malaysian midnight — 16:00 UTC
  the day before — and a phone set to Bangkok or London read that back as the
  previous day, walked forward onto the day already posted, found its own
  (earlier) midnight still "after" lastRunAt, and posted it a second time.
  Days are now plain YYYY-MM-DD strings in Malaysian time, compared as
  strings, so the answer is the same wherever the phone is. Malaysia has kept
  UTC+8 without daylight saving since 1982, so a fixed offset is exact.
*/
const MYT_OFFSET_MS = 8 * 3600_000;

/** A calendar day as a UTC-midnight Date, so stepping and weekday maths ignore the device zone. */
const parseDay = (day: string) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
};

const formatDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The Malaysian calendar day an instant falls on, as YYYY-MM-DD. Anything
 * unreadable gives null rather than a day nothing could have run on.
 */
export const scheduleDay = (instant: Date | string | number): string | null => {
  const t = new Date(instant).getTime();
  return Number.isFinite(t) ? formatDay(new Date(t + MYT_OFFSET_MS)) : null;
};

/**
 * What lastRunAt stores once a day has run: that day's Malaysian midnight.
 * It is exactly what a phone in Malaysia always wrote, so rules posted
 * before days were strings read back as the same day.
 */
export const runStamp = (day: string) => new Date(parseDay(day).getTime() - MYT_OFFSET_MS).toISOString();

/** The phone's own midnight on that calendar day, for dating entries and showing them. */
export const localDate = (day: string) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d);
};

const daysInMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

/** The 31st has to fire on the 30th in April, and on the 28th in February. */
const clampDay = (day: number, d: Date) => Math.min(day, daysInMonth(d));

const matches = (s: Schedule, d: Date) => {
  switch (s.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return d.getUTCDay() === s.weekday;
    case 'monthly':
      return d.getUTCDate() === clampDay(s.dayOfMonth, d);
    case 'yearly':
      return d.getUTCMonth() + 1 === s.month && d.getUTCDate() === clampDay(s.dayOfMonth, d);
  }
};

/**
 * Every occurrence strictly after `lastRunAt` and up to today, as Malaysian
 * calendar days. There is no server to fire these on time, so they are
 * reconstructed when the app opens.
 */
export const dueOccurrences = (s: Schedule, now = new Date()): string[] => {
  const last = scheduleDay(s.lastRunAt);
  const today = scheduleDay(now);
  if (!last || !today) return [];

  const cursor = parseDay(last);
  const out: string[] = [];
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (formatDay(cursor) <= today && out.length < MAX_CATCH_UP) {
    if (matches(s, cursor)) out.push(formatDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

/**
 * The first day after today (and after whatever is already posted) that the
 * rule fires on, as the phone's midnight on it. Today itself is never
 * returned: if it is due, the catch-up above is posting it right now.
 */
export const nextOccurrence = (s: Schedule, now = new Date()): Date | null => {
  const today = scheduleDay(now);
  if (!today) return null;
  const last = scheduleDay(s.lastRunAt);
  const cursor = parseDay(last && last > today ? last : today);
  for (let i = 0; i < 400; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (matches(s, cursor)) return localDate(formatDay(cursor));
  }
  return null;
};

// English names, kept for anything that wants the raw list. On screen the
// weekday and month come from the dictionary, in the current language.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Plain-language summary of when a rule fires, for the schedule list. */
export const describe = (s: Pick<Schedule, 'frequency' | 'weekday' | 'dayOfMonth' | 'month'>) => {
  const words = m().profile.describe;
  switch (s.frequency) {
    case 'daily':
      return words.daily;
    case 'weekly':
      return words.weekly(s.weekday);
    case 'monthly':
      return words.monthly(s.dayOfMonth);
    case 'yearly':
      return words.yearly(s.month, s.dayOfMonth);
  }
};

/** Labels are read in the current language each time they are shown. */
const frequency = (value: Frequency): { value: Frequency; label: string } => ({
  value,
  get label() {
    return m().profile.frequencies[value];
  },
});

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  frequency('daily'),
  frequency('weekly'),
  frequency('monthly'),
  frequency('yearly'),
];

export const WEEKDAY_LABELS = WEEKDAYS;
export const MONTH_LABELS = MONTHS;
