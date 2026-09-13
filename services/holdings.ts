import type { Holding, Trade } from '../types';
import { toCents } from './money';
import { totalFees, valueCents } from './fees';

/**
 * The arithmetic behind the holdings screen. Everything here is pure so the
 * tests can hold it to the same standard as the savings ledger: whole sen,
 * rounded down, and never inventing money that was not paid.
 *
 * Prices arrive from Yahoo as ordinary numbers (10.56) and become sen (1056)
 * at the edge, so nothing downstream deals in floats.
 */

/** A price already turned into whole sen, with when it was read. */
export interface Quote {
  priceCents: number;
  previousCloseCents: number;
  /** Epoch ms of the exchange's own timestamp, not of our request. */
  at: number;
}

/** Prices keyed by the symbol they belong to. */
export type Quotes = Record<string, Quote>;

/**
 * Bursa counters are four digits; Yahoo wants the exchange suffix. A code
 * typed as "1155" and one pasted as "1155.kl" have to end up the same, or the
 * one-row-per-symbol rule quietly breaks.
 */
export const normalizeSymbol = (input: string) => {
  const raw = input.trim().toUpperCase();
  if (!raw) return '';
  if (raw.endsWith('.KL')) return raw;
  return /^\d{3,5}$/.test(raw) ? `${raw}.KL` : raw;
};

/**
 * Yahoo's chart payload, reduced to the two prices we show. Anything missing
 * means no quote at all — the screen then falls back to the cached one rather
 * than rendering a zero.
 */
export const parseQuote = (payload: unknown): Quote | null => {
  const meta = (payload as { chart?: { result?: { meta?: Record<string, unknown> }[] } })?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;

  const previous = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
  const seconds = Number(meta.regularMarketTime);

  return {
    priceCents: toCents(price),
    previousCloseCents: toCents(Number.isFinite(previous) && previous > 0 ? previous : price),
    at: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now(),
  };
};

/** What one unit cost on average, in sen. Fractional on purpose: it is only
    ever divided out for display, never stored back. */
export const averageCostCents = (holding: Pick<Holding, 'units' | 'costCents'>) =>
  holding.units > 0 ? holding.costCents / holding.units : 0;

export const marketValueCents = (holding: Pick<Holding, 'units'>, priceCents: number) =>
  holding.units * priceCents;

/** Paper gain against what was actually paid. */
export const gain = (holding: Pick<Holding, 'units' | 'costCents'>, priceCents: number) => {
  const cents = marketValueCents(holding, priceCents) - holding.costCents;
  return {
    cents,
    percent: holding.costCents > 0 ? Math.round((cents / holding.costCents) * 1000) / 10 : 0,
  };
};

/** Today's move on the position, from the previous close. */
export const dayChangeCents = (holding: Pick<Holding, 'units'>, quote: Quote) =>
  holding.units * (quote.priceCents - quote.previousCloseCents);

/**
 * Buying more of something already held. Units and money paid are simply added
 * together, which lets the average fall out of the division — no rounding, so
 * ten top-ups cost exactly what ten top-ups cost.
 */
export const applyBuy = (
  holding: Pick<Holding, 'units' | 'costCents'>,
  units: number,
  priceCents: number
) => buyInto(holding, units, units * priceCents);

/** A buy by what it cost in total — shares and fees — which is what the average is made of. */
export const buyInto = (holding: Pick<Holding, 'units' | 'costCents'>, units: number, paidCents: number) => ({
  units: holding.units + units,
  costCents: holding.costCents + paidCents,
});

/**
 * Selling takes cost out at the average, which is what leaves the average
 * itself untouched — the standard way of accounting for a partial sale. What
 * the sale actually earned over that cost is handed back as the realised gain.
 */
export const applySell = (
  holding: Pick<Holding, 'units' | 'costCents'>,
  units: number,
  priceCents: number
) => sellFrom(holding, units, Math.min(Math.max(0, Math.floor(units)), holding.units) * priceCents);

/** A sale by what actually came back — the sale less its fees. */
export const sellFrom = (holding: Pick<Holding, 'units' | 'costCents'>, units: number, receivedCents: number) => {
  const sold = Math.min(Math.max(0, Math.floor(units)), holding.units);
  // Round the cost coming out so a full sale empties the position exactly.
  const costOut = sold === holding.units ? holding.costCents : Math.round(sold * averageCostCents(holding));
  return {
    units: holding.units - sold,
    costCents: holding.costCents - costOut,
    realisedCents: receivedCents - costOut,
  };
};

/* ------------------------------------------------------------------ trades */

/**
 * Local midnight of the day an instant falls on. Trades are dated by day, not
 * by the minute they were typed in: an exchange settles on days, and which
 * side of a day you were on is what decides a dividend.
 */
export const dayStart = (ms: number) => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Oldest first; two trades on the same day keep the order they were entered. */
export const ordered = (trades: Trade[]) =>
  [...trades].sort((a, b) => a.tradedAt - b.tradedAt || a.createdAt - b.createdAt);

/**
 * The position a log of trades adds up to. Nothing stores units and cost —
 * they are worked out here every time, which is what lets one wrong trade be
 * corrected without touching any other, and stops the stored total and the
 * history from ever telling two different stories.
 *
 * A dividend is cash, not units: it leaves the position exactly as it was.
 */
export const replay = (trades: Trade[]): Pick<Holding, 'units' | 'costCents'> => {
  let position = { units: 0, costCents: 0 };
  for (const trade of ordered(trades)) {
    if (trade.kind === 'buy') {
      position = buyInto(position, trade.units, tradeTotalCents(trade));
    } else if (trade.kind === 'sell') {
      const after = sellFrom(position, trade.units, tradeTotalCents(trade));
      position = { units: after.units, costCents: after.costCents };
    }
  }
  return position;
};

/**
 * Every position the log adds up to, one per counter, oldest holding first.
 * A counter that has been sold out entirely drops off: its trades stay in the
 * log, but there is no position left to show.
 */
export const buildHoldings = (trades: Trade[]): Holding[] => {
  const bySymbol = new Map<string, Trade[]>();
  for (const trade of trades) {
    const list = bySymbol.get(trade.symbol);
    if (list) list.push(trade);
    else bySymbol.set(trade.symbol, [trade]);
  }

  return [...bySymbol.entries()]
    .map(([symbol, list]) => {
      const first = ordered(list)[0];
      const last = ordered(list)[list.length - 1];
      return {
        id: symbol,
        symbol,
        // The newest trade has the name the user most recently saw.
        name: last.name || first.name,
        createdAt: first.tradedAt,
        ...replay(list),
      };
    })
    .filter((holding) => holding.units > 0)
    .sort((a, b) => a.createdAt - b.createdAt);
};

/** How many units were held at the end of the given day. */
export const unitsHeldOn = (trades: Trade[], atMs: number) =>
  replay(trades.filter((trade) => trade.tradedAt <= dayStart(atMs))).units;

/**
 * The units a dividend is owed on. The ex-date is the first day a share trades
 * without its dividend, so entitlement is settled by the close of the day
 * before: buy on the ex-date and it stays with the seller, sell the day after
 * and it is still yours. This is the whole reason trades carry a date —
 * reading today's units on the pay date would pay the wrong number.
 */
export const unitsOnExDate = (trades: Trade[], exDateMs: number) =>
  unitsHeldOn(trades, dayStart(exDateMs) - 1);

/**
 * What one row of the log is worth in money. Buys and sells are units times
 * the price paid; a dividend is quoted per unit in ten-thousandths of a
 * ringgit, because Bursa pays amounts like RM0.0125.
 */
export const tradeCents = (trade: Pick<Trade, 'kind' | 'units' | 'priceCents' | 'perUnitPoints' | 'pricePoints'>) =>
  trade.kind === 'dividend'
    ? Math.floor((trade.units * (trade.perUnitPoints ?? 0)) / 100)
    : trade.pricePoints
      ? valueCents(trade.units, trade.pricePoints)
      : trade.units * trade.priceCents;

/**
 * The money a trade actually moved: what a buy cost with its fees, what a sale
 * brought home after them. A dividend is its value. Older trades have no fees
 * recorded, and none are guessed.
 */
export const tradeTotalCents = (trade: Pick<Trade, 'kind' | 'units' | 'priceCents' | 'perUnitPoints' | 'pricePoints' | 'fees'>) => {
  const value = tradeCents(trade);
  if (trade.kind === 'buy') return value + totalFees(trade.fees);
  if (trade.kind === 'sell') return Math.max(0, value - totalFees(trade.fees));
  return value;
};

/** A price as ten-thousandths of a ringgit, whichever way the trade stored it. */
export const pricePointsOf = (trade: Pick<Trade, 'priceCents' | 'pricePoints'>) => trade.pricePoints ?? trade.priceCents * 100;

/**
 * What the investing has actually come to, in the three parts it is made of.
 *
 * A gain on screen usually means only the paper gain on what is still held,
 * which flatters or punishes depending on what was sold. This adds the two
 * pieces that are just as real: what past sales made, and what the dividends
 * paid. Together they are the answer to "am I ahead".
 */
/**
 * What every position cost at the end of each month, back to the first trade.
 *
 * This half of the picture can be worked out honestly at any time: the trade
 * log says exactly what had been bought and sold by any date. What it cannot
 * say is what those shares were *worth* on a past day — the app keeps no
 * price history — which is why market value comes from snapshots taken as
 * time passes, and why the two lines start in different places.
 */
export const costByMonth = (trades: Trade[], now: Date = new Date()) => {
  if (trades.length === 0) return [];

  const first = new Date(Math.min(...trades.map((t) => t.tradedAt)));
  const out: { key: string; end: Date; costCents: number }[] = [];

  for (
    let month = new Date(first.getFullYear(), first.getMonth(), 1);
    month <= now;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  ) {
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const upTo = trades.filter((t) => t.tradedAt < end.getTime());
    const costCents = [...new Set(upTo.map((t) => t.symbol))].reduce(
      (sum, symbol) => sum + replay(upTo.filter((t) => t.symbol === symbol)).costCents,
      0
    );
    out.push({
      key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
      end,
      costCents,
    });
  }
  return out;
};
export interface Performance {
  /** What the open positions cost, and what they are worth now. */
  costCents: number;
  valueCents: number;
  unrealisedCents: number;
  /** Made on shares already sold, at the average cost they left at. */
  realisedCents: number;
  dividendCents: number;
  /** The three added together. */
  totalCents: number;
  /** Every ringgit ever put in, which is what the return is measured against. */
  investedCents: number;
  returnPercent: number;
}

export const performance = (trades: Trade[], quotes: Quotes): Performance => {
  let costCents = 0;
  let valueCents = 0;
  let realisedCents = 0;
  let dividendCents = 0;
  let investedCents = 0;

  const bySymbol = new Map<string, Trade[]>();
  for (const trade of trades) {
    const list = bySymbol.get(trade.symbol);
    if (list) list.push(trade);
    else bySymbol.set(trade.symbol, [trade]);
  }

  for (const [symbol, list] of bySymbol) {
    let position = { units: 0, costCents: 0 };
    for (const trade of ordered(list)) {
      if (trade.kind === 'buy') {
        investedCents += tradeTotalCents(trade);
        position = buyInto(position, trade.units, tradeTotalCents(trade));
      } else if (trade.kind === 'sell') {
        const after = sellFrom(position, trade.units, tradeTotalCents(trade));
        realisedCents += after.realisedCents;
        position = { units: after.units, costCents: after.costCents };
      } else {
        dividendCents += tradeCents(trade);
      }
    }

    costCents += position.costCents;
    const quote = quotes[symbol];
    // No price means holding it at cost, the same as everywhere else: a
    // missing quote must never read as a loss.
    valueCents += position.units * (quote ? quote.priceCents : Math.round(averageCostCents(position)));
  }

  const unrealisedCents = valueCents - costCents;
  const totalCents = unrealisedCents + realisedCents + dividendCents;
  return {
    costCents,
    valueCents,
    unrealisedCents,
    realisedCents,
    dividendCents,
    totalCents,
    investedCents,
    returnPercent: investedCents > 0 ? Math.round((totalCents / investedCents) * 1000) / 10 : 0,
  };
};

export interface PortfolioTotals {
  valueCents: number;
  costCents: number;
  gainCents: number;
  gainPercent: number;
  dayChangeCents: number;
  /** Oldest quote in the set, so the screen can say how stale the worst is. */
  quotedAt: number | null;
  /** Counters we have no price for at all, cached or otherwise. */
  missing: string[];
}

/** The numbers along the top of the holdings screen, and on the Home card. */
export const portfolioTotals = (holdings: Holding[], quotes: Quotes): PortfolioTotals => {
  let valueCents = 0;
  let costCents = 0;
  let dayCents = 0;
  let quotedAt: number | null = null;
  const missing: string[] = [];

  for (const holding of holdings) {
    costCents += holding.costCents;
    const quote = quotes[holding.symbol];
    if (!quote) {
      missing.push(holding.symbol);
      // With no price, the position is worth what was paid for it — better
      // than dropping it and making the total look like money went missing.
      valueCents += holding.costCents;
      continue;
    }
    valueCents += marketValueCents(holding, quote.priceCents);
    dayCents += dayChangeCents(holding, quote);
    quotedAt = quotedAt === null ? quote.at : Math.min(quotedAt, quote.at);
  }

  const gainCents = valueCents - costCents;
  return {
    valueCents,
    costCents,
    gainCents,
    gainPercent: costCents > 0 ? Math.round((gainCents / costCents) * 1000) / 10 : 0,
    dayChangeCents: dayCents,
    quotedAt,
    missing,
  };
};
