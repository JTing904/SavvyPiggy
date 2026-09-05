import type { Activity, Alert, NotificationPrefs, PiggyBank, SavingsSettings } from '../types';
import { currentStreak, dayKey, inflowCents, startOfDay } from './analytics';
import { isInSplit, type Movement } from './ledger';
import { fromCents, toCents } from './money';

/** Percent-of-target lines a goal is congratulated for crossing. */
export const MILESTONES = [25, 50, 75, 100];

/** Consecutive saving days worth a card. */
export const STREAK_MILESTONES = [7, 30, 100, 365];

/** Alerts are disposable, so they are cleared long before the ledger is. */
export const ALERT_RETENTION_DAYS = 90;

export const DEFAULT_SAVINGS: SavingsSettings = {
  overflow: false,
};

export const DEFAULT_PREFS: NotificationPrefs = {
  receipts: true,
  milestones: true,
  reminder: false,
  reminderTime: '20:00',
  digest: true,
};

/** Everything but `read`, which is always false when an alert is born. */
export type AlertDraft = Omit<Alert, 'read'>;

/**
 * Cards for goals a deposit pushed past a milestone. Ids are deterministic,
 * so re-crossing the same line (after spending, say) refreshes the card
 * instead of stacking a duplicate. Only the highest line crossed is reported:
 * one deposit jumping from 20 % to 60 % earns a single "50 %" card.
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
    if (!bank || bank.targetAmount <= 0) continue;

    const target = toCents(bank.targetAmount);
    const before = toCents(bank.currentAmount);
    const after = before + m.cents;
    // Integer comparison: `before < p% of target <= after`.
    const crossed = MILESTONES.filter((p) => before * 100 < p * target && after * 100 >= p * target);
    const percent = crossed[crossed.length - 1];
    if (!percent) continue;

    out.push(
      percent === 100
        ? {
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
          }
        : {
            id: `milestone_${bank.id}_${percent}`,
            kind: 'milestone',
            date: when.toISOString(),
            bankId: bank.id,
            bankName: bank.name,
            percent,
            amount: fromCents(target - after),
          }
    );
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
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
