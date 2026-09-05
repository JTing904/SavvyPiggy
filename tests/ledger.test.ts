import {
  archiveStrategy,
  balanceCents,
  effectiveSplit,
  isFull,
  isInSplit,
  planDeposit,
  planWithdrawal,
  totalDebtCents,
} from '../services/ledger';
import type { Loan, PiggyBank } from '../types';
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

const loan = (id: string, outstanding: number, createdAt = 0): Loan => ({
  id,
  amount: outstanding,
  outstanding,
  note: '',
  sources: [],
  createdAt,
  settledAt: null,
});

const BANKS = [bank('vacation', 30, 24), bank('emergency', 50, 50), bank('tech', 20, 8)];
const net = (ms: { bankId: string; cents: number }[]) => ms.map((m) => [m.bankId, m.cents]);

// --- no debt: behaves exactly like the plain strategy split
{
  const plan = planDeposit(1000, BANKS, [], null);
  eq('no debt: nothing is repaid', plan.repaidCents, 0);
  eq('no debt: split by percentage', net(plan.movements), [
    ['vacation', 300],
    ['emergency', 500],
    ['tech', 200],
  ]);
}

// --- borrowed money is paid back out of the app, not into the goals
{
  const plan = planDeposit(300, BANKS, [loan('l1', 5)], null);
  eq('a deposit smaller than the debt repays all of it', plan.repaidCents, 300);
  eq('nothing reaches the goals', net(plan.movements), []);
}

{
  const plan = planDeposit(1200, BANKS, [loan('l1', 2)], null);
  eq('debt is settled first', plan.repaidCents, 200);
  eq('the remaining $10 is split 30/50/20', net(plan.movements), [
    ['vacation', 300],
    ['emergency', 500],
    ['tech', 200],
  ]);
  eq(
    'repayment plus the split accounts for the whole deposit',
    plan.repaidCents + plan.movements.reduce((sum, m) => sum + m.cents, 0),
    1200
  );
}

// --- oldest loan first
{
  const loans = [loan('newer', 3, 2000), loan('older', 2, 1000)];
  const plan = planDeposit(400, BANKS, loans, null);
  eq(
    'the older loan is cleared first',
    plan.repayments.map((r) => [r.loan.id, r.cents]),
    [
      ['older', 200],
      ['newer', 200],
    ]
  );
  eq('nothing is left to split', plan.splitMovements.length, 0);
}

// --- the indivisible cent from the request
{
  const plan = planDeposit(2, BANKS, [loan('l1', 0.01)], null);
  eq('1c clears the debt', plan.repaidCents, 1);
  eq('the leftover 1c goes to the highest-percentage goal', net(plan.splitMovements), [
    ['vacation', 0],
    ['emergency', 1],
    ['tech', 0],
  ]);
}

// --- a deposit aimed at one goal bypasses debt entirely
{
  const plan = planDeposit(5000, BANKS, [loan('l1', 100)], 'tech');
  eq('a targeted deposit repays nothing', plan.repaidCents, 0);
  eq('it all lands on the chosen goal', net(plan.movements), [['tech', 5000]]);
}

// --- spending, including past the balance
eq('a withdrawal is a single negative movement', net(planWithdrawal(500, 'emergency')), [
  ['emergency', -500],
]);

eq('overspending is allowed and is not capped at the balance', net(planWithdrawal(14234, 'tech')), [
  ['tech', -14234],
]);

eq('a zero withdrawal moves nothing', planWithdrawal(0, 'tech'), []);

// --- a goal already in the red still splits normally
{
  const inTheRed = [bank('vacation', 30, -40), bank('emergency', 50, 50), bank('tech', 20, 8)];
  const plan = planDeposit(1000, inTheRed, [], null);
  eq('a negative goal takes its usual share, no catch-up', net(plan.movements), [
    ['vacation', 300],
    ['emergency', 500],
    ['tech', 200],
  ]);
}

// --- overflow: a finished goal hands its share to the ones still saving
{
  const goal = (id: string, pct: number, balance: number, target: number) => ({
    ...bank(id, pct, balance),
    targetAmount: target,
  });
  // "emergency" is full; the other two are not.
  const mixed = [goal('vacation', 30, 24, 1000), goal('emergency', 50, 500, 500), goal('tech', 20, 8, 1000)];

  eq('a goal at its target is full', mixed.map(isFull), [false, true, false]);
  eq('overflow off: the full goal keeps taking its cut', net(planDeposit(1000, mixed, [], null).movements), [
    ['vacation', 300],
    ['emergency', 500],
    ['tech', 200],
  ]);

  const plan = planDeposit(1000, mixed, [], null, true);
  eq('overflow on: the full goal is skipped', net(plan.movements), [
    ['vacation', 600],
    ['tech', 400],
  ]);
  eq('the whole deposit is still placed', plan.movements.reduce((sum, m) => sum + m.cents, 0), 1000);
  eq('movements carry the share actually used', plan.movements.map((m) => m.percentage), [60, 40]);

  // 7 cents across 60/40 floors to 4 + 2, and the odd cent goes to the bigger share.
  eq('cents never round up', net(planDeposit(7, mixed, [], null, true).movements), [
    ['vacation', 5],
    ['tech', 2],
  ]);

  const under = [goal('vacation', 30, 24, 1000), goal('emergency', 30, 500, 500)];
  eq('a deliberately unallocated remainder stays unallocated', net(planDeposit(1000, under, [], null, true).movements), [
    ['vacation', 600],
  ]);

  const allFull = [goal('emergency', 50, 500, 500), goal('tech', 50, 900, 900)];
  eq('every goal full: the deposit still lands', net(planDeposit(1000, allFull, [], null, true).movements), [
    ['emergency', 500],
    ['tech', 500],
  ]);

  const openEnded = [goal('vacation', 50, 9999, 0), goal('emergency', 50, 500, 500)];
  eq('open-ended goals are never full', net(planDeposit(1000, openEnded, [], null, true).movements), [
    ['vacation', 1000],
  ]);

  eq('a goal aimed at directly is paid whatever the overflow says', net(planDeposit(1000, mixed, [], 'emergency', true).movements), [
    ['emergency', 1000],
  ]);

  eq('effective percentages', effectiveSplit(mixed, true).map((i) => [i.item.id, i.percentage]), [
    ['vacation', 60],
    ['tech', 40],
  ]);
}

// --- archiving hands the share on, and the goal leaves the split
{
  const archived = archiveStrategy(BANKS, 'vacation');
  eq('the archived goal stops taking a cut', [archived[0].splitPercentage, archived[0].autoSplit], [0, false]);
  // 30 points across 50/20: 21.4 -> 21 and 8.5 -> 8, the leftover point to the bigger.
  eq('its 30% is shared out, floored, remainder to the biggest', archived.map((b) => b.splitPercentage), [0, 72, 28]);
  eq('the strategy still adds up', archived.reduce((sum, b) => sum + b.splitPercentage, 0), 100);

  const solo = archiveStrategy([bank('only', 100, 5)], 'only');
  eq('nothing to hand to leaves the split empty', solo.map((b) => b.splitPercentage), [0]);

  eq('an archived goal is out of the split', isInSplit({ ...bank('x', 50, 1), archivedAt: Date.now() }), false);
  eq('an archived goal never receives a deposit', net(planDeposit(1000, [
    { ...bank('vacation', 30, 24), archivedAt: 1 },
    bank('emergency', 70, 50),
  ], [], null).movements), [['emergency', 700]]);
}

eq('balance of one goal', balanceCents(BANKS, 'vacation'), 2400);
eq('total debt across open loans', totalDebtCents([loan('a', 1.5), loan('b', 2.25)]), 375);

report();
