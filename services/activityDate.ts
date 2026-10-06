import { dayKey } from './analytics';

/**
 * Which day an entry may be dated, for recording a past deposit or moving one.
 *
 * Pure and exception-free: the screens ask, and map the problem to a message.
 */

export type DateProblem = 'future' | 'beforeAllowed';

/** A phone clock a minute ahead of the one that set `now` is not a future date. */
const SKEW_MS = 60 * 1000;

/**
 * Whether `at` can be the date of an entry: not in the future, and not before
 * `notBefore` (the start of the window the screens show, or the retention
 * cutoff for the service). `notBefore` itself is allowed.
 */
export const checkActivityDate = (at: Date, now: Date, notBefore: Date): DateProblem | null => {
  if (at.getTime() > now.getTime() + SKEW_MS) return 'future';
  if (at.getTime() < notBefore.getTime()) return 'beforeAllowed';
  return null;
};

const isLocalMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;

/**
 * The timestamp an entry is stored with, as a UTC ISO string (which sorts the
 * same as time does).
 *
 * A picker gives a day, not a moment, and the screens pass it as local
 * midnight. A past day is stamped at noon so it sorts mid-day and stays on the
 * same calendar day in any time zone near the phone's; today keeps the real
 * time. No date at all means now.
 */
export const stampFor = (
  at: Date | undefined,
  now: Date,
  notBefore: Date
): { stamp: string } | { problem: DateProblem } => {
  let moment = at ?? now;
  if (at && isLocalMidnight(at) && dayKey(at) !== dayKey(now)) {
    moment = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 12);
  } else if (at && isLocalMidnight(at)) {
    moment = now;
  }
  const problem = checkActivityDate(moment, now, notBefore);
  return problem ? { problem } : { stamp: moment.toISOString() };
};

/**
 * Whether a debt was already there on the day of a back-dated deposit, so the
 * deposit may repay it. Compared by local day, not instant: an auto-save row
 * is dated at midnight and a loan made later that day was still owed that day.
 */
export const debtExistedOn = (loanCreatedAtIso: string, depositAt: Date) =>
  dayKey(new Date(loanCreatedAtIso)) <= dayKey(depositAt);
