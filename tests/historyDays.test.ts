import type { Activity, ActivityType } from '../types';
import { credited, dotsFor, groupByDay, inflow, monthDays, monthSummary, outflow, sharesCents, weekOf } from '../services/historyDays';
import { dayKey } from '../services/analytics';
import { eq, report } from './harness';

let n = 0;
const act = (
  type: ActivityType,
  date: Date,
  distributions: { bankId: string; amount: number }[],
  extra: Partial<Activity> = {}
): Activity => ({
  id: `a${++n}`,
  type,
  date: date.toISOString(),
  amount: Math.abs(distributions.reduce((s, d) => s + d.amount, 0)),
  distributions: distributions.map((d) => ({ ...d, percentage: 0 })),
  ...extra,
});

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);

// September 2026: a deposit, an auto-save, a spend and a pot move on the 5th; a trade on the 3rd.
const deposit = act('manual', at(2026, 9, 5, 9), [{ bankId: 'a', amount: 30 }, { bankId: 'b', amount: 20.5 }]);
const spend = act('withdraw', at(2026, 9, 5, 20), [{ bankId: 'a', amount: -12.35 }]);
const toPot = act('toInvest', at(2026, 9, 5, 21), [{ bankId: 'b', amount: -100 }]);
const buy = act('invest', at(2026, 9, 3), [{ bankId: 'a', amount: -200 }], { tradeId: 't1' });
const sell = act('divest', at(2026, 9, 3, 15), [{ bankId: 'a', amount: 250 }], { tradeId: 't2', repaid: 10 });
const fromPot = act('fromInvest', at(2026, 9, 2), [{ bankId: 'a', amount: 40 }]);
const moved = act('transfer', at(2026, 9, 1), [{ bankId: 'a', amount: 75 }], { fromGoal: 'Old' });
const auto = act('auto-save', at(2026, 9, 5, 7), [{ bankId: 'a', amount: 10 }]);
const loan = act('borrow', at(2026, 9, 8), [{ bankId: 'a', amount: -50 }], { loanId: 'l1' });
const august = act('manual', at(2026, 8, 31, 23), [{ bankId: 'a', amount: 99 }]);

// Newest first, as the app hands them over.
const ledger = [loan, toPot, spend, deposit, auto, buy, sell, fromPot, moved, august].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
);

// --- the figures per entry
eq('credited counts only money in', credited(deposit), 5050);
eq('inflow of a deposit', inflow(deposit), 5050);
eq('inflow ignores a sale, a transfer and a pot return', [inflow(sell), inflow(moved), inflow(fromPot)], [0, 0, 0]);
eq('outflow of a spend', outflow(spend), 1235);
eq('outflow ignores a purchase, a sale, a transfer and a pot move', [buy, sell, moved, toPot].map(outflow), [0, 0, 0, 0]);
eq('a borrow is outflow', outflow(loan), 5000);
eq('sharesCents of a purchase', sharesCents(buy), 20000);
eq('sharesCents of a sale includes spent ahead it covered', sharesCents(sell), 26000);
eq(
  'a sale smaller than its fees is negative',
  sharesCents(act('divest', at(2026, 9, 9), [{ bankId: 'a', amount: -3 }])),
  -300
);

// --- grouping
{
  const days = groupByDay(ledger, { year: 2026, month: 8 });
  eq('days newest first', days.map((d) => d.key), ['2026-09-08', '2026-09-05', '2026-09-03', '2026-09-02', '2026-09-01']);
  eq('keys are zero-padded and match analytics', days.every((d) => d.key === dayKey(d.date)), true);
  const fifth = days[1];
  eq('a day holds its entries newest first', fifth.entries.map((a) => a.id), [toPot.id, spend.id, deposit.id, auto.id].sort(
    (x, y) => {
      const byId = new Map([toPot, spend, deposit, auto].map((a) => [a.id, new Date(a.date).getTime()]));
      return byId.get(y)! - byId.get(x)!;
    }
  ));
  eq('saved sums deposits and auto-saves', fifth.saved, 5050 + 1000);
  eq('spent sums spends only', fifth.spent, 1235);
  eq('a pot move is shares out, not spent', fifth.sharesOut, 10000);
  eq('the day date is local midnight', [fifth.date.getHours(), fifth.date.getDate()], [0, 5]);
  const third = days[2];
  eq('a purchase and its sale on one day', [third.sharesOut, third.sharesIn, third.saved, third.spent], [20000, 26000, 0, 0]);
  eq('a day with a borrow', [days[0].borrowed, days[0].spent], [5000, 5000]);
  eq('a pot return is shares in', days[3].sharesIn, 4000);
  eq('a transfer is nothing but an entry', [days[4].saved, days[4].spent, days[4].sharesIn, days[4].sharesOut], [0, 0, 0, 0]);
  eq('another month is left out', days.some((d) => d.key === '2026-08-31'), false);
}
eq('without a month everything is grouped', groupByDay(ledger).length, 6);
eq('a month with no records has no days', groupByDay(ledger, { year: 2026, month: 3 }), []);
eq('two times of day share a key', groupByDay([auto, deposit]).length, 1);
eq(
  'a single-digit month and day are padded',
  groupByDay([act('manual', at(2026, 1, 2), [{ bankId: 'a', amount: 1 }])])[0].key,
  '2026-01-02'
);
eq(
  'a deposit shows what it cleared of debt',
  groupByDay([act('manual', at(2026, 9, 10), [{ bankId: 'a', amount: 40 }], { repaid: 10 })])[0].repaid,
  1000
);

// --- dots
{
  const days = groupByDay(ledger, { year: 2026, month: 8 });
  const dots = (key: string) => dotsFor(days.find((d) => d.key === key)!);
  eq('deposit and spend and pot move', dots('2026-09-05'), { in: true, out: true, invest: true });
  eq('a borrow is out', dots('2026-09-08'), { in: false, out: true, invest: false });
  eq('a trade is invest, not in or out', dots('2026-09-03'), { in: false, out: false, invest: true });
  eq('a pot return is invest', dots('2026-09-02'), { in: false, out: false, invest: true });
  eq('a transfer between goals has no dot', dots('2026-09-01'), { in: false, out: false, invest: false });
  eq('an auto-save alone is in', dotsFor(groupByDay([auto])[0]), { in: true, out: false, invest: false });
}

// --- month summary
{
  const s = monthSummary(ledger, 2026, 8);
  eq('in is deposits and auto-saves', s.inCents, 5050 + 1000);
  eq('out is the spend and the borrow, never the pot or a purchase', s.outCents, 1235 + 5000);
  eq('moved is shares and pot in, less what came back', s.movedCents, 10000 + 20000 - 26000 - 4000);
  eq('last month is separate', monthSummary(ledger, 2026, 7), { inCents: 9900, outCents: 0, movedCents: 0 });
  eq('a month with no records', monthSummary(ledger, 2026, 2), { inCents: 0, outCents: 0, movedCents: 0 });
  eq('moving to the pot alone is not spending', monthSummary([toPot], 2026, 8), { inCents: 0, outCents: 0, movedCents: 10000 });
  eq('the year matters', monthSummary(ledger, 2025, 8).inCents, 0);
}

// --- weeks and months
const keys = (ds: Date[]) => ds.map(dayKey);
eq('a week starts on Sunday', keys(weekOf(at(2026, 9, 9))), [
  '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12',
]);
eq('a Sunday starts its own week', weekOf(at(2026, 9, 6))[0].getDate(), 6);
eq('a Saturday ends its week', dayKey(weekOf(at(2026, 9, 12))[6]), '2026-09-12');
eq('a week crossing a month end', keys(weekOf(at(2026, 9, 1))), [
  '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
]);
eq('a week crossing a year end', keys(weekOf(at(2026, 1, 1))), [
  '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03',
]);
eq('week days are local midnight', weekOf(at(2026, 9, 9, 18)).every((d) => d.getHours() === 0), true);
eq('a week has seven days', weekOf(new Date()).length, 7);

{
  const sep = monthDays(2026, 8);
  const real = sep.flat().filter((d): d is Date => d !== null);
  eq('six rows of seven', [sep.length, sep.every((r) => r.length === 7)], [6, true]);
  // 1 Sept 2026 is a Tuesday: two blanks lead.
  eq('blanks lead the first row', sep[0].map((d) => (d ? d.getDate() : null)), [null, null, 1, 2, 3, 4, 5]);
  eq('real days are dates in that month', real.every((d) => d.getMonth() === 8 && d.getFullYear() === 2026), true);
  eq('30 days in September', real.length, 30);
  eq('a short month still has six rows', monthDays(2026, 1).length, 6);
  eq('keys line up with grouping', dayKey(sep[1][2]!), '2026-09-08');
}

report();
