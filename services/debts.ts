import type { Activity, Liability, Schedule } from '../types';
import { dueOccurrences, localDate } from './schedules';
import { toCents } from './money';

/**
 * Paying a debt: one amount paid, of which some is interest. Pure and in whole
 * cents; the writers in firestore.ts only apply it.
 *
 * The interest is worked out from the yearly rate the person gave once:
 * what is still owed, times the rate, over twelve. That is how a loan that
 * charges on the balance left behaves, so the interest falls as the debt does.
 * A bank may round or count days differently by a few sen, so the person can
 * always put the statement's figure in when they confirm. The principal is
 * what is left of the payment, and only that lowers what is owed.
 */

export type PaymentProblem = 'amountPositive' | 'interestTooBig' | 'overBalance';

export interface PaymentPlan {
  totalCents: number;
  interestCents: number;
  principalCents: number;
  /** What is still owed after this payment. */
  balanceAfterCents: number;
}

export const planPayment = (i: {
  totalCents: number;
  interestCents: number;
  balanceCents: number;
}): { plan: PaymentPlan } | { problem: PaymentProblem } => {
  if (!(i.totalCents > 0)) return { problem: 'amountPositive' };
  if (i.interestCents < 0 || i.interestCents > i.totalCents) return { problem: 'interestTooBig' };
  const principal = i.totalCents - i.interestCents;
  if (principal > Math.max(0, i.balanceCents)) return { problem: 'overBalance' };
  return { plan: { totalCents: i.totalCents, interestCents: i.interestCents, principalCents: principal, balanceAfterCents: i.balanceCents - principal } };
};

/** A month's interest on an amount at a yearly rate in percent, rounded down to the sen. */
export const interestFor = (cents: number, ratePercent: number): number => {
  if (!(cents > 0) || !(ratePercent > 0)) return 0;
  // The rate in hundredths of a percent, so 4.35 is 435 and no float arithmetic touches the money.
  const basisPoints = Math.round(ratePercent * 100);
  return Math.floor((cents * basisPoints) / 120_000);
};

type Terms = Pick<Liability, 'balance' | 'monthly' | 'rate' | 'rateType' | 'original'>;

/**
 * The interest for this month. A debt charged on what is still owed (EIR) pays it
 * on the balance now, so it falls as the debt does; a flat-rate one pays it on the
 * amount first borrowed, so it is the same every month.
 */
export const monthlyInterest = (debt: Terms): number => {
  const base = debt.rateType === 'flat' ? toCents(debt.original ?? 0) : toCents(debt.balance);
  return interestFor(base, debt.rate ?? 0);
};

/**
 * What this month's payment is likely to be: the usual payment, with the
 * interest worked out. The last payment is whatever clears the debt.
 */
export const suggestPayment = (debt: Terms): PaymentPlan | null => {
  const balance = toCents(debt.balance);
  const usual = toCents(debt.monthly ?? 0);
  if (balance <= 0 || usual <= 0) return null;
  let total = usual;
  // Interest alone can be more than the usual payment (a card, or a rate that has risen): then it is all interest.
  const interest = Math.min(monthlyInterest(debt), total);
  let principal = total - interest;
  if (principal > balance) {
    principal = balance;
    total = balance + interest;
  }
  return { totalCents: total, interestCents: interest, principalCents: principal, balanceAfterCents: balance - principal };
};

/**
 * Paying a debt off in one go: the bank's settlement figure is the total, the
 * whole of what is owed is principal, and whatever is more than that (a
 * settlement fee, interest to the day) is interest. Less than what is owed is
 * not a settlement.
 */
export const planSettlement = (i: { totalCents: number; balanceCents: number }): { plan: PaymentPlan } | { problem: 'amountPositive' | 'underBalance' } => {
  if (!(i.totalCents > 0)) return { problem: 'amountPositive' };
  if (i.totalCents < i.balanceCents) return { problem: 'underBalance' };
  return { plan: { totalCents: i.totalCents, interestCents: i.totalCents - i.balanceCents, principalCents: i.balanceCents, balanceAfterCents: 0 } };
};

/** The recurrence engine's own shape, so a debt reuses its day arithmetic: monthly, on its pay day. */
export const debtSchedule = (d: Pick<Liability, 'id' | 'monthly' | 'payDay' | 'lastRunAt' | 'createdAt' | 'balance'>): Schedule => ({
  id: d.id,
  amount: d.monthly ?? 0,
  frequency: 'monthly',
  weekday: 1,
  dayOfMonth: d.payDay ?? 1,
  month: 1,
  targetBankId: null,
  // Asked about only while something is owed and a day and an amount are known.
  enabled: Boolean(d.payDay && d.monthly && toCents(d.balance) > 0),
  createdAt: d.createdAt,
  lastRunAt: d.lastRunAt ?? new Date(d.createdAt).toISOString(),
});

/** Pay days that have come since the last answer, oldest first. */
export const dueDebtDays = (debt: Liability, now = new Date()): string[] => {
  const schedule = debtSchedule(debt);
  return schedule.enabled ? dueOccurrences(schedule, now) : [];
};

/** A day inside the history the app keeps is worth recording; an older one is only passed over. */
const recordable = (day: string, notBefore: Date) =>
  localDate(day).getTime() >= new Date(notBefore.getFullYear(), notBefore.getMonth(), notBefore.getDate()).getTime();

export interface PendingDebt {
  debt: Liability;
  /** The oldest pay day still waiting. */
  day: string;
  /** How many are waiting in all, this one included. */
  waiting: number;
}

/** Debts with a payment waiting to be confirmed, the oldest day of each. */
export const pendingDebts = (debts: Liability[], now: Date, notBefore: Date): PendingDebt[] =>
  debts
    .flatMap((debt) => {
      const days = dueDebtDays(debt, now).filter((d) => recordable(d, notBefore));
      return days.length > 0 ? [{ debt, day: days[0], waiting: days.length }] : [];
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.debt.name.localeCompare(b.debt.name)));

/** Pay days older than the history the app keeps: only passed over, so the clock can move on. */
export const debtDaysOutsideHistory = (debt: Liability, now: Date, notBefore: Date): string[] =>
  dueDebtDays(debt, now).filter((d) => !recordable(d, notBefore));

/** The payments recorded for one debt, newest first. */
export const paymentsFor = (activities: Activity[], liabilityId: string): Activity[] =>
  activities
    .filter((a) => a.type === 'loanPayment' && a.liabilityId === liabilityId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/** What the recorded payments add up to. Only as far back as the records are loaded. */
export const paidSoFar = (payments: Activity[]) =>
  payments.reduce(
    (sum, a) => ({ principalCents: sum.principalCents + toCents(a.principal ?? 0), interestCents: sum.interestCents + toCents(a.interest ?? 0) }),
    { principalCents: 0, interestCents: 0 }
  );
