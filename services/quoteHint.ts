import type { Quote } from './holdings';
import { quotePricePoints } from './holdings';

/**
 * The "last price" hint under the price field of a new buy or sale.
 *
 * It is only ever a suggestion the person taps: a quote is the market's last
 * trade, not what their order filled at, so nothing here writes a price on its
 * own. Pure, so the rules can be tested without a screen.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Bursa keeps Malaysia time, which has no daylight saving. */
const KL_OFFSET = 8 * HOUR;
/** A quote this recent is fresh whatever the day of the week. */
const FRESH_MS = 30 * HOUR;
/** Never fresh past a long weekend's worth, however quiet the market was. */
const LONGEST_GAP_MS = 4 * DAY;
/** The market closes at 17:00 KL; from 18:00 today's session has certainly happened. */
const SESSION_DONE_HOUR = 18;

const klDay = (ms: number) => Math.floor((ms + KL_OFFSET) / DAY);
/** 1970-01-01 was a Thursday. */
const isWeekday = (day: number) => {
  const dow = (day + 4) % 7;
  return dow >= 1 && dow <= 5;
};

/**
 * Whether a quote is recent enough to be worth suggesting: within about one
 * trading day. A Friday close is still the latest price all weekend, and a
 * quote from before a session that has since been and gone is not.
 */
export const isFreshQuote = (at: number, now: number): boolean => {
  const age = now - at;
  if (!Number.isFinite(at) || age < -10 * 60_000) return false;
  if (age <= FRESH_MS) return true;
  if (age > LONGEST_GAP_MS) return false;

  // Older than a day: fine only if no trading session has happened since.
  const quoteDay = klDay(at);
  const today = klDay(now);
  for (let d = quoteDay + 1; d < today; d++) if (isWeekday(d)) return false;
  const klHour = Math.floor(((now + KL_OFFSET) % DAY) / HOUR);
  if (today > quoteDay && isWeekday(today) && klHour >= SESSION_DONE_HOUR) return false;
  return true;
};

export type AgoUnit = 'now' | 'minutes' | 'hours' | 'days';

/** How long ago, as a count and a unit the caller words in the right language. */
export const agoOf = (at: number, now: number): { unit: AgoUnit; n: number } => {
  const age = Math.max(0, now - at);
  if (age < 60_000) return { unit: 'now', n: 0 };
  if (age < HOUR) return { unit: 'minutes', n: Math.floor(age / 60_000) };
  if (age < DAY) return { unit: 'hours', n: Math.floor(age / HOUR) };
  return { unit: 'days', n: Math.floor(age / DAY) };
};

/** 10.60 stays 10.60 and 0.345 stays 0.345: two places at least, four at most. */
export const priceText = (points: number) => (points / 10_000).toFixed(4).replace(/(\.\d{2}\d*?)0+$/, '$1');

export interface QuoteHint {
  /** The price as the field would hold it, e.g. "9.82". */
  text: string;
  points: number;
  ago: { unit: AgoUnit; n: number };
}

/** What to offer for a counter, or null when there is no price worth offering. */
export const hintFor = (quote: Quote | null | undefined, now: number): QuoteHint | null => {
  if (!quote || !Number.isFinite(quote.priceCents) || quote.priceCents <= 0) return null;
  if (!isFreshQuote(quote.at, now)) return null;
  const points = quotePricePoints(quote);
  if (!(points > 0)) return null;
  return { text: priceText(points), points, ago: agoOf(quote.at, now) };
};

/**
 * Shown only on a new trade, only while the price field is still empty. An
 * edit already has its own price, and a typed one is never second-guessed.
 */
export const showHint = (i: { isNew: boolean; priceField: string; quote: Quote | null | undefined; now: number }): QuoteHint | null =>
  i.isNew && i.priceField.trim() === '' ? hintFor(i.quote, i.now) : null;

/** The price field, and whether its value came from the hint rather than from the person. */
export interface PriceField {
  text: string;
  fromHint: boolean;
}

/** Tapping "Use RM9.82": the price is filled in, and remembered as not typed. */
export const applyHint = (hint: QuoteHint): PriceField => ({ text: hint.text, fromHint: true });

/** Any edit makes the price the person's own again. */
export const typePrice = (text: string): PriceField => ({ text, fromHint: false });

/**
 * Whether a counter still needs a price fetched for the hint: a new trade with
 * an empty field and no fresh price already in hand, asked for at most once
 * per counter so a failed fetch is not retried on every render.
 */
export const needsQuoteFetch = (i: {
  isNew: boolean;
  symbol: string;
  priceField: string;
  have: Quote | null | undefined;
  asked: ReadonlySet<string>;
  now: number;
}): boolean => i.isNew && !!i.symbol && i.priceField.trim() === '' && !i.asked.has(i.symbol) && !hintFor(i.have, i.now);
