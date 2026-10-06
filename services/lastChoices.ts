import type { PiggyBank } from '../types';
import { CATEGORIES } from './categories';
import { isArchived } from './ledger';
import { localKey, readLocal, writeLocal } from './localFlags';

/**
 * The picks a person made last time, so the next deposit or spend starts
 * where they left off. Kept on the phone per account; it can only ever save
 * a tap, so anything missing, stale or odd is simply dropped.
 */
export interface LastChoices {
  v: 1;
  depositTarget?: 'split' | string;
  spendGoal?: string;
  spendCategory?: string;
  potInGoal?: string;
  potOutTarget?: 'split' | string;
  /** Quick amounts, in cents. */
  quick?: { deposit?: number; spend?: number; pot?: number };
}

export type ChoicePatch = Partial<Omit<LastChoices, 'v'>>;

/** Up to RM100,000: past that it is a typo, not a habit. */
export const QUICK_MAX_CENTS = 10_000_000;

const text = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 128 ? v : undefined);
const cents = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= QUICK_MAX_CENTS ? v : undefined;

const strip = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const parseLastChoices = (raw: string | null): LastChoices => {
  if (!raw) return { v: 1 };
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== 'object' || v.v !== 1) return { v: 1 };
    const q = v.quick && typeof v.quick === 'object' ? (v.quick as Record<string, unknown>) : {};
    const quick = strip({ deposit: cents(q.deposit), spend: cents(q.spend), pot: cents(q.pot) });
    return strip({
      v: 1 as const,
      depositTarget: text(v.depositTarget),
      spendGoal: text(v.spendGoal),
      spendCategory: text(v.spendCategory),
      potInGoal: text(v.potInGoal),
      potOutTarget: text(v.potOutTarget),
      quick: Object.keys(quick).length > 0 ? quick : undefined,
    });
  } catch {
    return { v: 1 };
  }
};

/** A patch value of undefined forgets that choice. */
export const withChoice = (c: LastChoices, patch: ChoicePatch): LastChoices => {
  const quick = patch.quick === undefined ? c.quick : strip({ ...c.quick, ...patch.quick });
  return strip({ ...c, ...patch, v: 1 as const, quick: quick && Object.keys(quick).length > 0 ? quick : undefined });
};

/** What can still be used: goals that exist and are active, known categories, sane amounts. */
export const usableChoices = (c: LastChoices, banks: PiggyBank[]): LastChoices => {
  const live = (id: string | undefined) => (id && banks.some((b) => b.id === id && !isArchived(b)) ? id : undefined);
  const goalOrSplit = (id: string | undefined) => (id === 'split' ? id : live(id));
  const quick = strip({ deposit: cents(c.quick?.deposit), spend: cents(c.quick?.spend), pot: cents(c.quick?.pot) });
  return strip({
    v: 1 as const,
    depositTarget: goalOrSplit(c.depositTarget),
    spendGoal: live(c.spendGoal),
    spendCategory: CATEGORIES.some((k) => k.key === c.spendCategory) ? c.spendCategory : undefined,
    potInGoal: live(c.potInGoal),
    potOutTarget: goalOrSplit(c.potOutTarget),
    quick: Object.keys(quick).length > 0 ? quick : undefined,
  });
};

const key = (uid: string) => localKey('choices', uid);

export const loadLastChoices = (uid: string): LastChoices => {
  try {
    return parseLastChoices(readLocal(key(uid)));
  } catch {
    return { v: 1 };
  }
};

export const saveLastChoices = (uid: string, c: LastChoices) => {
  try {
    writeLocal(key(uid), JSON.stringify(c));
  } catch {
    // Remembering is a convenience; the next pick is simply made again.
  }
};
