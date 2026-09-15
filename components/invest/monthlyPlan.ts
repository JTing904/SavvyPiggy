import type { InvestSettings, StyleMix } from '../../types';
import type { Quote, Quotes } from '../../services/holdings';
import type { BlendedCounter, Feature, Features, Style } from '../../services/advisor/model';
import { STYLES } from '../../services/advisor/model';

/**
 * The arithmetic behind the recommendation page and its Home card, kept apart
 * from React so it can be tested. Nothing here writes anything: the page only
 * ever hands a draft to the Buy sheet, which is where money moves.
 */

/** One colour per style, the same everywhere a style is drawn. */
export const STYLE_COLORS: Record<Style, string> = {
  income: '#2DD4BF',
  cash: '#FBBF24',
  price: '#A78BFA',
};

/** Styles that carry any weight, in the fixed order they are always listed. */
export const activeStyles = (mix: StyleMix): Style[] => STYLES.filter((s) => mix[s] > 0);

/* -------------------------------------------------------------- prices */

/** A quote's price in ten-thousandths of a ringgit; null when there is none. */
export const pricePointsOfQuote = (quote: Quote | undefined): number | null => {
  if (!quote) return null;
  const points = quote.pricePoints ?? quote.priceCents * 100;
  return points > 0 ? points : null;
};

/** Two sets of quotes, keeping whichever price for a symbol was read later. */
export const mergeQuotes = (a: Quotes, b: Quotes): Quotes => {
  const out: Quotes = { ...a };
  for (const [symbol, quote] of Object.entries(b)) {
    const mine = out[symbol];
    if (!mine || quote.at >= mine.at) out[symbol] = quote;
  }
  return out;
};

/** RM7.90, RM0.345, RM0.0125 — as many decimals as the price really has, never fewer than two. */
export const priceText = (points: number) => {
  const decimals = points % 100 === 0 ? 2 : points % 10 === 0 ? 3 : 4;
  return `RM${(points / 10_000).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

/** 0.0633 → "6.3%". */
export const pct = (x: number, decimals = 1) => `${(x * 100).toFixed(decimals)}%`;

/* ---------------------------------------------------------------- pick */

/** Top two so close in match that calling one the winner would overstate it. */
export const TIE_GAP = 5;

export const isTie = (ranked: Pick<BlendedCounter, 'match'>[]) =>
  ranked.length >= 2 && ranked[0].match - ranked[1].match < TIE_GAP;

/**
 * The same feature can be the best reason for two styles at once (a high
 * yield helps both dividend styles). It is said once, with both styles beside it.
 */
export const groupReasons = <T extends { style: Style; feature: Feature }>(items: T[]) => {
  const out: { feature: Feature; styles: Style[] }[] = [];
  for (const { style, feature } of items) {
    const row = out.find((r) => r.feature === feature);
    if (row) row.styles.push(style);
    else out.push({ feature, styles: [style] });
  }
  return out;
};

/** The earliest and latest months any style's record covers, "YYYY-MM". */
export const recordSpan = (records: Record<Style, { from: string | null; to: string | null } | null> | null) => {
  let from: string | null = null;
  let to: string | null = null;
  for (const s of STYLES) {
    const r = records?.[s];
    if (!r) continue;
    if (r.from && (!from || r.from < from)) from = r.from;
    if (r.to && (!to || r.to > to)) to = r.to;
  }
  return from && to ? { from, to } : null;
};

/** "2026-09" as a Date on the 1st, local time. */
export const monthDate = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
};

/** The watchlist's symbols, in order, once each. */
export const watchSymbols = (watchlist: InvestSettings['watchlist']) => [...new Set(watchlist.map((w) => w.symbol))];

/* ------------------------------------------------------------- wording */

type PlanWords = typeof import('../../i18n/en/plan').plan;

/** One plain sentence about the number behind a reason, in the words given. */
export const reasonText = (words: PlanWords, feature: Feature, x: Features) => {
  const r = words.reason;
  switch (feature) {
    case 'yield12':
      return r.yield12(pct(x.yield12));
    case 'divGrowth':
      return x.divGrowth >= 0 ? r.divUp(pct(x.divGrowth)) : r.divDown(pct(-x.divGrowth));
    case 'payCount12': {
      const n = Math.round(x.payCount12);
      return n <= 0 ? r.payNone : r.payCount(n);
    }
    case 'cuts3y':
      return x.cuts3y === 0 ? r.noCuts : r.cuts(x.cuts3y);
    case 'dist52':
      // Within half a percent of the high reads as at it; "0.2% below" is noise.
      return x.dist52 > -0.005 ? r.atHigh : r.belowHigh(pct(-x.dist52));
    case 'vsMA6':
      return x.vsMA6 >= 0 ? r.aboveMa : r.belowMa;
    case 'mom3':
      return x.mom3 >= 0 ? r.up3(pct(x.mom3)) : r.down3(pct(-x.mom3));
    case 'mom12':
      return x.mom12 >= 0 ? r.up12(pct(x.mom12)) : r.down12(pct(-x.mom12));
    case 'vol12':
      return r.vol(pct(x.vol12));
  }
};

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * A reason, said so it makes sense on the side of the pick it is on.
 *
 * The models weigh the same fact differently: a high yield helps the "big
 * payouts" style and counts against "steady dividends", because high yields
 * are cut more often. Printing "Paid 6.3% in dividends" under both "for" and
 * "against" read as a contradiction, so each side says why. A combination
 * that has no honest plain-language reading — "no cuts in 3 years" as a
 * reason against — is left out rather than shown. Null means skip the line.
 */
export const reasonLine = (
  words: PlanWords,
  feature: Feature,
  x: Features,
  side: 'for' | 'against',
  list: Features[]
): string | null => {
  const r = words.reason;
  switch (feature) {
    case 'yield12': {
      const high = x.yield12 >= median(list.map((c) => c.yield12));
      if (side === 'for') return high ? r.yield12(pct(x.yield12)) : r.modestYield(pct(x.yield12));
      return high ? r.highYield(pct(x.yield12)) : r.lowYield(pct(x.yield12));
    }
    case 'divGrowth':
      if (side === 'against' && x.divGrowth > 0.1) return r.bigJump(pct(x.divGrowth));
      if (side === 'for' && x.divGrowth < 0) return null;
      return reasonText(words, feature, x);
    case 'cuts3y':
      if (side === 'against' && x.cuts3y === 0) return null;
      if (side === 'for' && x.cuts3y > 0) return null;
      return reasonText(words, feature, x);
    case 'vol12': {
      const calm = x.vol12 <= median(list.map((c) => c.vol12));
      if (side === 'for') return calm ? r.steadier : null;
      return calm ? null : r.swingsMore(pct(x.vol12));
    }
    default:
      return reasonText(words, feature, x);
  }
};

/** A record clearly better than chance: at least five points over a random pick. */
export const CLEARLY_BETTER = 0.05;
export const beatsRandom = (record: { hitRate: number; randomRate: number }) =>
  record.hitRate - record.randomRate >= CLEARLY_BETTER;

/** "yield 6.3% · no cuts in 3 yrs · 12m +21.9%" under a ranked row. */
export const factsText = (words: PlanWords, x: Features) =>
  [
    words.facts.yield(pct(x.yield12)),
    x.cuts3y === 0 ? words.facts.noCuts : words.facts.cuts(x.cuts3y),
    words.facts.ret12(`${x.mom12 >= 0 ? '+' : ''}${pct(x.mom12)}`),
  ].join(' · ');
