import type { PiggyBank } from '../types';
import { atFromPicked, defaultDepositTarget, defaultSpendSource } from '../services/moneySheet';
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
const off = (id: string) => bank(id, { autoSplit: false });
const zero = (id: string) => bank(id, { splitPercentage: 0 });
const gone = (id: string) => bank(id, { archivedAt: 5 });

// --- spend source: never guessed when there is a choice
eq('spend: last used goal', defaultSpendSource([a, b], 'b'), 'b');
eq('spend: only goal', defaultSpendSource([a]), 'a');
eq('spend: only goal beats a stale last', defaultSpendSource([a], 'zzz'), 'a');
eq('spend: two goals and no history is nothing', defaultSpendSource([a, b]), undefined);
eq('spend: stale last with two goals is nothing', defaultSpendSource([a, b], 'zzz'), undefined);
eq('spend: no goals is nothing', defaultSpendSource([]), undefined);
eq('spend: an archived last is not used', defaultSpendSource([a, gone('c')], 'c'), 'a');
eq('spend: archived goals do not count as the only one', defaultSpendSource([a, gone('c')]), 'a');
eq('spend: two active and an archived is nothing', defaultSpendSource([a, b, gone('c')]), undefined);

// --- deposit target
eq('deposit: split when any goal is in it', defaultDepositTarget([a, b]), null);
eq('deposit: remembered split', defaultDepositTarget([a, b], 'split'), null);
eq('deposit: remembered goal wins', defaultDepositTarget([a, b], 'b'), 'b');
eq('deposit: stale remembered goal falls back to split', defaultDepositTarget([a, b], 'zzz'), null);
eq('deposit: only goal when none is in the split', defaultDepositTarget([off('x')]), 'x');
eq('deposit: a 0% goal is not in the split', defaultDepositTarget([zero('x')]), 'x');
eq('deposit: nothing in the split and several goals is null', defaultDepositTarget([off('x'), off('y')]), null);
eq('deposit: no goals is null', defaultDepositTarget([]), null);
eq('deposit: archived goal is not the sole goal', defaultDepositTarget([gone('x')]), null);
eq('deposit: split goal archived, one other left', defaultDepositTarget([gone('x'), off('y')]), 'y');

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
