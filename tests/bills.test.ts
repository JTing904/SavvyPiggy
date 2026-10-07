import type { Activity, Bill } from '../types';
import { dueDays, expectedCents, outsideHistory, pendingVariable, planFixedRun, recentAmounts, upcomingBills, walletShortfall, WALLET_SOURCE } from '../services/bills';
import { occurrencesBetween, runStamp } from '../services/schedules';
import { billSchedule } from '../services/bills';
import { eq, report } from './harness';

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Netflix',
  mode: 'fixed',
  amount: 55,
  frequency: 'monthly',
  weekday: 0,
  dayOfMonth: 5,
  month: 1,
  sourceId: WALLET_SOURCE,
  category: 'bills',
  enabled: true,
  createdAt: 1,
  // The first of September in Malaysia: only days after it are due.
  lastRunAt: runStamp('2026-09-01'),
  ...over,
});

// 7 Oct 2026, mid-morning in Kuala Lumpur.
const now = new Date(Date.UTC(2026, 9, 7, 2, 0));
const keepFrom = new Date(2026, 6, 7);

// --- which days are due
eq('monthly: the 5th of each month since the last run', dueDays(bill(), now), ['2026-09-05', '2026-10-05']);
eq('a paused bill is never due', dueDays(bill({ enabled: false }), now), []);
eq('nothing is due on the day it last ran', dueDays(bill({ lastRunAt: runStamp('2026-10-05') }), now), []);
eq('weekly: every Friday', dueDays(bill({ frequency: 'weekly', weekday: 5, lastRunAt: runStamp('2026-09-25') }), now), ['2026-10-02']);
eq('daily: every day since the last run', dueDays(bill({ frequency: 'daily', lastRunAt: runStamp('2026-10-04') }), now), ['2026-10-05', '2026-10-06', '2026-10-07']);
eq('yearly: once a year on its month and day', dueDays(bill({ frequency: 'yearly', month: 3, dayOfMonth: 20, lastRunAt: runStamp('2025-01-01') }), now), ['2025-03-20', '2026-03-20']);
eq('the 31st falls on the last day of a short month', dueDays(bill({ dayOfMonth: 31, lastRunAt: runStamp('2026-08-31') }), new Date(Date.UTC(2026, 9, 31, 2, 0))), ['2026-09-30', '2026-10-31']);

// --- fixed bills: what the app does when it opens
eq('fixed: everything due is recorded when the history reaches back that far', planFixedRun(bill(), now, keepFrom), { post: ['2026-09-05', '2026-10-05'], skipped: [] });
eq('fixed: days older than the history are passed over, not recorded', planFixedRun(bill(), now, new Date(2026, 9, 1)), { post: ['2026-10-05'], skipped: ['2026-09-05'] });
eq('fixed: a variable bill is never recorded by itself', planFixedRun(bill({ mode: 'variable' }), now, keepFrom), { post: [], skipped: [] });
eq('fixed: nothing due is nothing to do', planFixedRun(bill({ lastRunAt: runStamp('2026-10-05') }), now, keepFrom), { post: [], skipped: [] });

eq('outside the history: fixed or variable, the old days are passed over', outsideHistory(bill(), now, new Date(2026, 9, 1)), ['2026-09-05']);
eq('outside the history: nothing when the history reaches back far enough', outsideHistory(bill(), now, keepFrom), []);

// --- variable bills wait for an answer
const power = bill({ id: 'b2', name: 'Electricity', mode: 'variable', amount: 0, dayOfMonth: 15, lastRunAt: runStamp('2026-08-20') });
eq('variable: asks about the oldest day first and counts what waits behind it', pendingVariable([power], now, keepFrom).map((p) => [p.day, p.waiting]), [['2026-09-15', 1]]);
eq('variable: three due days waiting', pendingVariable([power], new Date(Date.UTC(2026, 10, 16, 2, 0)), keepFrom).map((p) => [p.day, p.waiting]), [['2026-09-15', 3]]);
eq('variable: days older than the history are not asked about', pendingVariable([power], now, new Date(2026, 9, 1)), []);
eq('variable: fixed bills are not in the list', pendingVariable([bill()], now, keepFrom), []);
eq('variable: a bill not due yet is not in the list', pendingVariable([{ ...power, lastRunAt: runStamp('2026-09-15') }], now, keepFrom), []);

// --- what a bill usually costs
let n = 0;
const spent = (billId: string, date: string, amount: number): Activity => ({ id: `a${++n}`, type: 'withdraw', date, amount, distributions: [], wallet: -amount, billId });
const history = [spent('b2', '2026-07-15T12:00:00.000Z', 109), spent('b2', '2026-09-15T12:00:00.000Z', 118), spent('b2', '2026-08-15T12:00:00.000Z', 132), spent('b1', '2026-09-05T12:00:00.000Z', 55)];
eq('recent amounts: newest first, only this bill', recentAmounts(history, 'b2').map((r) => r.cents), [11800, 13200, 10900]);
eq('recent amounts: limited to the count asked for', recentAmounts(history, 'b2', 1).map((r) => r.cents), [11800]);
eq('expected: the last amount recorded', expectedCents(power, history), 11800);
eq('expected: the amount it was made with when nothing is recorded', expectedCents(bill({ amount: 12.5 }), []), 1250);
eq('expected: nothing at all is zero', expectedCents(power, []), 0);

// --- coming up
const week = upcomingBills([bill({ lastRunAt: runStamp('2026-10-05') }), power, bill({ id: 'b3', name: 'Internet', dayOfMonth: 9, amount: 99, lastRunAt: runStamp('2026-10-01') })], history, now, 7);
eq('upcoming: the next seven days, today first, in date order', week.map((u) => [u.bill.name, u.day, u.cents]), [['Internet', '2026-10-09', 9900]]);
const wide = upcomingBills([power, bill({ id: 'b3', name: 'Internet', dayOfMonth: 9, amount: 99 })], history, now, 10);
eq('upcoming: a longer look picks up the 15th too', wide.map((u) => u.bill.name), ['Internet', 'Electricity']);
eq('upcoming: a paused bill is left out', upcomingBills([bill({ enabled: false })], [], now, 30), []);

// --- the wallet against what is coming
const coming = [
  { bill: bill(), day: '2026-10-09', cents: 5500 },
  { bill: bill({ id: 'g', sourceId: 'goal1' }), day: '2026-10-10', cents: 20000 },
];
eq('shortfall: only bills out of the wallet count', walletShortfall(coming, 2400), { totalCents: 5500, shortCents: 3100 });
eq('shortfall: none when the wallet covers them', walletShortfall(coming, 5500), null);
eq('shortfall: an overdrawn wallet covers nothing', walletShortfall(coming, -500), { totalCents: 5500, shortCents: 5500 });
eq('shortfall: no wallet bills is nothing to warn about', walletShortfall([coming[1]], 0), null);

// --- the engine's helper
eq('occurrencesBetween includes both ends', occurrencesBetween(billSchedule(bill({ dayOfMonth: 5 })), '2026-09-05', '2026-10-05'), ['2026-09-05', '2026-10-05']);
eq('occurrencesBetween ignores what was already posted', occurrencesBetween(billSchedule(bill({ lastRunAt: runStamp('2026-10-05') })), '2026-10-05', '2026-10-05'), ['2026-10-05']);

report();
