import type { Activity } from '../types';
import { categoryOf } from './categories';
import { toCents } from './money';
import { walletSpentCents } from './analytics';
import { CATEGORY_WORDS, DAY_BEFORE_WORDS, FROM_WORDS, INCOME_WORDS, TODAY_WORDS, YESTERDAY_WORDS } from './quickWords';

/**
 * Reads one short line like "午餐 12.5 昨天" into what an entry needs.
 *
 * Rules a person can learn, not a guess: an amount, a "+" or an income word,
 * a day word, a goal's name, a word that points at one category. Anything the
 * line does not say is left unset, and anything it says in two ways (two
 * amounts, two categories) is left for the person to choose rather than picked.
 */

export interface QuickGoal {
  id: string;
  name: string;
}

export interface QuickContext {
  goals: QuickGoal[];
  now: Date;
  /** The earliest day an entry may be dated. */
  liveFrom: Date;
}

export type QuickIssue = 'noAmount' | 'manyAmounts' | 'tooOld' | 'badDay';

export interface QuickParse {
  /** Income when the line says so (a "+" or an income word), otherwise spending; null for an empty line. */
  kind: 'spend' | 'income' | null;
  /** The one amount in the line, in cents. */
  cents: number | null;
  /** Every distinct amount the line has, in cents, in the order written. */
  amounts: number[];
  /** A category key, when exactly one is pointed at. */
  category: string | null;
  /** A goal named in the line. */
  goalId: string | null;
  /** The day, as local midnight; null when the line does not name one (today). */
  day: Date | null;
  /** What is left of the line once the parts above are taken out. */
  note: string;
  issues: QuickIssue[];
}

const EMPTY: QuickParse = { kind: null, cents: null, amounts: [], category: null, goalId: null, day: null, note: '', issues: [] };

const isLatin = (word: string) => /^[a-z0-9' ]+$/.test(word);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Removes the first occurrence of any word from `text` (whole words for Latin ones), reporting whether one was there. */
const takeWord = (text: string, words: string[]): { text: string; found: boolean } => {
  for (const word of words) {
    const re = isLatin(word) ? new RegExp(`(?<![a-z0-9])${escapeRe(word)}(?![a-z0-9])`, 'i') : new RegExp(escapeRe(word));
    if (re.test(text)) return { text: text.replace(re, ' '), found: true };
  }
  return { text, found: false };
};

/** "12", "12.5" and "12.50" as cents, with no float arithmetic. */
const centsOf = (whole: string, fraction: string | undefined) => {
  const w = Number(whole);
  if (!Number.isFinite(w) || whole.length > 9) return null;
  return w * 100 + (fraction ? Number(fraction.padEnd(2, '0')) : 0);
};

const AMOUNT = /(?<![a-z\d.,])(\+)?\s*(?:(?:rm|myr)\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(?:rm|myr|块|元))?(?![a-z\d]|-[a-z])/gi;

export const parseQuick = (line: string, ctx: QuickContext): QuickParse => {
  let text = line.replace(/\s+/g, ' ').trim();
  if (!text) return { ...EMPTY };
  const issues: QuickIssue[] = [];

  // Which day. The words come out first so their digits are not read as an amount.
  let day: Date | null = null;
  const today = midnight(ctx.now);
  const back = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  let hit = takeWord(text, DAY_BEFORE_WORDS);
  if (hit.found) {
    day = back(2);
    text = hit.text;
  } else if ((hit = takeWord(text, YESTERDAY_WORDS)).found) {
    day = back(1);
    text = hit.text;
  } else if ((hit = takeWord(text, TODAY_WORDS)).found) {
    text = hit.text;
  } else {
    const m = /(\d{1,2})\s*[号日](?![a-z])/i.exec(text);
    if (m) {
      const n = Number(m[1]);
      // A day later than today's date can only be last month's.
      const month = n <= today.getDate() ? today.getMonth() : today.getMonth() - 1;
      const candidate = new Date(today.getFullYear(), month, n);
      if (n >= 1 && candidate.getDate() === n) day = candidate;
      else issues.push('badDay');
      text = text.replace(m[0], ' ');
    }
  }
  if (day && day.getTime() < midnight(ctx.liveFrom).getTime()) {
    issues.push('tooOld');
    day = null;
  }

  // Which amounts, and whether the line says it is income.
  let plus = false;
  const amounts: number[] = [];
  text = text.replace(AMOUNT, (whole, sign: string | undefined, intPart: string, fraction: string | undefined) => {
    const cents = centsOf(intPart.replace(/,/g, ''), fraction);
    if (cents === null || cents <= 0) return whole;
    if (sign) plus = true;
    if (!amounts.includes(cents)) amounts.push(cents);
    return ' ';
  });
  let cents: number | null = null;
  if (amounts.length === 1) cents = amounts[0];
  else if (amounts.length === 0) issues.push('noAmount');
  else issues.push('manyAmounts');

  // A goal named in the line is where the money comes from or goes to.
  let goalId: string | null = null;
  const lower = () => text.toLowerCase();
  const named = ctx.goals
    .filter((g) => g.name.trim().length >= 2 && lower().includes(g.name.trim().toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named) {
    goalId = named.id;
    const name = named.name.trim();
    const re = new RegExp(`(?:(${FROM_WORDS.map(escapeRe).join('|')})\\s*)?${escapeRe(name)}`, 'i');
    text = text.replace(re, ' ');
  }

  // Income by word.
  const income = takeWordKeep(text, INCOME_WORDS);

  // One category, or none when the words point at two.
  const matched = Object.entries(CATEGORY_WORDS)
    .filter(([, words]) => words.some((w) => matchesWord(text, w)))
    .map(([key]) => key);
  const category = matched.length === 1 ? matched[0] : null;

  const note = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，.。:：;；\-+]+|[\s,，.。:：;；\-+]+$/g, '')
    .trim();

  return {
    kind: plus || income ? 'income' : 'spend',
    cents,
    amounts,
    category,
    goalId,
    day,
    note,
    issues,
  };
};

const matchesWord = (text: string, word: string) =>
  isLatin(word)
    ? new RegExp(`(?<![a-z0-9])${escapeRe(word)}(?![a-z0-9])`, 'i').test(text)
    : text.includes(word);

/** Whether any of the words is in the text, leaving the text as it is (an income word is part of the note). */
const takeWordKeep = (text: string, words: string[]) => words.some((w) => matchesWord(text, w));

/**
 * An entry already on the books for the same day, amount and use: the one
 * worth a word of warning before it is written twice.
 */
export const findDuplicate = (
  activities: Activity[],
  probe: { cents: number; category: string; day: Date | null },
  now: Date = new Date()
): Activity | null => {
  const day = midnight(probe.day ?? now).getTime();
  for (const a of activities) {
    if (a.type !== 'withdraw') continue;
    const at = new Date(a.date);
    if (midnight(at).getTime() !== day) continue;
    const spent = a.distributions.reduce((sum, d) => (d.amount < 0 ? sum - toCents(d.amount) : sum), 0) + walletSpentCents(a);
    if (spent === probe.cents && categoryOf(a.category).key === categoryOf(probe.category).key) return a;
  }
  return null;
};
