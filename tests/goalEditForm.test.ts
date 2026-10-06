import {
  DEFAULT_GOAL_ICON,
  FIRST_RUN_GOALS,
  QUICK_ICONS,
  buildBankEdit,
  canCreateGoal,
  clipName,
  formOfBank,
  formTarget,
  goalIconLabel,
  iconForNewGoal,
  isEmptyEdit,
  newGoalOf,
  quickIconsFor,
  targetMissing,
  targetTextOf,
} from '../services/goalEditForm';
import { GOAL_NAME_MAX, planBankEdit } from '../services/bankEdit';
import { GOAL_ICON_SET } from '../services/goalIcons';
import type { PiggyBank } from '../types';
import { eq, report } from './harness';

const bank: PiggyBank = {
  id: 'g',
  name: 'Car',
  targetAmount: 5000,
  currentAmount: 1200,
  splitPercentage: 50,
  icon: 'directions_car',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
};

// --- the lists the screens show
eq('quick icons are all in the catalogue', QUICK_ICONS.filter((n) => !GOAL_ICON_SET.has(n)), []);
eq('eight quick icons', QUICK_ICONS.length, 8);
eq('the default icon is in the catalogue', GOAL_ICON_SET.has(DEFAULT_GOAL_ICON), true);
eq('first-run icons are in the catalogue', FIRST_RUN_GOALS.filter((g) => g.icon && !GOAL_ICON_SET.has(g.icon)).map((g) => g.key), []);
eq('first run offers four tiles, the last one blank', FIRST_RUN_GOALS.map((g) => g.icon === null), [false, false, false, true]);
eq('first-run keys', FIRST_RUN_GOALS.map((g) => g.key), ['travel', 'emergency', 'phone', 'own']);

eq('a quick icon leaves the row as it is', quickIconsFor('home'), [...QUICK_ICONS]);
eq('another icon takes the last place', quickIconsFor('mosque').slice(-1), ['mosque']);
eq('and the row stays eight long', quickIconsFor('mosque').length, 8);
eq('an unknown icon never enters the row', quickIconsFor('nope'), [...QUICK_ICONS]);

// --- a new goal's icon
eq('a picked icon wins', iconForNewGoal('Umrah trip', 'flight'), 'flight');
eq('the name suggests one', iconForNewGoal('New phone', null), 'smartphone');
eq('nothing recognised falls back to the piggy', iconForNewGoal('Zzz', null), DEFAULT_GOAL_ICON);
eq('an empty name falls back too', iconForNewGoal('', null), DEFAULT_GOAL_ICON);

// --- the target as typed
eq('3500 reads back as 3500', targetTextOf(3500), '3500');
eq('12.5 reads back as 12.5', targetTextOf(12.5), '12.5');
eq('12.05 keeps its zero', targetTextOf(12.05), '12.05');
eq('open-ended reads back as nothing', targetTextOf(0), '');
eq('the typed text is ringgit', formTarget({ targetText: '12.5', noLimit: false }), 12.5);
eq('No limit is 0 whatever is typed', formTarget({ targetText: '12.5', noLimit: true }), 0);
eq('a lone dot is nothing', formTarget({ targetText: '.', noLimit: false }), 0);
eq('a limit with nothing typed is missing', targetMissing({ targetText: '', noLimit: false }), true);
eq('0 typed is missing too', targetMissing({ targetText: '0', noLimit: false }), true);
eq('No limit never lacks a target', targetMissing({ targetText: '', noLimit: true }), false);
eq('a typed amount is not missing', targetMissing({ targetText: '1', noLimit: false }), false);

// --- the edit form
const open = formOfBank(bank);
eq('the form opens on the goal', open, { name: 'Car', targetText: '5000', noLimit: false, icon: 'directions_car' });
eq('an open-ended goal opens on No limit', formOfBank({ ...bank, targetAmount: 0 }).noLimit, true);
eq('a miscased icon opens as the known one', formOfBank({ ...bank, icon: 'Celebration' }).icon, 'celebration');
eq('an unknown icon opens as the piggy', formOfBank({ ...bank, icon: 'zzz' }).icon, 'savings');
eq('nothing changed is an empty edit', buildBankEdit(bank, open), {});
eq('and says so', isEmptyEdit(buildBankEdit(bank, open)), true);
eq('only the name when only the name changed', buildBankEdit(bank, { ...open, name: 'Holiday' }), { name: 'Holiday' });
eq('a name that only gained spaces is unchanged', buildBankEdit(bank, { ...open, name: '  Car ' }), {});
eq('only the target when only the target changed', buildBankEdit(bank, { ...open, targetText: '6000' }), { targetAmount: 6000 });
eq('No limit sends 0', buildBankEdit(bank, { ...open, noLimit: true }), { targetAmount: 0 });
eq('only the icon when only the icon changed', buildBankEdit(bank, { ...open, icon: 'flight' }), { icon: 'flight' });
eq('all three together', buildBankEdit(bank, { name: 'Trip', targetText: '300.5', noLimit: false, icon: 'flight' }), {
  name: 'Trip',
  targetAmount: 300.5,
  icon: 'flight',
});
eq('a cleared name is sent so the plan can refuse it', planBankEdit(bank, buildBankEdit(bank, { ...open, name: '' })), { problem: 'nameEmpty' });
eq('a legacy icon left alone is not rewritten', buildBankEdit({ ...bank, icon: 'Celebration' }, formOfBank({ ...bank, icon: 'Celebration' })), {});
eq(
  'a target at the balance gets the gentle flag',
  (() => {
    const p = planBankEdit(bank, buildBankEdit(bank, { ...open, targetText: '1200' }));
    return 'patch' in p && p.belowBalance;
  })(),
  true
);

// --- creating
const f = (name: string, targetText = '', noLimit = false) => ({ name, targetText, noLimit });
eq('a blank name cannot be created', canCreateGoal(f('   ', '10')), false);
eq('an empty name cannot be created', canCreateGoal(f('', '10')), false);
eq('a name and an amount can', canCreateGoal(f('Trip', '10')), true);
eq('a name with No limit can', canCreateGoal(f('Trip', '', true)), true);
eq('a limit with no amount cannot (it would be open-ended by accident)', canCreateGoal(f('Trip', '')), false);
eq('an amount of 0 cannot', canCreateGoal(f('Trip', '0')), false);
eq('the longest name can', canCreateGoal(f('a'.repeat(GOAL_NAME_MAX), '1')), true);
eq('one more cannot', canCreateGoal(f('a'.repeat(GOAL_NAME_MAX + 1), '1')), false);
eq('Chinese characters count one each', canCreateGoal(f('钱'.repeat(GOAL_NAME_MAX), '1')), true);
eq('clipName keeps a short name', clipName('Car'), 'Car');
eq('clipName cuts a long one', clipName('a'.repeat(50)).length, GOAL_NAME_MAX);
eq('clipName does not split an emoji', Array.from(clipName('😀'.repeat(50))).length, GOAL_NAME_MAX);

eq(
  'the new goal is trimmed and has a numeric target',
  newGoalOf({ name: '  Trip ', targetText: '2500.5', noLimit: false, icon: 'flight' }, true),
  { name: 'Trip', targetAmount: 2500.5, icon: 'flight', autoSplit: true }
);
eq(
  'an open-ended goal is stored as 0, with its photo and split choice',
  newGoalOf({ name: 'Trip', targetText: '9', noLimit: true, icon: 'flight' }, false, 'data:x'),
  { name: 'Trip', targetAmount: 0, icon: 'flight', imageUrl: 'data:x', autoSplit: false }
);

// --- icon names for people
eq('English reads the symbol name', goalIconLabel('shield_with_heart', 'en'), 'Shield with heart');
eq('Chinese uses the icon own Chinese word', goalIconLabel('flight', 'zh'), '机票');
eq('and falls back to the group', goalIconLabel('key', 'zh'), '钥匙');
eq('an unknown icon is its name in Chinese', goalIconLabel('nope', 'zh'), 'nope');

report();
