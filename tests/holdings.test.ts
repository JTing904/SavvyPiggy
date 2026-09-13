import {
  applyBuy,
  buildHoldings,
  costByMonth,
  dayStart,
  performance,
  tradeCents,
  replay,
  unitsHeldOn,
  unitsOnExDate,
  applySell,
  averageCostCents,
  dayChangeCents,
  gain,
  marketValueCents,
  normalizeSymbol,
  parseQuote,
  portfolioTotals,
  pointsValueCents,
  quoteValueCents,
  type Quote,
} from '../services/holdings';
import type { Holding, Trade } from '../types';
import { eq, report } from './harness';

const holding = (extra: Partial<Holding> = {}): Holding => ({
  id: 'h1',
  symbol: '1155.KL',
  name: 'MAYBANK',
  units: 500,
  costCents: 460000, // RM4,600.00 → RM9.20 a unit
  createdAt: 0,
  ...extra,
});

const quote = (price: number, previous = price, at = 1_757_000_000_000): Quote => ({
  priceCents: price,
  previousCloseCents: previous,
  at,
});

// --- symbols
eq('a bare Bursa code gains the suffix', normalizeSymbol('1155'), '1155.KL');
eq('a pasted symbol is case-folded, not doubled', normalizeSymbol(' 1155.kl '), '1155.KL');
eq('a name is left alone apart from case', normalizeSymbol('maybank'), 'MAYBANK');
eq('nothing in, nothing out', normalizeSymbol('   '), '');

// --- quotes
const payload = {
  chart: { result: [{ meta: { regularMarketPrice: 10.56, chartPreviousClose: 10.58, regularMarketTime: 1_757_000_000 } }] },
};
eq('a quote arrives in sen, and in points for half-sen prices', parseQuote(payload), { priceCents: 1056, pricePoints: 105_600, previousCloseCents: 1058, previousClosePoints: 105_800, at: 1_757_000_000_000 });
eq('a missing payload is no quote', parseQuote({}), null);
eq('a zero price is no quote', parseQuote({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }), null);
eq(
  'a missing previous close falls back to the price',
  parseQuote({ chart: { result: [{ meta: { regularMarketPrice: 3.42, regularMarketTime: 1 } }] } })?.previousCloseCents,
  342
);

// --- the position as it stands
eq('average is divided out of the total', averageCostCents(holding()), 920);
eq('an empty position has no average', averageCostCents(holding({ units: 0, costCents: 0 })), 0);
eq('market value at the last price', marketValueCents(holding(), 1056), 528000);
eq('gain against what was paid', gain(holding(), 1056), { cents: 68000, percent: 14.8 });
eq('a loss reads negative', gain(holding(), 780), { cents: -70000, percent: -15.2 });
eq("today's move uses the previous close", dayChangeCents(holding(), quote(1056, 1058)), -1000);

// --- half-sen prices
{
  // RM0.345 is 34 in whole sen; valued that way 1,000 units lost RM5.
  const half: Quote = { priceCents: 34, pricePoints: 3450, previousCloseCents: 34, previousClosePoints: 3400, at: 1 };
  eq('a half-sen price is valued exactly', quoteValueCents({ units: 1000 }, half), 34500);
  eq('an odd lot drops only the last fraction of a sen, downwards', pointsValueCents(1, 3450), 34);
  eq('a quote cached before points falls back to sen', quoteValueCents({ units: 1000 }, quote(34)), 34000);
  eq('the day move is in points too', dayChangeCents({ units: 1000 }, half), 500);
  eq('but not against a close cached in sen only',
    dayChangeCents({ units: 1000 }, { priceCents: 34, pricePoints: 3450, previousCloseCents: 34, at: 1 }), 0);
  const totals = portfolioTotals([holding({ units: 1000, costCents: 30000 })], { '1155.KL': half });
  eq('the portfolio total uses it', [totals.valueCents, totals.gainCents], [34500, 4500]);
  const p = performance(
    [{ id: 'hs', symbol: '1155.KL', name: 'X', kind: 'buy', units: 1000, priceCents: 30, tradedAt: 1, createdAt: 1 }],
    { '1155.KL': half }
  );
  eq('and so does the growth figure', p.valueCents, 34500);
}

// --- buying more
{
  const after = applyBuy(holding(), 100, 1050);
  eq('units and money paid both add up', after, { units: 600, costCents: 565000 });
  eq('the new average falls out of the division', Math.round(averageCostCents(after)), 942);
}
{
  // Ten top-ups at a price that does not divide evenly: the total must still
  // be exactly what was handed over, with nothing shaved off on the way.
  let pos = { units: 0, costCents: 0 };
  for (let i = 0; i < 10; i++) pos = applyBuy(pos, 7, 333);
  eq('repeated top-ups lose nothing to rounding', pos, { units: 70, costCents: 23310 });
}

// --- selling
{
  const after = applySell(holding(), 100, 1056);
  eq('units come off and cost leaves at the average', { units: after.units, costCents: after.costCents }, { units: 400, costCents: 368000 });
  eq('the average is untouched by a sale', Math.round(averageCostCents(after)), 920);
  eq('the sale reports what it actually earned', after.realisedCents, 13600);
}
{
  const all = applySell(holding(), 500, 1056);
  eq('selling the lot empties the position exactly', { units: all.units, costCents: all.costCents }, { units: 0, costCents: 0 });
  eq('and reports the whole gain', all.realisedCents, 68000);
}
{
  const odd = applySell(holding({ units: 3, costCents: 1000 }), 1, 400);
  eq('an inexact average still empties to zero over the full sale',
    applySell({ units: odd.units, costCents: odd.costCents }, 2, 400).costCents, 0);
}
eq('selling more than you hold sells what you hold', applySell(holding(), 900, 1000).units, 0);
eq('selling nothing changes nothing', applySell(holding(), 0, 1000), { units: 500, costCents: 460000, realisedCents: 0 });

// --- the portfolio
{
  const holdings = [
    holding(),
    holding({ id: 'h2', symbol: '6012.KL', name: 'MAXIS', units: 2000, costCents: 610000 }),
  ];
  const quotes = { '1155.KL': quote(1056, 1058, 100), '6012.KL': quote(342, 343, 200) };
  const totals = portfolioTotals(holdings, quotes);
  eq('total value', totals.valueCents, 528000 + 684000);
  eq('total cost', totals.costCents, 460000 + 610000);
  eq('total gain', { cents: totals.gainCents, percent: totals.gainPercent }, { cents: 142000, percent: 13.3 });
  eq("today's move across the lot", totals.dayChangeCents, -1000 + -2000);
  eq('staleness follows the oldest quote', totals.quotedAt, 100);
  eq('nothing is missing', totals.missing, []);
}
{
  // A counter we could not price is held at cost, so the total never looks
  // like money vanished while the network was down.
  const totals = portfolioTotals([holding()], {});
  eq('an unpriced position falls back to its cost', totals.valueCents, 460000);
  eq('and says so', totals.missing, ['1155.KL']);
  eq('with no gain invented', totals.gainCents, 0);
  eq('and no timestamp to show', totals.quotedAt, null);
}
eq('an empty portfolio is all zeroes', portfolioTotals([], {}), {
  valueCents: 0, costCents: 0, gainCents: 0, gainPercent: 0, dayChangeCents: 0, quotedAt: null, missing: [],
});


/* --------------------------------------------------------------- the log */

const DAY = 86_400_000;
/** Dates as local midnights, the way a trade is stored. */
const on = (day: number) => dayStart(new Date(2026, 2, day).getTime());

let seq = 0;
const trade = (extra: Partial<Trade> & Pick<Trade, 'kind' | 'units' | 'priceCents' | 'tradedAt'>): Trade => ({
  id: `t${++seq}`,
  symbol: '1155.KL',
  name: 'MAYBANK',
  ...extra,
  createdAt: extra.createdAt ?? seq,
});

eq('a date is pinned to the start of its day', dayStart(on(12) + 13 * 3_600_000), on(12));

{
  const log = [
    trade({ kind: 'buy', units: 100, priceCents: 920, tradedAt: on(1) }),
    trade({ kind: 'buy', units: 400, priceCents: 1087, tradedAt: on(15) }),
  ];
  eq('a position is the sum of its trades', replay(log), { units: 500, costCents: 92000 + 434800 });
  eq('the order they are given in does not matter', replay([...log].reverse()), replay(log));
}
{
  const log = [
    trade({ kind: 'buy', units: 500, priceCents: 920, tradedAt: on(1) }),
    trade({ kind: 'sell', units: 100, priceCents: 1056, tradedAt: on(20) }),
  ];
  eq('a sale takes cost out at the average', replay(log), { units: 400, costCents: 368000 });
}
{
  // A dividend is cash, not units: the position it was paid on is unchanged.
  const log = [
    trade({ kind: 'buy', units: 500, priceCents: 920, tradedAt: on(1) }),
    trade({ kind: 'dividend', units: 500, priceCents: 33, tradedAt: on(26) }),
  ];
  eq('a dividend leaves the position alone', replay(log), { units: 500, costCents: 460000 });
}
eq('no trades is no position', replay([]), { units: 0, costCents: 0 });

/* ------------------------------------------------- units on a past date */

const exampleLog = [
  trade({ kind: 'buy', units: 100, priceCents: 920, tradedAt: on(1) }),
  trade({ kind: 'buy', units: 100, priceCents: 1087, tradedAt: on(15) }),
];

eq('units on the day of the first buy', unitsHeldOn(exampleLog, on(1)), 100);
eq('units the day before anything was bought', unitsHeldOn(exampleLog, on(1) - DAY), 0);
eq('units are read as at the end of the day', unitsHeldOn(exampleLog, on(1) + 20 * 3_600_000), 100);
eq('units after the second buy', unitsHeldOn(exampleLog, on(20)), 200);

// The question this whole design exists to answer: buying more after the
// ex-date must not enlarge a dividend that was already decided.
eq('a top-up after the ex-date does not join that dividend', unitsOnExDate(exampleLog, on(12)), 100);
eq('buying on the ex-date itself is too late', unitsOnExDate([
  trade({ kind: 'buy', units: 300, priceCents: 920, tradedAt: on(12) }),
], on(12)), 0);
eq('selling after the ex-date keeps the dividend', unitsOnExDate([
  trade({ kind: 'buy', units: 300, priceCents: 920, tradedAt: on(1) }),
  trade({ kind: 'sell', units: 300, priceCents: 1000, tradedAt: on(13) }),
], on(12)), 300);
eq('selling before the ex-date gives it up', unitsOnExDate([
  trade({ kind: 'buy', units: 300, priceCents: 920, tradedAt: on(1) }),
  trade({ kind: 'sell', units: 300, priceCents: 1000, tradedAt: on(11) }),
], on(12)), 0);

// Correcting one trade is meant to change the past — that is the point of a
// correction — but only by that trade's worth.
{
  const corrected = exampleLog.map((t) => (t.tradedAt === on(1) ? { ...t, units: 150 } : t));
  eq('fixing the first buy fixes the ex-date figure', unitsOnExDate(corrected, on(12)), 150);
  eq('and leaves the later buy standing', unitsHeldOn(corrected, on(20)), 250);
}

eq('a buy is worth what was paid for it', tradeCents({ kind: 'buy', units: 100, priceCents: 920 }), 92000);
eq('a dividend is quoted per unit in ten-thousandths',
  tradeCents({ kind: 'dividend', units: 500, priceCents: 0, perUnitPoints: 3300 }), 16500);
eq('a sub-sen dividend rounds down, never up',
  tradeCents({ kind: 'dividend', units: 333, priceCents: 0, perUnitPoints: 125 }), 416);

/* ------------------------------------------------------------ positions */

{
  const log = [
    trade({ kind: 'buy', units: 100, priceCents: 920, tradedAt: on(1) }),
    trade({ symbol: '5258.KL', name: 'BIMB', kind: 'buy', units: 200, priceCents: 210, tradedAt: on(5) }),
    trade({ kind: 'buy', units: 400, priceCents: 1087, tradedAt: on(15) }),
  ];
  const built = buildHoldings(log);
  eq('one position per counter, oldest first', built.map((h) => h.symbol), ['1155.KL', '5258.KL']);
  eq('each is replayed from its own trades', built[0], {
    id: '1155.KL', symbol: '1155.KL', name: 'MAYBANK', createdAt: on(1), units: 500, costCents: 526800,
  });
}
{
  // Sold out entirely: the trades stay, but there is no position to show.
  const built = buildHoldings([
    trade({ kind: 'buy', units: 100, priceCents: 920, tradedAt: on(1) }),
    trade({ kind: 'sell', units: 100, priceCents: 1000, tradedAt: on(9) }),
  ]);
  eq('a closed position drops off the list', built, []);
}
eq('an empty log holds nothing', buildHoldings([]), []);

/* ------------------------------------------------------- what it came to */

{
  // Bought 500 at 9.20, sold 100 at 10.56, took a 30 sen dividend on 500,
  // and the 400 still held are worth 10.56 each.
  const log = [
    trade({ kind: 'buy', units: 500, priceCents: 920, tradedAt: on(1) }),
    trade({ kind: 'sell', units: 100, priceCents: 1056, tradedAt: on(20) }),
    { ...trade({ kind: 'dividend', units: 500, priceCents: 0, tradedAt: on(26) }), perUnitPoints: 3000 },
  ];
  const p = performance(log, { '1155.KL': quote(1056, 1056, 1) });
  eq('what is still held, at cost', p.costCents, 368000);
  eq('and at today’s price', p.valueCents, 422400);
  eq('the paper gain is the difference', p.unrealisedCents, 54400);
  eq('the sale made what it made', p.realisedCents, 13600);
  eq('the dividend counts too', p.dividendCents, 15000);
  eq('all three together', p.totalCents, 54400 + 13600 + 15000);
  eq('measured against everything put in', { invested: p.investedCents, percent: p.returnPercent },
    { invested: 460000, percent: 18.0 });
}
{
  // A sale worth less than its fees. The money plan can only pay nothing into
  // a goal for it, but the loss is the whole of it: RM3 of shares that cost
  // RM4, sold for RM8 of fees, lost RM9 — not the RM4 a zero would show.
  const fees = { brokerageCents: 800, clearingCents: 0, stampCents: 0, sstCents: 0 };
  const log = [
    trade({ kind: 'buy', units: 10, priceCents: 40, tradedAt: on(1) }),
    { ...trade({ kind: 'sell', units: 10, priceCents: 30, tradedAt: on(2) }), fees },
  ];
  eq('a sale smaller than its fees shows the whole loss', performance(log, {}).realisedCents, 300 - 800 - 400);
}
{
  // An unpriced counter is held at cost, so it reads as neither gain nor loss.
  const p = performance([trade({ kind: 'buy', units: 100, priceCents: 920, tradedAt: on(1) })], {});
  eq('an unpriced position shows no gain either way',
    { value: p.valueCents, unrealised: p.unrealisedCents }, { value: 92000, unrealised: 0 });
}
eq('nothing traded is nothing to report', performance([], {}), {
  costCents: 0, valueCents: 0, unrealisedCents: 0, realisedCents: 0,
  dividendCents: 0, totalCents: 0, investedCents: 0, returnPercent: 0,
});

/* ------------------------------------------------------------ over time */

// The honest half of the growth chart: what a position cost at each month end
// can always be replayed, however long ago. What it was worth cannot.
{
  const log = [
    trade({ kind: 'buy', units: 100, priceCents: 1000, tradedAt: on(1) }),
    trade({ kind: 'buy', units: 100, priceCents: 1200, tradedAt: dayStart(new Date(2026, 4, 10).getTime()) }),
  ];
  const months = costByMonth(log, new Date(2026, 4, 20));
  eq('one entry per month from the first trade', months.map((m) => m.key), ['2026-03', '2026-04', '2026-05']);
  eq('cost is what had been bought by each month end', months.map((m) => m.costCents), [100000, 100000, 220000]);
  eq('no trades, no line', costByMonth([], new Date(2026, 4, 20)), []);
}

report();
