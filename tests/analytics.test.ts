import {
  archivable,
  bucketsFor,
  currentStreak,
  periodRange,
  rangeLabel,
  retentionCutoff,
  summarize,
} from '../services/analytics';
import type { Activity, PiggyBank } from '../types';
import { eq, report } from './harness';

const bank = (id: string, extra: Partial<PiggyBank> = {}): PiggyBank => ({
  id,
  name: id,
  targetAmount: 1000,
  currentAmount: 0,
  splitPercentage: 0,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  ...extra,
});

let seq = 0;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const deposit = (date: string, split: Record<string, number>, extra: Partial<Activity> = {}): Activity => ({
  id: `a${++seq}`,
  type: 'manual',
  date,
  amount: Object.values(split).reduce((s, n) => s + n, 0),
  distributions: Object.entries(split).map(([bankId, amount]) => ({ bankId, amount, percentage: 0 })),
  ...extra,
});

// Saturday 5 Sep 2026, 15:00 local.
const NOW = new Date(2026, 8, 5, 15);

// --- ranges
const week = periodRange('week', NOW);
eq('week starts Monday', [week.start.getDate(), week.start.getMonth()], [31, 7]);
eq('week ends exclusive next Monday', week.end.getDate(), 7);
eq('week days elapsed (Mon..Sat)', week.days, 6);
eq('week label spans years/months', week.label, 'Aug 31 – Sep 6, 2026');

const month = periodRange('month', NOW);
eq('month label', month.label, 'Sep 1 – Sep 30, 2026');
eq('month days elapsed', month.days, 5);
eq('month previous is August', [month.previous!.start.getMonth(), month.previous!.end.getMonth()], [7, 8]);

const quarter = periodRange('quarter', NOW);
eq('quarter label', quarter.label, 'Jul 1 – Sep 30, 2026');
eq('quarter days elapsed', quarter.days, 31 + 31 + 5);

const year = periodRange('year', NOW);
eq('year label', year.label, 'Jan 1 – Dec 31, 2026');
eq('year previous', year.previous!.start.getFullYear(), 2025);

const all = periodRange('all', NOW, new Date(2025, 2, 12, 9));
eq('all starts at first record', all.label, 'Since Mar 12, 2025');
eq('all has no previous', all.previous, null);
eq('all with no records is today only', periodRange('all', NOW, null).days, 1);
eq('cross-year label', rangeLabel(new Date(2025, 11, 20), new Date(2026, 0, 3)), 'Dec 20, 2025 – Jan 2, 2026');

// --- buckets
eq('week buckets are weekdays', bucketsFor('week', week).map((b) => b.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
eq('month buckets are 5 weeks', bucketsFor('month', month).map((b) => b.label), ['W1', 'W2', 'W3', 'W4', 'W5']);
eq('last month bucket ends at month end', bucketsFor('month', month)[4].range.end.getDate(), 1);
eq('quarter buckets are months', bucketsFor('quarter', quarter).map((b) => b.label), ['Jul', 'Aug', 'Sep']);
eq('year buckets are 12 months', bucketsFor('year', year).length, 12);
eq('all-time short span is monthly', bucketsFor('all', periodRange('all', NOW, new Date(2026, 3, 2))).map((b) => b.label), ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
eq('all-time long span is yearly', bucketsFor('all', periodRange('all', NOW, new Date(2024, 0, 2))).map((b) => b.label), ['2024', '2025', '2026']);

// --- summary
const BANKS = [
  bank('car', { name: 'Car', targetAmount: 1000, currentAmount: 900, createdAt: 1 }),
  bank('fun', { name: 'Fun', targetAmount: 0, currentAmount: 40, createdAt: 2 }),
  bank('pc', { name: 'PC', targetAmount: 500, currentAmount: 500, createdAt: 3 }),
];
const ACTS: Activity[] = [
  deposit(at(2026, 9, 1), { car: 30, fun: 10 }),
  deposit(at(2026, 9, 3), { car: 30, fun: 10 }, { repaid: 5 }),
  deposit(at(2026, 9, 4), { car: 30.05, fun: 10 }),
  deposit(at(2026, 9, 5), { car: 30 }),
  // Spending never counts as saving.
  { id: 'w', type: 'withdraw', date: at(2026, 9, 4), amount: 20, distributions: [{ bankId: 'fun', amount: -20, percentage: 100 }] },
  // Borrowing touches no goal.
  { id: 'b', type: 'borrow', date: at(2026, 9, 2), amount: 50, distributions: [], loanId: 'l1' },
  // Previous month.
  deposit(at(2026, 8, 20), { car: 100 }),
  deposit(at(2026, 8, 21), { car: 20 }),
  // Long ago.
  deposit(at(2025, 1, 1), { car: 1 }),
];

const s = summarize(ACTS, BANKS, 'month', NOW);
eq('distributed = inflow only', s.distributed, 150.05);
eq('spent', s.spent, 20);
eq('repaid', s.repaid, 5);
eq('borrowed', s.borrowed, 50);
eq('transactions in period', s.transactions, 6);
eq('change vs previous month', s.change, 25);
eq('daily average floors cents', s.dailyAverage, 30.01);
eq('banks sorted by credited', s.banks.map((b) => b.bankId), ['car', 'fun', 'pc']);
eq('bank credited', s.banks[0].credited, 120.05);
eq('bank share', s.banks.map((b) => b.share), [80, 20, 0]);
eq('funded from live balance', s.banks.map((b) => b.funded), [90, null, 100]);
eq('top goal', s.top!.name, 'Car');
eq('collective funded', s.collective, { funded: 93.3, goals: 2, reached: 1 });
eq('buckets by week', s.buckets.map((b) => b.amount), [150.05, 0, 0, 0, 0]);
eq('current bucket flagged', s.buckets.map((b) => b.current), [true, false, false, false, false]);
eq('active days', s.activeDays, 4);
eq('max day', s.maxDay, 40.05);
eq('streak counts back from today', s.streak, 3);
eq('forecast picks the closest goal', [s.forecast!.bankId, s.forecast!.days, s.forecast!.remaining], ['car', 5, 100]);
eq('forecast date', s.forecast!.date.getDate(), 10);

const prev = summarize(ACTS, BANKS, 'quarter', NOW);
eq('quarter includes August', prev.distributed, 270.05);
eq('no previous data means no change', summarize(ACTS, BANKS, 'quarter', new Date(2026, 3, 5)).change, null);

const empty = summarize([], BANKS, 'month', NOW);
eq('empty period', [empty.distributed, empty.top, empty.forecast, empty.streak], [0, null, null, 0]);
eq('empty shares', empty.banks.map((b) => b.share), [0, 0, 0]);

// --- streak
eq('streak alive when today is empty', currentStreak([deposit(at(2026, 9, 4), { car: 1 }), deposit(at(2026, 9, 3), { car: 1 })], NOW), 2);
eq('streak broken by a gap', currentStreak([deposit(at(2026, 9, 5), { car: 1 }), deposit(at(2026, 9, 3), { car: 1 })], NOW), 1);
eq('withdrawals do not extend a streak', currentStreak([{ id: 'w', type: 'withdraw', date: at(2026, 9, 5), amount: 1, distributions: [{ bankId: 'car', amount: -1, percentage: 100 }] }], NOW), 0);

// --- archive
eq('cutoff is 12 months back', retentionCutoff(NOW).toISOString().slice(0, 10), new Date(2025, 8, 5).toISOString().slice(0, 10));
eq('only records before the cutoff are archivable', archivable(ACTS, NOW).map((a) => a.distributions[0].amount), [1]);
eq('a record on the cutoff day stays', archivable([deposit(at(2025, 9, 5, 0), { car: 1 })], NOW).length, 0);

report();
