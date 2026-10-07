import type { Liability, NetWorthPoint } from '../types';
import { toCents } from './money';
import { addMonthsTo, monthKeyOf } from './review';

/**
 * What the person has, less what they owe. Pure and in whole cents.
 *
 * Everything in it is something the app already knows: the wallet, the goals,
 * the investing pot and shares at their last price, and the debts, which only
 * change by a payment recorded or a correction. Nothing here asks the person
 * for a value or guesses one.
 */

export interface NetWorthInput {
  walletCents: number;
  goalsCents: number;
  /** The investing pot's cash. */
  potCents: number;
  /** Shares at their last price, or at cost where there is none. */
  holdingsCents: number;
  liabilities: Liability[];
}

export interface NetWorthParts {
  /** Wallet plus goals; the wallet is negative when it is overdrawn. */
  savingsCents: number;
  investingCents: number;
  /** What is owed, as a positive number. */
  debtsCents: number;
  totalCents: number;
}

export const netWorthOf = (i: NetWorthInput): NetWorthParts => {
  const savings = i.walletCents + i.goalsCents;
  const investing = i.potCents + i.holdingsCents;
  const debts = i.liabilities.reduce((sum, l) => sum + Math.max(0, toCents(l.balance)), 0);
  return { savingsCents: savings, investingCents: investing, debtsCents: debts, totalCents: savings + investing - debts };
};

/** Debts, largest first, ties in the order they were added. */
export const largestFirst = <T extends { createdAt: number }>(rows: T[], cents: (row: T) => number): T[] =>
  rows
    .map((row, i) => ({ row, i, c: cents(row) }))
    .sort((a, b) => b.c - a.c || a.row.createdAt - b.row.createdAt || a.i - b.i)
    .map((x) => x.row);

export interface TrendPoint {
  month: string;
  /** Null where the app was never opened that month. */
  cents: number | null;
}

/** The last `count` months up to this one, oldest first; this month always carries today's figure. */
export const trendOf = (points: NetWorthPoint[], now: Date, totalCents: number, count = 6): TrendPoint[] => {
  const byMonth = new Map(points.map((p) => [p.month, p.cents]));
  const thisMonth = monthKeyOf(now);
  const out: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = monthKeyOf(addMonthsTo(now, -i));
    out.push({ month, cents: month === thisMonth ? totalCents : (byMonth.get(month) ?? null) });
  }
  return out;
};

/** Today's figure less last month's, or null when last month has no record. */
export const changeSinceLastMonth = (points: NetWorthPoint[], now: Date, totalCents: number): number | null => {
  const last = points.find((p) => p.month === monthKeyOf(addMonthsTo(now, -1)));
  return last ? totalCents - last.cents : null;
};

/** Whether today's figure is worth writing: this month has none, or a different one. */
export const needsSnapshot = (points: NetWorthPoint[], now: Date, totalCents: number): boolean =>
  points.find((p) => p.month === monthKeyOf(now))?.cents !== totalCents;
