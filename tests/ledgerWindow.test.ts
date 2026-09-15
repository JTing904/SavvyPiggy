import type { Activity } from '../types';
import { retentionCutoff, streakRun } from '../services/analytics';
import { staleAlertsCutoff, streakAlertFor } from '../services/alerts';
import {
  coveringRows,
  historyNeedsFrom,
  knownStreak,
  liveWindowStart,
  mergeLedger,
  olderNeed,
  parseStreakMemory,
  reportNeedsFrom,
} from '../services/ledgerWindow';
import { OlderLedger } from '../services/olderLedger';
import { eq, report } from './harness';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const deposit = (date: Date, id = date.toISOString()): Activity => ({
  id,
  type: 'manual',
  date: date.toISOString(),
  amount: 1,
  distributions: [{ bankId: 'car', amount: 1, percentage: 100 }],
});
const daily = (from: Date, to: Date, skip: string[] = []) => {
  const out: Activity[] = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!skip.includes(key)) out.push(deposit(d));
  }
  return out.reverse();
};
const ms = (d: Date | null) => (d ? d.getTime() : null);

// Tuesday 15 Sep 2026, evening.
const NOW = day(2026, 9, 15, 20);
const LIVE = liveWindowStart(NOW);
const KEPT12 = retentionCutoff(NOW, 12);
const KEPT6 = retentionCutoff(NOW, 6);

// --- the live window
eq('live window: this month and the two before, from the 1st', ms(LIVE), ms(new Date(2026, 6, 1)));
eq('live window crosses a year', ms(liveWindowStart(day(2026, 1, 10))), ms(new Date(2025, 10, 1)));
eq('live window on the 1st at midnight', ms(liveWindowStart(new Date(2026, 8, 1, 0, 0))), ms(new Date(2026, 6, 1)));
eq('always inside the shortest kept window', LIVE > KEPT6, true);

// --- what each screen needs
eq('nothing needed inside the live window', olderNeed(new Date(2026, 7, 1), LIVE, KEPT12), null);
eq('a need is clamped to what is kept', ms(olderNeed(new Date(2020, 0, 1), LIVE, KEPT6)), ms(KEPT6));
eq('report week and month stay live', [reportNeedsFrom('week', NOW, LIVE, KEPT12), reportNeedsFrom('month', NOW, LIVE, KEPT12)], [null, null]);
eq('report quarter needs the quarter before, for its comparison', ms(reportNeedsFrom('quarter', NOW, LIVE, KEPT12)), ms(new Date(2026, 3, 1)));
eq('report year reaches last January, clamped to the kept window', ms(reportNeedsFrom('year', NOW, LIVE, KEPT12)), ms(KEPT12));
eq('report year with six months kept', ms(reportNeedsFrom('year', NOW, LIVE, KEPT6)), ms(KEPT6));
eq('report all is everything kept', ms(reportNeedsFrom('all', NOW, LIVE, KEPT12)), ms(KEPT12));
eq('a quarter viewed in its first month still reaches the quarter before',
  ms(reportNeedsFrom('quarter', day(2026, 7, 5), liveWindowStart(day(2026, 7, 5)), KEPT12)), ms(new Date(2026, 3, 1)));
eq('history: the oldest live month needs the month before', ms(historyNeedsFrom(new Date(2026, 6, 1), LIVE, KEPT12)), ms(new Date(2026, 5, 1)));
eq('history: a newer month needs nothing', historyNeedsFrom(new Date(2026, 7, 1), LIVE, KEPT12), null);

// --- merging
{
  const live = [deposit(day(2026, 9, 2), 'a'), deposit(day(2026, 7, 1, 0), 'b')];
  const older = [deposit(day(2026, 5, 3), 'c'), deposit(day(2026, 6, 30), 'd'), deposit(day(2026, 6, 30), 'b'), deposit(day(2025, 8, 31), 'old')];
  eq('older rows follow the live ones, newest first, past-the-window rows and duplicates left out',
    mergeLedger(live, older, KEPT12).map((a) => a.id), ['a', 'b', 'd', 'c']);
  eq('no older rows: the live array itself', mergeLedger(live, [], KEPT12) === live, true);
}

// --- streaks: a 100-day run ending today, with only three months live
{
  const all = daily(day(2026, 6, 8), day(2026, 9, 15));
  const live = all.filter((a) => a.date >= LIVE.toISOString());
  const truth = streakRun(all, NOW, KEPT12);
  eq('the true run', [truth.days, truth.capped], [100, false]);

  const cold = knownStreak(live, NOW, LIVE, KEPT12, null);
  eq('live only, nothing remembered: capped, and asks for the older ledger', [cold.run.days, cold.run.capped, cold.needsOlder], [77, true, true]);
  eq('no card from a run that cannot be counted', streakAlertFor(cold.run, [], NOW), null);

  const loaded = knownStreak(all, NOW, KEPT12, KEPT12, null);
  eq('everything kept loaded: the true run, remembered', [loaded.run.days, loaded.run.capped, loaded.needsOlder, loaded.memory],
    [100, false, false, { first: '2026-06-08', last: '2026-09-15' }]);

  const remembered = knownStreak(live, NOW, LIVE, KEPT12, { first: '2026-06-08', last: '2026-09-14' });
  eq('yesterday\'s memory bridges the window: the true run without reading', [remembered.run.days, remembered.run.capped, remembered.needsOlder],
    [truth.days, false, false]);
  eq('and the 100-day card fires on the day it always did', streakAlertFor(remembered.run, [], NOW)?.id, streakAlertFor(truth, [], NOW)?.id);
  eq('memory moves forward', remembered.memory, { first: '2026-06-08', last: '2026-09-15' });

  eq('a memory that stops short of the window does not bridge',
    knownStreak(live, NOW, LIVE, KEPT12, { first: '2026-06-08', last: '2026-06-20' }).needsOlder, true);
  eq('a memory starting inside the live run is no help',
    knownStreak(live, NOW, LIVE, KEPT12, { first: '2026-07-01', last: '2026-09-14' }).needsOlder, true);

  const pruned = knownStreak(live, NOW, LIVE, new Date(2026, 5, 10), { first: '2026-06-01', last: '2026-09-14' });
  eq('never counted past the kept window, and then capped as before', [pruned.run.days, pruned.run.capped], [98, true]);

  const broken = daily(day(2026, 7, 1), day(2026, 9, 15), ['2026-08-10']);
  const fresh = knownStreak(broken, NOW, LIVE, KEPT12, { first: '2026-06-08', last: '2026-09-14' });
  eq('a gap inside the live window wins over memory', [fresh.run.days, fresh.run.capped, fresh.needsOlder, fresh.memory],
    [36, false, false, { first: '2026-08-11', last: '2026-09-15' }]);

  eq('no run forgets', knownStreak([], NOW, LIVE, KEPT12, { first: '2026-06-08', last: '2026-09-14' }).memory, null);
  eq('memory parsing is strict', [parseStreakMemory('{"first":"2026-06-08","last":"2026-09-14"}'), parseStreakMemory('{"first":"x"}'), parseStreakMemory('nope'), parseStreakMemory(null)],
    [{ first: '2026-06-08', last: '2026-09-14' }, null, null, null]);
}

eq('alert sweep cutoff is 90 days before today', ms(staleAlertsCutoff(NOW)), ms(new Date(2026, 5, 17)));

// --- the on-demand store
const settle = () => new Promise((r) => setTimeout(r, 5));
const iso = (d: Date) => d.toISOString().slice(0, 10);

{
  const rows = [deposit(day(2026, 3, 5), 'mar'), deposit(day(2026, 4, 5), 'apr'), deposit(day(2026, 6, 5), 'jun'), deposit(day(2026, 6, 30, 23), 'jun30')];
  const calls: string[] = [];
  let failing = false;
  const store = new OlderLedger(LIVE, async (from, to) => {
    calls.push(`${iso(from)}..${iso(to)}`);
    if (failing) throw new Error('offline');
    return rows.filter((r) => r.date >= from.toISOString() && r.date < to.toISOString());
  });

  eq('nothing loaded: only the live window is ready', [store.status(null), store.status(LIVE), store.status(new Date(2026, 5, 1))], ['ready', 'ready', 'loading']);

  store.need(new Date(2026, 5, 1));
  store.need(new Date(2026, 3, 1));
  await settle();
  eq('a second, earlier need while reading extends it without re-reading', calls, [`${iso(new Date(2026, 5, 1))}..${iso(LIVE)}`, `${iso(new Date(2026, 3, 1))}..${iso(new Date(2026, 5, 1))}`]);
  eq('rows from both stretches', store.list.map((a) => a.id).sort(), ['apr', 'jun', 'jun30']);
  eq('covered from April', [store.status(new Date(2026, 3, 1)), ms(store.loadedFrom)], ['ready', ms(new Date(2026, 3, 1))]);

  store.need(new Date(2026, 4, 1));
  await settle();
  eq('a stretch already read is never read again', calls.length, 2);

  failing = true;
  store.need(new Date(2026, 2, 1));
  await settle();
  eq('a failed read says so', store.status(new Date(2026, 2, 1)), 'failed');
  store.need(new Date(2026, 2, 1));
  await settle();
  eq('and is not retried on its own', calls.length, 3);
  failing = false;
  store.retry();
  await settle();
  eq('retry reads it', [calls.length, store.status(new Date(2026, 2, 1)), store.has('mar')], [4, 'ready', true]);

  store.patch('apr', { ...rows[1], amount: 5 });
  eq('a row changed on this phone is patched', store.list.find((a) => a.id === 'apr')?.amount, 5);
  store.patch('apr', null);
  eq('a deleted row goes', store.has('apr'), false);
  store.patch('jun', { ...rows[2], date: day(2026, 9, 1).toISOString() });
  eq('a row that moved into the live window leaves the older ledger', store.has('jun'), false);
  const before = store.version;
  eq('an unknown row changes nothing', [store.patch('never-loaded', null), store.version], [false, before]);

  // A back-dated row written after its stretch was read (a catch-up deposit).
  eq('a new row inside what is loaded is taken in', [store.patch('late', deposit(day(2026, 5, 20), 'late')), store.has('late')], [true, true]);
  eq('a new row older than what is loaded is not', [store.patch('ancient', deposit(day(2026, 1, 5), 'ancient')), store.has('ancient')], [false, false]);
  eq('a new row in the live window is not', [store.patch('now', deposit(day(2026, 9, 2), 'now')), store.has('now')], [false, false]);
}

{
  const fresh = new OlderLedger(LIVE, async () => []);
  eq('nothing older read yet', [fresh.hasOlder, fresh.patch('x', deposit(day(2026, 5, 20), 'x')), fresh.has('x')], [false, false, false]);
}

// --- deposits that covered a spent ahead
{
  const loan = { id: 'L', amount: 30, outstanding: 5, note: '', sources: [], createdAt: 0, settledAt: null };
  const paid = (id: string, amounts: [string, number][]): Activity => ({
    ...deposit(day(2026, 8, 1), id),
    repayments: amounts.map(([loanId, amount]) => ({ loanId, amount })),
  });
  const rows = [paid('a', [['L', 10.1]]), paid('b', [['L', 14.9], ['M', 3]]), paid('c', [['M', 7]]), deposit(day(2026, 8, 2), 'd')];
  const found = coveringRows('L', loan, rows);
  eq('covering rows are the ones that repaid this debt', found.rows.map((a) => a.id), ['a', 'b']);
  eq('complete when they add up to what was covered', found.complete, true);
  eq('incomplete when one is missing', coveringRows('L', loan, rows.slice(1)).complete, false);
  eq('incomplete with the debt unknown', coveringRows('L', undefined, rows).complete, false);
  eq('nothing covered needs nothing', coveringRows('L', { ...loan, outstanding: 30 }, []).complete, true);
}

report();
