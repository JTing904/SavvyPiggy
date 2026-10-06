import type { PiggyBank } from '../types';
import type { Messages } from '../i18n';
import type { ActivityEditProblem } from './activityEdit';
import { GOAL_NAME_MAX, type GoalEditProblem } from './bankEdit';
import { formatMoney, fromCents } from './money';

/**
 * One wording for every refusal, whichever screen or writer meets it.
 *
 * The planners return a kind and never a sentence, so the same problem reads
 * the same in an edit sheet, a toast and a thrown error, in either language.
 * Pure: the translation object is passed in (`useT()` on screen, `messages()`
 * in a service).
 */

export type Strings = Messages;

const money = (cents: number | undefined) => formatMoney(fromCents(cents ?? 0));

const goalName = (t: Strings, banks: PiggyBank[] | undefined, goalId: string | undefined) =>
  banks?.find((b) => b.id === goalId)?.name ?? t.errors.problems.thatGoal;

export type DateProblemKind = 'future' | 'beforeAllowed' | 'dateFuture' | 'dateTooOld';

export const dateProblemText = (kind: DateProblemKind, t: Strings): string => t.errors.problems.date[kind];

export const activityEditProblemText = (
  p: { kind: ActivityEditProblem; cents?: number; goalId?: string },
  t: Strings,
  banks?: PiggyBank[]
): string => {
  const text = t.errors.problems.activity;
  switch (p.kind) {
    case 'dateFuture':
    case 'dateTooOld':
      return dateProblemText(p.kind, t);
    case 'goalArchived':
      return text.goalArchived(goalName(t, banks, p.goalId));
    case 'borrowBelowCovered':
      return text.borrowBelowCovered(money(p.cents));
    case 'notEditable':
    case 'amountPositive':
    case 'goalGone':
    case 'staleRow':
    case 'staleDebt':
    case 'loanGone':
    case 'legacyBorrow':
    case 'dateBeforeDebt':
    case 'unknownCategory':
    case 'noDestination':
      return text[p.kind];
  }
};

export const bankEditProblemText = (kind: GoalEditProblem, t: Strings): string => {
  const text = t.errors.problems.bank;
  return kind === 'nameTooLong' ? text.nameTooLong(GOAL_NAME_MAX) : text[kind];
};

export const potTransferProblemText = (
  p: { problem: string; availableCents?: number; neededCents?: number; goalId?: string },
  t: Strings,
  banks?: PiggyBank[]
): string => {
  const text = t.errors.problems.potTransfer;
  switch (p.problem) {
    case 'potShort':
      return t.invest.potShort(money(p.availableCents), money(p.neededCents));
    case 'goalShort':
      return text.goalShort(goalName(t, banks, p.goalId), money(p.availableCents), money(p.neededCents));
    case 'dateFuture':
    case 'dateTooOld':
      return dateProblemText(p.problem, t);
    case 'needsChoice':
    case 'noDestination':
    case 'notPotRow':
    case 'goalGone':
    case 'amountPositive':
      return text[p.problem];
    default:
      return t.errors.recordGone;
  }
};

export const dividendProblemText = (
  p: { problem: string; availableCents?: number; neededCents?: number },
  t: Strings
): string => {
  const text = t.errors.problems.dividend;
  switch (p.problem) {
    case 'potShort':
      return t.invest.potShort(money(p.availableCents), money(p.neededCents));
    case 'notDividend':
    case 'notPot':
    case 'outOfSync':
    case 'amountPositive':
      return text[p.problem];
    default:
      return t.errors.recordGone;
  }
};
