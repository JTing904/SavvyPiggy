import type { Activity, PiggyBank } from '../types';
import {
  amountText,
  buildActivityEdit,
  buildPotEdit,
  composeDate,
  dateChanged,
  formFromActivity,
  goalPreview,
  hasChanges,
  clearedOverdraft,
  landedLines,
  pickableGoals,
  sourceOf,
  timeOf,
  dayOf,
} from '../services/entryFields';
import { cursorForMonth, monthCellState, shiftDay, shiftMonth, yearRange } from '../services/monthCells';
import { eq, report } from './harness';

const at = (y: number, m: number, d: number, h = 12, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s);

const bank = (id: string, name: string, amount: number, archivedAt: number | null = null): PiggyBank => ({
  id,
  name,
  targetAmount: 0,
  currentAmount: amount,
  splitPercentage: 50,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  archivedAt,
});

const spend: Activity = {
  id: 's1',
  type: 'withdraw',
  date: at(2026, 9, 13, 12, 40, 33).toISOString(),
  amount: 12,
  distributions: [{ bankId: 'wallet', amount: -12, percentage: 100 }],
  note: 'Lunch',
  category: 'food',
};
const deposit: Activity = {
  id: 'd1',
  type: 'manual',
  date: at(2026, 9, 15, 21, 41).toISOString(),
  amount: 1000,
  distributions: [
    { bankId: 'a', amount: 600, percentage: 60 },
    { bankId: 'b', amount: 400, percentage: 40 },
  ],
};
const toPot: Activity = {
  id: 'p1',
  type: 'toInvest',
  date: at(2026, 9, 14, 18, 56).toISOString(),
  amount: 400,
  distributions: [{ bankId: 'travel', amount: -400, percentage: 100 }],
};

/* ------------------------------------------------------------ the form */

{
  const form = formFromActivity(spend);
  eq('form starts from the row', form, {
    amount: '1200',
    day: '2026-09-13',
    time: '12:40',
    source: 'wallet',
    target: null,
    category: 'food',
    note: 'Lunch',
  });
  eq('an untouched form edits nothing', buildActivityEdit(spend, form), {});
  eq('an untouched form has no changes', hasChanges(buildActivityEdit(spend, form)), false);
}
eq('amount text is the cents, as the keypad types them', [amountText(12), amountText(12.5), amountText(0.07), amountText(1234.56)], ['1200', '1250', '7', '123456']);
eq('time and day of an instant', [timeOf(spend.date), dayOf(spend.date)], ['12:40', '2026-09-13']);
eq('compose drops seconds', composeDate('2026-09-13', '08:05').getTime(), at(2026, 9, 13, 8, 5).getTime());

/* ---------------------------------------------- only what changed is sent */

{
  const form = { ...formFromActivity(spend), amount: '1250' };
  eq('only the amount', buildActivityEdit(spend, form), { amount: 12.5 });
}
{
  const form = { ...formFromActivity(spend), day: '2026-09-12' };
  eq('only the date, time kept', buildActivityEdit(spend, form), { date: at(2026, 9, 12, 12, 40).toISOString() });
  eq('a moved day is a change', dateChanged(spend, form), true);
}
{
  const form = { ...formFromActivity(spend), time: '12:41' };
  eq('a time a minute on is a change', dateChanged(spend, form), true);
  const same = formFromActivity(spend);
  eq('seconds never make a change', dateChanged(spend, same), false);
}
{
  const form = { ...formFromActivity(spend), category: 'transport', note: '  Taxi ' };
  eq('category and a trimmed note', buildActivityEdit(spend, form), { note: 'Taxi', category: 'transport' });
}
{
  const form = { ...formFromActivity(spend), note: 'Lunch  ' };
  eq('trailing spaces on the same note are not a change', buildActivityEdit(spend, form), {});
}
{
  const form = { ...formFromActivity(spend), source: 'bank2' };
  eq('a new source goal', buildActivityEdit(spend, form), { source: 'bank2' });
  eq('the same source is not sent', buildActivityEdit(spend, { ...form, source: 'wallet' }), {});
}
{
  const form = { ...formFromActivity(spend), amount: '' };
  eq('an emptied amount is sent as zero for the planner to refuse', buildActivityEdit(spend, form), { amount: 0 });
}
{
  const form = { ...formFromActivity(spend), amount: '1200' };
  eq('1200 cents is still RM12', buildActivityEdit(spend, form), {});
}

/* ------------------------------------------------------------- deposits */

{
  const form = formFromActivity(deposit);
  eq('a deposit sends no target until one is picked', buildActivityEdit(deposit, form), {});
  eq('splitting', buildActivityEdit(deposit, { ...form, target: { mode: 'split' } }), { target: { mode: 'split' } });
  eq(
    'one goal',
    buildActivityEdit(deposit, { ...form, amount: '80000', target: { mode: 'goal', goalId: 'b' } }),
    { amount: 800, target: { mode: 'goal', goalId: 'b' } }
  );
  const auto: Activity = { ...deposit, type: 'auto-save' };
  eq('an auto-save takes a target too', buildActivityEdit(auto, { ...form, target: { mode: 'split' } }), { target: { mode: 'split' } });
}
{
  // A spend must never carry a target, and a deposit never a category or source.
  const wrongSpend = { ...formFromActivity(spend), target: { mode: 'split' } as const };
  eq('a spend ignores a target', buildActivityEdit(spend, wrongSpend), {});
  const wrongDeposit = { ...formFromActivity(deposit), category: 'travel', source: 'a' };
  eq('a deposit ignores category and source', buildActivityEdit(deposit, wrongDeposit), {});
}
eq('a deposit over two goals has no single source', sourceOf(deposit), null);

/* ---------------------------------------------------------------- pot */

{
  const form = formFromActivity(toPot);
  eq('pot form source is the goal', form.source, 'travel');
  eq('nothing changed', buildPotEdit(toPot, form), {});
  eq('amount and goal', buildPotEdit(toPot, { ...form, amount: '35000', source: 'car' }), { amount: 350, goalId: 'car' });
  eq('date', buildPotEdit(toPot, { ...form, day: '2026-09-10' }), { date: at(2026, 9, 10, 18, 56).toISOString() });
  const back: Activity = { ...toPot, type: 'fromInvest', distributions: [{ bankId: 'travel', amount: 400, percentage: 100 }] };
  eq('a pot return keeps its goals', buildPotEdit(back, { ...formFromActivity(back), source: 'car' }), {});
}

/* ------------------------------------------------------------ previews */

{
  const banks = [bank('a', 'Travel', 100), bank('b', 'Car', 50.5), bank('c', 'Idle', 9), bank('d', 'Overspent', -3.25)];
  eq(
    'the biggest change first, with before and after',
    goalPreview({ b: -1250, a: 500, c: 0 }, banks),
    [
      { id: 'b', name: 'Car', beforeCents: 5050, afterCents: 3800, deltaCents: -1250 },
      { id: 'a', name: 'Travel', beforeCents: 10000, afterCents: 10500, deltaCents: 500 },
    ]
  );
  eq('a negative balance is signed correctly', goalPreview({ d: 100 }, banks)[0].beforeCents, -325);
  eq('goals that are gone are left out', goalPreview({ gone: 500 }, banks), []);
  eq('no deltas, no preview', goalPreview({}, banks), []);
}
{
  const banks = [bank('a', 'A', 1), bank('b', 'B', 1, 123), bank('c', 'C', 1)];
  eq('archived goals are not offered', pickableGoals(banks, null).map((b) => b.id), ['a', 'c']);
  eq('but the one the row uses stays', pickableGoals(banks, 'b').map((b) => b.id), ['a', 'b', 'c']);
}

/* ---------------------------------------------------- the month picker */

{
  const now = at(2026, 9, 15);
  const liveFrom = new Date(2026, 6, 1); // July: three live months
  const keptFrom = new Date(2026, 1, 10); // pruning keeps from 10 Feb
  const s = (month: number, loadedFrom?: Date) => monthCellState(2026, month, keptFrom, liveFrom, now, loadedFrom);

  eq('January is wholly before the cutoff', s(0), 'cleared');
  eq('the month holding the cutoff is partly kept, so it can be read', s(1), 'load');
  eq('March to June need a read', [s(2), s(3), s(4), s(5)], ['load', 'load', 'load', 'load']);
  eq('the live window is instant', [s(6), s(7), s(8)], ['live', 'live', 'live']);
  eq('later months are future', [s(9), s(10), s(11)], ['future', 'future', 'future']);
  eq('a month read this session is instant', [s(4, new Date(2026, 4, 1)), s(3, new Date(2026, 4, 1))], ['live', 'load']);
  eq('a read that reached the cutoff covers the kept part of February', s(1, keptFrom), 'live');
  eq('earlier years are cleared when before the cutoff', monthCellState(2025, 11, keptFrom, liveFrom, now), 'cleared');
  eq('a cutoff exactly at a month start clears the month before it', monthCellState(2026, 0, new Date(2026, 1, 1), liveFrom, now), 'cleared');
  eq('and keeps that month', monthCellState(2026, 1, new Date(2026, 1, 1), liveFrom, now), 'load');
  eq('next year is all future', monthCellState(2027, 0, keptFrom, liveFrom, now), 'future');
  eq('the year range', yearRange(keptFrom, now), { min: 2026, max: 2026 });
  eq('the year range spans a cutoff in the past', yearRange(new Date(2025, 10, 1), now), { min: 2025, max: 2026 });
}

/* ---------------------------------------------------------- the cursor */

{
  const now = at(2026, 9, 15, 20);
  eq('the current month lands on today', cursorForMonth(2026, 8, now).getTime(), at(2026, 9, 15, 0).getTime());
  eq('another month lands on its first', cursorForMonth(2026, 5, now).getTime(), at(2026, 6, 1, 0).getTime());
  eq('a day on', shiftDay(at(2026, 9, 30, 15), 1).getTime(), at(2026, 10, 1, 0).getTime());
  eq('a week back over a year end', shiftDay(at(2026, 1, 3), -7).getTime(), at(2025, 12, 27, 0).getTime());
  eq('a month back clamps the day', shiftMonth(at(2026, 3, 31), -1).getTime(), at(2026, 2, 28, 0).getTime());
  eq('a month on rolls the year', shiftMonth(at(2026, 12, 15), 1).getTime(), at(2027, 1, 15, 0).getTime());
}

{
  const split: Activity = {
    ...deposit,
    amount: 0.22,
    distributions: [
      { bankId: 'car', amount: 0.08, percentage: 30 },
      { bankId: 'trip', amount: 0.01, percentage: 5 },
      { bankId: 'none', amount: 0, percentage: 5 },
    ],
  };
  eq('each goal shows what it really got', landedLines(split), [
    { bankId: 'car', cents: 8, percentage: 30 },
    { bankId: 'trip', cents: 1, percentage: 5 },
  ]);
  eq('money kept in the wallet is listed last', landedLines({ ...split, distributions: [{ bankId: 'car', amount: 87.5, percentage: 100 }], wallet: 12.5 }), [
    { bankId: 'car', cents: 8750, percentage: 100 },
    { bankId: null, cents: 1250, percentage: 0 },
  ]);
  eq('a spend out of the wallet lists nothing', landedLines({ ...split, distributions: [], wallet: -5 }), []);
  const mixed: Activity = {
    ...split,
    amount: 20,
    distributions: [
      { bankId: 'car', amount: 1.01, percentage: 15 },
      { bankId: 'inv', amount: 1.41, percentage: 20 },
      { bankId: 'soc', amount: 1.35, percentage: 20 },
      { bankId: 'gift', amount: 0.33, percentage: 5 },
      { bankId: 'web', amount: 0.67, percentage: 10 },
      { bankId: 'fix', amount: 1.01, percentage: 15 },
      { bankId: 'em', amount: 0.67, percentage: 10 },
      { bankId: 'trip', amount: 0.33, percentage: 5 },
    ],
    wallet: 13.22,
  };
  eq('largest first, the wallet last', landedLines(mixed).map((l) => l.bankId), ['inv', 'soc', 'car', 'fix', 'web', 'em', 'gift', 'trip', null]);
  eq('every share used: the wallet part cleared an overdraft', clearedOverdraft(mixed), true);
  eq('shares under 100%: it may be the unsplit part', clearedOverdraft({ ...mixed, distributions: mixed.distributions.slice(1) }), false);
  eq('kept in the wallet is not an overdraft', clearedOverdraft({ ...mixed, distributions: [] }), false);
}

report();
