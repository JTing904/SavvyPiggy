import { parseLastChoices, usableChoices, withChoice, type LastChoices } from '../services/lastChoices';
import type { PiggyBank } from '../types';
import { eq, report } from './harness';

const bank = (id: string, extra: Partial<PiggyBank> = {}): PiggyBank => ({
  id,
  name: id,
  targetAmount: 0,
  currentAmount: 0,
  splitPercentage: 50,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  ...extra,
});

const banks = [bank('car'), bank('trip', { archivedAt: 5 })];

eq('null gives empty choices', parseLastChoices(null), { v: 1 });
eq('garbage gives empty choices', parseLastChoices('{nope'), { v: 1 });
eq('another version gives empty choices', parseLastChoices('{"v":2,"spendGoal":"car"}'), { v: 1 });
eq('a non-object gives empty choices', parseLastChoices('42'), { v: 1 });
eq('wrong field types are dropped one by one', parseLastChoices('{"v":1,"spendGoal":7,"spendCategory":"food","quick":{"deposit":"x","spend":500}}'), {
  v: 1,
  spendCategory: 'food',
  quick: { spend: 500 },
});

const all: LastChoices = {
  v: 1,
  depositTarget: 'car',
  spendGoal: 'car',
  spendCategory: 'food',
  potInGoal: 'car',
  potOutTarget: 'split',
  quick: { deposit: 5000, spend: 1200, pot: 100 },
};
eq('a saved set round-trips', parseLastChoices(JSON.stringify(all)), all);
eq('everything valid is usable', usableChoices(all, banks), all);

eq('a deleted goal is dropped', usableChoices({ v: 1, spendGoal: 'gone', depositTarget: 'gone' }, banks), { v: 1 });
eq('an archived goal is dropped', usableChoices({ v: 1, spendGoal: 'trip', potInGoal: 'trip', potOutTarget: 'trip' }, banks), { v: 1 });
eq('split stays usable with no goals at all', usableChoices({ v: 1, depositTarget: 'split' }, []), { v: 1, depositTarget: 'split' });
eq('an unknown category is dropped', usableChoices({ v: 1, spendCategory: 'nonsense' }, banks), { v: 1 });
eq(
  'quick amounts outside 1 sen .. RM100,000 are dropped',
  usableChoices({ v: 1, quick: { deposit: 0, spend: -5, pot: 10_000_001 } }, banks),
  { v: 1 }
);
eq('RM100,000 exactly is kept', usableChoices({ v: 1, quick: { deposit: 10_000_000 } }, banks), { v: 1, quick: { deposit: 10_000_000 } });
eq('a fractional quick amount is dropped', usableChoices({ v: 1, quick: { deposit: 12.5 } }, banks), { v: 1 });

eq('withChoice merges and keeps the rest', withChoice(all, { spendGoal: 'trip' }), { ...all, spendGoal: 'trip' });
eq('withChoice merges quick amounts one by one', withChoice(all, { quick: { spend: 900 } }).quick, { deposit: 5000, spend: 900, pot: 100 });
eq('withChoice forgets a choice set to undefined', withChoice(all, { spendCategory: undefined }).spendCategory, undefined);
eq('withChoice does not change its input', all.spendGoal, 'car');

report();
