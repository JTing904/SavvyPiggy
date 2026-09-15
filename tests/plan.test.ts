import type { Features } from '../services/advisor/model';
import {
  activeStyles,
  factsText,
  groupReasons,
  isTie,
  mergeQuotes,
  pricePointsOfQuote,
  priceText,
  reasonText,
  reasonLine,
  beatsRandom,
  recordSpan,
} from '../components/invest/monthlyPlan';
import { plan as en } from '../i18n/en/plan';
import { plan as zh } from '../i18n/zh/plan';
import { eq, report } from './harness';

// --- prices

eq('half-sen prices keep their third decimal', priceText(3450), 'RM0.345');
eq('whole-sen prices show two decimals', priceText(79_000), 'RM7.90');
eq('dividend-sized prices keep four', priceText(125), 'RM0.0125');
eq('a quote without points falls back to sen', pricePointsOfQuote({ priceCents: 790, previousCloseCents: 780, at: 1 }), 79_000);
eq('no quote, no price', pricePointsOfQuote(undefined), null);
eq(
  'merging quotes keeps the later read per symbol',
  mergeQuotes(
    { A: { priceCents: 100, previousCloseCents: 100, at: 5 }, B: { priceCents: 200, previousCloseCents: 200, at: 9 } },
    { A: { priceCents: 101, previousCloseCents: 100, at: 6 }, B: { priceCents: 199, previousCloseCents: 200, at: 1 }, C: { priceCents: 3, previousCloseCents: 3, at: 1 } }
  ),
  {
    A: { priceCents: 101, previousCloseCents: 100, at: 6 },
    B: { priceCents: 200, previousCloseCents: 200, at: 9 },
    C: { priceCents: 3, previousCloseCents: 3, at: 1 },
  }
);

// --- the pick

eq('top two within 5 match points is a tie', isTie([{ match: 100 }, { match: 96 }]), true);
eq('5 points apart is not', isTie([{ match: 100 }, { match: 95 }]), false);
eq('one counter is never a tie', isTie([{ match: 100 }]), false);
eq('styles with no weight are left out', activeStyles({ income: 60, cash: 40, price: 0 }), ['income', 'cash']);
eq(
  'a reason shared by two styles is said once',
  groupReasons([
    { style: 'income', feature: 'cuts3y' },
    { style: 'cash', feature: 'cuts3y' },
    { style: 'price', feature: 'mom3' },
  ]),
  [
    { feature: 'cuts3y', styles: ['income', 'cash'] },
    { feature: 'mom3', styles: ['price'] },
  ]
);
eq(
  'the record span covers every style that has one',
  recordSpan({
    income: { from: '2014-01', to: '2025-06' },
    cash: { from: '2013-12', to: '2025-05' },
    price: null,
  }),
  { from: '2013-12', to: '2025-06' }
);
eq('no records, no span', recordSpan({ income: null, cash: null, price: null }), null);

// --- the words

{
  const x: Features = {
    yield12: 0.0633,
    dist52: -0.0899,
    vsMA6: -0.0428,
    mom3: -0.076,
    mom12: 0.2186,
    vol12: 0.0501,
    divGrowth: -0.312,
    payCount12: 1.6667,
    cuts3y: 2,
    dividendsLastYear: 0.5,
    paysPerYear: 2,
  };
  eq('yield', reasonText(en, 'yield12', x), 'Paid 6.3% in dividends over the last year');
  eq('dividend growth down', reasonText(en, 'divGrowth', x), 'Dividends down 31.2% on the year before');
  eq('payments a year', reasonText(en, 'payCount12', x), 'Pays about 2 times a year');
  eq('cuts', reasonText(en, 'cuts3y', x), 'Cut its dividend 2 times in the last 3 years');
  eq('no cuts', reasonText(en, 'cuts3y', { ...x, cuts3y: 0 }), 'No dividend cuts in the last 3 years');
  eq('below the high', reasonText(en, 'dist52', x), '9.0% below its 52-week high');
  eq('at the high', reasonText(en, 'dist52', { ...x, dist52: -0.002 }), 'At its 52-week high');
  eq('moving average', reasonText(en, 'vsMA6', x), 'Below its 6-month average price');
  eq('3 months', reasonText(en, 'mom3', x), 'Down 7.6% over 3 months');
  eq('12 months', reasonText(en, 'mom12', x), 'Up 21.9% over 12 months');
  eq('volatility', reasonText(en, 'vol12', x), 'Price moves about 5.0% a month');
  eq('in Chinese', reasonText(zh, 'mom12', x), '12 个月涨了 21.9%');
  eq('never paid', reasonText(en, 'payCount12', { ...x, payCount12: 0 }), 'Has not paid a dividend in the last 3 years');
  eq('facts line', factsText(en, x), 'yield 6.3% · 2 cuts in 3 yrs · 12m +21.9%');

  // The same fact on both sides of a pick must not read as a contradiction.
  const low = { ...x, yield12: 0.023 };
  const list = [x, low];
  eq('a high yield for it is just the yield', reasonLine(en, 'yield12', x, 'for', list), 'Paid 6.3% in dividends over the last year');
  eq('a high yield against it says why', reasonLine(en, 'yield12', x, 'against', list), 'A high yield (6.3%) — high yields are cut more often');
  eq('a modest yield for it says why', reasonLine(en, 'yield12', low, 'for', list), 'A modest yield (2.3%) — modest yields are cut less often');
  eq('a low yield against it', reasonLine(en, 'yield12', low, 'against', list), 'Only paid 2.3% in dividends over the last year');
  eq('"no cuts" is never a reason against', reasonLine(en, 'cuts3y', { ...x, cuts3y: 0 }, 'against', list), null);
  eq('"cut twice" is never a reason for', reasonLine(en, 'cuts3y', x, 'for', list), null);
  eq('a big dividend jump against it says why', reasonLine(en, 'divGrowth', { ...x, divGrowth: 0.4 }, 'against', list), "Dividends jumped 40.0% — jumps that big often don't last");
  eq('Chinese says it too', reasonLine(zh, 'yield12', x, 'against', list), '股息率偏高（6.3%）——高股息比较常被砍');
}

eq('five points over chance is clearly better', beatsRandom({ hitRate: 0.55, randomRate: 0.5 }), true);
eq('three points is not', beatsRandom({ hitRate: 0.53, randomRate: 0.5 }), false);
eq('below chance is not', beatsRandom({ hitRate: 0.47, randomRate: 0.5 }), false);

report();
