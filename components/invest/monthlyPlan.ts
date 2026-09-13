import type { InvestSettings, PiggyBank, StyleMix } from '../../types';
import type { Quote, Quotes } from '../../services/holdings';
import { BOARD_LOT, costCents, feeDrag, feesFor, lotPlan, totalFees, valueCents, type Broker, type SecurityType, type TradeFees } from '../../services/fees';
import type { BlendedCounter, Feature, Features, Style } from '../../services/advisor/model';
import { STYLES } from '../../services/advisor/model';
import { toCents } from '../../services/money';

/**
 * The arithmetic behind the monthly buy page and its Home card, kept apart
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

/* ------------------------------------------------------------ pay from */

export type PayFrom = { mode: 'goal'; goalId: string } | { mode: 'none' };

const activeGoals = (banks: PiggyBank[]) => banks.filter((b) => !b.archivedAt);

/**
 * Which goal the page starts on. The saved choice wins while that goal still
 * exists. With nothing saved, the goal holding the most money is the one most
 * likely set aside for this. A saved goal that has since been deleted is not
 * swapped for a different one behind the person's back — they pick again.
 */
export const defaultPayFrom = (banks: PiggyBank[], budgetGoalId: string | null): PayFrom => {
  const goals = activeGoals(banks);
  if (budgetGoalId !== null) {
    return goals.some((b) => b.id === budgetGoalId) ? { mode: 'goal', goalId: budgetGoalId } : { mode: 'none' };
  }
  if (goals.length === 0) return { mode: 'none' };
  const richest = goals.reduce((best, b) => (b.currentAmount > best.currentAmount ? b : best), goals[0]);
  return { mode: 'goal', goalId: richest.id };
};

/**
 * What the plan may spend, in sen. From a goal it is never more than the goal
 * holds — a buy bigger than the balance would be refused anyway — and a goal
 * that is overspent has nothing to give. `typedCents` null means "all of it".
 */
export const planBudget = (
  payFrom: PayFrom,
  typedCents: number | null,
  banks: PiggyBank[]
): { cashCents: number; balanceCents: number | null; over: boolean } => {
  if (payFrom.mode === 'none') return { cashCents: Math.max(0, typedCents ?? 0), balanceCents: null, over: false };
  const bank = banks.find((b) => b.id === payFrom.goalId);
  const balance = Math.max(0, toCents(bank?.currentAmount ?? 0));
  if (typedCents === null) return { cashCents: balance, balanceCents: balance, over: false };
  const typed = Math.max(0, typedCents);
  return { cashCents: Math.min(typed, balance), balanceCents: balance, over: typed > balance };
};

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

/* -------------------------------------------------------------- sizing */

export interface Order {
  units: number;
  valueCents: number;
  fees: TradeFees;
  totalCents: number;
  /** Fees as a share of the value bought. */
  drag: number;
  /** What the budget has left once this is paid. */
  leftCents: number;
}

export type Sizing =
  /** Not even one unit plus fees fits. */
  | { kind: 'none'; oneUnitCents: number }
  /** Under a full lot. `order` is set only when buying the odd units now was chosen. */
  | { kind: 'shortOfLot'; units: number; shortCents: number; lotCents: number; order: Order | null }
  /** At least one full lot; `odd` more units only fit on the odd-lot market. */
  | { kind: 'lots'; units: number; lots: number; odd: number; order: Order };

const orderFor = (units: number, pricePoints: number, broker: Broker, type: SecurityType, cashCents: number): Order => {
  const value = valueCents(units, pricePoints);
  const fees = feesFor(value, broker, type);
  const total = value + totalFees(fees);
  return { units, valueCents: value, fees, totalCents: total, drag: feeDrag(fees, value), leftCents: cashCents - total };
};

/**
 * What the budget buys. Full lots are the default; `allNow` is the person's
 * choice to take the odd units too, which trade on a thinner market.
 */
export const sizeBuy = (
  cashCents: number,
  pricePoints: number,
  broker: Broker,
  type: SecurityType,
  allNow: boolean
): Sizing => {
  const plan = lotPlan(cashCents, pricePoints, broker, type);
  if (plan.kind === 'none') return { kind: 'none', oneUnitCents: costCents(1, pricePoints, broker, type) };
  if (plan.kind === 'shortOfLot') {
    return {
      kind: 'shortOfLot',
      units: plan.units,
      shortCents: plan.shortCents,
      lotCents: plan.shortCents + cashCents,
      order: allNow ? orderFor(plan.units, pricePoints, broker, type, cashCents) : null,
    };
  }
  const units = allNow ? plan.units : plan.lots * BOARD_LOT;
  return { kind: 'lots', units: plan.units, lots: plan.lots, odd: plan.odd, order: orderFor(units, pricePoints, broker, type, cashCents) };
};

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

/** "yield 6.3% · no cuts in 3 yrs · 12m +21.9%" under a ranked row. */
export const factsText = (words: PlanWords, x: Features) =>
  [
    words.facts.yield(pct(x.yield12)),
    x.cuts3y === 0 ? words.facts.noCuts : words.facts.cuts(x.cuts3y),
    words.facts.ret12(`${x.mom12 >= 0 ? '+' : ''}${pct(x.mom12)}`),
  ].join(' · ');
