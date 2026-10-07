import { eq, report } from './harness';
import type { Activity } from '../types';
import { findDuplicate, parseQuick, type QuickContext } from '../services/quickParse';

const NOW = new Date(2026, 9, 7, 15); // 7 Oct 2026
const ctx: QuickContext = {
  goals: [
    { id: 'car', name: 'Car' },
    { id: 'trip', name: '旅行基金' },
  ],
  now: NOW,
  liveFrom: new Date(2026, 7, 1),
};
const p = (line: string) => parseQuick(line, ctx);
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

// --- the plain cases
{
  const r = p('午餐 12.5');
  eq('amount, spending, category, note', [r.cents, r.kind, r.category, r.note, r.day, r.goalId], [1250, 'spend', 'food', '午餐', null, null]);
}
eq('a whole number is ringgit', p('grab 8').cents, 800);
eq('so 1250 is RM1,250', p('电费 1250').cents, 125000);
eq('two decimals', p('lunch 12.50').cents, 1250);
eq('one decimal', p('lunch 12.5').cents, 1250);
eq('rm in front', p('lunch rm12.50').cents, 1250);
eq('rm behind', p('lunch 12.50rm').cents, 1250);
eq('块', p('午餐 12块').cents, 1200);
eq('thousands comma', p('薪水 3,200.50').cents, 320050);
eq('a category word in English', p('grab 8').category, 'transport');
eq('Malay', [p('makan 9').category, p('petrol 50').category], ['food', 'transport']);

// --- income
{
  const r = p('薪水 3200');
  eq('an income word', [r.kind, r.cents, r.note], ['income', 320000, '薪水']);
}
eq('a plus sign', [p('红包 +50').kind, p('红包 +50').cents], ['income', 5000]);
eq('no plus, no income word: spending', p('红包 50').kind, 'spend');

// --- days
eq('yesterday', ymd(p('午餐 12 昨天').day), '2026-10-6');
eq('the day before', ymd(p('午餐 12 前天').day), '2026-10-5');
eq('English', ymd(p('lunch 12 yesterday').day), '2026-10-6');
eq('today is no day at all', p('午餐 12 今天').day, null);
eq('a day of this month', ymd(p('午餐 12 3号').day), '2026-10-3');
eq('a day later than today is last month', ymd(p('午餐 12 20号').day), '2026-9-20');
eq('the day is not an amount', p('午餐 12 3号').cents, 1200);
eq('the first of this month is fine', ymd(p('午餐 12 1号').day), '2026-10-1');
{
  const old = parseQuick('午餐 12 25号', { ...ctx, liveFrom: new Date(2026, 9, 1) });
  eq('before liveFrom: no day, and it says why', [old.day, old.issues], [null, ['tooOld']]);
}
eq('a day that does not exist', p('午餐 12 31号').issues.includes('badDay') || ymd(p('午餐 12 31号').day) === '2026-9-30', true);

// --- goals
{
  const r = p('买东西 25 从Car');
  eq('a goal named', [r.goalId, r.cents, r.category], ['car', 2500, null]);
  eq('the from-word goes with it', r.note, '买东西');
}
eq('a Chinese goal name', p('机票 300 旅行基金').goalId, 'trip');
eq('no goal named', p('午餐 12').goalId, null);

// --- things it must not guess
eq('two amounts are not picked from', [p('买菜 3 4.5').cents, p('买菜 3 4.5').amounts, p('买菜 3 4.5').issues], [null, [300, 450], ['manyAmounts']]);
eq('the same amount twice is one amount', p('午餐 12 12').cents, 1200);
eq('no amount, no entry', [p('午餐').cents, p('午餐').issues], [null, ['noAmount']]);
eq('two categories: none', p('午餐 grab 12').category, null);
eq('no category word: none', p('买东西 25').category, null);
eq('a shop name with a digit is not an amount', [p('7-eleven 12').cents, p('7-eleven 12').amounts], [1200, [1200]]);
eq('empty', p('   ').kind, null);
eq('zero is not an amount', p('午餐 0').cents, null);

// --- the note keeps what is left
eq('the note', p('和朋友 午餐 12.5 昨天').note, '和朋友 午餐');

// --- the same entry twice
{
  const row = (over: Partial<Activity>): Activity => ({
    id: 'x',
    type: 'withdraw',
    date: new Date(2026, 9, 7, 12, 3).toISOString(),
    amount: 12.5,
    distributions: [],
    wallet: -12.5,
    category: 'food',
    ...over,
  });
  const seen = [row({})];
  eq('same day, amount and use is a repeat', findDuplicate(seen, { cents: 1250, category: 'food', day: null }, NOW)?.id, 'x');
  eq('another amount is not', findDuplicate(seen, { cents: 1300, category: 'food', day: null }, NOW), null);
  eq('another use is not', findDuplicate(seen, { cents: 1250, category: 'transport', day: null }, NOW), null);
  eq('another day is not', findDuplicate(seen, { cents: 1250, category: 'food', day: new Date(2026, 9, 6) }, NOW), null);
  eq('a spend from a goal counts too', findDuplicate([row({ wallet: undefined, distributions: [{ bankId: 'a', amount: -12.5, percentage: 100 }] })], { cents: 1250, category: 'food', day: null }, NOW)?.id, 'x');
  eq('an income is never a repeat of a spend', findDuplicate([row({ type: 'manual' })], { cents: 1250, category: 'food', day: null }, NOW), null);
}

report();
