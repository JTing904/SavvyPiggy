import { buyInto, sellFrom, tradeTotalCents, replay } from '../services/holdings';
import { planTradeMoney, type TradeMoneyInput } from '../services/tradeMoney';
import type { Activity, Loan, PiggyBank, Trade } from '../types';
import { eq, report } from './harness';

const bank = (id: string, pct: number, balance: number): PiggyBank => ({
  id,
  name: id,
  targetAmount: 0,
  currentAmount: balance,
  splitPercentage: pct,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
});

const loan = (id: string, outstanding: number): Loan => ({
  id,
  amount: outstanding,
  outstanding,
  note: '',
  sources: [],
  createdAt: 0,
  settledAt: null,
});

const BANKS = [bank('stocks', 50, 1500), bank('car', 50, 2000)];
const FEES = { brokerageCents: 800, clearingCents: 32, stampCents: 200, sstCents: 0 };

const buy = (money: Trade['money'], extra: Partial<Trade> = {}): Trade => ({
  id: 't1',
  symbol: '1155.KL',
  name: 'MAYBANK',
  kind: 'buy',
  units: 100,
  priceCents: 1060,
  tradedAt: 0,
  createdAt: 0,
  fees: FEES,
  money,
  ...extra,
});

const run = (input: Partial<TradeMoneyInput>) =>
  planTradeMoney({ previous: null, next: null, banks: BANKS, loans: [], overflow: false, ...input });

const plan = (input: Partial<TradeMoneyInput>) => {
  const out = run(input);
  if ('problem' in out) throw new Error('unexpected problem: ' + out.problem.kind);
  return out.plan;
};

// --- the holdings side: fees are part of what a position cost

eq('the contract note: a buy moves RM1,070.32', tradeTotalCents(buy({ mode: 'none' })), 107_032);
eq('fees raise the average: 100 units costing RM1,070.32', replay([buy({ mode: 'none' })]), { units: 100, costCents: 107_032 });
eq('an older trade with no fees recorded is not given any', tradeTotalCents(buy(undefined, { fees: undefined })), 106_000);
eq('half-sen prices: 1,000 units of RM0.345', tradeTotalCents(buy(undefined, { units: 1000, priceCents: 34, pricePoints: 3450, fees: undefined })), 34_500);
{
  const held = buyInto({ units: 0, costCents: 0 }, 100, 107_032);
  eq('a sale counts only what came home after fees', sellFrom(held, 100, 109_000 - 1_033).realisedCents, 109_000 - 1_033 - 107_032);
}

// --- recording a buy

{
  const p = plan({ next: { kind: 'buy', totalCents: 107_032, choice: { mode: 'goal', goalId: 'stocks' }, counter: 'MAYBANK', units: 100 } });
  eq('a buy from a goal takes exactly its total from that goal', p.bankDeltas, { stocks: -107_032 });
  eq('and writes one History row', p.activity.write, 'create');
  eq('the row is an investment of RM1,070.32', p.activity.write === 'create' ? [p.activity.draft.type, p.activity.draft.amount] : null, ['invest', 1070.32]);
}

eq(
  'a buy bigger than the goal is refused, and says what is there',
  run({ next: { kind: 'buy', totalCents: 200_000, choice: { mode: 'goal', goalId: 'stocks' }, counter: 'MAYBANK', units: 100 } }),
  { problem: { kind: 'insufficient', goalId: 'stocks', availableCents: 150_000, neededCents: 200_000 } }
);

{
  const p = plan({ next: { kind: 'buy', totalCents: 107_032, choice: { mode: 'none' }, counter: 'MAYBANK', units: 100 } });
  eq('not from a goal: no goal moves', p.bankDeltas, {});
  eq('not from a goal: no History row', p.activity.write, 'none');
  eq('not from a goal: the trade says so', p.money, { mode: 'none' });
}

// --- correcting a buy

const invested = (amount: number, goalId = 'stocks'): Activity => ({
  id: 'a1',
  type: 'invest',
  date: '2026-09-13T00:00:00.000Z',
  amount,
  distributions: [{ bankId: goalId, amount: -amount, percentage: 100 }],
  tradeId: 't1',
});

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'a1' }), activity: invested(1070.32) };
  const p = plan({ previous, next: { kind: 'buy', totalCents: 108_032, choice: { mode: 'goal', goalId: 'stocks' }, counter: 'MAYBANK', units: 100 } });
  eq('a RM10 correction moves the goal by RM10, not by the whole trade', p.bankDeltas, { stocks: -1_000 });
  eq('and rewrites the same row rather than adding one', p.activity.write === 'update' ? p.activity.id : null, 'a1');
}

{
  // The goal holds RM1,500 now, after the first buy already took RM1,070.32.
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'a1' }), activity: invested(1070.32) };
  const p = run({ previous, next: { kind: 'buy', totalCents: 260_000, choice: { mode: 'goal', goalId: 'stocks' }, counter: 'MAYBANK', units: 100 } });
  eq('a correction may use what the trade itself put back', 'problem' in p ? p.problem : null, {
    kind: 'insufficient',
    goalId: 'stocks',
    availableCents: 150_000 + 107_032,
    neededCents: 260_000,
  });
}

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'a1' }), activity: invested(1070.32) };
  const p = plan({ previous, next: { kind: 'buy', totalCents: 107_032, choice: { mode: 'goal', goalId: 'car' }, counter: 'MAYBANK', units: 100 } });
  eq('switching goals refunds one and charges the other', p.bankDeltas, { stocks: 107_032, car: -107_032 });
}

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'a1' }), activity: invested(1070.32) };
  const p = plan({ previous, next: { kind: 'buy', totalCents: 107_032, choice: { mode: 'none' }, counter: 'MAYBANK', units: 100 } });
  eq('switching to "not from a goal" refunds it all', p.bankDeltas, { stocks: 107_032 });
  eq('and removes the row', p.activity, { write: 'delete', id: 'a1' });
}

// --- deleting

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'a1' }), activity: invested(1070.32) };
  const p = plan({ previous });
  eq('deleting a buy puts its money back', p.bankDeltas, { stocks: 107_032 });
  eq('and removes its row', p.activity, { write: 'delete', id: 'a1' });
}

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'gone', activityId: 'a1' }), activity: invested(1070.32, 'gone') };
  eq('a buy from a deleted goal asks where the money goes', run({ previous }), { problem: { kind: 'goalGone', cents: 107_032 } });
  eq('...into a goal', plan({ previous, refund: { mode: 'goal', goalId: 'car' } }).bankDeltas, { car: 107_032 });
  eq('...split', plan({ previous, refund: { mode: 'split' } }).bankDeltas, { stocks: 53_516, car: 53_516 });
  eq('...or nowhere', plan({ previous, refund: { mode: 'none' } }).bankDeltas, {});
}

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'a1' }), activity: null };
  eq('a buy whose History row was cleared is refunded from the trade itself', plan({ previous }).bankDeltas, { stocks: 107_032 });
}

// --- selling

{
  const loans = [loan('l1', 30)];
  const p = plan({ loans, next: { kind: 'sell', totalCents: 108_967, choice: { mode: 'split' }, counter: 'MAYBANK', units: 100 } });
  eq('auto split covers spent ahead first, like a deposit', p.loanDeltas, { l1: -3_000 });
  eq('and splits the rest', p.bankDeltas, { stocks: 52_984, car: 52_983 });
  eq('the split adds back up to the sale', 3_000 + 52_984 + 52_983, 108_967);
  eq('a settled debt is known to be settled', p.loanOutstanding, { l1: 0 });
}

{
  const p = plan({ loans: [loan('l1', 30)], next: { kind: 'sell', totalCents: 50_000, choice: { mode: 'goal', goalId: 'car' }, counter: 'MAYBANK', units: 50 } });
  eq('into one goal: all of it, debt untouched (an explicit choice, like a targeted deposit)', [p.bankDeltas, p.loanDeltas], [{ car: 50_000 }, {}]);
}

{
  const sold: Activity = {
    id: 'a2',
    type: 'divest',
    date: '2026-09-13T00:00:00.000Z',
    amount: 1089.67,
    distributions: [
      { bankId: 'stocks', amount: 529.84, percentage: 50 },
      { bankId: 'car', amount: 529.83, percentage: 50 },
    ],
    repaid: 30,
    repayments: [{ loanId: 'l1', amount: 30 }],
  };
  const trade: Trade = { ...buy({ mode: 'split', activityId: 'a2' }), kind: 'sell' };
  const loans = [loan('l1', 0)];
  const p = plan({ previous: { trade, activity: sold }, loans, next: { kind: 'sell', totalCents: 108_967 - 1_000, choice: { mode: 'split' }, counter: 'MAYBANK', units: 100 } });
  eq('correcting a split sale undoes the old split exactly and redoes it', p.bankDeltas, { stocks: -500, car: -500 });
  eq('the debt it covered is covered again, not twice', p.loanDeltas, {});
  eq('deleting a split sale when its row is gone is refused, not guessed', run({ previous: { trade, activity: null } }), { problem: { kind: 'rowGone' } });
}

{
  // The sale fed stocks and a goal since deleted, whose RM529.83 moved on with it.
  const sold: Activity = {
    id: 'a3',
    type: 'divest',
    date: '2026-09-13T00:00:00.000Z',
    amount: 1059.67,
    distributions: [
      { bankId: 'stocks', amount: 529.84, percentage: 50 },
      { bankId: 'temp', amount: 529.83, percentage: 50 },
    ],
  };
  const trade: Trade = { ...buy({ mode: 'split', activityId: 'a3' }), kind: 'sell' };
  const previous = { trade, activity: sold };
  eq('deleting a sale that fed a deleted goal asks where its share comes back from', run({ previous }), {
    problem: { kind: 'saleGoalGone', cents: 52_983 },
  });
  eq('...from a goal', plan({ previous, takeBack: { mode: 'goal', goalId: 'car' } }).bankDeltas, { stocks: -52_984, car: -52_983 });
  eq('...or not at all, for a goal that took its money with it', plan({ previous, takeBack: { mode: 'none' } }).bankDeltas, { stocks: -52_984 });
  eq('a goal that is not there cannot be the answer', run({ previous, takeBack: { mode: 'goal', goalId: 'temp' } }), {
    problem: { kind: 'saleGoalGone', cents: 52_983 },
  });
  const edited = plan({
    previous,
    takeBack: { mode: 'goal', goalId: 'car' },
    next: { kind: 'sell', totalCents: 105_967, choice: { mode: 'goal', goalId: 'stocks' }, counter: 'MAYBANK', units: 100 },
  });
  eq('correcting it asks the same, then lands the sale again', edited.bankDeltas, { stocks: 105_967 - 52_984, car: -52_983 });
}

// --- trades older than the loaded History

{
  const sale: Trade = { ...buy({ mode: 'goal', goalId: 'car', activityId: 'old' }), kind: 'sell' };
  const p = plan({ previous: { trade: sale, activity: null } });
  eq('a sale into one goal whose row is not loaded is undone from the trade itself', p.bankDeltas, { car: -104_968 });
  eq('and its row is removed by the id the trade kept', p.activity, { write: 'delete', id: 'old' });
}

{
  const previous = { trade: buy({ mode: 'goal', goalId: 'stocks', activityId: 'old' }), activity: null };
  const p = plan({ previous, next: { kind: 'buy', totalCents: 108_032, choice: { mode: 'goal', goalId: 'stocks' }, counter: 'MAYBANK', units: 100 } });
  eq('correcting a buy whose row is not loaded replaces that row instead of adding a second', p.activity.write === 'replace' ? p.activity.oldId : null, 'old');
  eq('and still moves the goal only by the difference', p.bankDeltas, { stocks: -1_000 });
}

// --- a sale worth less than its fees

{
  const tiny = { ...buy(undefined, { kind: 'sell', units: 10, priceCents: 50, fees: { brokerageCents: 800, clearingCents: 1, stampCents: 100, sstCents: 0 } }) };
  eq('RM5 of shares less RM9.01 of fees comes to -RM4.01', tradeTotalCents(tiny), -401);
  const next = { kind: 'sell' as const, totalCents: -401, counter: 'X', units: 10 };
  const p = plan({ next: { ...next, choice: { mode: 'goal', goalId: 'car' } } });
  eq('the shortfall comes out of the chosen goal', p.bankDeltas, { car: -401 });
  eq('and its row says so, signed', p.activity.write === 'create' ? p.activity.draft.distributions : null, [{ bankId: 'car', amount: -4.01, percentage: 100 }]);
  eq('auto split cannot carry a cost', run({ next: { ...next, choice: { mode: 'split' } } }), { problem: { kind: 'saleBelowFees', cents: 401 } });
}

report();
