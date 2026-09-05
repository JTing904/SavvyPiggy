import { sortBanks, evenSplit } from '../services/sorting';
import type { PiggyBank } from '../types';
import { eq, report } from './harness';

const bank = (
  id: string,
  extra: Partial<PiggyBank> = {}
): PiggyBank => ({
  id,
  name: id,
  targetAmount: 1000,
  currentAmount: 0,
  splitPercentage: 0,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  ...extra,
});

const ids = (banks: PiggyBank[]) => banks.map((b) => b.id);

const BANKS = [
  bank('b', { name: 'Tokyo', currentAmount: 300, targetAmount: 1000, splitPercentage: 30, createdAt: 2 }),
  bank('a', { name: 'emergency', currentAmount: 900, targetAmount: 1000, splitPercentage: 50, createdAt: 1 }),
  bank('c', { name: 'Charity', currentAmount: 50, targetAmount: 0, splitPercentage: 20, createdAt: 3 }),
  bank('d', { name: 'PC', currentAmount: 100, targetAmount: 200, splitPercentage: 40, autoSplit: false, createdAt: 4 }),
];

// --- created
eq('created asc', ids(sortBanks(BANKS, { key: 'created', dir: 'asc' })), ['a', 'b', 'c', 'd']);
eq('created desc', ids(sortBanks(BANKS, { key: 'created', dir: 'desc' })), ['d', 'c', 'b', 'a']);

// --- name: case-insensitive
eq('name asc ignores case', ids(sortBanks(BANKS, { key: 'name', dir: 'asc' })), ['c', 'a', 'd', 'b']);
eq('name desc', ids(sortBanks(BANKS, { key: 'name', dir: 'desc' })), ['b', 'd', 'a', 'c']);

// --- balance
eq('balance asc', ids(sortBanks(BANKS, { key: 'balance', dir: 'asc' })), ['c', 'd', 'b', 'a']);
eq('balance desc', ids(sortBanks(BANKS, { key: 'balance', dir: 'desc' })), ['a', 'b', 'd', 'c']);

// --- progress: unlimited goals are always last
eq('progress desc, unlimited last', ids(sortBanks(BANKS, { key: 'progress', dir: 'desc' })), ['a', 'd', 'b', 'c']);
eq('progress asc, unlimited still last', ids(sortBanks(BANKS, { key: 'progress', dir: 'asc' })), ['b', 'd', 'a', 'c']);

// --- split: excluded goals count as 0
eq('split desc, excluded goal is 0', ids(sortBanks(BANKS, { key: 'split', dir: 'desc' })), ['a', 'b', 'c', 'd']);
eq('split asc', ids(sortBanks(BANKS, { key: 'split', dir: 'asc' })), ['d', 'c', 'b', 'a']);

// --- ties fall back to creation order in both directions
{
  const tied = [bank('y', { currentAmount: 5, createdAt: 2 }), bank('x', { currentAmount: 5, createdAt: 1 })];
  eq('tie asc → created', ids(sortBanks(tied, { key: 'balance', dir: 'asc' })), ['x', 'y']);
  eq('tie desc → still created', ids(sortBanks(tied, { key: 'balance', dir: 'desc' })), ['x', 'y']);
}

// --- input is never mutated
{
  const input = [...BANKS];
  sortBanks(input, { key: 'name', dir: 'asc' });
  eq('sort does not mutate', ids(input), ids(BANKS));
}

// --- even split
eq('even split of 4', evenSplit([bank('a'), bank('b'), bank('c'), bank('d')]), { a: 25, b: 25, c: 25, d: 25 });
eq('even split of 3 gives the spare point to the first', evenSplit([bank('a'), bank('b'), bank('c')]), {
  a: 34,
  b: 33,
  c: 33,
});
eq(
  'locked goal keeps its share and the rest is split',
  evenSplit([bank('a', { splitPercentage: 40, isLocked: true }), bank('b'), bank('c')]),
  { b: 30, c: 30 }
);
eq(
  'excluded goal is skipped',
  evenSplit([bank('a', { autoSplit: false }), bank('b'), bank('c')]),
  { b: 50, c: 50 }
);
eq('nothing adjustable', evenSplit([bank('a', { isLocked: true, splitPercentage: 100 })]), null);
eq('locks over 100 leave nothing to hand out', evenSplit([bank('a', { isLocked: true, splitPercentage: 120 }), bank('b')]), {
  b: 0,
});
eq('no banks', evenSplit([]), null);

report();
