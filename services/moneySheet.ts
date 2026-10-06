import type { PiggyBank } from '../types';
import { isArchived, isInSplit } from './ledger';

/**
 * Starting points for the deposit / spend sheet. Pure, so what a person finds
 * preselected is tested rather than guessed.
 */

const activeGoals = (banks: PiggyBank[]) => banks.filter((b) => !isArchived(b));

/**
 * The goal a spend starts from: the one used last time if it still exists,
 * else the only goal there is. With several goals and no history nothing is
 * chosen (undefined) and the sheet makes the person pick, so money is never
 * taken from a goal, or recorded as spent ahead, by default.
 */
export const defaultSpendSource = (banks: PiggyBank[], last?: string): string | undefined => {
  const goals = activeGoals(banks);
  if (last && goals.some((b) => b.id === last)) return last;
  return goals.length === 1 ? goals[0].id : undefined;
};

/**
 * Where a deposit starts: null is "split by %". A goal remembered from last
 * time that still exists wins; otherwise the split whenever any goal takes a
 * share; otherwise the only goal; otherwise null, and the sheet explains there
 * is no split to use.
 */
export const defaultDepositTarget = (banks: PiggyBank[], last?: string): string | null => {
  const goals = activeGoals(banks);
  if (last && last !== 'split' && goals.some((b) => b.id === last)) return last;
  if (goals.some(isInSplit)) return null;
  return goals.length === 1 ? goals[0].id : null;
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
