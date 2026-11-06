import { eq, report } from './harness';
import type { Loan, PiggyBank } from '../types';
import { cleanWallet, planIncome, planWalletMove, planWalletSpend, DEFAULT_WALLET } from '../services/wallet';

const bank = (id: string, split: number, current = 0, extra: Partial<PiggyBank> = {}): PiggyBank => ({
  id,
  name: id,
  icon: 'savings',
  imageUrl: '',
  targetAmount: 0,
  currentAmount: current,
  splitPercentage: split,
  isLocked: false,
  createdAt: 1,
  autoSplit: true,
  ...extra,
});

const loan = (id: string, outstanding: number, createdAt: number): Loan => ({
  id,
  amount: outstanding,
  outstanding,
  note: '',
  sources: [],
  createdAt,
  settledAt: null,
});

const goals = [bank('a', 60), bank('b', 40)];
const base = { banks: goals, loans: [] as Loan[], wallet: 0, overflow: false };

const income = (over: Partial<Parameters<typeof planIncome>[0]> & { amountCents: number; target: Parameters<typeof planIncome>[0]['target'] }) =>
  planIncome({ ...base, ...over });

const planOf = (r: ReturnType<typeof planIncome>) => ('plan' in r ? r.plan : null);

// --- defaults and cleaning
eq('default wallet is empty', DEFAULT_WALLET, { balance: 0 });
eq('a missing setting reads as the default', cleanWallet(undefined), { balance: 0 });
eq('an old goals share in the stored document is ignored', cleanWallet({ balance: 5, goalsPercent: 40 } as never), { balance: 5 });
eq('a negative balance is an overdraft and is kept', cleanWallet({ balance: -3 }), { balance: -3 });
eq('junk becomes the default', cleanWallet({ balance: NaN }), { balance: 0 });

// --- income by choice
{
  const p = planOf(income({ amountCents: 5000, target: { mode: 'wallet' } }));
  eq('keep in wallet puts all of it in the wallet', [p?.movements.length, p?.walletCents], [0, 5000]);
}
{
  const p = planOf(income({ amountCents: 10000, target: { mode: 'split' } }));
  eq('split sends it to the goals by their shares', p?.movements.map((m) => [m.bankId, m.cents]), [['a', 6000], ['b', 4000]]);
  eq('and nothing stays in the wallet', p?.walletCents, 0);
}
{
  const p = planOf(income({ amountCents: 1001, target: { mode: 'split' } }));
  eq('the odd sen stay in the wallet by default', [p?.movements.map((m) => [m.bankId, m.cents]), p?.walletCents, p?.leftoverCents, p?.unsplitCents], [[['a', 600], ['b', 400]], 1, 1, 0]);
  const toA = planOf(income({ amountCents: 1001, target: { mode: 'split' }, leftoverTo: 'a' }));
  eq('or go to the goal chosen for them', [toA?.movements.map((m) => [m.bankId, m.cents]), toA?.walletCents], [[['a', 601], ['b', 400]], 0]);
  const gone = planOf(income({ amountCents: 1001, target: { mode: 'split' }, leftoverTo: 'zzz' }));
  eq('a chosen goal no longer in the split leaves them in the wallet', gone?.walletCents, 1);
}
{
  const share = (id: string, percent: number) => ({ ...bank(id, percent), splitPercentage: percent });
  const p = planOf(planIncome({ ...base, banks: [share('a', 50), share('b', 30)], amountCents: 10005, target: { mode: 'split' } }));
  eq('shares under 100% and odd sen are told apart', [p?.movements.map((m) => [m.bankId, m.cents]), p?.unsplitCents, p?.leftoverCents, p?.walletCents], [[['a', 5002], ['b', 3001]], 2001, 1, 2002]);
  const tiny = planOf(planIncome({ ...base, banks: [share('a', 50), share('b', 50)], amountCents: 1, target: { mode: 'split' } }));
  eq('a single sen with goals in the split is kept, not refused', [tiny?.movements, tiny?.walletCents], [[], 1]);
}
{
  const p = planOf(income({ amountCents: 5000, target: { mode: 'goal', goalId: 'b' } }));
  eq('one named goal gets all of it', [p?.movements, p?.walletCents], [[{ bankId: 'b', cents: 5000, percentage: 100 }], 0]);
}
eq('a missing goal is refused', income({ amountCents: 100, target: { mode: 'goal', goalId: 'zzz' } }), { problem: 'goalGone' });
eq(
  'an archived goal is refused',
  planIncome({ ...base, banks: [bank('a', 100, 0, { archivedAt: 5 })], amountCents: 100, target: { mode: 'goal', goalId: 'a' } }),
  { problem: 'goalArchived' }
);
eq('zero is refused', income({ amountCents: 0, target: { mode: 'wallet' } }), { problem: 'amountPositive' });
eq(
  'a split with nowhere to go is refused, not parked in the wallet',
  planIncome({ ...base, banks: [bank('a', 0)], amountCents: 8000, target: { mode: 'split' } }),
  { problem: 'noDestination' }
);

// --- income never goes missing
{
  const share = (id: string, percent: number) => ({ ...bank(id, percent), splitPercentage: percent });
  const none = planOf(planIncome({ ...base, banks: [share('a', 0)], wallet: -5000, amountCents: 10000, target: { mode: 'split' } }));
  eq('no goal in the split: past the overdraft it stays in the wallet', [none?.movements, none?.coveredCents, none?.walletCents], [[], 5000, 10000]);
  const under = planOf(planIncome({ ...base, banks: [share('a', 80)], amountCents: 10000, target: { mode: 'split' } }));
  eq('shares under 100%: the rest stays in the wallet', [under?.movements.reduce((s, m) => s + m.cents, 0), under?.walletCents], [8000, 2000]);
  const fine = planOf(planIncome({ ...base, banks: [share('a', 100)], amountCents: 10000, target: { mode: 'split' } }));
  eq('a full split leaves nothing behind', fine?.walletCents, 0);
}

// --- overdraft and old debt
{
  const p = planOf(income({ amountCents: 10000, wallet: -2500, target: { mode: 'split' } }));
  eq('an overdraft is cleared first', p?.coveredCents, 2500);
  eq('the rest is split over the goals', p?.movements.reduce((s, m) => s + m.cents, 0), 7500);
  eq('clearing it counts as money into the wallet', p?.walletCents, 2500);
}
{
  const p = planOf(income({ amountCents: 1000, wallet: -2500, target: { mode: 'split' } }));
  eq('a small income only reduces the overdraft', [p?.coveredCents, p?.movements.length, p?.walletCents], [1000, 0, 1000]);
}
{
  const p = planOf(income({ amountCents: 10000, wallet: -2500, target: { mode: 'wallet' } }));
  eq('keep-in-wallet clears the overdraft, then keeps the rest', p?.walletCents, 10000);
}
{
  const p = planOf(income({ amountCents: 10000, loans: [loan('l1', 30, 1)], wallet: -2000, target: { mode: 'split' } }));
  eq('old debt is repaid before the overdraft', [p?.repaidCents, p?.coveredCents], [3000, 2000]);
  eq('and what is left is placed', p?.movements.reduce((s, m) => s + m.cents, 0), 5000);
}
{
  const p = planOf(income({ amountCents: 10000, loans: [loan('l1', 30, 1)], wallet: -2000, target: { mode: 'goal', goalId: 'a' } }));
  eq('a named goal skips both debt and overdraft', [p?.repaidCents, p?.coveredCents, p?.walletCents], [0, 0, 0]);
}
{
  const p = planOf(income({ amountCents: 2000, loans: [loan('l1', 30, 1)], target: { mode: 'split' } }));
  eq('an income smaller than the old debt only repays it', [p?.repaidCents, p?.movements.length, p?.walletCents], [2000, 0, 0]);
}

// --- spending
eq('spending from the wallet takes exactly the amount', planWalletSpend(1234), { walletCents: -1234 });
eq('spending nothing is refused', planWalletSpend(0), { problem: 'amountPositive' });

// --- moving by hand
{
  const r = planWalletMove({ amountCents: 3000, move: { direction: 'toGoals', target: { mode: 'split' } }, banks: goals, wallet: 5000, overflow: false });
  eq('wallet to goals by the split', 'plan' in r && [r.plan.movements.map((m) => m.cents), r.plan.walletCents], [[1800, 1200], -3000]);
}
{
  const r = planWalletMove({ amountCents: 3000, move: { direction: 'toGoals', target: { mode: 'goal', goalId: 'b' } }, banks: goals, wallet: 3000, overflow: false });
  eq('wallet to one goal, down to exactly zero', 'plan' in r && [r.plan.movements, r.plan.walletCents], [[{ bankId: 'b', cents: 3000, percentage: 100 }], -3000]);
}
eq(
  'moving more than the wallet holds is refused',
  planWalletMove({ amountCents: 3000, move: { direction: 'toGoals', target: { mode: 'split' } }, banks: goals, wallet: 2999, overflow: false }),
  { problem: 'walletShort', availableCents: 2999 }
);
eq(
  'an overdrawn wallet has nothing to move',
  planWalletMove({ amountCents: 100, move: { direction: 'toGoals', target: { mode: 'split' } }, banks: goals, wallet: -500, overflow: false }),
  { problem: 'walletShort', availableCents: 0 }
);
eq(
  'a split with no goal in it is refused rather than parked',
  planWalletMove({ amountCents: 100, move: { direction: 'toGoals', target: { mode: 'split' } }, banks: [bank('a', 0)], wallet: 500, overflow: false }),
  { problem: 'noDestination' }
);
{
  const r = planWalletMove({ amountCents: 2000, move: { direction: 'toWallet', goalId: 'a' }, banks: [bank('a', 60, 50)], wallet: 0, overflow: false });
  eq('goal to wallet', 'plan' in r && [r.plan.movements, r.plan.walletCents], [[{ bankId: 'a', cents: -2000, percentage: 100 }], 2000]);
}
eq(
  'a goal cannot give more than it holds',
  planWalletMove({ amountCents: 6000, move: { direction: 'toWallet', goalId: 'a' }, banks: [bank('a', 60, 50)], wallet: 0, overflow: false }),
  { problem: 'goalShort', availableCents: 5000 }
);

report();
