import type { Frequency, Schedule } from '../types';
import { m } from '../i18n';

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
