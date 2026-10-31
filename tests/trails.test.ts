import type { Trade } from '../types';
import { parseDailyCloses, since, valueSeries, walletTrail } from '../services/trails';
import { eq, report } from './harness';

const now = new Date(2026, 9, 20, 12);
const iso = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();

eq('no entries: the wallet was flat', walletTrail([], 5000, now, 3), [5000, 5000, 5000]);
eq(
  'each day shows what the wallet held at its end',
  walletTrail([{ date: iso(20), wallet: -12 }, { date: iso(19), wallet: 100 }], 20000, now, 3),
  [11200, 21200, 20000]
);
eq('an entry that left the wallet alone changes nothing', walletTrail([{ date: iso(20) }], 700, now, 2), [700, 700]);
eq('today is always the balance itself', walletTrail([{ date: iso(20, 23), wallet: -5 }], 100, now, 2).at(-1), 100);

const payload = (stamps: number[], closes: (number | null)[]) => ({
  chart: { result: [{ meta: { gmtoffset: 28800 }, timestamp: stamps, indicators: { quote: [{ close: closes }] } }] },
});
// 09:00 MYT on the 19th is 01:00 UTC; 01:00 MYT on the 20th is still the 19th in UTC.
const on19 = Date.UTC(2026, 9, 19, 1) / 1000;
const on20 = Date.UTC(2026, 9, 19, 17) / 1000;
eq(
  'a close belongs to the exchange day, not the UTC day',
  parseDailyCloses(payload([on19, on20], [10.02, 10.5])),
  [
    { day: '2026-10-19', points: 100200 },
    { day: '2026-10-20', points: 105000 },
  ]
);
eq('a day Yahoo has no close for is skipped', parseDailyCloses(payload([on19, on20], [null, 10.5]))?.length, 1);
eq('nothing readable is null, not an empty line', parseDailyCloses({ chart: { result: [] } }), null);

const trade = (over: Partial<Trade>): Trade =>
  ({ id: 'a', symbol: '1155.KL', name: 'Maybank', kind: 'buy', units: 100, priceCents: 1000, tradedAt: new Date(2026, 9, 2).getTime(), createdAt: 1, ...over }) as Trade;
const closes = {
  '1155.KL': [
    { day: '2026-10-01', points: 90000 },
    { day: '2026-10-02', points: 100000 },
    { day: '2026-10-05', points: 110000 },
  ],
};

eq('no trades, no line', valueSeries([], closes), []);
eq(
  'starts the day it was bought, units times that close',
  valueSeries([trade({})], closes),
  [
    { day: '2026-10-02', cents: 100000 },
    { day: '2026-10-05', cents: 110000 },
  ]
);
eq(
  'selling changes what is held from that day on',
  valueSeries([trade({}), trade({ id: 'b', kind: 'sell', units: 40, tradedAt: new Date(2026, 9, 5).getTime(), createdAt: 2 })], closes),
  [
    { day: '2026-10-02', cents: 100000 },
    { day: '2026-10-05', cents: 66000 },
  ]
);
eq(
  'a half-sen close is not rounded up',
  valueSeries([trade({ units: 1 })], { '1155.KL': [{ day: '2026-10-02', points: 3450 }] }),
  [{ day: '2026-10-02', cents: 34 }]
);
eq(
  'a counter with no closes makes the line null, never a false fall',
  valueSeries([trade({}), trade({ id: 'b', symbol: '1295.KL', name: 'PBB' })], closes),
  null
);
eq(
  'a quiet day keeps the last close',
  valueSeries([trade({}), trade({ id: 'b', symbol: '1295.KL', name: 'PBB', tradedAt: new Date(2026, 9, 2).getTime() })], {
    ...closes,
    '1295.KL': [{ day: '2026-10-02', points: 40000 }],
  }),
  [
    { day: '2026-10-02', cents: 140000 },
    { day: '2026-10-05', cents: 150000 },
  ]
);
eq('since keeps the days from then on', since([{ day: '2026-10-02', cents: 1 }, { day: '2026-10-05', cents: 2 }], '2026-10-03'), [{ day: '2026-10-05', cents: 2 }]);

{
  const two: Trade[] = [
    { id: 'o', symbol: 'OLD', name: 'OLD', kind: 'buy', units: 100, priceCents: 100, pricePoints: 10000, tradedAt: new Date(2026, 0, 1).getTime(), fees: 0, securityType: 'stock', createdAt: 1 } as unknown as Trade,
    { id: 'n', symbol: 'NEW', name: 'NEW', kind: 'buy', units: 100, priceCents: 100, pricePoints: 10000, tradedAt: new Date(2026, 0, 1).getTime(), fees: 0, securityType: 'stock', createdAt: 2 } as unknown as Trade,
  ];
  const line = valueSeries(two, {
    OLD: [
      { day: '2026-01-02', points: 10000 },
      { day: '2026-01-03', points: 10000 },
    ],
    NEW: [{ day: '2026-01-03', points: 20000 }],
  });
  eq('held before its first close: that day is skipped, the line stays', line?.map((p) => [p.day, p.cents]), [['2026-01-03', 30000]]);
}

report();
