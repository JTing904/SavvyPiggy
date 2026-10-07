import { firstGoalSplit } from '../services/firstGoalSplit';
import type { PiggyBank } from '../types';
import { eq, report } from './harness';

const bank = (over: Partial<PiggyBank> = {}): PiggyBank => ({
  id: 'g',
  name: 'Car',
  targetAmount: 100,
  currentAmount: 0,
  splitPercentage: 100,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  ...over,
});

eq('the first goal takes the whole split', firstGoalSplit([], true), 100);
eq('autoSplit unspecified counts as in', firstGoalSplit([], undefined), 100);
eq('a first goal left out of the split gets nothing', firstGoalSplit([], false), 0);
eq('a second goal starts at nothing', firstGoalSplit([bank()], true), 0);
eq('an archived goal does not count as saving', firstGoalSplit([bank({ archivedAt: 5 })], true), 100);
eq('one active goal among archived ones blocks it', firstGoalSplit([bank({ archivedAt: 5 }), bank({ id: 'h' })], true), 0);
eq('archived and left out gets nothing', firstGoalSplit([bank({ archivedAt: 5 })], false), 0);

report();
