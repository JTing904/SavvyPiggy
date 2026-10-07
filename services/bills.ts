import type { Activity, Bill, Schedule } from '../types';
import { dueOccurrences, localDate, occurrencesBetween, scheduleDay } from './schedules';
import { toCents } from './money';

/**
 * Recurring bills: money that goes out every day, week, month or year.
 *
 * A fixed bill is recorded by the app on its day (when the app is open, as
 * auto deposits are); a variable one only asks, with last time's amount filled
 * in, and nothing moves until the person confirms. Everything here is pure; the
 * writers in firestore.ts apply it.
 *
 * Which day a bill falls on is decided in Malaysia, like auto deposits (see
 * schedules.ts): days are plain YYYY-MM-DD strings.
 */

/** The wallet as the source of a bill, in the same field as a goal's id. */
export const WALLET_SOURCE = 'wallet';

/** The recurrence engine's own shape, so a bill reuses its day arithmetic. */
export const billSchedule = (
  b: Pick<Bill, 'id' | 'amount' | 'frequency' | 'weekday' | 'dayOfMonth' | 'month' | 'enabled' | 'createdAt' | 'lastRunAt'>
): Schedule => ({
  id: b.id,
  amount: b.amount,
  frequency: b.frequency,
  weekday: b.weekday,
  dayOfMonth: b.dayOfMonth,
  month: b.month,
  targetBankId: null,
  enabled: b.enabled,
  createdAt: b.createdAt,
  lastRunAt: b.lastRunAt,
});

/** Days a bill has come due since it last ran, oldest first. */
export const dueDays = (bill: Bill, now = new Date()): string[] => (bill.enabled ? dueOccurrences(billSchedule(bill), now) : []);

/** A day inside the history the app keeps is worth recording; an older one is only passed over. */
const recordable = (day: string, notBefore: Date) => localDate(day).getTime() >= new Date(notBefore.getFullYear(), notBefore.getMonth(), notBefore.getDate()).getTime();

/**
 * What the app does for a fixed bill when it opens: record each due day it
 * still can, and pass over the ones older than the history it keeps (those
 * only move the bill's clock forward, so they are never asked about again).
 */
export const planFixedRun = (bill: Bill, now: Date, notBefore: Date): { post: string[]; skipped: string[] } => {
  if (bill.mode !== 'fixed') return { post: [], skipped: [] };
  const post: string[] = [];
  const skipped: string[] = [];
  for (const day of dueDays(bill, now)) (recordable(day, notBefore) ? post : skipped).push(day);
  return { post, skipped };
};

/** Due days older than the history the app keeps, of any bill: only passed over, so the bill's clock can move on. */
export const outsideHistory = (bill: Bill, now: Date, notBefore: Date): string[] => dueDays(bill, now).filter((d) => !recordable(d, notBefore));

export interface PendingBill {
  bill: Bill;
  /** The oldest day still waiting. Later days wait behind it: one is answered at a time. */
  day: string;
  /** How many days are waiting in all, this one included. */
  waiting: number;
}

/** Variable bills that have come due and have not been recorded or skipped, oldest day of each. */
export const pendingVariable = (bills: Bill[], now: Date, notBefore: Date): PendingBill[] =>
  bills
    .filter((b) => b.mode === 'variable')
    .flatMap((bill) => {
      const days = dueDays(bill, now).filter((d) => recordable(d, notBefore));
      return days.length > 0 ? [{ bill, day: days[0], waiting: days.length }] : [];
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.bill.name.localeCompare(b.bill.name)));

/** What a bill is expected to cost: the last amount recorded for it, else the figure it was made with. */
export const expectedCents = (bill: Bill, activities: Activity[]): number => {
  const last = recentAmounts(activities, bill.id, 1)[0];
  return last ? last.cents : toCents(bill.amount);
};

/** The latest amounts recorded for one bill, newest first, from the entries the app has loaded. */
export const recentAmounts = (activities: Activity[], billId: string, count = 3): { cents: number; date: string }[] =>
  activities
    .filter((a) => a.billId === billId && a.type === 'withdraw')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, count)
    .map((a) => ({ cents: toCents(a.amount), date: a.date }));

export interface UpcomingBill {
  bill: Bill;
  day: string;
  cents: number;
}

/**
 * Bills falling on the next `days` days, today first, whether or not they are
 * already due. A bill that is already waiting is included on its day.
 */
export const upcomingBills = (bills: Bill[], activities: Activity[], now: Date, days = 7): UpcomingBill[] => {
  const today = scheduleDay(now);
  if (!today) return [];
  const [y, m, d] = today.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + days - 1)).toISOString().slice(0, 10);
  return bills
    .filter((b) => b.enabled)
    .flatMap((bill) => occurrencesBetween(billSchedule(bill), today, end).map((day) => ({ bill, day, cents: expectedCents(bill, activities) })))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.bill.name.localeCompare(b.bill.name)));
};

/**
 * Whether the wallet covers the bills coming out of it. Bills that come out of
 * a goal do not count: a goal may go below zero by design, the wallet's
 * overdraft is the thing worth warning about.
 */
export const walletShortfall = (upcoming: UpcomingBill[], walletCents: number): { totalCents: number; shortCents: number } | null => {
  const total = upcoming.filter((u) => u.bill.sourceId === WALLET_SOURCE).reduce((s, u) => s + u.cents, 0);
  if (total <= 0) return null;
  const short = total - Math.max(0, walletCents);
  return short > 0 ? { totalCents: total, shortCents: short } : null;
};

/** The note an entry made by a bill carries, so History reads as the bill's name. */
export const billNote = (bill: Pick<Bill, 'name'>) => bill.name.trim();
