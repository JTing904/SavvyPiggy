import { eq, report } from './harness';
import { soonestFirst } from '../services/sorting';
import { byValueDesc } from '../services/holdings';

// --- things on a schedule: soonest first, paused last
const day = (d: number) => new Date(2026, 9, d);
const rows = [
  { id: 'later', enabled: true, createdAt: 1, at: day(20) },
  { id: 'paused', enabled: false, createdAt: 2, at: day(5) },
  { id: 'soon', enabled: true, createdAt: 3, at: day(8) },
  { id: 'none', enabled: true, createdAt: 4, at: null as Date | null },
  { id: 'same-a', enabled: true, createdAt: 5, at: day(8) },
];
eq(
  'the soonest comes first, paused and dateless ones last in the order they were made',
  soonestFirst(rows, (r) => r.at).map((r) => r.id),
  ['soon', 'same-a', 'later', 'paused', 'none']
);
eq('nothing to sort', soonestFirst([], () => null), []);

// --- positions: largest first, ties in the order bought
const h = (symbol: string, units: number, costCents: number) => ({ symbol, units, costCents });
const holdings = [h('A', 100, 10_000), h('B', 100, 50_000), h('C', 100, 10_000), h('D', 10, 90_000)];
const quotes: Record<string, { priceCents: number; pricePoints: number }> = {
  A: { priceCents: 300, pricePoints: 3_000_000 / 100 },
};
eq(
  'by what each is worth now, at cost when there is no price',
  byValueDesc(holdings, (x) => quotes[x.symbol]).map((x) => x.symbol),
  // A is worth 100 units at RM3.00 = RM300 = 30,000 sen; D cost 90,000; B 50,000; C 10,000
  ['D', 'B', 'A', 'C']
);
eq('ties keep the order bought', byValueDesc([h('X', 1, 500), h('Y', 1, 500)], () => undefined).map((x) => x.symbol), ['X', 'Y']);

report();
