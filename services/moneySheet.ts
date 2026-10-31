import type { PiggyBank } from '../types';
import { isArchived } from './ledger';

/**
 * Starting points for the income / spend sheet. Pure, so what a person finds
 * preselected is tested rather than guessed.
 */

const activeGoals = (banks: PiggyBank[]) => banks.filter((b) => !isArchived(b));

/** The wallet as a source of spending, in the same field as a goal's id. */
export const WALLET = 'wallet';

/**
 * Where an income goes: `wallet` keeps all of it, `split` sends all of it to
 * the goals by their shares; anything else is a goal's id.
 */
export type IncomeChoice = 'split' | 'wallet' | string;

/**
 * Where an income starts: what was used last time if it still exists,
 * otherwise the wallet. (An old remembered "rule" no longer exists and reads
 * as the wallet.)
 */
export const defaultIncomeChoice = (banks: PiggyBank[], last?: string): IncomeChoice => {
  const goals = activeGoals(banks);
  if (last === 'split' && goals.length > 0) return 'split';
  if (last && last !== WALLET && last !== 'split' && last !== 'rule' && goals.some((b) => b.id === last)) return last;
  return WALLET;
};

/**
 * Where a spend starts: the goal used last time if it still exists, otherwise
 * the wallet. The source is on the page before saving, and spending past the
 * wallet says so there.
 */
export const defaultSpendSource = (banks: PiggyBank[], last?: string): string => {
  const goals = activeGoals(banks);
  return last && goals.some((b) => b.id === last) ? last : WALLET;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * The date to hand the save for a day picked on the sheet. No pick, or today,
 * is undefined (the entry is stamped with the real time); any other day is
 * that day's local midnight, which the activity date service stamps at noon.
 */
export const atFromPicked = (day: Date | null, now: Date): Date | undefined => {
  if (!day || sameDay(day, now)) return undefined;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
};
