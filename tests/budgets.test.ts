import { eq, report } from './harness';
import type { Activity, Budgets } from '../types';
import { budgetNotice, budgetRows, cleanBudgets, EMPTY_BUDGETS, limitAt, statusOf, TOTAL, withLimit } from '../services/budgets';

// --- limits over time
const steps = withLimit(withLimit([], '2026-08', 80000), '2026-10', 90000);
eq('a limit holds from its month', limitAt(steps, '2026-08'), 80000);
eq('and carries on into later months', limitAt(steps, '2026-09'), 80000);
eq('a later step takes over from its month', limitAt(steps, '2026-10'), 90000);
eq('a month before the first step has no limit', limitAt(steps, '2026-07'), null);
eq('no steps, no limit', limitAt(undefined, '2026-10'), null);
eq('setting 0 takes the limit away from that month on', limitAt(withLimit(steps, '2026-11', 0), '2026-11'), null);
eq('and leaves the months before alone', limitAt(withLimit(steps, '2026-11', 0), '2026-10'), 90000);
eq('setting the same month again replaces it', withLimit(steps, '2026-10', 95000), [
  { from: '2026-08', cents: 80000 },
  { from: '2026-10', cents: 95000 },
]);
eq('a step that changes nothing is not kept', withLimit(steps, '2026-12', 90000), steps);
eq('a limit that is just removed leaves nothing', withLimit(withLimit([], '2026-10', 5000), '2026-10', 0), []);
eq('cents are whole', withLimit([], '2026-10', 1234.9), [{ from: '2026-10', cents: 1234 }]);

// --- stored junk
eq('junk becomes empty', cleanBudgets({ total: 'x', categories: { food: 5 } } as never), EMPTY_BUDGETS);
eq(
  'bad steps are dropped, good ones kept in order',
  cleanBudgets({
    total: [
      { from: '2026-10', cents: 2000 },
      { from: 'oct', cents: 5 },
      { from: '2026-09', cents: -1 },
      { from: '2026-08', cents: 1000 },
    ],
    categories: { food: [{ from: '2026-10', cents: 800 }], gifts: [] },
  }),
  { total: [{ from: '2026-08', cents: 1000 }, { from: '2026-10', cents: 2000 }], categories: { food: [{ from: '2026-10', cents: 800 }] } }
);
eq('missing is empty', cleanBudgets(undefined), EMPTY_BUDGETS);

// --- status
eq('no limit', statusOf(5000, null), 'none');
eq('under 80% is ok', statusOf(7999, 10000), 'ok');
eq('80% is near', statusOf(8000, 10000), 'near');
eq('exactly the limit is still near', statusOf(10000, 10000), 'near');
eq('a cent over is over', statusOf(10001, 10000), 'over');

// --- rows
const budgets: Budgets = {
  total: [{ from: '2026-10', cents: 240000 }],
  categories: {
    food: [{ from: '2026-10', cents: 80000 }],
    transport: [{ from: '2026-10', cents: 30000 }],
    fun: [{ from: '2026-10', cents: 20000 }],
    gifts: [{ from: '2026-10', cents: 10000 }],
  },
};
const spend = [
  { key: 'food', cents: 65600, entries: 21, share: 35 },
  { key: 'bills', cents: 56000, entries: 5, share: 30 },
  { key: 'transport', cents: 32000, entries: 9, share: 17 },
  { key: 'fun', cents: 7000, entries: 2, share: 4 },
];
const rows = budgetRows(budgets, '2026-10', spend, 189600);
eq('the total comes first', rows[0].key, TOTAL);
eq('the total is judged on its own limit', [rows[0].limitCents, rows[0].status, rows[0].used, rows[0].leftCents], [240000, 'ok', 79, 50400]);
eq('then over, near, ok, and no-limit last', rows.slice(1).map((r) => [r.key, r.status]), [
  ['transport', 'over'],
  ['food', 'near'],
  ['fun', 'ok'],
  ['gifts', 'ok'],
  ['bills', 'none'],
]);
eq('over reports what is left as negative', rows.find((r) => r.key === 'transport')?.leftCents, -2000);
eq('a limit with no spending still shows', rows.find((r) => r.key === 'gifts')?.spentCents, 0);
eq('a category with no limit has no percent', rows.find((r) => r.key === 'bills')?.used, null);
eq('before the limits began, nothing is judged', budgetRows(budgets, '2026-09', spend, 189600).every((r) => r.status === 'none'), true);
eq('nothing at all, no rows', budgetRows(EMPTY_BUDGETS, '2026-10', [], 0), []);

// --- the line on Home
const act = (over: Partial<Activity> & Pick<Activity, 'date' | 'amount'>): Activity => ({
  id: String(Math.random()),
  type: 'withdraw',
  distributions: [],
  ...over,
});
const NOW = new Date(2026, 9, 16, 12);
const day = (d: number) => new Date(2026, 9, d, 12).toISOString();
const spent = [
  act({ date: day(2), amount: 656, wallet: -656, category: 'food' }),
  act({ date: day(5), amount: 320, wallet: -320, category: 'transport' }),
  act({ date: day(6), amount: 70, wallet: -70, category: 'fun' }),
];
eq('over and near are named, worst first', budgetNotice(budgets, spent, NOW), { over: ['transport'], near: ['food'] });
eq('nothing to say when nothing is close', budgetNotice(budgets, [spent[2]], NOW), { over: [], near: [] });
eq('no budgets, nothing to say', budgetNotice(EMPTY_BUDGETS, spent, NOW), { over: [], near: [] });
eq(
  'the total is named first when it is the one over',
  budgetNotice({ ...budgets, total: [{ from: '2026-10', cents: 90000 }] }, spent, NOW),
  { over: [TOTAL, 'transport'], near: ['food'] }
);

report();
