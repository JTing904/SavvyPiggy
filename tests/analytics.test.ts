import {
  archivable,
  bucketsFor,
  clearingPlan,
  currentStreak,
  goalsChangeCents,
  shownOlder,
  streakRun,
  periodRange,
  rangeLabel,
  monthSummary,
  monthsWithRecords,
  nextToClear,
  RETENTION_CHOICES,
  allowedRetention,
  retentionCutoff,
  spendingByCategory,
  summarize,
} from '../services/analytics';
import type { Activity, Trade, PiggyBank } from '../types';
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

// --- money moved for shares: neither saving nor spending
{
  const bought: Activity = {
    id: 'inv', type: 'invest', date: at(2026, 9, 4), amount: 799.24,
    distributions: [{ bankId: 'car', amount: -799.24, percentage: 100 }],
    tradeId: 't1', counter: 'RHBBANK', units: 100,
  };
  // A split sale: RM50 cleared spent ahead, the rest reached two goals.
  const sold: Activity = {
    id: 'div', type: 'divest', date: at(2026, 9, 5), amount: 1070.32,
    distributions: [{ bankId: 'car', amount: 600.2, percentage: 60 }, { bankId: 'fun', amount: 420.12, percentage: 40 }],
    repaid: 50, repayments: [{ loanId: 'l1', amount: 50 }],
    tradeId: 't2', counter: 'MAYBANK', units: 100,
  };
  const base = summarize(ACTS, BANKS, 'month', NOW);
  const withShares = summarize([...ACTS, bought, sold], BANKS, 'month', NOW);
  eq('a purchase is money moved into shares', withShares.invested, 799.24);
  eq('a sale is money coming back, spent ahead included', withShares.cameBack, 1070.32);
  eq('only what reached goals counts as back in the goals', withShares.cameBackToGoals, 1020.32);
  eq('saving, spending and debt are untouched',
    [withShares.distributed, withShares.spent, withShares.repaid, withShares.borrowed],
    [base.distributed, base.spent, base.repaid, base.borrowed]);
  eq('no goal is credited by a sale', withShares.banks.map((b) => b.credited), base.banks.map((b) => b.credited));
  eq('cadence and active days are deposits only',
    [withShares.buckets.map((b) => b.amount), withShares.activeDays, withShares.maxDay],
    [base.buckets.map((b) => b.amount), base.activeDays, base.maxDay]);
  eq('the goals grew by saving less spending, less shares, plus what came back to them',
    Math.round((withShares.distributed - withShares.spent - withShares.invested + withShares.cameBackToGoals) * 100) / 100,
    Math.round((150.05 - 20 - 799.24 + 1020.32) * 100) / 100);
  eq('nothing moved for shares reads as zero', [base.invested, base.cameBack, base.cameBackToGoals], [0, 0, 0]);
  eq('a sale on its own does not extend a streak', currentStreak([sold], NOW), 0);
  eq('nor does a sale bridge a gap', currentStreak([deposit(at(2026, 9, 5), { car: 1 }), { ...sold, date: at(2026, 9, 4) }, deposit(at(2026, 9, 3), { car: 1 })], NOW), 1);
}

// --- archive
const asDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Whole months, so a statement is never half cleared: in September with a
// twelve-month window the ledger starts on the first of the previous September.
eq('the cutoff is the first of the month, twelve back', asDay(retentionCutoff(NOW)), '2025-09-01');
eq('a shorter window moves it forward', asDay(retentionCutoff(NOW, 6)), '2026-03-01');
eq('keeping everything reaches back past any record', retentionCutoff(NOW, null).getTime(), 0);
eq('only records before the cutoff are archivable', archivable(ACTS, NOW).map((a) => a.distributions[0].amount), [1]);
eq('a record from the first kept month stays', archivable([deposit(at(2025, 9, 5, 0), { car: 1 })], NOW).length, 0);
eq('a record from the month before it goes', archivable([deposit(at(2025, 8, 31, 0), { car: 1 })], NOW).length, 1);
eq('nothing is archivable when everything is kept', archivable(ACTS, NOW, null).length, 0);

// --- monthly statements
{
  const trade = (tradedAt: number): Trade => ({
    id: `t${tradedAt}`, symbol: '1155.KL', name: 'MAYBANK', kind: 'buy',
    units: 100, priceCents: 1000, tradedAt, createdAt: tradedAt,
  });
  const months = monthsWithRecords(
    [deposit(at(2026, 9, 2), { car: 30 }), deposit(at(2026, 9, 4), { car: 20 }), deposit(at(2026, 7, 9), { car: 40 })],
    [trade(new Date(2026, 7, 15).getTime()), trade(new Date(2026, 5, 1).getTime())],
    NOW
  );
  eq('newest month first, one entry each', months.map((m) => m.key), ['2026-09', '2026-08', '2026-07', '2026-06']);
  eq('a month is labelled the way people say it', months[0].label, 'September 2026');
  eq('deposits are counted and netted', { n: months[0].activities, net: months[0].net }, { n: 2, net: 50 });
  eq('the running month is marked', months.map((m) => m.current), [true, false, false, false]);
  // A month with only a share purchase is still a month worth exporting.
  eq('trades make a month of their own', { n: months[1].activities, t: months[1].trades }, { n: 0, t: 1 });
  eq('a month is cleared on the first, twelve months on', asDay(months[2].clearedOn!), '2027-08-01');
  eq('keeping everything clears nothing',
    monthsWithRecords([deposit(at(2026, 9, 2), { car: 1 })], [], NOW, null)[0].clearedOn, null);
  eq('nothing recorded, nothing to report', monthsWithRecords([], [], NOW), []);

  // The bug this guards: summarising from the month's exclusive end lands in
  // the next month and reports nothing at all.
  const sept = months[0];
  const septActs = [deposit(at(2026, 9, 2), { car: 30 }), deposit(at(2026, 9, 4), { car: 20 })];
  const running = monthSummary(septActs, BANKS, sept, NOW);
  eq('the month still running counts what is in it', running.distributed, 50);
  eq('and counts the days so far, not the whole month', running.range.days, 5);
  eq('the label is the month, not a date range', running.range.label, 'September 2026');

  const july = months[2];
  const julyActs = [deposit(at(2026, 7, 9), { car: 40 })];
  const finished = monthSummary(julyActs, BANKS, july, NOW);
  eq('a finished month counts what was in it', finished.distributed, 40);
  eq('and counts every one of its days', finished.range.days, 31);

  const due = nextToClear(monthsWithRecords(ACTS, [], NOW));
  eq('the oldest month on record is the one to warn about', due?.key, '2025-01');

  // A month before the window's first day is already due; one inside is not.
  const ages = monthsWithRecords([deposit(at(2025, 8, 20), { car: 1 }), deposit(at(2025, 9, 2), { car: 1 })], [], NOW);
  eq('a month past the window is marked due, the first kept month is not', ages.map((m) => [m.key, m.due]), [
    ['2025-09', false],
    ['2025-08', true],
  ]);
  eq('keeping everything marks nothing due',
    monthsWithRecords([deposit(at(2020, 1, 2), { car: 1 })], [], NOW, null)[0].due, false);
}

// --- a deleted goal's money moving is neither money in nor money out
{
  const mixed: Activity[] = [
    deposit(at(2026, 9, 2), { car: 100 }),
    { id: 'tr', type: 'transfer', date: at(2026, 9, 3), amount: 500, distributions: [{ bankId: 'car', amount: 500, percentage: 100 }], fromGoal: 'Old' },
    { id: 'buy', type: 'invest', date: at(2026, 9, 4), amount: 50, distributions: [{ bankId: 'car', amount: -50, percentage: 100 }] },
  ];
  const [sept] = monthsWithRecords(mixed, [], NOW);
  const s = summarize(mixed, [bank('car')], 'month', NOW);
  // The Report's "goals grew by".
  const grewBy = Math.round((s.distributed - s.spent - s.invested + s.cameBackToGoals) * 100) / 100;
  eq('the month total leaves the transfer out', sept.net, 50);
  eq('and matches what the Report says the goals grew by', sept.net, grewBy);
  eq('a transfer counts as nothing, either way', [goalsChangeCents(mixed[1]), goalsChangeCents({ ...mixed[1], distributions: [{ bankId: 'car', amount: -20, percentage: 100 }] })], [0, 0]);
  eq('the month still counts the transfer as a record', sept.activities, 3);
}

// --- clearing waits for what has been shown
{
  // NOW is 5 Sep 2026; a twelve-month window starts 1 Sep 2025.
  const cut12 = new Date(2025, 8, 1);
  const cut6 = new Date(2026, 2, 1);
  const iso = (d: Date) => d.toISOString();

  const never = clearingPlan(NOW, 12, undefined);
  eq('never shown: nothing may go, and everything due is unseen',
    [never.clearBefore, never.unseenFrom?.getTime()], [null, 0]);
  eq('a cutoff that will not parse counts as never shown', clearingPlan(NOW, 12, 'soon').clearBefore, null);

  const current = clearingPlan(NOW, 12, iso(cut12));
  eq('shown at this cutoff: everything before it may go, nothing unseen',
    [current.clearBefore?.getTime(), current.unseenFrom], [cut12.getTime(), null]);

  // Shown last month; a month has aged out since.
  const lastMonth = new Date(2025, 7, 1);
  const aged = clearingPlan(NOW, 12, iso(lastMonth));
  eq('a month aged out since: only what was shown may go',
    aged.clearBefore?.getTime(), lastMonth.getTime());
  eq('and the new month is unseen, so the warning comes back',
    [aged.unseenFrom?.getTime(), aged.cutoff.getTime()], [lastMonth.getTime(), cut12.getTime()]);

  // Shown under twelve months, then the window shrank to six.
  const shrunk = clearingPlan(NOW, 6, iso(cut12));
  eq('a shrunken window clears no further than what was shown',
    [shrunk.clearBefore?.getTime(), shrunk.unseenFrom?.getTime(), shrunk.cutoff.getTime()],
    [cut12.getTime(), cut12.getTime(), cut6.getTime()]);

  // Shown under six months, then widened to twelve: the window is the limit.
  const widened = clearingPlan(NOW, 12, iso(cut6));
  eq('a widened window clears only past its own start',
    [widened.clearBefore?.getTime(), widened.unseenFrom], [cut12.getTime(), null]);

  eq('keeping everything plans nothing', [clearingPlan(NOW, null, iso(cut12)).clearBefore, clearingPlan(NOW, null, undefined).unseenFrom], [null, null]);

  // What the screen can say it showed.
  const old = [deposit(at(2025, 6, 3), { car: 1 }), deposit(at(2025, 7, 9), { car: 1 }), deposit(at(2025, 7, 20), { car: 1 })];
  const whole = shownOlder(old, true, cut12);
  eq('a complete read shows everything, up to the cutoff', [whole.activities.length, whole.shownCutoff.getTime()], [3, cut12.getTime()]);
  const partial = shownOlder(old, false, cut12);
  eq('a full page drops its last month, which may be cut short',
    partial.activities.map((a) => a.date), [old[0].date]);
  eq('and acknowledges only up to that month', partial.shownCutoff.getTime(), new Date(2025, 6, 1).getTime());
  eq('a full page of a single month acknowledges nothing',
    shownOlder(old.slice(1), false, cut12).activities.length, 0);
}

// --- a streak longer than the loaded history
{
  const daily = (from: Date, to: Date) => {
    const out: Activity[] = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      out.push(deposit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(), { car: 1 }));
    }
    return out;
  };
  const firstOfMonth = new Date(2026, 8, 1, 8);
  const loaded = daily(new Date(2025, 8, 1), new Date(2026, 7, 31));
  const run = streakRun(loaded, firstOfMonth);
  eq('a run reaching the window start reads as capped', [run.days, run.capped], [365, true]);
  eq('given where loading started, the same', streakRun(loaded, firstOfMonth, new Date(2025, 8, 1)).capped, true);
  eq('a run starting after it is not', streakRun(loaded.slice(1), firstOfMonth, new Date(2025, 8, 1)).capped, false);
  eq('everything loaded: never capped', streakRun(loaded, firstOfMonth, new Date(0)).capped, false);
  eq('the report carries it', summarize(loaded, [bank('car')], 'month', firstOfMonth).streakCapped, true);
  eq('a short streak is not capped', summarize([deposit(at(2026, 9, 5), { car: 1 })], [bank('car')], 'month', NOW).streakCapped, false);
}

// Only two windows are offered, and neither is "forever": every kept record
// is re-read on each app open, so keeping everything eventually costs the
// ability to open the app rather than costing space.
eq('the choices are six and twelve months', RETENTION_CHOICES.map((c) => c.months), [6, 12]);
eq('a window from before they narrowed comes back in range', allowedRetention(24), 12);
eq('and so does "keep everything"', allowedRetention(null), 12);
eq('a valid one is left alone', allowedRetention(6), 6);

// --- where the money went
{
  const spend = (date: string, amount: number, category?: string): Activity => ({
    id: `s${date}${amount}`,
    type: 'withdraw',
    date,
    amount,
    distributions: [{ bankId: 'car', amount: -amount, percentage: 100 }],
    ...(category ? { category } : {}),
  });

  const month = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };
  const rows = spendingByCategory(
    [
      spend(at(2026, 9, 2), 30, 'food'),
      spend(at(2026, 9, 3), 10, 'food'),
      spend(at(2026, 9, 4), 60, 'transport'),
      spend(at(2026, 9, 4), 20), // before categories existed
      spend(at(2026, 8, 30), 999, 'food'), // another month
      deposit(at(2026, 9, 2), { car: 500 }), // not spending
    ],
    month,
    NOW
  );

  eq('largest first', rows.map((r) => r.key), ['transport', 'food', 'other']);
  eq('amounts are summed per category', rows.map((r) => r.cents), [6000, 4000, 2000]);
  eq('two entries under food', rows[1].entries, 2);
  eq('shares are whole percents of the period', rows.map((r) => r.share), [50, 33, 17]);
  // An entry from before categories existed must still be counted somewhere;
  // a total that quietly omits spending is worse than a large Other.
  eq('an uncategorised entry lands in Other', rows[2].cents, 2000);
  eq('another month is not counted', rows.reduce((s, r) => s + r.cents, 0), 12000);
  eq('nothing spent, nothing to show', spendingByCategory([], month, NOW), []);
}

report();
