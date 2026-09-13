import {
  formatTime,
  milestoneAlerts,
  milestoneStep,
  parseTime,
  receiptAlert,
  staleAlerts,
  streakAlert,
} from '../services/alerts';
import { plannedNotifications } from '../services/notifications';
import { nextOccurrence } from '../services/schedules';
import type { Activity, Alert, PiggyBank, Schedule } from '../types';
import { eq, report } from './harness';

const bank = (id: string, extra: Partial<PiggyBank> = {}): PiggyBank => ({
  id,
  name: id,
  targetAmount: 1000,
  currentAmount: 0,
  splitPercentage: 50,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  ...extra,
});

// Saturday 5 Sep 2026, 15:00 local.
const NOW = new Date(2026, 8, 5, 15);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const deposit = (date: string, cents: number): Activity => ({
  id: date,
  type: 'manual',
  date,
  amount: cents / 100,
  distributions: [{ bankId: 'car', amount: cents / 100, percentage: 100 }],
});

// --- milestones
const BANKS = [
  bank('car', { name: 'Car', currentAmount: 240 }),
  bank('fun', { name: 'Fun', targetAmount: 0, currentAmount: 40 }),
  bank('pc', { name: 'PC', targetAmount: 500, currentAmount: 480, splitPercentage: 20 }),
  bank('idle', { name: 'Idle', targetAmount: 100, currentAmount: 99, splitPercentage: 0 }),
];

// The step scales with what is already saved, so the cadence stays sane from
// a first RM50 to a house deposit.
eq('the step is a tenth, rounded down the 1-2-5 ladder', [
  milestoneStep(8_000),        // RM80 -> RM50
  milestoneStep(146_100),      // RM1,461 -> RM100
  milestoneStep(1_200_000),    // RM12,000 -> RM1,000
  milestoneStep(20_000_000),   // RM200,000 -> RM10,000
], [5_000, 10_000, 100_000, 1_000_000]);
eq('never finer than the first rung', [milestoneStep(0), milestoneStep(1), milestoneStep(49_900)], [5_000, 5_000, 5_000]);

// Car: RM240 of RM1,000. A RM10 deposit lands on RM250, and at that balance
// the step is RM50 — so RM250 is the line it passes.
const cross = milestoneAlerts(BANKS, [{ bankId: 'car', cents: 1000, percentage: 50 }], NOW);
eq('passing a round amount earns one card',
  cross.map((a) => [a.id, a.kind, a.reachedAmount]),
  [['milestone_car_25000', 'milestone', 250]]);
eq('card names the goal', cross[0].bankName, 'Car');
eq('a goal with a target still says how far it has to go', [cross[0].percent, cross[0].amount], [25, 750]);

eq('stopping short of the line earns nothing',
  milestoneAlerts(BANKS, [{ bankId: 'car', cents: 999, percentage: 50 }], NOW).length, 0);
eq('landing exactly on it counts',
  milestoneAlerts(BANKS, [{ bankId: 'car', cents: 1000, percentage: 50 }], NOW).length, 1);

// RM240 -> RM740 crosses RM250, RM300 ... RM700 at the RM50 step.
const jump = milestoneAlerts(BANKS, [{ bankId: 'car', cents: 50000, percentage: 50 }], NOW);
eq('a big deposit reports only the highest line', jump.map((a) => a.reachedAmount), [700]);

// The whole point of the change: a goal with no finish line now gets cards.
const open = milestoneAlerts(BANKS, [{ bankId: 'fun', cents: 100000, percentage: 50 }], NOW);
eq('an open-ended goal passes round amounts too',
  open.map((a) => [a.kind, a.reachedAmount]), [['milestone', 1000]]);
eq('and has no percentage or distance, because it has no target',
  [open[0].percent, open[0].amount], [undefined, undefined]);

// PC: RM480 of RM500.
const reached = milestoneAlerts(BANKS, [{ bankId: 'pc', cents: 2000, percentage: 20 }], NOW);
eq('reaching the target is a "reached" card carrying the share it still takes',
  reached.map((a) => [a.id, a.kind, a.percent, a.amount]), [['reached_pc', 'reached', 20, 500]]);
eq('and it outranks any step crossed by the same deposit', reached.length, 1);

const overflowed = milestoneAlerts(BANKS, [{ bankId: 'pc', cents: 2000, percentage: 20 }], NOW, true);
eq('with overflow on there is nothing to reallocate by hand', [overflowed[0].percent, overflowed[0].overflow], [0, true]);

const idle = milestoneAlerts(BANKS, [{ bankId: 'idle', cents: 100, percentage: 100 }], NOW);
eq('a goal outside the split has nothing to reallocate', idle[0].percent, 0);

eq('spending never earns a milestone', milestoneAlerts(BANKS, [{ bankId: 'car', cents: -1000, percentage: 100 }], NOW), []);
eq('unknown goals are skipped', milestoneAlerts(BANKS, [{ bankId: 'gone', cents: 1000, percentage: 100 }], NOW), []);

// --- receipts
const receipt = receiptAlert('act1', 5000, BANKS, [
  { bankId: 'car', cents: 2500, percentage: 50 },
  { bankId: 'pc', cents: 2500, percentage: 50 },
], NOW);
eq('receipt id follows the activity', receipt.id, 'receipt_act1');
eq('receipt lists each goal', receipt.lines, [
  { bankId: 'car', name: 'Car', amount: 25 },
  { bankId: 'pc', name: 'PC', amount: 25 },
]);
eq('receipt total', receipt.amount, 50);

// --- streaks
const week = [1, 2, 3, 4, 5, 6, 7].map((d) => deposit(at(2026, 8, 29 + d), 100)); // Aug 30 .. Sep 5
eq('7-day streak earns a card keyed on its first day', streakAlert(week, [], NOW)?.id, 'streak_7_2026-08-30');
eq('the same streak never earns twice', streakAlert(week, [{ id: 'streak_7_2026-08-30', kind: 'streak', date: '', read: true }], NOW), null);
eq('6 days is not a milestone', streakAlert(week.slice(1), [], NOW), null);
eq('a streak alive from yesterday is keyed the same way', streakAlert(week.slice(0, 6), [], new Date(2026, 8, 5, 8)), null);
eq('7 days ending yesterday', streakAlert(week, [], new Date(2026, 8, 6, 8))?.id, 'streak_7_2026-08-30');
eq('a known window start does not stop a real milestone', streakAlert(week, [], NOW, new Date(2025, 8, 1))?.id, 'streak_7_2026-08-30');
{
  // A year of daily saving, loaded from the twelve-month window's first day.
  // On the first of the month it counts to exactly 365 — the cap, not the
  // streak — and without a guard a new card was minted every month.
  const year: Activity[] = [];
  for (let d = new Date(2025, 8, 1); d < new Date(2026, 8, 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    year.push(deposit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(), 100));
  }
  const firstOfMonth = new Date(2026, 8, 1, 8);
  eq('a streak capped by the loaded window earns no card', streakAlert(year, [], firstOfMonth), null);
  eq('nor when the window start is given', streakAlert(year, [], firstOfMonth, new Date(2025, 8, 1)), null);
  eq('with the whole ledger loaded, the milestone is real',
    streakAlert(year, [], firstOfMonth, new Date(0))?.id, 'streak_365_2025-09-01');
}

// --- housekeeping
const alert = (id: string, date: Date): Alert => ({ id, kind: 'streak', date: date.toISOString(), read: true });
eq('alerts older than 90 days are stale', staleAlerts([alert('old', new Date(2026, 5, 1)), alert('new', new Date(2026, 6, 1))], NOW).map((a) => a.id), ['old']);

// --- times
eq('parse time', parseTime('20:05'), { hour: 20, minute: 5 });
eq('garbage time falls back', parseTime('later'), { hour: 20, minute: 0 });
eq('format time', [formatTime('20:05'), formatTime('00:30'), formatTime('12:00')], ['8:05 PM', '12:30 AM', '12:00 PM']);

// --- notifications plan
const rule = (extra: Partial<Schedule>): Schedule => ({
  id: 'r',
  amount: 50,
  frequency: 'daily',
  weekday: 1,
  dayOfMonth: 1,
  month: 1,
  targetBankId: null,
  enabled: true,
  lastRunAt: at(2026, 9, 5),
  createdAt: 0,
  ...extra,
});

eq('next daily occurrence is tomorrow', nextOccurrence(rule({}), NOW)?.getDate(), 6);
eq('next weekly (Monday) occurrence', nextOccurrence(rule({ frequency: 'weekly' }), NOW)?.getDate(), 7);
eq('today is skipped even if unposted', nextOccurrence(rule({ lastRunAt: at(2026, 9, 1) }), NOW)?.getDate(), 6);
eq('a dormant rule still looks forward from today', nextOccurrence(rule({ frequency: 'monthly', dayOfMonth: 3, lastRunAt: at(2026, 1, 3) }), NOW)?.toDateString(), 'Sat Oct 03 2026');

const PREFS = { receipts: true, milestones: true, reminder: true, reminderTime: '21:15', digest: true, exDates: true };
const RULES = [
  rule({}),
  rule({ id: 'off', enabled: false }),
  rule({ id: 'monthly', frequency: 'monthly', dayOfMonth: 20 }),
];
const plan = plannedNotifications(PREFS, RULES, [], [], NOW);

eq('one alarm per feature plus per live rule', plan.length, 4);
eq('reminder repeats daily at the chosen time', plan[0].schedule, { on: { hour: 21, minute: 15 } });
eq('digest repeats monthly on the 1st', plan[1].schedule, { on: { day: 1, hour: 9, minute: 0 } });
eq('rule nudge is a one-off on the next due morning', (plan[3].schedule?.at as Date).toString().slice(0, 21), 'Sun Sep 20 2026 09:00');
eq('rule nudge names the amount', plan[2].title, 'Auto deposit of RM50.00 due today');

// An alarm id used to be the rule's position in the list, so deleting one
// re-pointed a live alarm at a different rule.
{
  const ids = (rules: typeof RULES) =>
    plannedNotifications(PREFS, rules, [], [], NOW).map((n) => n.id);
  eq('every alarm has its own id', new Set(plan.map((n) => n.id)).size, plan.length);

  // The id of the *first* rule is what matters: with positional ids, dropping
  // the rule ahead of it moved it onto a different slot.
  const monthlyId = ids(RULES)[3];
  eq('a rule keeps its id when another is removed before it',
    ids([RULES[2]])[2], monthlyId);
  eq('and when the list is reordered',
    ids([RULES[2], RULES[1], RULES[0]])[2], monthlyId);
}

// --- ex-dates
{
  const declared = {
    symbol: '1155.KL', subject: 'Interim', exDate: new Date(2026, 8, 20).getTime(),
    payDate: new Date(2026, 9, 5).getTime(), perUnitPoints: 3300, announcedAt: 0,
  };
  const held = [{
    id: 't1', symbol: '1155.KL', name: 'MAYBANK', kind: 'buy' as const,
    units: 500, priceCents: 1000, tradedAt: new Date(2026, 7, 1).getTime(), createdAt: 0,
  }];
  const withEx = plannedNotifications(PREFS, [], [declared], held, NOW);
  eq('a warning two days before the ex-date',
    (withEx[2].schedule?.at as Date).toString().slice(0, 21), 'Fri Sep 18 2026 09:00');
  eq('it says how many units are held', withEx[2].body?.includes('You hold 500'), true);

  const none = plannedNotifications(PREFS, [], [declared], [], NOW);
  eq('holding nothing still gets the nudge, worded to buy',
    none[2].body?.includes('Buy before the ex-date'), true);

  // An ex-date that has already been and gone is not worth an alarm.
  const past = { ...declared, exDate: new Date(2026, 7, 1).getTime() };
  eq('a past ex-date plans nothing', plannedNotifications(PREFS, [], [past], held, NOW).length, 2);
  eq('and neither does the setting turned off',
    plannedNotifications({ ...PREFS, exDates: false }, [], [declared], held, NOW).length, 2);
}

eq('everything off plans nothing',
  plannedNotifications(
    { receipts: true, milestones: true, reminder: false, reminderTime: '20:00', digest: false, exDates: false },
    [], [], [], NOW
  ),
  []);

report();
