import type { Activity } from '../types';
import { toCents } from './money';
import { inflowCents, spendingByCategory, walletSpentCents, type CategorySpend } from './analytics';

/**
 * One calendar month, worked out from the ledger: what came in, what went out,
 * and how much of it was set aside. Pure and in whole cents; `now` is passed in.
 *
 * Saving means reaching a goal. Money kept in the wallet is not saved, money
 * moved from the wallet into a goal is, and money that leaves a goal (spent, or
 * moved back to the wallet) is taken off. Moving money to and from the
 * investing pot is neither, and neither is clearing an old spent-ahead debt.
 */

export const monthStartOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonthsTo = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** "2026-09": the month a figure belongs to, in local time. */
export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export interface BiggestSpend {
  id: string;
  date: string;
  cents: number;
  note: string;
  category: string;
  /** Made by a recurring bill rather than typed in. */
  bill: boolean;
  auto: boolean;
}

export interface MonthFigures {
  start: Date;
  /** Exclusive. */
  end: Date;
  /** Everything that came in, less what cleared old spent-ahead debt. */
  incomeCents: number;
  /** Out of the wallet and out of the goals. */
  spentCents: number;
  /** The part of `spentCents` that came out of the wallet, and the part that came out of goals. */
  spentFromWalletCents: number;
  spentFromGoalsCents: number;
  /** Reached a goal: income put straight in, and money moved in from the wallet. */
  putInCents: number;
  /** Left a goal: spent from it, or moved back to the wallet. */
  takenOutCents: number;
  /** putIn less takenOut. */
  savedCents: number;
  /** Whole percent of income that was saved; null when there was no income to speak of. */
  rate: number | null;
  /** What the wallet changed by, signed. */
  walletChangeCents: number;
  /** Spending made by recurring bills, and how many entries. */
  billsCents: number;
  billCount: number;
  categories: CategorySpend[];
  /** The five largest single spends, largest first. */
  biggest: BiggestSpend[];
  /** Whether anything at all was recorded in the month. */
  entries: number;
}

export const savingsRate = (savedCents: number, incomeCents: number): number | null =>
  incomeCents > 0 ? Math.round((savedCents / incomeCents) * 100) : null;

const goalSpentCents = (a: Activity) => a.distributions.reduce((sum, d) => (d.amount < 0 ? sum - toCents(d.amount) : sum), 0);

/** The same figures for any stretch of days, which the Report uses for its week, quarter, year and all-time views. */
export const figuresFor = (activities: Activity[], first: Date, end: Date, now: Date = new Date()): MonthFigures => {

  let income = 0;
  let spent = 0;
  let spentWallet = 0;
  let spentGoals = 0;
  let putIn = 0;
  let takenOut = 0;
  let wallet = 0;
  let bills = 0;
  let billCount = 0;
  let entries = 0;
  const spends: BiggestSpend[] = [];

  for (const a of activities) {
    const at = new Date(a.date);
    if (at < first || at >= end || at > now) continue;
    entries += 1;
    wallet += toCents(a.wallet ?? 0);

    if (a.type === 'manual' || a.type === 'auto-save') {
      income += Math.max(0, toCents(a.amount) - toCents(a.repaid ?? 0));
      putIn += inflowCents(a);
    } else if (a.type === 'withdraw') {
      const cents = goalSpentCents(a) + walletSpentCents(a);
      spent += cents;
      spentWallet += walletSpentCents(a);
      spentGoals += goalSpentCents(a);
      takenOut += goalSpentCents(a);
      if (cents > 0) {
        spends.push({
          id: a.id,
          date: a.date,
          cents,
          note: a.note ?? '',
          category: a.category ?? '',
          bill: Boolean(a.billId),
          auto: Boolean(a.auto),
        });
        if (a.billId) {
          bills += cents;
          billCount += 1;
        }
      }
    } else if (a.type === 'walletMove') {
      for (const d of a.distributions) {
        if (d.amount > 0) putIn += toCents(d.amount);
        else if (d.amount < 0) takenOut -= toCents(d.amount);
      }
    }
  }

  const saved = putIn - takenOut;
  return {
    start: first,
    end,
    incomeCents: income,
    spentCents: spent,
    spentFromWalletCents: spentWallet,
    spentFromGoalsCents: spentGoals,
    putInCents: putIn,
    takenOutCents: takenOut,
    savedCents: saved,
    rate: savingsRate(saved, income),
    walletChangeCents: wallet,
    billsCents: bills,
    billCount,
    categories: spendingByCategory(activities, { start: first, end }, now),
    biggest: spends.sort((x, y) => y.cents - x.cents || (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)).slice(0, 5),
    entries,
  };
};

export const monthFigures = (activities: Activity[], start: Date, now: Date = new Date()): MonthFigures => {
  const first = monthStartOf(start);
  return figuresFor(activities, first, addMonthsTo(first, 1), now);
};

export interface RatePoint {
  start: Date;
  rate: number | null;
  /** The month is recorded at all; an empty month is drawn as nothing rather than as 0%. */
  has: boolean;
}

/** The savings rate of the `count` months up to and including the one starting at `last`, oldest first. */
export const rateSeries = (activities: Activity[], last: Date, count: number, now: Date = new Date()): RatePoint[] => {
  const out: RatePoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const f = monthFigures(activities, addMonthsTo(last, -i), now);
    out.push({ start: f.start, rate: f.rate, has: f.entries > 0 });
  }
  return out;
};

/**
 * How a month compares with the one before, in the unit that reads naturally:
 * points for a rate, whole percent for money. Null when there is nothing to
 * compare against.
 */
export const pointsChange = (now: number | null, before: number | null): number | null =>
  now === null || before === null ? null : now - before;

export const centsChange = (now: number, before: number): number | null =>
  before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 100);

/**
 * What reached each goal in a stretch of days, in cents: what was put straight
 * in, and what was moved in from the wallet. Money coming back from investing,
 * or from a goal that was deleted, is not counted.
 */
export const creditedByGoal = (activities: Activity[], start: Date, end: Date, now: Date = new Date()): Map<string, number> => {
  const out = new Map<string, number>();
  for (const a of activities) {
    const at = new Date(a.date);
    if (at < start || at >= end || at > now) continue;
    if (a.type === 'fromInvest' || a.type === 'invest' || a.type === 'toInvest' || a.type === 'transfer' || a.type === 'divest') continue;
    for (const d of a.distributions) {
      if (d.amount > 0) out.set(d.bankId, (out.get(d.bankId) ?? 0) + toCents(d.amount));
    }
  }
  return out;
};
