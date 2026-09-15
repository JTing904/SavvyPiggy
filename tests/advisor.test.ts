import {
  adjustMix,
  blend,
  featuresAt,
  fitLogistic,
  mixFromAnswers,
  monthIndex,
  monthKey,
  probability,
  reasonsFor,
  scoreNow,
  scoringMonth,
  type MonthlySeries,
  type ScoredCounter,
  type Style,
} from '../services/advisor/model';
import { loadHistory, parseHistory, UNIVERSE, type HistoryCache } from '../services/advisor/history';
import { eq, report } from './harness';

// A counter priced at RM10 that pays 30 sen every March and September.
const steady = (months: number, start = '2020-01', late = false): MonthlySeries => {
  const closes = Array.from({ length: months }, () => 10);
  const divs = closes.map((_, i) => {
    const m = Number(monthKey(start, i).slice(5));
    if (m === 3) return 0.3;
    // A "late" payer's September dividend lands in October instead.
    if (m === (late ? 10 : 9)) return 0.3;
    return 0;
  });
  return { start, closes, divs };
};

// --- reading Yahoo

{
  const sec = (ym: string) => Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1) / 1000;
  const payload = {
    chart: {
      result: [
        {
          timestamp: [sec('2026-01'), sec('2026-02'), sec('2026-04')],
          indicators: { quote: [{ close: [10.12345, null, 10.5] }] },
          events: { dividends: { a: { date: sec('2026-04') + 86_400 * 9, amount: 0.33 } } },
        },
      ],
    },
  };
  const s = parseHistory(payload)!;
  eq('months line up even where Yahoo skipped one', s.closes.length, 4);
  eq('a missing close carries the last one forward', s.closes, [10.1235, 10.1235, 10.1235, 10.5]);
  eq('a dividend lands in the month it was paid', s.divs, [0, 0, 0, 0.33]);
  eq('an empty answer is no history', parseHistory({ chart: { result: [] } }), null);
}

{
  // As Yahoo really sends Bursa: each monthly bar at midnight on the 1st in
  // Kuala Lumpur, which is 16:00 UTC the day before, then this month's live
  // point stamped at the last trade. Dividends are stamped during the day.
  const bar = (y: number, m: number) => Date.UTC(y, m - 1, 1) / 1000 - 8 * 3600;
  const payload = {
    chart: {
      result: [
        {
          meta: { gmtoffset: 28_800 },
          timestamp: [bar(2026, 6), bar(2026, 7), bar(2026, 8), bar(2026, 9), Date.UTC(2026, 8, 12, 8, 59) / 1000],
          indicators: { quote: [{ close: [1.1, 1.2, 1.3, 1.35, 1.4] }] },
          events: { dividends: { a: { date: Date.UTC(2026, 7, 14, 1) / 1000, amount: 0.05 } } },
        },
      ],
    },
  };
  const s = parseHistory(payload)!;
  eq('a bar stamped 16:00 UTC on 31 May is June', s.start, '2026-06');
  eq("this month's live point takes this month's place instead of adding a month", s.closes, [1.1, 1.2, 1.3, 1.4]);
  eq('a dividend paid on 14 August is August', s.divs, [0, 0, 0.05, 0]);

  const noOffset = { chart: { result: [{ ...payload.chart.result[0], meta: {} }] } };
  eq('without an offset in the payload, Bursa time is assumed', parseHistory(noOffset)!.start, '2026-06');
}

// --- months

eq('month keys roll over the year', monthKey('2025-11', 3), '2026-02');
eq('and back', monthIndex('2025-11', '2026-02'), 3);

// --- dividends counted by payment

{
  const s = steady(80);
  const sept = monthIndex(s.start, '2026-08'); // just before this year's September payment
  const x = featuresAt(s, sept)!;
  eq('twice a year is twice a year', x.paysPerYear, 2);
  eq('the last year of payments is 60 sen', Math.round(x.dividendsLastYear * 100), 60);
  eq('a yield of 6%', Math.round(x.yield12 * 1000), 60);
  eq('a payment not yet due is not a cut', x.cuts3y, 0);
  eq('and dividends did not fall', x.divGrowth, 0);
}

{
  const s = steady(90, '2020-01', true);
  const x = featuresAt(s, monthIndex(s.start, '2026-09'))!;
  eq('a payment a month late is still not a cut', x.cuts3y, 0);
}

{
  const s = steady(80);
  // Halve every payment from 2025 on.
  s.divs = s.divs.map((d, i) => (monthKey(s.start, i) >= '2025-01' ? d / 2 : d));
  const x = featuresAt(s, monthIndex(s.start, '2025-12'))!;
  eq('a real halving is a cut', x.cuts3y, 1);
  eq('of -50%', Math.round(x.divGrowth * 100), -50);
}

{
  const s = steady(80);
  s.divs = s.divs.map((d, i) => (monthKey(s.start, i) >= '2025-01' ? 0 : d));
  eq('a counter that stopped paying has no current dividend', featuresAt(s, monthIndex(s.start, '2026-06'))!.dividendsLastYear, 0);
}

{
  const s = steady(80);
  s.closes[50] = 30; // a bad print
  eq('a month next to a price that tripled overnight is not trusted', featuresAt(s, 60), null);
}

eq('too little history gives no features', featuresAt(steady(20), 19), null);

// --- the regression

{
  // One feature that decides the outcome, one that is noise.
  const X: number[][] = [];
  const Y: number[] = [];
  for (let i = 0; i < 400; i++) {
    const signal = (i % 20) / 10 - 1;
    const noise = ((i * 7919) % 13) / 6 - 1;
    X.push([signal, noise]);
    Y.push(signal + noise * 0.1 > 0 ? 1 : 0);
  }
  const w = fitLogistic(X, Y);
  eq('it learns the feature that matters', w[1] > 1, true);
  eq('and not the one that does not', Math.abs(w[2]) < Math.abs(w[1]) / 3, true);
  eq('a high signal scores above half', probability(w, [0.9, 0]) > 0.5, true);
  eq('a low one below', probability(w, [-0.9, 0]) < 0.5, true);
}

eq('no data gives flat weights', fitLogistic([], []), [0]);

// --- blending

const counter = (symbol: string, income: number, cash: number, price: number): ScoredCounter => ({
  symbol,
  x: {} as ScoredCounter['x'],
  chance: { income, cash, price },
  push: { income: { cuts3y: 0.2, yield12: -0.3 }, cash: { yield12: 0.5 }, price: { mom3: 0.01 } },
});

{
  const list = [counter('A', 0.9, 0.2, 0.5), counter('B', 0.6, 0.8, 0.5), counter('C', 0.7, 0.5, 0.5)];
  eq('all income: the steadiest wins', blend(list, { income: 100, cash: 0, price: 0 })[0].symbol, 'A');
  eq('all cash: the biggest payer wins', blend(list, { income: 0, cash: 100, price: 0 })[0].symbol, 'B');
  const mixed = blend(list, { income: 50, cash: 50, price: 0 });
  eq('match runs 0 to 100 across the list', [Math.max(...mixed.map((c) => c.match)), Math.min(...mixed.map((c) => c.match))], [100, 0]);
}

{
  // The price model barely separates them (0.40 vs 0.41); the income model clearly does.
  const list = [counter('A', 0.8, 0.5, 0.4), counter('B', 0.6, 0.5, 0.41)];
  eq('a model that can barely tell counters apart hardly moves the pick', blend(list, { income: 20, cash: 0, price: 80 })[0].symbol, 'A');
}

{
  const why = reasonsFor(counter('A', 0.9, 0.2, 0.5), { income: 60, cash: 35, price: 5 });
  eq('one reason for each style that matters, from that model', why.forIt, [
    { style: 'income', feature: 'cuts3y' },
    { style: 'cash', feature: 'yield12' },
  ]);
  eq('and the biggest thing against it', why.against.map((a) => a.feature), ['yield12']);
}

// --- scoring today

{
  // 48 months to Sep 2026 at a near-flat price, paying `div` every March and September.
  const flat = (price: number, div: number, months = 48, start = '2022-10'): MonthlySeries => {
    const closes = Array.from({ length: months }, (_, i) => price * (1 + ((i * 37) % 7) / 200));
    const divs = closes.map((_, i) => ([3, 9].includes(Number(monthKey(start, i).slice(5))) ? div : 0));
    return { start, closes, divs };
  };
  const zeros = (n: number) => new Array(n).fill(0);
  // A steady-dividends model that, like the real one, leans against high yields.
  const weights: Record<Style, number[]> = { income: [0, -3, ...zeros(6)], cash: zeros(8), price: zeros(7) };
  const universe = { PAY1: flat(10, 0.3), PAY2: flat(20, 0.2), PAY3: flat(5, 0.25), PAY4: flat(8, 0.1), NONE: flat(9, 0) };
  const scored = scoreNow(universe, Object.keys(universe), weights);
  const none = scored.find((c) => c.symbol === 'NONE')!;
  eq('a counter that pays nothing has no chance of keeping its dividend', none.chance.income, 0);
  const ranked = blend(scored, { income: 100, cash: 0, price: 0 });
  eq('so on all steady dividends it never out-ranks a payer', ranked[ranked.length - 1].symbol, 'NONE');
  eq('and nothing in the blend is NaN', ranked.every((c) => Number.isFinite(c.score) && Number.isFinite(c.match)), true);
  eq('and the dividend model gives it no reasons', reasonsFor(none, { income: 100, cash: 0, price: 0 }), { forIt: [], against: [] });
  eq('a payer still gets its chance', scored.find((c) => c.symbol === 'PAY1')!.chance.income > 0, true);
}

{
  const flat = (months: number, start = '2022-10'): MonthlySeries => ({
    start,
    closes: Array.from({ length: months }, (_, i) => 10 + ((i * 13) % 5) / 10),
    divs: Array.from({ length: months }, (_, i) => (i % 6 === 0 ? 0.2 : 0)),
  });
  const zeros = (n: number) => new Array(n).fill(0);
  const weights: Record<Style, number[]> = { income: zeros(8), cash: zeros(8), price: [0, 1, ...zeros(5)] };
  // Cached on 1 Sep before Bursa opened, so everything ends in August; then a
  // counter added later, whose history already has September.
  const universe: Record<string, MonthlySeries> = { A: flat(47), B: flat(47), C: flat(47), D: flat(47), NEW: flat(48), OLD: flat(46) };
  eq('the scoring month is the one most histories end in', scoringMonth(universe), '2026-08');
  const scored = scoreNow(universe, Object.keys(universe), weights);
  eq('a newer history does not knock the rest out', scored.map((c) => c.symbol).sort(), ['A', 'B', 'C', 'D', 'NEW']);
  const cut = { ...universe.NEW, closes: universe.NEW.closes.slice(0, 47), divs: universe.NEW.divs.slice(0, 47) };
  eq('it is scored as of the same month as the rest', scored.find((c) => c.symbol === 'NEW')!.x, featuresAt(cut, 46));
  eq('a tie goes to the later month', scoringMonth({ A: flat(47), B: flat(48) }), '2026-09');
}

// --- keeping history on the phone

await (async () => {
  const now = new Date(2026, 8, 13, 10);
  const one: MonthlySeries = { start: '2020-01', closes: [1], divs: [0] };
  const store = (initial: HistoryCache | null) => {
    const box = { value: initial, writes: 0 };
    const cache = {
      read: () => box.value,
      write: (c: HistoryCache) => {
        box.value = c;
        box.writes++;
      },
    };
    return { box, cache };
  };

  // Offline on the first open of a new month.
  const lastMonth = store({ month: '2026-08', series: { A: one, B: one } });
  const offline = await loadHistory([], () => {}, now, () => false, async () => null, lastMonth.cache);
  eq("offline in a new month: last month's history is used", [offline.month, Object.keys(offline.series)], ['2026-08', ['A', 'B']]);
  eq('and the cache on the phone is not replaced with an empty one', [lastMonth.box.writes, lastMonth.box.value!.month], [0, '2026-08']);

  // A new month, and one counter Yahoo will not give.
  const fresh = store(null);
  const asked: string[] = [];
  const fetcher = async (s: string) => {
    asked.push(s);
    return s === 'GONE.KL' ? null : one;
  };
  await loadHistory(['GONE.KL'], () => {}, now, () => false, fetcher, fresh.cache);
  eq('everything else is kept', Object.keys(fresh.box.value!.series).length, UNIVERSE.length);
  eq('the one that failed is noted for the day', fresh.box.value!.failed, { 'GONE.KL': '2026-09-13' });

  asked.length = 0;
  const again = await loadHistory(['GONE.KL'], () => {}, now, () => false, fetcher, fresh.cache);
  eq('opening again the same day asks for nothing and writes nothing', [asked, fresh.box.writes], [[], 1]);
  eq('and the rest is still there', Object.keys(again.series).length, UNIVERSE.length);

  asked.length = 0;
  await loadHistory(['GONE.KL'], () => {}, new Date(2026, 8, 14, 10), () => false, fetcher, fresh.cache);
  eq('the next day it is tried once more, without a rewrite', [asked, fresh.box.writes], [['GONE.KL'], 1]);

  // The connection drops part way: what arrived is kept, and nothing is
  // written off as failing, so the next open picks up the rest.
  const dropped = store(null);
  let calls = 0;
  await loadHistory([], () => {}, now, () => false, async () => (++calls <= 8 ? one : null), dropped.cache);
  eq('a connection that dropped keeps what arrived', Object.keys(dropped.box.value!.series).length, 8);
  eq('and marks nothing as failing', dropped.box.value!.failed, {});

  // Stopped part way (the screen was left): no further batch is fetched.
  const stopped = store(null);
  let fetched = 0;
  const count = async () => {
    fetched++;
    return one;
  };
  await loadHistory([], () => {}, now, () => fetched >= 4, count, stopped.cache);
  eq('a stopped download fetches no further batch', fetched, 4);
})();

// --- the questions

eq('the example answers come to 60 / 35 / 5', mixFromAnswers([1, 0, 0, 1, 0, 2]), { income: 60, cash: 35, price: 5 });
{
  const mix = mixFromAnswers([2, 0, 2, 2, 1, 0]);
  eq('a price person is mostly price', mix.price >= 60, true);
  eq('always adds to 100', mix.income + mix.cash + mix.price, 100);
}
eq('no answers splits evenly', mixFromAnswers([]), { income: 34, cash: 33, price: 33 });

{
  const moved = adjustMix({ income: 50, cash: 35, price: 15 }, 'price', 40);
  eq('moving one slider keeps the total at 100', moved.income + moved.cash + moved.price, 100);
  eq('and the other two keep their proportion', moved, { income: 35, cash: 25, price: 40 });
  eq('a slider can take everything', adjustMix({ income: 50, cash: 35, price: 15 }, 'income', 100), { income: 100, cash: 0, price: 0 });
}

report();
