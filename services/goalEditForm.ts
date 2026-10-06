import type { PiggyBank } from '../types';
import { GOAL_ICON_SET, iconGroupOf, safeGoalIcon, suggestIconFromName } from './goalIcons';
import { GOAL_NAME_MAX, type BankEdit } from './bankEdit';
import { amountToCents } from './keypad';
import { fromCents, toCents } from './money';

/**
 * The pure side of the goal forms (create, edit, first run): what the typed
 * fields mean, which edit they make, and which icons a goal starts with. The
 * screens only draw it.
 */

export interface GoalForm {
  name: string;
  /** What the keypad has typed ("", "12", "12.5"). Ignored while `noLimit`. */
  targetText: string;
  /** An open-ended goal: stored as a target of 0. */
  noLimit: boolean;
  icon: string;
}

/** What a goal wears when nothing in its name suggests an icon. */
export const DEFAULT_GOAL_ICON = 'savings';

/** The icons offered up front; the rest are behind "More". All must be in the catalogue. */
export const QUICK_ICONS: readonly string[] = [
  'flight',
  'shield_with_heart',
  'smartphone',
  'home',
  'directions_car',
  'favorite',
  'school',
  'savings',
];

/**
 * The quick row for a chosen icon: the same eight, except that a chosen icon
 * that is not among them takes the last place, so the choice is always visible.
 */
export const quickIconsFor = (selected: string): string[] =>
  QUICK_ICONS.includes(selected) || !GOAL_ICON_SET.has(selected)
    ? [...QUICK_ICONS]
    : [...QUICK_ICONS.slice(0, QUICK_ICONS.length - 1), selected];

/** The icon a new goal wears: the one picked, else what its name suggests, else the piggy. */
export const iconForNewGoal = (name: string, picked: string | null): string =>
  picked ?? suggestIconFromName(name) ?? DEFAULT_GOAL_ICON;

/** The target as the keypad would have typed it: '3500', '12.5', '' for none. */
export const targetTextOf = (targetAmount: number): string => {
  const cents = toCents(targetAmount);
  if (!Number.isFinite(cents) || cents <= 0) return '';
  const text = fromCents(cents).toFixed(2);
  return text.replace(/\.?0+$/, '');
};

/** The form a goal's edit sheet opens with. */
export const formOfBank = (bank: PiggyBank): GoalForm => ({
  name: bank.name,
  targetText: targetTextOf(bank.targetAmount),
  noLimit: !(bank.targetAmount > 0),
  icon: safeGoalIcon(bank.icon),
});

/** The target the form stands for, in ringgit; 0 is open-ended. */
export const formTarget = (form: Pick<GoalForm, 'targetText' | 'noLimit'>): number =>
  form.noLimit ? 0 : fromCents(amountToCents(form.targetText));

/**
 * Having a limit but typing nothing would silently make the goal open-ended,
 * so it is a missing target, not a target of 0.
 */
export const targetMissing = (form: Pick<GoalForm, 'targetText' | 'noLimit'>): boolean =>
  !form.noLimit && amountToCents(form.targetText) <= 0;

/** Only what changed, so an untouched name or icon is never rewritten. The name is sent as typed; the plan trims and judges it. */
export const buildBankEdit = (bank: PiggyBank, form: GoalForm): BankEdit => {
  const edit: BankEdit = {};
  if (form.name.trim() !== bank.name) edit.name = form.name;
  if (toCents(formTarget(form)) !== toCents(bank.targetAmount)) edit.targetAmount = formTarget(form);
  if (form.icon !== safeGoalIcon(bank.icon)) edit.icon = form.icon;
  return edit;
};

export const isEmptyEdit = (edit: BankEdit): boolean =>
  edit.name === undefined && edit.targetAmount === undefined && edit.icon === undefined;

/** Characters, not UTF-16 units, so a Chinese or emoji name is not cut short. */
export const nameLength = (name: string): number => Array.from(name).length;

/** A pasted or typed name never goes past the limit. */
export const clipName = (name: string): string =>
  nameLength(name) <= GOAL_NAME_MAX ? name : Array.from(name).slice(0, GOAL_NAME_MAX).join('');

/** Whether Create can be pressed: a name once trimmed, and a target or "No limit". */
export const canCreateGoal = (form: Pick<GoalForm, 'name' | 'targetText' | 'noLimit'>): boolean => {
  const name = form.name.trim();
  return name.length > 0 && nameLength(name) <= GOAL_NAME_MAX && !targetMissing(form);
};

/** What Create hands to the app. */
export const newGoalOf = (
  form: GoalForm,
  autoSplit: boolean,
  imageUrl?: string
): { name: string; targetAmount: number; icon: string; imageUrl?: string; autoSplit: boolean } => ({
  name: form.name.trim(),
  targetAmount: formTarget(form),
  icon: form.icon,
  ...(imageUrl ? { imageUrl } : {}),
  autoSplit,
});

const HAN = /[㐀-鿿]/;

/**
 * An icon's name for a person, and for a screen reader: Chinese uses the first
 * Chinese word the catalogue holds for it (else its group), English reads the
 * symbol name with spaces.
 */
export const goalIconLabel = (name: string, lang: 'en' | 'zh'): string => {
  const group = iconGroupOf(name);
  if (lang === 'zh') {
    const word = group?.icons.find((i) => i.name === name)?.kw?.find((w) => HAN.test(w));
    return word ?? group?.zh ?? name;
  }
  const words = name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The goals suggested on the first-run screen. `icon` is a catalogue icon, null for "my own". */
export const FIRST_RUN_GOALS = [
  { key: 'travel', icon: 'flight', tint: 'peach' },
  { key: 'emergency', icon: 'shield_with_heart', tint: 'mint' },
  { key: 'phone', icon: 'smartphone', tint: 'sun' },
  { key: 'own', icon: null, tint: 'lav' },
] as const;
