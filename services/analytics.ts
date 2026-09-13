import type { Activity, PiggyBank, Trade } from '../types';
import { categoryOf } from './categories';
import { fromCents, toCents } from './money';
import { m } from '../i18n';

/**
 * Everything the Report page shows is derived here from the activity ledger,
 * with a fixed `now` passed in so it is testable. Sums are done in cents.
 *
 * Balances are never derived from the ledger: a goal's `currentAmount` is the
 * truth, so clearing old records changes these statistics but never the money.
 *
 * Labels are worded in the language current when they are built.
 */

export type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';

/** The label is read in the current language each time it is shown. */
const periodOption = (key: Period): { key: Period; label: string } => ({
  key,
  get label() {
    return m().report.periods[key];
  },
});

export const PERIODS: { key: Period; label: string }[] = [
  periodOption('week'),
  periodOption('month'),
  periodOption('quarter'),
  periodOption('year'),
  periodOption('all'),
];

export interface DateRange {
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface PeriodRange extends DateRange {
  label: string;
  /** Days of the period that have happened so far, today included. */
  days: number;
  previous: DateRange | null;
}

const DAY = 24 * 60 * 60 * 1000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Local calendar day, so a deposit at 23:30 counts for the day it was made. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const shortDate = (d: Date) => m().report.dayMonth(d.getMonth(), d.getDate());

/** "Sep 1 – Sep 30, 2026", or with both years when the range straddles one. */
export const rangeLabel = (start: Date, endExclusive: Date) => {
  const last = addDays(endExclusive, -1);
  if (start.getFullYear() !== last.getFullYear()) {
    return m().report.rangeCrossYear(shortDate(start), start.getFullYear(), shortDate(last), last.getFullYear());
  }
  return m().report.rangeSameYear(shortDate(start), shortDate(last), last.getFullYear());
};

const inRange = (d: Date, r: DateRange) => d >= r.start && d < r.end;

const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

/** Weeks start on Monday. */
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export const periodRange = (period: Period, now: Date, firstActivity: Date | null = null): PeriodRange => {
  const today = startOfDay(now);
  let start: Date;
  let end: Date;
  let previous: DateRange | null;

  switch (period) {
    case 'week':
      start = startOfWeek(now);
      end = addDays(start, 7);
      previous = { start: addDays(start, -7), end: start };
      break;
    case 'month':
      start = addMonths(now, 0);
      end = addMonths(now, 1);
      previous = { start: addMonths(now, -1), end: start };
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), q, 1);
      end = new Date(now.getFullYear(), q + 3, 1);
      previous = { start: new Date(now.getFullYear(), q - 3, 1), end: start };
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      previous = { start: new Date(now.getFullYear() - 1, 0, 1), end: start };
      break;
    case 'all':
      start = firstActivity && firstActivity < today ? startOfDay(firstActivity) : today;
      end = addDays(today, 1);
      previous = null;
      break;
  }

  const label = period === 'all' ? m().report.since(shortDate(start), start.getFullYear()) : rangeLabel(start, end);
  // A period that ends before today is fully elapsed; otherwise count to today.
  const lastDay = end <= today ? addDays(end, -1) : today;
  const days = Math.max(1, daysBetween(start, lastDay) + 1);

  return { start, end, label, days, previous };
};

/* ------------------------------------------------------------------ totals */

export interface BankStat {
  bankId: string;
  name: string;
  icon: string;
  /** Money that reached this goal in the period. */
  credited: number;
  /** Whole-percent share of everything credited in the period. */
  share: number;
  current: number;
  target: number;
  /** Percent of target reached, from the live balance; null when open-ended. */
  funded: number | null;
}

export interface Bucket {
  label: string;
  amount: number;
  /** True for the bar today falls in. */
  current: boolean;
}

export interface Forecast {
  bankId: string;
  name: string;
  /** Average credited per day over the period. */
  dailyRate: number;
  remaining: number;
  days: number;
  date: Date;
}

export interface Summary {
  range: PeriodRange;
  /** Sum of everything credited to goals in the period. */
  distributed: number;
  spent: number;
  repaid: number;
  borrowed: number;
  /** Paid out of goals for shares. Not spending: the money still exists, as shares. */
  invested: number;
  /** A sale's proceeds coming back — split, into a goal, or covering spent ahead. Not saving. */
  cameBack: number;
  /** The part of `cameBack` that landed in goals, rather than covering spent ahead. */
  cameBackToGoals: number;
  /** Percent change of `distributed` against the previous period. */
  change: number | null;
  dailyAverage: number;
  transactions: number;
  top: BankStat | null;
  collective: { funded: number | null; goals: number; reached: number };
  banks: BankStat[];
  buckets: Bucket[];
  /** Consecutive days with money reaching a goal, up to today or yesterday. */
  streak: number;
  /** Days in the period with money reaching a goal. */
  activeDays: number;
  maxDay: number;
  forecast: Forecast | null;
}

/**
 * What was saved into goals: only the positive side of the distributions. A
 * sale's proceeds land in goals too, but that is money coming back from shares
 * rather than money saved, so it counts neither here nor towards a streak.
 */
export const inflowCents = (a: Activity) =>
  a.type === 'divest' ? 0 : a.distributions.reduce((sum, d) => (d.amount > 0 ? sum + toCents(d.amount) : sum), 0);

/** What was spent out of goals. Buying shares is not spending, so it is left out. */
const outflowCents = (a: Activity) =>
  a.type === 'invest' ? 0 : a.distributions.reduce((sum, d) => (d.amount < 0 ? sum - toCents(d.amount) : sum), 0);

const movedCents = (a: Activity) => a.distributions.reduce((sum, d) => sum + Math.abs(toCents(d.amount)), 0);

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const firstActivityDate = (activities: Activity[]): Date | null => {
  let first: Date | null = null;
  for (const a of activities) {
    const d = new Date(a.date);
    if (!first || d < first) first = d;
  }
  return first;
};

/** Consecutive days with inflow, counted back from today (or yesterday, if today is still empty). */
export const currentStreak = (activities: Activity[], now: Date) => {
  const days = new Set<string>();
  for (const a of activities) if (inflowCents(a) > 0) days.add(dayKey(new Date(a.date)));

  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

/** Slices the period into the bars the cadence chart draws. */
export const bucketsFor = (period: Period, range: PeriodRange): { label: string; range: DateRange }[] => {
  const out: { label: string; range: DateRange }[] = [];
  switch (period) {
    case 'week':
      for (let i = 0; i < 7; i++) {
        const day = addDays(range.start, i);
        out.push({ label: m().common.weekdaysShort[day.getDay()], range: { start: day, end: addDays(day, 1) } });
      }
      break;
    case 'month':
      for (let i = 0, start = range.start; start < range.end; i++, start = addDays(start, 7)) {
        const end = addDays(start, 7) < range.end ? addDays(start, 7) : range.end;
        out.push({ label: m().report.weekBucket(i + 1), range: { start, end } });
      }
      break;
    case 'quarter':
    case 'year':
      for (let start = range.start; start < range.end; start = addMonths(start, 1)) {
        out.push({ label: m().report.monthsShort[start.getMonth()], range: { start, end: addMonths(start, 1) } });
      }
      break;
    case 'all': {
      const months =
        (range.end.getFullYear() - range.start.getFullYear()) * 12 + range.end.getMonth() - range.start.getMonth();
      if (months > 15) {
        for (let y = range.start.getFullYear(); y <= addDays(range.end, -1).getFullYear(); y++) {
          out.push({ label: String(y), range: { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) } });
        }
      } else {
        for (let start = addMonths(range.start, 0); start < range.end; start = addMonths(start, 1)) {
          out.push({ label: m().report.monthsShort[start.getMonth()], range: { start, end: addMonths(start, 1) } });
        }
      }
      break;
    }
  }
  return out;
};

export const summarize = (
  activities: Activity[],
  banks: PiggyBank[],
  period: Period,
  now: Date = new Date()
): Summary => {
  const range = periodRange(period, now, firstActivityDate(activities));
  const dated = activities.map((a) => ({ a, d: new Date(a.date) }));
  const inPeriod = dated.filter(({ d }) => inRange(d, range));

  let distributed = 0;
  let spent = 0;
  let repaid = 0;
  let borrowed = 0;
  let invested = 0;
  let cameBack = 0;
  let cameBackToGoals = 0;
  const credited = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const { a, d } of inPeriod) {
    if (a.type === 'invest') {
      invested += movedCents(a);
      continue;
    }
    if (a.type === 'divest') {
      cameBack += movedCents(a) + toCents(a.repaid ?? 0);
      cameBackToGoals += movedCents(a);
      continue;
    }
    const inflow = inflowCents(a);
    distributed += inflow;
    spent += outflowCents(a);
    repaid += toCents(a.repaid ?? 0);
    if (a.type === 'borrow') borrowed += toCents(a.amount);
    for (const dist of a.distributions) {
      if (dist.amount > 0) credited.set(dist.bankId, (credited.get(dist.bankId) ?? 0) + toCents(dist.amount));
    }
    if (inflow > 0) {
      const key = dayKey(d);
      byDay.set(key, (byDay.get(key) ?? 0) + inflow);
    }
  }

  const previousTotal = range.previous
    ? dated.filter(({ d }) => inRange(d, range.previous!)).reduce((sum, { a }) => sum + inflowCents(a), 0)
    : null;
  const change =
    previousTotal === null || previousTotal === 0
      ? null
      : Math.round(((distributed - previousTotal) / previousTotal) * 1000) / 10;

  const bankStats: BankStat[] = banks
    .map((b) => {
      const c = credited.get(b.id) ?? 0;
      return {
        bankId: b.id,
        name: b.name,
        icon: b.icon,
        credited: fromCents(c),
        share: percent(c, distributed),
        current: b.currentAmount,
        target: b.targetAmount,
        funded: b.targetAmount > 0 ? Math.round((b.currentAmount / b.targetAmount) * 100) : null,
      };
    })
    .sort((x, y) => y.credited - x.credited || banks.findIndex((b) => b.id === x.bankId) - banks.findIndex((b) => b.id === y.bankId));

  const withTarget = banks.filter((b) => b.targetAmount > 0);
  const targetSum = withTarget.reduce((sum, b) => sum + toCents(b.targetAmount), 0);
  const currentSum = withTarget.reduce((sum, b) => sum + Math.max(0, toCents(b.currentAmount)), 0);
  const collective = {
    funded: targetSum > 0 ? Math.round((currentSum / targetSum) * 1000) / 10 : null,
    goals: withTarget.length,
    reached: withTarget.filter((b) => b.currentAmount >= b.targetAmount).length,
  };

  const buckets = bucketsFor(period, range).map((bucket) => ({
    label: bucket.label,
    amount: fromCents(
      inPeriod.filter(({ d }) => inRange(d, bucket.range)).reduce((sum, { a }) => sum + inflowCents(a), 0)
    ),
    current: inRange(now, bucket.range),
  }));

  // Pace is each goal's own average, so targeted deposits count for the goal
  // they went to rather than being smeared across the strategy.
  let forecast: Forecast | null = null;
  for (const stat of bankStats) {
    if (stat.target <= 0 || stat.credited <= 0) continue;
    const remaining = toCents(stat.target) - toCents(stat.current);
    if (remaining <= 0) continue;
    const dailyRate = toCents(stat.credited) / range.days;
    const days = Math.ceil(remaining / dailyRate);
    if (!forecast || days < forecast.days) {
      forecast = {
        bankId: stat.bankId,
        name: stat.name,
        dailyRate: fromCents(Math.floor(dailyRate)),
        remaining: fromCents(remaining),
        days,
        date: addDays(startOfDay(now), days),
      };
    }
  }

  return {
    range,
    distributed: fromCents(distributed),
    spent: fromCents(spent),
    repaid: fromCents(repaid),
    borrowed: fromCents(borrowed),
    invested: fromCents(invested),
    cameBack: fromCents(cameBack),
    cameBackToGoals: fromCents(cameBackToGoals),
    change,
    dailyAverage: fromCents(Math.floor(distributed / range.days)),
    transactions: inPeriod.length,
    top: bankStats.find((s) => s.credited > 0) ?? null,
    collective,
    banks: bankStats,
    buckets,
    streak: currentStreak(activities, now),
    activeDays: byDay.size,
    maxDay: fromCents(Math.max(0, ...byDay.values())),
    forecast,
  };
};

/* ------------------------------------------------------------- categories */

export interface CategorySpend {
  key: string;
  /** Positive: what left the goals under this heading. */
  cents: number;
  entries: number;
  /** Whole percent of the period's spending, largest first. */
  share: number;
}

/**
 * Where the month's money went.
 *
 * Only withdrawals count. A deposit has no category and borrowing is not
 * spending — it is money moved forward, and counting it here would say it was
 * spent twice, once when borrowed and again when the debt was cleared.
 *
 * Entries from before categories existed have none, and read as Other rather
 * than being dropped: a total that quietly omits some spending is worse than
 * one with a large Other in it.
 */
export const spendingByCategory = (
  activities: Activity[],
  range: DateRange,
  now: Date = new Date()
): CategorySpend[] => {
  const totals = new Map<string, { cents: number; entries: number }>();

  for (const a of activities) {
    if (a.type !== 'withdraw') continue;
    const at = new Date(a.date);
    if (at < range.start || at >= range.end || at > now) continue;

    const cents = a.distributions.reduce((sum, d) => sum + Math.abs(toCents(d.amount)), 0);
    if (cents === 0) continue;

    const key = categoryOf(a.category).key;
    const row = totals.get(key) ?? { cents: 0, entries: 0 };
    row.cents += cents;
    row.entries += 1;
    totals.set(key, row);
  }

  const spent = [...totals.values()].reduce((sum, r) => sum + r.cents, 0);
  return [...totals.entries()]
    .map(([key, r]) => ({
      key,
      cents: r.cents,
      entries: r.entries,
      share: spent > 0 ? Math.round((r.cents / spent) * 100) : 0,
    }))
    .sort((a, b) => b.cents - a.cents);
};

/* ---------------------------------------------------------------- archive */

export const RETENTION_MONTHS = 12;

/**
 * How long the ledger is kept. Only two choices, and neither of them is
 * "forever": the app re-reads every kept record each time it opens, and a free
 * project allows fifty thousand reads a day. Keeping everything does not cost
 * space — it eventually costs the ability to open the app at all.
 */
const retentionChoice = (months: number): { months: number; label: string } => ({
  months,
  // Read in the current language each time it is shown.
  get label() {
    return m().report.retentionChoice(months);
  },
});

export const RETENTION_CHOICES: { months: number; label: string }[] = [retentionChoice(6), retentionChoice(12)];

/**
 * A stored setting made safe. A value from before the choices narrowed — or
 * anything else unexpected — comes back as the twelve-month default rather
 * than as "keep everything".
 */
export const allowedRetention = (months: number | null | undefined) =>
  RETENTION_CHOICES.some((c) => c.months === months) ? (months as number) : RETENTION_MONTHS;

/**
 * The first day still kept. Retention works in whole months so a statement is
 * never half deleted: on any day in September with a twelve-month window, the
 * ledger starts on the first of the previous September.
 */
export const retentionCutoff = (now: Date, months: number | null = RETENTION_MONTHS) =>
  months === null ? new Date(0) : new Date(now.getFullYear(), now.getMonth() - months, 1);

export const archivable = (activities: Activity[], now: Date, months: number | null = RETENTION_MONTHS) => {
  const cutoff = retentionCutoff(now, months);
  return activities.filter((a) => new Date(a.date) < cutoff);
};

/* ------------------------------------------------------------- statements */

export interface MonthReport {
  /** Sortable and stable: "2026-08". */
  key: string;
  label: string;
  start: Date;
  /** Exclusive. */
  end: Date;
  activities: number;
  /** Net into the goals that month, in whole ringgit as the ledger stores it. */
  net: number;
  trades: number;
  /** The month still running, whose figures are not final. */
  current: boolean;
  /** The date this month's records are cleared, if a window is set. */
  clearedOn: Date | null;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * One entry per month that has anything in it, newest first.
 *
 * Trades count towards a month as much as deposits do: a statement covers the
 * saving and the investing side by side, so a month with only a share purchase
 * is still a month worth exporting.
 */
export const monthsWithRecords = (
  activities: Activity[],
  trades: Trade[],
  now: Date = new Date(),
  months: number | null = RETENTION_MONTHS
): MonthReport[] => {
  const seen = new Map<string, { start: Date; activities: number; net: number; trades: number }>();

  const touch = (d: Date) => {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const key = monthKey(start);
    let entry = seen.get(key);
    if (!entry) {
      entry = { start, activities: 0, net: 0, trades: 0 };
      seen.set(key, entry);
    }
    return entry;
  };

  for (const a of activities) {
    const entry = touch(new Date(a.date));
    entry.activities += 1;
    // What actually reached the goals, so a withdrawal reads as the minus it is.
    entry.net += a.distributions.reduce((sum, d) => sum + d.amount, 0);
  }
  for (const t of trades) touch(new Date(t.tradedAt)).trades += 1;

  const thisMonth = monthKey(now);

  return [...seen.entries()]
    .map(([key, e]) => ({
      key,
      label: m().report.monthYear(e.start.getMonth(), e.start.getFullYear()),
      start: e.start,
      end: new Date(e.start.getFullYear(), e.start.getMonth() + 1, 1),
      activities: e.activities,
      net: e.net,
      trades: e.trades,
      current: key === thisMonth,
      // Cleared on the first of the month once it falls outside the window.
      clearedOn:
        months === null
          ? null
          : new Date(e.start.getFullYear(), e.start.getMonth() + months + 1, 1),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
};

/**
 * One month's figures, whether that month has finished or not.
 *
 * The instant a summary is taken from decides both which month it covers and
 * how many days it counts, so it has to land inside the month: the first of
 * the next month would summarise the wrong month entirely, and the first of
 * this one would report a finished month as a single day. It is the earlier of
 * now and the month's last moment — today for the month still running, the
 * last day for every month before it.
 */
export const monthSummary = (
  activities: Activity[],
  banks: PiggyBank[],
  month: Pick<MonthReport, 'label' | 'end'>,
  now: Date = new Date()
): Summary => {
  const asOf = new Date(Math.min(now.getTime(), month.end.getTime() - 1));
  const summary = summarize(activities, banks, 'month', asOf);
  // The range already is this month; only the wording is ours.
  return { ...summary, range: { ...summary.range, label: month.label } };
};

/**
 * The month that goes next, for the warning on screen: simply the oldest one
 * on record. A month already past its date has not been cleared yet — the
 * clearing runs when the app opens — so it is still the right one to name.
 */
export const nextToClear = (months: MonthReport[]) =>
  [...months]
    .filter((m) => m.clearedOn !== null && m.activities > 0)
    .sort((a, b) => a.key.localeCompare(b.key))[0] ?? null;
