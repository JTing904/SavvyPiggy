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
  type MonthlySeries,
  type ScoredCounter,
} from '../services/advisor/model';
import { parseHistory } from '../services/advisor/history';
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
