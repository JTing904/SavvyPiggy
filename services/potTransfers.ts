import type { Activity, PiggyBank, SavingsSettings } from '../types';
import { dayStart } from './holdings';
import { isArchived, planDeposit, type GoalMoneyChoice } from './ledger';
import { resplitDeposit, splitProportionally, toCents } from './money';

/**
 * Correcting or deleting a row of money moved between the goals and the
 * investment pot: 'toInvest' (goal -> pot) and 'fromInvest' (pot -> goals).
 *
 * Pure, in whole sen. A move is not a spend: no goal may be pushed below zero
 * and the pot may not go below zero (exactly zero is fine), so every plan that
 * would is refused with the amounts, never trimmed to fit.
 */

/** Where money goes (or is taken from) when the goal a row names is gone. 'none' is not allowed: it would destroy money. */
export type PotReturn = GoalMoneyChoice | null;

export type PotTransferProblem = 'potShort' | 'goalShort' | 'needsChoice' | 'noDestination' | 'notPotRow';
export type PotTransferEditProblem = PotTransferProblem | 'dateFuture' | 'dateTooOld' | 'goalGone' | 'amountPositive';

export interface PotTransferProblemInfo<K extends string> {
  problem: K;
  availableCents?: number;
  neededCents?: number;
  goalId?: string;
}

export interface PotTransferPlan {
  /** Change to each goal's balance, in sen; zero changes are left out. */
  bankDeltas: Record<string, number>;
  /** Change to the investment pot, in sen. */
  potDelta: number;
}

/** What the row itself should say after an edit. Only the fields that change are present. */
export interface PotTransferRowPatch {
  /** Ringgit, the positive magnitude, as Activity.amount. */
  amount?: number;
  /** As the caller passed it. */
  date?: string;
  /** Signed per goal, in ringgit, as Activity.distributions. */
  distributions?: Activity['distributions'];
}

const isPotRow = (activity: Activity) => activity.type === 'toInvest' || activity.type === 'fromInvest';

/** Whole sen of a signed ringgit figure; toCents alone would floor a negative the wrong way. */
const signedCents = (amount: number) => (amount < 0 ? -toCents(-amount) : toCents(amount));

const exists = (banks: PiggyBank[], id: string) => banks.some((b) => b.id === id);

const add = (map: Record<string, number>, key: string, cents: number) => {
  if (cents !== 0) map[key] = (map[key] ?? 0) + cents;
};

const nonZero = (map: Record<string, number>) =>
  Object.fromEntries(Object.entries(map).filter(([, cents]) => cents !== 0));

/** The first goal the deltas would take below zero, or null when none does. */
const goalShort = (banks: PiggyBank[], deltas: Record<string, number>) => {
  for (const [id, delta] of Object.entries(deltas)) {
    const bank = banks.find((b) => b.id === id);
    if (!bank || delta >= 0) continue;
    const have = signedCents(bank.currentAmount);
    if (have + delta < 0) return { goalId: id, availableCents: Math.max(0, have), neededCents: -delta };
  }
  return null;
};

/** What a split of `cents` over the goals taking part comes to, every sen placed. */
const splitIntoGoals = (cents: number, banks: PiggyBank[], overflow: boolean) => {
  const movements = planDeposit(cents, banks.filter((b) => !isArchived(b)), [], null, overflow).movements.filter(
    (m) => m.cents !== 0
  );
  if (movements.length === 0) return null;
  const placed = movements.reduce((sum, m) => sum + m.cents, 0);
  if (placed < cents) movements.reduce((a, b) => (b.percentage > a.percentage ? b : a)).cents += cents - placed;
  return movements;
};

/** The sen a day names, from either a "YYYY-MM-DD" day or a full ISO instant; null when unreadable. */
const dayOf = (text: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : dayStart(ms);
};

/**
 * Deleting a row: the move is reversed in full.
 *
 * toInvest: the goal gets its money back and the pot gives it up. fromInvest:
 * each goal gives its share back and the pot receives the amount. A goal that
 * has been deleted since cannot be asked, so `returnTo` says where the money
 * goes (toInvest) or which goal it is taken from (fromInvest); without it the
 * plan stops and asks. An archived goal still exists and is treated as any other.
 */
export const planPotTransferDelete = (i: {
  activity: Activity;
  banks: PiggyBank[];
  potCents: number;
  returnTo?: PotReturn;
  savings: SavingsSettings;
}): { plan: PotTransferPlan } | PotTransferProblemInfo<PotTransferProblem> => {
  const { activity, banks, potCents, savings } = i;
  const returnTo = i.returnTo ?? null;
  if (!isPotRow(activity)) return { problem: 'notPotRow' };

  const amountCents = toCents(activity.amount);
  const deltas: Record<string, number> = {};

  if (activity.type === 'toInvest') {
    const goalId = activity.distributions[0]?.bankId;
    if (goalId && exists(banks, goalId)) {
      add(deltas, goalId, amountCents);
    } else {
      if (!returnTo) return { problem: 'needsChoice' };
      if (returnTo.mode === 'goal') {
        const into = banks.find((b) => b.id === returnTo.goalId && !isArchived(b));
        if (!into) return { problem: 'noDestination' };
        add(deltas, into.id, amountCents);
      } else {
        const movements = splitIntoGoals(amountCents, banks, savings.overflow);
        if (!movements) return { problem: 'noDestination' };
        movements.forEach((m) => add(deltas, m.bankId, m.cents));
      }
    }
    // The pot gives the money back, so it has to still hold it.
    if (potCents < amountCents) return { problem: 'potShort', availableCents: potCents, neededCents: amountCents };
    return { plan: { bankDeltas: nonZero(deltas), potDelta: -amountCents } };
  }

  // fromInvest: every goal that got a share gives it back.
  let goneCents = 0;
  for (const d of activity.distributions) {
    const cents = toCents(d.amount);
    if (exists(banks, d.bankId)) add(deltas, d.bankId, -cents);
    else goneCents += cents;
  }
  if (goneCents > 0) {
    if (!returnTo) return { problem: 'needsChoice' };
    if (returnTo.mode === 'goal') {
      if (!exists(banks, returnTo.goalId)) return { problem: 'noDestination' };
      add(deltas, returnTo.goalId, -goneCents);
    } else {
      // Taken out in proportion to what each goal holds, like any other withdrawal.
      const shares = splitProportionally(
        goneCents,
        banks.filter((b) => !isArchived(b)).map((b) => ({ item: b, weight: Math.max(0, signedCents(b.currentAmount)) }))
      );
      if (shares.length === 0) return { problem: 'noDestination' };
      shares.forEach((s) => add(deltas, s.item.id, -s.cents));
    }
  }
  const short = goalShort(banks, deltas);
  if (short) return { problem: 'goalShort', ...short };
  return { plan: { bankDeltas: nonZero(deltas), potDelta: amountCents } };
};

/**
 * Correcting a row: its amount, its date, or (toInvest) the goal it came from.
 *
 * Changing the amount moves money by the difference only. toInvest: the goal
 * gives (or gets back) the difference and the pot takes (or gives up) the
 * same. fromInvest: the new amount is re-split by the percentages the move was
 * split by, the pot paying or receiving the difference. A date alone moves no
 * money. `goalId` only applies to toInvest (null keeps the goal); it is
 * ignored on fromInvest, whose goals follow the stored split.
 *
 * Dates are compared by calendar day: not after `now`'s day, not before
 * `notBefore`'s day, and a date the row already has is never re-checked.
 */
export const planPotTransferEdit = (i: {
  activity: Activity;
  edit: { amount?: number; date?: string; goalId?: string | null };
  banks: PiggyBank[];
  potCents: number;
  notBefore: Date;
  now: Date;
  savings: SavingsSettings;
}): { plan: PotTransferPlan & { activity: PotTransferRowPatch } } | PotTransferProblemInfo<PotTransferEditProblem> => {
  const { activity, edit, banks, potCents } = i;
  if (!isPotRow(activity)) return { problem: 'notPotRow' };

  const patch: PotTransferRowPatch = {};

  if (edit.date !== undefined && edit.date !== activity.date) {
    const day = dayOf(edit.date);
    // An unreadable date is as unusable as one out of range; nothing is guessed from it.
    if (day === null || day < dayStart(i.notBefore.getTime())) return { problem: 'dateTooOld' };
    if (day > dayStart(i.now.getTime())) return { problem: 'dateFuture' };
    patch.date = edit.date;
  }

  const oldCents = toCents(activity.amount);
  let newCents = oldCents;
  if (edit.amount !== undefined) {
    if (!Number.isFinite(edit.amount) || toCents(edit.amount) <= 0) return { problem: 'amountPositive' };
    newCents = toCents(edit.amount);
    if (newCents !== oldCents) patch.amount = edit.amount;
  }

  const deltas: Record<string, number> = {};
  let potDelta = 0;

  if (activity.type === 'toInvest') {
    const oldGoal = activity.distributions[0]?.bankId;
    const newGoal = edit.goalId ?? oldGoal;
    const moved = newGoal !== oldGoal;
    if (moved || newCents !== oldCents) {
      // The old goal takes its money back, the (new) goal gives the new amount.
      if (oldGoal) add(deltas, oldGoal, oldCents);
      if (newGoal) add(deltas, newGoal, -newCents);
      if (!newGoal || !banks.some((b) => b.id === newGoal && (!moved || !isArchived(b)))) {
        return { problem: 'goalGone', goalId: newGoal ?? undefined };
      }
      // Whichever goal is gone cannot be paid back to or asked for money.
      if (oldGoal && !exists(banks, oldGoal)) return { problem: 'goalGone', goalId: oldGoal };
      potDelta = newCents - oldCents;
      patch.distributions = [{ bankId: newGoal, amount: -newCents / 100, percentage: 100 }];
    }
  } else if (newCents !== oldCents) {
    const shares = resplitDeposit(newCents, oldCents, activity.distributions);
    const distributions: Activity['distributions'] = [];
    for (let k = 0; k < activity.distributions.length; k++) {
      const d = activity.distributions[k];
      const delta = shares[k] - toCents(d.amount);
      if (delta !== 0 && !exists(banks, d.bankId)) return { problem: 'goalGone', goalId: d.bankId };
      add(deltas, d.bankId, delta);
      distributions.push({ bankId: d.bankId, amount: shares[k] / 100, percentage: d.percentage });
    }
    potDelta = oldCents - newCents;
    patch.distributions = distributions;
  }

  if (potCents + potDelta < 0) {
    return { problem: 'potShort', availableCents: potCents, neededCents: -potDelta };
  }
  const short = goalShort(banks, deltas);
  if (short) return { problem: 'goalShort', ...short };

  return { plan: { bankDeltas: nonZero(deltas), potDelta, activity: patch } };
};
