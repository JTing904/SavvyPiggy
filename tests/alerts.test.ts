import { formatTime, milestoneAlerts, parseTime, receiptAlert, staleAlerts, streakAlert } from '../services/alerts';
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

const cross = milestoneAlerts(BANKS, [{ bankId: 'car', cents: 1000, percentage: 50 }], NOW);
eq('crossing 25% earns one card', cross.map((a) => [a.id, a.kind, a.percent, a.amount]), [['milestone_car_25', 'milestone', 25, 750]]);
eq('card names the goal', cross[0].bankName, 'Car');

eq('just under the line earns nothing', milestoneAlerts(BANKS, [{ bankId: 'car', cents: 999, percentage: 50 }], NOW).length, 0);
eq('reaching the line counts', milestoneAlerts(BANKS, [{ bankId: 'car', cents: 1001, percentage: 50 }], NOW).length, 1);

const jump = milestoneAlerts(BANKS, [{ bankId: 'car', cents: 40000, percentage: 50 }], NOW);
eq('a big jump reports only the highest line', jump.map((a) => a.percent), [50]);

const reached = milestoneAlerts(BANKS, [{ bankId: 'pc', cents: 2000, percentage: 20 }], NOW);
eq('100% is a "reached" card carrying the share it still takes', reached.map((a) => [a.id, a.kind, a.percent, a.amount]), [['reached_pc', 'reached', 20, 500]]);

const overflowed = milestoneAlerts(BANKS, [{ bankId: 'pc', cents: 2000, percentage: 20 }], NOW, true);
eq('with overflow on there is nothing to reallocate by hand', [overflowed[0].percent, overflowed[0].overflow], [0, true]);

const idle = milestoneAlerts(BANKS, [{ bankId: 'idle', cents: 100, percentage: 100 }], NOW);
eq('a goal outside the split has nothing to reallocate', idle[0].percent, 0);

eq('open-ended goals have no milestones', milestoneAlerts(BANKS, [{ bankId: 'fun', cents: 100000, percentage: 50 }], NOW), []);
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

const plan = plannedNotifications(
  { receipts: true, milestones: true, reminder: true, reminderTime: '21:15', digest: true },
  [rule({}), rule({ id: 'off', enabled: false }), rule({ id: 'monthly', frequency: 'monthly', dayOfMonth: 20 })],
  NOW
);
eq('one alarm per feature plus per live rule', plan.map((n) => n.id), [1, 2, 100, 102]);
eq('reminder repeats daily at the chosen time', plan[0].schedule, { on: { hour: 21, minute: 15 } });
eq('digest repeats monthly on the 1st', plan[1].schedule, { on: { day: 1, hour: 9, minute: 0 } });
eq('rule nudge is a one-off on the next due morning', (plan[3].schedule?.at as Date).toString().slice(0, 21), 'Sun Sep 20 2026 09:00');
eq('rule nudge names the amount', plan[2].title, 'Auto deposit of $50.00 due today');

eq('everything off plans nothing', plannedNotifications({ receipts: true, milestones: true, reminder: false, reminderTime: '20:00', digest: false }, [], NOW), []);

report();
