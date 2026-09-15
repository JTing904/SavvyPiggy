import type { Activity, Loan } from '../types';
import { toCents } from './money';
import { dayKey, periodRange, startOfDay, streakCapped, streakRun, type Period, type StreakRun } from './analytics';

/**
 * How much of the ledger is kept live, and what older stretches a screen needs.
 *
 * A listener that has been away for more than half an hour is billed as a
 * fresh query, so every app open used to re-read the whole retention window —
 * five hundred entries, five hundred reads, every time. Only the last three
 * months are listened to now. Anything older that is still kept is read once,
 * on demand, by the screens that actually look that far back.
 */

/** The current month and the two whole months before it. */
export const LIVE_MONTHS = 3;

/**
 * The first moment the live listener reads from: the first of the month two
 * months back, local time. Whole months, so History, the Report's month and
 * quarter, and a month's statement are never half loaded.
 */
export const liveWindowStart = (now: Date) => new Date(now.getFullYear(), now.getMonth() - (LIVE_MONTHS - 1), 1);

const earlier = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);
const later = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/**
 * The older stretch a screen needs, clamped to what is kept: null when the
 * live window already covers it.
 */
export const olderNeed = (from: Date | null, liveFrom: Date, keptFrom: Date): Date | null => {
  if (!from) return null;
  const clamped = later(from, keptFrom);
  return clamped.getTime() < liveFrom.getTime() ? clamped : null;
};

/**
 * Where a Report period's figures start, its comparison included. "All" is
 * everything kept; the rest is the period and the one before it.
 */
export const reportNeedsFrom = (period: Period, now: Date, liveFrom: Date, keptFrom: Date): Date | null => {
  if (period === 'all') return olderNeed(keptFrom, liveFrom, keptFrom);
  const range = periodRange(period, now);
  const from = range.previous ? earlier(range.start, range.previous.start) : range.start;
  return olderNeed(from, liveFrom, keptFrom);
};

/** History compares a month with the one before it, so both have to be loaded. */
export const historyNeedsFrom = (month: Date, liveFrom: Date, keptFrom: Date): Date | null =>
  olderNeed(new Date(month.getFullYear(), month.getMonth() - 1, 1), liveFrom, keptFrom);

/**
 * The live rows and whatever older rows have been read, as one newest-first
 * ledger. Older rows past the kept window are left out, exactly as the
 * listener used to leave them out.
 */
export const mergeLedger = (live: Activity[], older: Activity[], keptFrom: Date): Activity[] => {
  if (older.length === 0) return live;
  const ids = new Set(live.map((a) => a.id));
  const kept = keptFrom.toISOString();
  const extra = older
    .filter((a) => !ids.has(a.id) && a.date >= kept)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return extra.length === 0 ? live : [...live, ...extra];
};

/**
 * The loaded deposits that covered a spent ahead, and whether they are all of
 * them. Covered money is what was borrowed less what is still owed; when the
 * loaded rows account for every sen of it, nothing older is needed. Otherwise
 * (or with the debt not on the phone) the rest of the kept ledger has to be
 * read before deleting, or the goals are left short by whatever was missed.
 */
export const coveringRows = (loanId: string, loan: Loan | undefined, loaded: Activity[]) => {
  const rows = loaded.filter((a) => a.repayments?.some((r) => r.loanId === loanId));
  const found = rows.reduce(
    (sum, a) => sum + (a.repayments ?? []).filter((r) => r.loanId === loanId).reduce((s, r) => s + toCents(r.amount), 0),
    0
  );
  const complete = !!loan && toCents(loan.amount) - toCents(loan.outstanding) === found;
  return { rows, complete };
};

/* ----------------------------------------------------------------- streaks */

/**
 * What an earlier open verified about the current run: every day from `first`
 * to `last` had money saved. Kept on the phone per account so a long streak
 * does not need the older ledger read on every open.
 */
export interface StreakMemory {
  first: string;
  last: string;
}

const DAY = 24 * 60 * 60 * 1000;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fromDayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const parseStreakMemory = (raw: string | null): StreakMemory | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StreakMemory>;
    return isDayKey(v.first) && isDayKey(v.last) && v.first <= v.last ? { first: v.first, last: v.last } : null;
  } catch {
    return null;
  }
};

export interface KnownStreak {
  run: StreakRun;
  /** What to remember for next time; null forgets. */
  memory: StreakMemory | null;
  /** The run reaches the live window's start and nothing remembered bridges it. */
  needsOlder: boolean;
}

/**
 * The current saving streak, from the loaded ledger and what was remembered.
 *
 * The live window is at least 59 days long, so the 7- and 30-day cards are
 * always judged on live data alone. A run that reaches the window's first day
 * is only as long as the remembered run says, when that run joins up with it;
 * otherwise the older ledger has to be read once to count it. A run reaching
 * the kept window's start is capped exactly as it always was.
 */
export const knownStreak = (
  activities: Activity[],
  now: Date,
  loadedFrom: Date,
  keptFrom: Date,
  memory: StreakMemory | null
): KnownStreak => {
  const run = streakRun(activities, now, loadedFrom);
  if (!run.first) return { run, memory: null, needsOlder: false };

  const last = addDays(run.first, run.days - 1);
  const remember = (first: Date) => ({ first: dayKey(first), last: dayKey(last) });
  const everythingKept = loadedFrom.getTime() <= keptFrom.getTime();
  if (!run.capped || everythingKept) return { run, memory: remember(run.first), needsOlder: false };

  const bridges =
    memory !== null && memory.first < dayKey(run.first) && memory.last >= dayKey(addDays(run.first, -1));
  if (!bridges) return { run, memory, needsOlder: true };

  // Never counted back past what is kept, so a run is "at least" the same
  // number it would have been with every kept record loaded.
  const first = later(fromDayKey(memory.first), startOfDay(keptFrom));
  const days = Math.round((startOfDay(last).getTime() - first.getTime()) / DAY) + 1;
  return {
    run: { days, first, capped: streakCapped(first, now, keptFrom) },
    memory: remember(first),
    needsOlder: false,
  };
};
