import type { PiggyBank } from '../types';
import { atFromPicked, defaultIncomeChoice, defaultSpendSource } from '../services/moneySheet';
import { eq, report } from './harness';

const bank = (id: string, over: Partial<PiggyBank> = {}): PiggyBank => ({
  id,
  name: id,
  targetAmount: 1000,
  currentAmount: 0,
  splitPercentage: 50,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 1,
  ...over,
});

const a = bank('a');
const b = bank('b');
const gone = (id: string) => bank(id, { archivedAt: 5 });

// --- spend source: never guessed when there is a choice
eq('spend: last used goal', defaultSpendSource([a, b], 'b'), 'b');
eq('spend: last used wallet', defaultSpendSource([a, b], 'wallet'), 'wallet');
eq('spend: a goal and the wallet is a real choice, so nothing', defaultSpendSource([a]), undefined);
eq('spend: two goals and no history is nothing', defaultSpendSource([a, b]), undefined);
eq('spend: stale last with two goals is nothing', defaultSpendSource([a, b], 'zzz'), undefined);
eq('spend: no goals leaves the wallet as the only source', defaultSpendSource([]), 'wallet');
eq('spend: only archived goals leave the wallet too', defaultSpendSource([gone('c')]), 'wallet');
eq('spend: an archived last is not used', defaultSpendSource([a, gone('c')], 'c'), undefined);
eq('spend: two active and an archived is nothing', defaultSpendSource([a, b, gone('c')]), undefined);

// --- income
eq('income: the rule by default', defaultIncomeChoice([a, b]), 'rule');
eq('income: remembered split reads as the rule', defaultIncomeChoice([a, b], 'split'), 'rule');
eq('income: remembered rule', defaultIncomeChoice([a, b], 'rule'), 'rule');
eq('income: remembered wallet', defaultIncomeChoice([a, b], 'wallet'), 'wallet');
eq('income: remembered goal wins', defaultIncomeChoice([a, b], 'b'), 'b');
eq('income: stale remembered goal falls back to the rule', defaultIncomeChoice([a, b], 'zzz'), 'rule');
eq('income: an archived remembered goal falls back too', defaultIncomeChoice([a, gone('c')], 'c'), 'rule');
eq('income: no goals still has the rule', defaultIncomeChoice([]), 'rule');

// --- date mapping
const now = new Date(2026, 9, 6, 14, 30);
eq('date: nothing picked', atFromPicked(null, now), undefined);
eq('date: today at midnight', atFromPicked(new Date(2026, 9, 6), now), undefined);
eq('date: today at any time', atFromPicked(new Date(2026, 9, 6, 23, 59), now), undefined);
const yesterday = atFromPicked(new Date(2026, 9, 5), now);
eq('date: a past day is its local midnight', yesterday && [yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), yesterday.getHours(), yesterday.getMinutes()], [2026, 9, 5, 0, 0]);
const stray = atFromPicked(new Date(2026, 8, 30, 17, 45), now);
eq('date: a past day with a time is trimmed to midnight', stray && [stray.getDate(), stray.getHours(), stray.getMinutes()], [30, 0, 0]);
eq('date: same day number in another month is not today', atFromPicked(new Date(2026, 8, 6), now)?.getMonth(), 8);

report();
