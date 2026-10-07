/**
 * The app's own number pad for money amounts, typed the way a till or TNG does
 * it: the digits are cents and push in from the right, so there is no decimal
 * point to find. Typing 6, 0, 0 gives RM6.00; 1, 2, 5, 0 gives RM12.50.
 *
 * The text being typed lives in the caller and is only the digits ("" is zero,
 * "600" is RM6.00). Every key press is a pure step from one text to the next,
 * so the rules (no stray zeros, a sane size) hold however it is drawn.
 */

/** RM99,999,999.99 at the most. */
const MAX_DIGITS = 10;

/** One key press: '0'-'9', '00', or 'b' for backspace. Anything refused returns the text unchanged. */
export const pressKey = (current: string, key: string): string => {
  if (key === 'b') return current.slice(0, -1);
  if (key === '00') return pressKey(pressKey(current, '0'), '0');
  if (!/^[0-9]$/.test(key)) return current;

  // A leading zero never stays: nothing is typed until the first real digit.
  if (current === '') return key === '0' ? '' : key;
  return current.length >= MAX_DIGITS ? current : current + key;
};

/** The typed text in cents; nothing typed is 0. */
export const amountToCents = (text: string): number => (/^[0-9]+$/.test(text) ? Number(text) : 0);

/** Cents back to the text the keypad would have typed: 600 is "600", nothing is "". */
export const typedFromCents = (cents: number): string => (Number.isFinite(cents) && cents > 0 ? String(Math.floor(cents)) : '');

/**
 * The typed text split for display. `whole` carries thousands separators and is
 * '0' while nothing is typed; `cents` is always two digits, so the sen never
 * jump about as the first digits go in.
 */
export const formatTyped = (text: string): { whole: string; cents: string; typed: boolean } => {
  const padded = (/^[0-9]*$/.test(text) ? text : '').padStart(3, '0');
  return {
    whole: Number(padded.slice(0, -2)).toLocaleString('en-US'),
    cents: padded.slice(-2),
    typed: text !== '',
  };
};

/**
 * A number typed as it reads: "100" shares, "7.25" a price, "8.00" a fee. Unlike
 * `pressKey` the digits do not push in from the right, because a share price has
 * to be able to say RM0.345 and a count of shares has no decimals at all.
 *
 * One key press: '0'-'9', '.' (only when `decimals` allows one), or 'b' for
 * backspace. Anything refused returns the text unchanged.
 */
export const pressNumber = (current: string, key: string, decimals: number): string => {
  if (key === 'b') return current.slice(0, -1);
  if (key === '.') {
    if (decimals <= 0 || current.includes('.')) return current;
    return current === '' ? '0.' : current + '.';
  }
  if (!/^[0-9]$/.test(key)) return current;
  if (current.length >= 12) return current;
  const dot = current.indexOf('.');
  if (dot >= 0 && current.length - dot - 1 >= decimals) return current;
  // A leading zero never stays: 0 then 5 is 5, but 0 then . keeps its zero.
  if (current === '0') return key;
  return current + key;
};
