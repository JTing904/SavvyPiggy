import type { Activity, Alert, NotificationPrefs, PiggyBank, SavingsSettings } from '../types';
import { currentStreak, dayKey, inflowCents, startOfDay } from './analytics';
import { isInSplit, type Movement } from './ledger';
import { getLang, m } from '../i18n';
import { fromCents, toCents } from './money';

/**
 * The round amounts a goal is congratulated for passing.
 *
 * These used to be percentages of the target — 25, 50, 75, 100 — which works
 * for a goal of a few hundred and not at all for anything bigger: a target of
 * RM200,000 puts the first line at RM50,000, so the card never comes. It also
 * meant a goal with no target got nothing, because a percentage needs
 * something to be a percentage of.
 *
 * A round amount needs neither. The step scales with what is already saved,
 * on a 1-2-5 ladder, so the cadence is about ten cards per tenfold — frequent
 * enough to mean something early and not a nuisance later.
 */
const LADDER = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];

/**
 * The step to congratulate on, for a goal holding this much. The largest rung
 * no bigger than a tenth of the balance, and never below the first one.
 */
export const milestoneStep = (balanceCents: number) => {
  const tenth = balanceCents / 10;
  let step = toCents(LADDER[0]);
  for (const rung of LADDER) {
    const cents = toCents(rung);
    if (cents <= tenth) step = cents;
  }
  return step;
};

/** Consecutive saving days worth a card. */
export const STREAK_MILESTONES = [7, 30, 100, 365];

/** Alerts are disposable, so they are cleared long before the ledger is. */
export const ALERT_RETENTION_DAYS = 90;

export const DEFAULT_SAVINGS: SavingsSettings = {
  overflow: false,
  retentionMonths: 12,
  retentionAcknowledged: false,
};

export const DEFAULT_PREFS: NotificationPrefs = {
  receipts: true,
  milestones: true,
  reminder: false,
  reminderTime: '20:00',
  digest: true,
  exDates: true,
};

/** Everything but `read`, which is always false when an alert is born. */
export type AlertDraft = Omit<Alert, 'read'>;

/**
 * Cards for goals a deposit pushed past a round amount, or past their target.
 *
 * Ids are deterministic, so crossing the same line again — after spending it
 * back down, say — refreshes the card instead of stacking a duplicate. Only
 * the highest line crossed is reported: one deposit that clears RM1,500 and
 * RM1,600 earns a single card.
 *
 * Reaching the target outranks any step, because it is the bigger news and
 * carries a question the step cards do not: what to do with the share this
 * goal keeps taking.
 */
export const milestoneAlerts = (
  banks: PiggyBank[],
  movements: Movement[],
  when: Date,
  overflow = false
): AlertDraft[] => {
  const out: AlertDraft[] = [];

  for (const m of movements) {
    if (m.cents <= 0) continue;
    const bank = banks.find((b) => b.id === m.bankId);
    // A goal with no target is no longer skipped: a round amount is something
    // to pass whether or not there is a finish line beyond it.
    if (!bank) continue;

    const target = toCents(bank.targetAmount);
    const before = toCents(bank.currentAmount);
    const after = before + m.cents;

    if (target > 0 && before < target && after >= target) {
      out.push({
        id: `reached_${bank.id}`,
        kind: 'reached',
        date: when.toISOString(),
        bankId: bank.id,
        bankName: bank.name,
        // The share it keeps taking — the card asks to move it elsewhere,
        // unless overflow is already doing exactly that.
        percent: isInSplit(bank) && !overflow ? bank.splitPercentage : 0,
        overflow,
        amount: bank.targetAmount,
      });
      continue;
    }

    // The highest multiple of the step that this deposit carried the balance
    // past. Judged on where the balance lands, so a goal stepping up a rung
    // does not re-announce lines it passed long ago.
    const step = milestoneStep(after);
    const passed = Math.floor(after / step) * step;
    if (passed <= before || passed <= 0) continue;
    // A goal with a target never celebrates a step at or beyond it; that is
    // what the reached card is for, and it has either already fired or is not
    // due yet.
    if (target > 0 && passed >= target) continue;

    out.push({
      id: `milestone_${bank.id}_${passed}`,
      kind: 'milestone',
      date: when.toISOString(),
      bankId: bank.id,
      bankName: bank.name,
      reachedAmount: fromCents(passed),
      // Only a goal with a finish line has a percentage or a distance to it.
      ...(target > 0
        ? { percent: Math.floor((after * 100) / target), amount: fromCents(target - after) }
        : {}),
    });
  }
  return out;
};

/** The receipt for one auto deposit, listing what each goal received. */
export const receiptAlert = (
  activityId: string,
  amountCents: number,
  banks: PiggyBank[],
  movements: Movement[],
  when: Date
): AlertDraft => ({
  id: `receipt_${activityId}`,
  kind: 'receipt',
  date: when.toISOString(),
  amount: fromCents(amountCents),
  lines: movements
    .filter((m) => m.cents > 0)
    .map((m) => ({
      bankId: m.bankId,
      name: banks.find((b) => b.id === m.bankId)?.name ?? 'Deleted goal',
      amount: fromCents(m.cents),
    })),
});

/**
 * A card when the running streak lands exactly on a milestone. The id carries
 * the streak's first day, so a second deposit on the same day changes nothing
 * and a fresh run of the same length, months later, gets its own card.
 */
export const streakAlert = (activities: Activity[], existing: Alert[], now: Date): AlertDraft | null => {
  const days = currentStreak(activities, now);
  if (!STREAK_MILESTONES.includes(days)) return null;

  const saved = new Set(activities.filter((a) => inflowCents(a) > 0).map((a) => dayKey(new Date(a.date))));
  const last = saved.has(dayKey(startOfDay(now))) ? startOfDay(now) : addDays(startOfDay(now), -1);
  const first = addDays(last, -(days - 1));

  const id = `streak_${days}_${dayKey(first)}`;
  if (existing.some((a) => a.id === id)) return null;
  return { id, kind: 'streak', date: now.toISOString(), days };
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Alerts old enough to be thrown away. */
export const staleAlerts = (alerts: Alert[], now: Date, days = ALERT_RETENTION_DAYS) => {
  const cutoff = addDays(startOfDay(now), -days).getTime();
  return alerts.filter((a) => new Date(a.date).getTime() < cutoff);
};

/** "20:00" -> { hour: 20, minute: 0 }; garbage falls back to the default. */
export const parseTime = (value: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  const hour = m ? Number(m[1]) : NaN;
  const minute = m ? Number(m[2]) : NaN;
  if (!(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)) return parseTime(DEFAULT_PREFS.reminderTime);
  return { hour, minute };
};

/** "20:00" -> "8:00 PM". */
export const formatTime = (value: string) => {
  const { hour, minute } = parseTime(value);
  const mm = String(minute).padStart(2, '0');
  // Chinese reads a 24-hour clock without a second thought; English keeps 8:00 PM.
  if (getLang() === 'zh') return `${String(hour).padStart(2, '0')}:${mm}`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${hour < 12 ? m().pickers.am : m().pickers.pm}`;
};
