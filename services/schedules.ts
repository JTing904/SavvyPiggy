import type { Frequency, Schedule } from '../types';

/** Guards against a runaway loop if a schedule was left dormant for years. */
const MAX_CATCH_UP = 60;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** The 31st has to fire on the 30th in April, and on the 28th in February. */
const clampDay = (day: number, d: Date) => Math.min(day, daysInMonth(d));

const matches = (s: Schedule, d: Date) => {
  switch (s.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return d.getDay() === s.weekday;
    case 'monthly':
      return d.getDate() === clampDay(s.dayOfMonth, d);
    case 'yearly':
      return d.getMonth() + 1 === s.month && d.getDate() === clampDay(s.dayOfMonth, d);
  }
};

/**
 * Every occurrence strictly after `lastRunAt` and up to today. There is no
 * server to fire these on time, so they are reconstructed when the app opens.
 */
export const dueOccurrences = (s: Schedule, now = new Date()): Date[] => {
  const today = startOfDay(now);
  const cursor = startOfDay(new Date(s.lastRunAt));
  const out: Date[] = [];

  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= today && out.length < MAX_CATCH_UP) {
    if (matches(s, cursor)) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

/**
 * The first day after today (and after whatever is already posted) that the
 * rule fires on. Today itself is never returned: if it is due, the catch-up
 * above is posting it right now.
 */
export const nextOccurrence = (s: Schedule, now = new Date()): Date | null => {
  const cursor = startOfDay(new Date(Math.max(now.getTime(), new Date(s.lastRunAt).getTime())));
  for (let i = 0; i < 400; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (matches(s, cursor)) return new Date(cursor);
  }
  return null;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/** Plain-English summary of when a rule fires, for the schedule list. */
export const describe = (s: Pick<Schedule, 'frequency' | 'weekday' | 'dayOfMonth' | 'month'>) => {
  switch (s.frequency) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `Every ${WEEKDAYS[s.weekday]}`;
    case 'monthly':
      return `The ${ordinal(s.dayOfMonth)} of each month`;
    case 'yearly':
      return `${MONTHS[s.month - 1]} ${ordinal(s.dayOfMonth)} each year`;
  }
};

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const WEEKDAY_LABELS = WEEKDAYS;
export const MONTH_LABELS = MONTHS;
