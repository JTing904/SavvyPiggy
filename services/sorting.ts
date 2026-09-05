import type { PiggyBank } from '../types';

export type SortKey = 'created' | 'name' | 'balance' | 'progress' | 'split';
export type SortDir = 'asc' | 'desc';
export interface SortOrder {
  key: SortKey;
  dir: SortDir;
}

export const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'created', label: 'Date added', icon: 'schedule' },
  { key: 'name', label: 'Name', icon: 'sort_by_alpha' },
  { key: 'balance', label: 'Balance', icon: 'savings' },
  { key: 'progress', label: 'Progress', icon: 'flag' },
  { key: 'split', label: 'Split %', icon: 'pie_chart' },
];

export const DEFAULT_ORDER: SortOrder = { key: 'created', dir: 'asc' };

/** What the direction means for the key, so the menu can say it in words. */
export const dirLabel = (key: SortKey, dir: SortDir) => {
  if (key === 'name') return dir === 'asc' ? 'A → Z' : 'Z → A';
  if (key === 'created') return dir === 'asc' ? 'Oldest first' : 'Newest first';
  return dir === 'asc' ? 'Low → High' : 'High → Low';
};

/** Fraction of the target reached. Open-ended goals have no progress to rank. */
const progressOf = (b: PiggyBank) => (b.targetAmount > 0 ? b.currentAmount / b.targetAmount : null);

/** Share of each deposit. Goals sitting out of the split rank as zero. */
const splitOf = (b: PiggyBank) => (b.autoSplit === false ? 0 : b.splitPercentage);

/**
 * Stable ordering by one key. Ties fall back to creation order so cards do not
 * jump around between renders. Open-ended goals always sit at the end of a
 * progress sort, whichever direction — they have no finish line to compare.
 */
export const sortBanks = (banks: PiggyBank[], order: SortOrder): PiggyBank[] => {
  const sign = order.dir === 'asc' ? 1 : -1;
  const byCreated = (a: PiggyBank, b: PiggyBank) => a.createdAt - b.createdAt;

  return [...banks].sort((a, b) => {
    let diff = 0;
    switch (order.key) {
      case 'name':
        diff = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
      case 'balance':
        diff = a.currentAmount - b.currentAmount;
        break;
      case 'split':
        diff = splitOf(a) - splitOf(b);
        break;
      case 'progress': {
        const pa = progressOf(a);
        const pb = progressOf(b);
        if (pa === null && pb === null) return byCreated(a, b);
        if (pa === null) return 1;
        if (pb === null) return -1;
        diff = pa - pb;
        break;
      }
      case 'created':
      default:
        diff = byCreated(a, b);
    }
    return diff !== 0 ? sign * diff : byCreated(a, b);
  });
};

/**
 * Splits 100% evenly over the goals that can take a share (in the split and not
 * locked), leaving locked goals exactly as they are. Whole percentages only, so
 * the odd point left over goes to the earliest goals. Returns the new
 * percentage per bank id, or null when there is nothing adjustable.
 */
export const evenSplit = (banks: PiggyBank[]): Record<string, number> | null => {
  const inSplit = banks.filter((b) => b.autoSplit !== false);
  const locked = inSplit.filter((b) => b.isLocked);
  const free = inSplit.filter((b) => !b.isLocked);
  if (free.length === 0) return null;

  const lockedTotal = locked.reduce((sum, b) => sum + b.splitPercentage, 0);
  const pool = Math.max(0, 100 - lockedTotal);
  const each = Math.floor(pool / free.length);
  let remainder = pool - each * free.length;

  const next: Record<string, number> = {};
  free.forEach((b) => {
    next[b.id] = each + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  });
  return next;
};
