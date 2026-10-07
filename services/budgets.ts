import type { Activity, BudgetStep, Budgets } from '../types';
import type { CategorySpend } from './analytics';
import { monthFigures } from './review';

/**
 * Monthly spending limits. Pure and in whole cents.
 *
 * A limit is a list of steps, each holding from a month onward, so setting a
 * limit for October leaves September judged by the limit September had.
 */

export const EMPTY_BUDGETS: Budgets = { total: [], categories: {} };

/** The key a limit for the whole month is filed under, apart from every category. */
export const TOTAL = 'total';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const cleanSteps = (raw: unknown): BudgetStep[] => {
  if (!Array.isArray(raw)) return [];
  const steps = raw
    .map((s) => ({ from: String((s as BudgetStep)?.from ?? ''), cents: Math.floor(Number((s as BudgetStep)?.cents)) }))
    .filter((s) => MONTH.test(s.from) && Number.isFinite(s.cents) && s.cents >= 0)
    .sort((a, b) => a.from.localeCompare(b.from));
  // One step per month: the last one written wins.
  return steps.filter((s, i) => steps[i + 1]?.from !== s.from);
};

/** Whatever was stored, as limits the screens can trust. */
export const cleanBudgets = (raw: Partial<Budgets> | undefined | null): Budgets => {
  const categories: Record<string, BudgetStep[]> = {};
  const given = raw?.categories && typeof raw.categories === 'object' ? raw.categories : {};
  for (const [key, steps] of Object.entries(given)) {
    const clean = cleanSteps(steps);
    if (clean.length > 0) categories[key] = clean;
  }
  return { total: cleanSteps(raw?.total), categories };
};

/** The limit in force for a month ("2026-10"), in cents; null when there is none. */
export const limitAt = (steps: BudgetStep[] | undefined, month: string): number | null => {
  let cents: number | null = null;
  for (const s of steps ?? []) {
    if (s.from > month) break;
    cents = s.cents;
  }
  return cents !== null && cents > 0 ? cents : null;
};

/**
 * The steps with a new limit from `month` on. Setting 0 takes the limit away
 * from that month. Steps that change nothing are dropped, so the history stays short.
 */
export const withLimit = (steps: BudgetStep[] | undefined, month: string, cents: number): BudgetStep[] => {
  const next = [...(steps ?? []).filter((s) => s.from !== month), { from: month, cents: Math.max(0, Math.floor(cents)) }].sort(
    (a, b) => a.from.localeCompare(b.from)
  );
  const out: BudgetStep[] = [];
  let held = 0;
  for (const s of next) {
    if (s.cents === held) continue;
    out.push(s);
    held = s.cents;
  }
  return out;
};

export type BudgetStatus = 'ok' | 'near' | 'over' | 'none';

/** Under 80% of the limit is fine, from 80% up to the limit is near, past it is over. */
export const statusOf = (spentCents: number, limitCents: number | null): BudgetStatus => {
  if (limitCents === null) return 'none';
  if (spentCents > limitCents) return 'over';
  return spentCents * 100 >= limitCents * 80 ? 'near' : 'ok';
};

export interface BudgetRow {
  /** `TOTAL` or a category key. */
  key: string;
  spentCents: number;
  limitCents: number | null;
  status: BudgetStatus;
  /** Whole percent of the limit used; null with no limit. */
  used: number | null;
  /** Left to spend; negative once over. Null with no limit. */
  leftCents: number | null;
  entries: number;
  /** Whole percent of the month's spending; 0 for the total row. */
  share: number;
}

const urgency: Record<BudgetStatus, number> = { over: 0, near: 1, ok: 2, none: 3 };

/**
 * The rows of one month's budget: the total first, then every category that has
 * a limit or was spent on, the most pressed first and the ones with no limit
 * last, the larger spend first among those.
 */
export const budgetRows = (
  budgets: Budgets,
  month: string,
  categories: CategorySpend[],
  spentCents: number
): BudgetRow[] => {
  const row = (key: string, spent: number, limit: number | null, entries: number, share: number): BudgetRow => ({
    key,
    spentCents: spent,
    limitCents: limit,
    status: statusOf(spent, limit),
    used: limit === null ? null : Math.round((spent / limit) * 100),
    leftCents: limit === null ? null : limit - spent,
    entries,
    share,
  });

  const seen = new Set<string>();
  const rows: BudgetRow[] = [];
  for (const c of categories) {
    seen.add(c.key);
    rows.push(row(c.key, c.cents, limitAt(budgets.categories[c.key], month), c.entries, c.share));
  }
  for (const key of Object.keys(budgets.categories)) {
    const limit = limitAt(budgets.categories[key], month);
    if (!seen.has(key) && limit !== null) rows.push(row(key, 0, limit, 0, 0));
  }
  rows.sort(
    (a, b) =>
      urgency[a.status] - urgency[b.status] ||
      (b.used ?? 0) - (a.used ?? 0) ||
      b.spentCents - a.spentCents ||
      a.key.localeCompare(b.key)
  );

  const totalLimit = limitAt(budgets.total, month);
  return totalLimit === null && spentCents === 0 && rows.length === 0
    ? rows
    : [row(TOTAL, spentCents, totalLimit, rows.reduce((s, r) => s + r.entries, 0), 0), ...rows];
};

export interface BudgetNotice {
  over: string[];
  near: string[];
}

/**
 * What needs a mention on Home: the keys (`TOTAL` or a category) that are over
 * their limit this month or close to it, the total first.
 */
export const budgetNotice = (budgets: Budgets, activities: Activity[], now: Date = new Date()): BudgetNotice => {
  const figures = monthFigures(activities, now, now);
  const month = `${figures.start.getFullYear()}-${String(figures.start.getMonth() + 1).padStart(2, '0')}`;
  const rows = budgetRows(budgets, month, figures.categories, figures.spentCents).filter((r) => r.limitCents !== null);
  const pick = (status: BudgetStatus) =>
    rows
      .filter((r) => r.status === status)
      .sort((a, b) => Number(b.key === TOTAL) - Number(a.key === TOTAL) || (b.used ?? 0) - (a.used ?? 0))
      .map((r) => r.key);
  return { over: pick('over'), near: pick('near') };
};
