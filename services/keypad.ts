import { toCents } from './money';

/**
 * The app's own number pad for money amounts. The text being typed lives in
 * the caller; every key press is a pure step from one text to the next, so the
 * rules (two decimals, no stray zeros, a sane size) hold however it is drawn.
 */

const MAX_INTEGER_DIGITS = 7;
const MAX_DECIMALS = 2;

/** One key press: '0'-'9', '.', or 'b' for backspace. Anything refused returns the text unchanged. */
export const pressKey = (current: string, key: string): string => {
  if (key === 'b') return current.slice(0, -1);

  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' || current === '0' ? '0.' : `${current}.`;
  }

  if (!/^[0-9]$/.test(key)) return current;

  const dot = current.indexOf('.');
  if (dot >= 0) return current.length - dot - 1 >= MAX_DECIMALS ? current : current + key;

  // A leading zero never stays: '0' then '5' is '5', and '00' cannot be typed.
  if (current === '0') return key;
  return current.length >= MAX_INTEGER_DIGITS ? current : current + key;
};

/** The typed text in cents, rounded down; nothing typed (or only a dot) is 0. */
export const amountToCents = (text: string): number => {
  const n = Number(text);
  return text === '' || text === '.' || !Number.isFinite(n) ? 0 : toCents(n);
};

/**
 * The typed text split for display. `whole` carries thousands separators and is
 * '0' while nothing is typed; `cents` is exactly the decimals typed so far, so
 * the screen can show the missing ones as ghost digits.
 */
export const formatTyped = (text: string): { whole: string; cents: string; hasDot: boolean } => {
  const dot = text.indexOf('.');
  const whole = dot >= 0 ? text.slice(0, dot) : text;
  return {
    whole: Number(whole || '0').toLocaleString('en-US'),
    cents: dot >= 0 ? text.slice(dot + 1) : '',
    hasDot: dot >= 0,
  };
};
