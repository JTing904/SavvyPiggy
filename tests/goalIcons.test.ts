import {
  GOAL_ICON_GROUPS,
  GOAL_ICON_SET,
  GOAL_ICONS,
  iconGroupOf,
  isKnownGoalIcon,
  safeGoalIcon,
  searchGoalIcons,
  suggestIconFromName,
} from '../services/goalIcons';
import { eq, report } from './harness';

const names = (query: string) => searchGoalIcons(query, 'en').map((r) => r.name);

// --- the catalogue
eq('14 groups', GOAL_ICON_GROUPS.length, 14);
eq('70 icons', GOAL_ICONS.length, 70);
eq('no duplicate names', new Set(GOAL_ICONS).size, GOAL_ICONS.length);
eq('the set matches the list', GOAL_ICON_SET.size, 70);
eq('every group holds 5 icons', GOAL_ICON_GROUPS.filter((g) => g.icons.length !== 5).map((g) => g.key), []);
eq('group keys are unique', new Set(GOAL_ICON_GROUPS.map((g) => g.key)).size, 14);
eq('every group has en and zh labels', GOAL_ICON_GROUPS.filter((g) => !g.en || !g.zh).map((g) => g.key), []);
eq(
  'every group has keywords in en, zh and ms',
  GOAL_ICON_GROUPS.filter((g) => !g.keywords.en.length || !g.keywords.zh.length || !g.keywords.ms.length).map((g) => g.key),
  []
);
eq(
  'names are lowercase symbols names',
  GOAL_ICONS.filter((n) => !/^[a-z_]+$/.test(n)),
  []
);

// --- icons that existing data and the sample goals use
const LEGACY = [
  'directions_car', 'flight', 'home', 'shopping_bag', 'restaurant', 'devices',
  'pets', 'fitness_center', 'movie', 'celebration', 'school', 'medical_services',
];
eq('the 12 legacy icons are all present', LEGACY.filter((n) => !GOAL_ICON_SET.has(n)), []);
eq('the sample goal icons are present', ['beach_access', 'shield_with_heart', 'devices'].filter((n) => !GOAL_ICON_SET.has(n)), []);

// --- lookups
eq('iconGroupOf finds the group', iconGroupOf('mosque')?.key, 'faith');
eq('iconGroupOf of an unknown name', iconGroupOf('nope'), undefined);
eq('iconGroupOf is exact, not lowercased', iconGroupOf('Celebration'), undefined);
eq('iconGroupOf on the lowercased miscased name', iconGroupOf('Celebration'.toLowerCase())?.key, 'celebration');
eq('iconGroupOf on a legacy name', iconGroupOf('Movie'.toLowerCase())?.key, 'hobbies');
eq('isKnownGoalIcon yes', isKnownGoalIcon('flight'), true);
eq('isKnownGoalIcon no', isKnownGoalIcon('Flight'), false);

// --- safeGoalIcon
eq('safeGoalIcon keeps a known icon', safeGoalIcon('flight'), 'flight');
eq('safeGoalIcon lowercases old data', safeGoalIcon('Celebration'), 'celebration');
eq('safeGoalIcon lowercases Home', safeGoalIcon('Home'), 'home');
eq('safeGoalIcon unknown falls back', safeGoalIcon('not_an_icon'), 'savings');
eq('safeGoalIcon empty falls back', safeGoalIcon(''), 'savings');
eq('safeGoalIcon undefined falls back', safeGoalIcon(undefined), 'savings');
eq('safeGoalIcon null falls back', safeGoalIcon(null), 'savings');
eq('safeGoalIcon a number falls back', safeGoalIcon(42), 'savings');

// --- search
eq('empty query returns all 70', searchGoalIcons('', 'en').length, 70);
eq('blank query returns all 70', searchGoalIcons('   ', 'zh').length, 70);
eq('hajj finds the mosque', names('hajj').includes('mosque'), true);
eq('chinese 朝圣 finds the mosque', searchGoalIcons('朝圣', 'zh').some((r) => r.name === 'mosque'), true);
eq('emas finds savings and diamond', ['savings', 'diamond'].filter((n) => !names('emas').includes(n)), []);
eq('kahwin finds celebration', names('kahwin').includes('celebration'), true);
eq('results carry the group key', searchGoalIcons('hajj', 'en')[0], { name: 'mosque', groupKey: 'faith' });
eq('search ignores case and padding', names('  HAJJ '), names('hajj'));
eq('every word has to match', names('hajj trip'), []);
eq('words may come from different fields', names('mosque hajj'), names('hajj').filter((n) => n === 'mosque'));
eq('an icon name matches with spaces', names('car repair'), ['car_repair']);
eq('tesla finds the electric car within vehicles', names('tesla').includes('electric_car'), true);
eq('phone finds tech', iconGroupOf(names('手机')[0])?.key, 'tech');
eq('nonsense finds nothing', names('zzzzqq'), []);
eq('the group label matches (zh)', names('旅行').length, 5);

// --- suggest from a goal name
eq('Umrah trip is a mosque, not a plane', suggestIconFromName('Umrah trip'), 'mosque');
eq('Hajj', suggestIconFromName('Hajj'), 'mosque');
eq('New car', suggestIconFromName('New car'), 'directions_car');
eq('kereta baru', suggestIconFromName('Kereta baru'), 'directions_car');
eq('Holiday group word picks the group lead', suggestIconFromName('Holiday'), 'flight');
eq('Beach trip', suggestIconFromName('Beach trip'), 'beach_access');
eq('Wedding', suggestIconFromName('Wedding'), 'favorite');
eq('Ang pow', suggestIconFromName('Ang pow fund'), 'redeem');
eq('Gold', suggestIconFromName('Gold'), 'diamond');
eq('Laptop', suggestIconFromName('New laptop'), 'laptop_mac');
eq('Emergency fund', suggestIconFromName('Emergency fund'), 'shield_with_heart');
eq('chinese name', suggestIconFromName('买房首付'), 'home');
eq('a word inside another word does not match', suggestIconFromName('Scarf'), null);
eq('an unrecognised name', suggestIconFromName('Something else'), null);
eq('an empty name', suggestIconFromName('   '), null);

report();
