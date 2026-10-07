import type { Activity } from '../types';
import { toCents } from './money';
import { dayKey } from './analytics';
import { monthGrid } from './calendar';

/**
 * How the History page bundles the ledger: by day, with the figures each day
 * and month shows. Pure, so the sums are tested without drawing anything.
 * Everything is in whole cents, and months are 0-based like Date's own.
 */

/** What actually reached the goals, in cents, whatever brought it there. */
export const credited = (a: Activity) => a.distributions.reduce((s, d) => (d.amount > 0 ? s + toCents(d.amount) : s), 0);

/**
 * What was saved and what was spent, in cents. A sale's proceeds are shares
 * coming back rather than saving, and a purchase is not spending. A deleted
 * goal's money moving into another goal is neither, and neither is money
 * moving to or from the investment pot.
 */
export const inflow = (a: Activity) =>
  a.type === 'divest' || a.type === 'transfer' || a.type === 'fromInvest' || a.type === 'walletMove'
    ? 0
    : // Income kept in the wallet (or clearing an overdraft) arrived all the same.
      credited(a) + Math.max(0, toCents(a.wallet ?? 0));

export const outflow = (a: Activity) =>
  a.type === 'invest' || a.type === 'divest' || a.type === 'transfer' || a.type === 'toInvest' || a.type === 'walletMove'
    ? 0
    : a.distributions.reduce((s, d) => (d.amount < 0 ? s - toCents(d.amount) : s), 0) +
      // Spending out of the wallet touches no goal, but it is spending.
      (a.type === 'withdraw' || a.type === 'loanPayment' ? Math.max(0, -toCents(a.wallet ?? 0)) : 0);

/** Everything a trade's row moved, in cents: a sale's proceeds include any spent ahead they covered. */
export const sharesCents = (a: Activity) =>
  a.type === 'divest'
    ? // Signed: a sale whose fees were bigger than the sale took money out.
      a.distributions.reduce((s, d) => s + toCents(d.amount), 0) + toCents(a.repaid ?? 0)
    : a.distributions.reduce((s, d) => s + Math.abs(toCents(d.amount)), 0);

export interface Day {
  /** Zero-padded "YYYY-MM-DD", the same key analytics uses. */
  key: string;
  date: Date;
  entries: Activity[];
  saved: number;
  spent: number;
  borrowed: number;
  repaid: number;
  /** Paid out of goals for shares, and a sale's proceeds back in. */
  sharesOut: number;
  sharesIn: number;
}

const inMonth = (a: Activity, year: number, month: number) => {
  const d = new Date(a.date);
  return d.getFullYear() === year && d.getMonth() === month;
};

/**
 * The records bundled by day, newest day first; `opts` keeps one month only.
 * Activities arrive newest first, so each day's entries already are too.
 */
export const groupByDay = (activities: Activity[], opts?: { year: number; month: number }): Day[] => {
  const out = new Map<string, Day>();
  for (const a of activities) {
    if (opts && !inMonth(a, opts.year, opts.month)) continue;

    const d = new Date(a.date);
    const key = dayKey(d);
    const day =
      out.get(key) ??
      ({
        key,
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        entries: [],
        saved: 0,
        spent: 0,
        borrowed: 0,
        repaid: 0,
        sharesOut: 0,
        sharesIn: 0,
      } as Day);

    day.entries.push(a);
    day.saved += inflow(a);
    day.spent += outflow(a);
    if (a.type === 'borrow') day.borrowed += toCents(a.amount);
    if (a.type === 'invest' || a.type === 'toInvest') day.sharesOut += sharesCents(a);
    else if (a.type === 'fromInvest') day.sharesIn += sharesCents(a);
    else if (a.type === 'divest') {
      const cents = sharesCents(a);
      if (cents >= 0) day.sharesIn += cents;
      else day.sharesOut -= cents;
    }
    // Spent ahead covered by a sale is part of the shares coming back, not a deposit's.
    else day.repaid += toCents(a.repaid ?? 0);
    out.set(key, day);
  }
  return [...out.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
};

/**
 * The dots a calendar cell shows for a day: money in, money out, and money
 * moved for investing. A transfer between goals is none of them.
 */
export const dotsFor = (day: Day): { in: boolean; out: boolean; invest: boolean } => ({
  in: day.entries.some((a) => (a.type === 'manual' || a.type === 'auto-save') && inflow(a) > 0),
  out: day.entries.some((a) => a.type === 'withdraw' || a.type === 'borrow'),
  invest: day.entries.some(
    (a) => a.type === 'invest' || a.type === 'divest' || a.type === 'toInvest' || a.type === 'fromInvest'
  ),
});

/**
 * A month's figures in cents. `movedCents` is what went into investing less
 * what came back, purchases and the pot alike and signed, and is kept apart:
 * moving money to investing is not spending, so it never reaches `outCents`.
 */
export const monthSummary = (
  activities: Activity[],
  year: number,
  month: number
): { inCents: number; outCents: number; movedCents: number } => {
  let inCents = 0;
  let outCents = 0;
  let movedCents = 0;
  for (const a of activities) {
    if (!inMonth(a, year, month)) continue;
    inCents += inflow(a);
    outCents += outflow(a);
    if (a.type === 'invest' || a.type === 'toInvest') movedCents += sharesCents(a);
    else if (a.type === 'divest' || a.type === 'fromInvest') movedCents -= sharesCents(a);
  }
  return { inCents, outCents, movedCents };
};

/** The seven days of the week holding `date`, Sunday first like the calendar grid, at local midnight. */
export const weekOf = (date: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay() + i));

/** A month as six rows of seven, a Date for each real day and null for the blanks. */
export const monthDays = (year: number, month: number): (Date | null)[][] =>
  monthGrid(year, month).map((row) => row.map((day) => (day === null ? null : new Date(year, month, day))));
