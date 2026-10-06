import { planBankEdit } from '../services/bankEdit';
import type { PiggyBank } from '../types';
import { eq, report } from './harness';

const bank: PiggyBank = {
  id: 'g',
  name: 'Car',
  targetAmount: 5000,
  currentAmount: 1200,
  splitPercentage: 50,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
};

eq('an empty name is refused', planBankEdit(bank, { name: '' }), { problem: 'nameEmpty' });
eq('a blank name is refused', planBankEdit(bank, { name: '   ' }), { problem: 'nameEmpty' });
eq('a name is trimmed', planBankEdit(bank, { name: '  Holiday ' }), { patch: { name: 'Holiday' }, belowBalance: false });
eq('40 characters is allowed', 'patch' in planBankEdit(bank, { name: 'a'.repeat(40) }), true);
eq('41 characters is refused', planBankEdit(bank, { name: 'a'.repeat(41) }), { problem: 'nameTooLong' });
eq('40 Chinese characters count as 40', 'patch' in planBankEdit(bank, { name: '钱'.repeat(40) }), true);

eq('a target of 0 makes the goal open-ended', planBankEdit(bank, { targetAmount: 0 }), { patch: { targetAmount: 0 }, belowBalance: false });
eq('a negative target is refused', planBankEdit(bank, { targetAmount: -1 }), { problem: 'targetInvalid' });
eq('NaN is refused', planBankEdit(bank, { targetAmount: NaN }), { problem: 'targetInvalid' });
eq('Infinity is refused', planBankEdit(bank, { targetAmount: Infinity }), { problem: 'targetInvalid' });
eq('a target is normalised to whole cents, rounded down', planBankEdit(bank, { targetAmount: 1500.999 }), {
  patch: { targetAmount: 1500.99 },
  belowBalance: false,
});

const icons = new Set(['savings', 'flight']);
eq('an unknown icon is refused when the set is given', planBankEdit(bank, { icon: 'nope' }, icons), { problem: 'iconUnknown' });
eq('a known icon is accepted', planBankEdit(bank, { icon: 'flight' }, icons), { patch: { icon: 'flight' }, belowBalance: false });
eq('any icon is accepted without a set', 'patch' in planBankEdit(bank, { icon: 'nope' }), true);

eq('a target below the balance is flagged', planBankEdit(bank, { targetAmount: 1000 }), { patch: { targetAmount: 1000 }, belowBalance: true });
eq('a target equal to the balance is flagged', planBankEdit(bank, { targetAmount: 1200 }), { patch: { targetAmount: 1200 }, belowBalance: true });
eq('a target just above the balance is not', planBankEdit(bank, { targetAmount: 1200.01 }), { patch: { targetAmount: 1200.01 }, belowBalance: false });

const everything = planBankEdit(bank, { name: 'x', targetAmount: 10, icon: 'flight' }, icons);
eq('the patch never contains the balance', 'patch' in everything && 'currentAmount' in everything.patch, false);
eq('an empty edit is an empty patch', planBankEdit(bank, {}), { patch: {}, belowBalance: false });

report();
