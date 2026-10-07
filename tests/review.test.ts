import { eq, report } from './harness';
import type { Activity } from '../types';
import { centsChange, monthFigures, pointsChange, rateSeries, savingsRate } from '../services/review';

let n = 0;
const act = (over: Partial<Activity> & Pick<Activity, 'type' | 'date' | 'amount'>): Activity => ({
  id: `a${++n}`,
  distributions: [],
  ...over,
});
const dist = (bankId: string, amount: number) => ({ bankId, amount, percentage: 100 });

const NOW = new Date(2026, 9, 20, 12);
const SEP = new Date(2026, 8, 1);
const sep = (day: number) => new Date(2026, 8, day, 12).toISOString();
const aug = (day: number) => new Date(2026, 7, day, 12).toISOString();

const ledger: Activity[] = [
  // income RM3,200: 400 straight into a goal, 2,800 kept in the wallet
  act({ type: 'manual', date: sep(1), amount: 3200, distributions: [dist('car', 400)], wallet: 2800 }),
  // 500 moved from the wallet into the goal
  act({ type: 'walletMove', date: sep(3), amount: 500, distributions: [dist('car', 500)], wallet: -500 }),
  // 130 spent out of the goal
  act({ type: 'withdraw', date: sep(5), amount: 130, distributions: [dist('car', -130)], category: 'shopping', note: 'headphones' }),
  // 1,000 of food from the wallet, 200 of it a bill that recorded itself
  act({ type: 'withdraw', date: sep(8), amount: 800, distributions: [], wallet: -800, category: 'food', note: 'meals' }),
  act({ type: 'withdraw', date: sep(9), amount: 200, distributions: [], wallet: -200, category: 'bills', note: 'Netflix', billId: 'b1', auto: true }),
  // 100 moved back to the wallet
  act({ type: 'walletMove', date: sep(12), amount: 100, distributions: [dist('car', -100)], wallet: 100 }),
  // not saving, not spending
  act({ type: 'toInvest', date: sep(14), amount: 300, distributions: [dist('car', -300)] }),
  act({ type: 'borrow', date: sep(15), amount: 50 }),
];

const f = monthFigures(ledger, SEP, NOW);
eq('income is what came in', f.incomeCents, 320000);
eq('spent is the wallet and the goals together', f.spentCents, 113000);
eq('put in: straight in plus moved in from the wallet', f.putInCents, 90000);
eq('taken out: spent from a goal plus moved back to the wallet', f.takenOutCents, 13000 + 10000);
eq('saved is put in less taken out', f.savedCents, 67000);
eq('the rate is saved over income', f.rate, 21);
eq('the wallet change is every entry\'s wallet part', f.walletChangeCents, 140000);
eq('bills are the entries a bill made', [f.billsCents, f.billCount], [20000, 1]);
eq('every entry of the month is counted as recorded', f.entries, 8);
eq('the investing pot and a borrow change neither saved nor income', [f.putInCents, f.incomeCents], [90000, 320000]);
eq('the categories add up to the spending', f.categories.reduce((s, c) => s + c.cents, 0), f.spentCents);
eq('categories are largest first', f.categories.map((c) => c.key), ['food', 'bills', 'shopping']);
eq('the biggest spends are largest first', f.biggest.map((b) => [b.note, b.cents]), [['meals', 80000], ['Netflix', 20000], ['headphones', 13000]]);
eq('a spend made by a bill says so', f.biggest.find((b) => b.note === 'Netflix')?.auto, true);

// repaying an old spent-ahead debt is neither income nor saving
{
  const g = monthFigures(
    [act({ type: 'manual', date: sep(2), amount: 1000, repaid: 300, distributions: [dist('car', 700)] })],
    SEP,
    NOW
  );
  eq('repaid debt is not income', g.incomeCents, 70000);
  eq('and not saved either', [g.putInCents, g.rate], [70000, 100]);
}

// a month with no income has no rate rather than a made-up one
{
  const g = monthFigures([act({ type: 'withdraw', date: sep(2), amount: 40, distributions: [], wallet: -40 })], SEP, NOW);
  eq('no income, no rate', g.rate, null);
  eq('but the spending is there', g.spentCents, 4000);
}
eq('an empty month has nothing', [monthFigures([], SEP, NOW).entries, monthFigures([], SEP, NOW).rate], [0, null]);

// spending more from the goals than was put in is a negative rate, shown as it is
eq('a negative rate stays negative', savingsRate(-5000, 100000), -5);
eq('rounding', savingsRate(770, 3200), 24);

// only the month asked for, and nothing from the future
{
  const g = monthFigures(
    [
      act({ type: 'manual', date: aug(31), amount: 999, distributions: [dist('car', 999)] }),
      act({ type: 'manual', date: new Date(2026, 9, 1, 12).toISOString(), amount: 888, distributions: [dist('car', 888)] }),
      act({ type: 'manual', date: new Date(2026, 9, 25, 12).toISOString(), amount: 777, distributions: [dist('car', 777)] }),
    ],
    new Date(2026, 9, 1),
    NOW
  );
  eq('only that month, and not days that have not happened', g.incomeCents, 88800);
}

// comparison with the month before
{
  const both = [
    ...ledger,
    act({ type: 'manual', date: aug(1), amount: 3200, distributions: [dist('car', 610)], wallet: 2590 }),
  ];
  const series = rateSeries(both, SEP, 2, NOW);
  eq('two months, oldest first', series.map((p) => [p.start.getMonth(), p.rate, p.has]), [[7, 19, true], [8, 21, true]]);
  eq('points change', pointsChange(24, 19), 5);
  eq('no rate, no comparison', pointsChange(null, 19), null);
  eq('percent change in money', centsChange(111, 100), 11);
  eq('nothing before, nothing to compare', centsChange(100, 0), null);
}

report();
