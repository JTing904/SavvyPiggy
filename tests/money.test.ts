import { toCents, splitByPercentage, splitProportionally, type Share } from '../services/money';
import { eq, report } from './harness';

const cents = <T,>(shares: Share<T>[]) => shares.map((s) => [s.item, s.cents]);

// --- parsing: never round a fraction of a cent upward
eq('toCents 45.20 (float is 4520.000000000001)', toCents(45.2), 4520);
eq('toCents 4.35 (float is 434.99999999999994)', toCents(4.35), 435);
eq('toCents 0.07', toCents(0.07), 7);
eq('toCents 8.11', toCents(8.11), 811);
eq('toCents truncates a third decimal down', toCents(1.239), 123);
eq('toCents never rounds up', toCents(1.999), 199);
eq('toCents 0', toCents(0), 0);

// --- the case from the request: a single cent that cannot be divided
eq(
  '$0.01 across 30/50/20 goes wholly to the 50% goal',
  cents(
    splitByPercentage(1, [
      { item: 'vacation', percentage: 30 },
      { item: 'emergency', percentage: 50 },
      { item: 'tech', percentage: 20 },
    ])
  ),
  [
    ['vacation', 0],
    ['emergency', 1],
    ['tech', 0],
  ]
);

eq(
  '$10.00 across 30/50/20 divides exactly',
  cents(
    splitByPercentage(1000, [
      { item: 'vacation', percentage: 30 },
      { item: 'emergency', percentage: 50 },
      { item: 'tech', percentage: 20 },
    ])
  ),
  [
    ['vacation', 300],
    ['emergency', 500],
    ['tech', 200],
  ]
);

eq(
  '$0.07 across thirds: floors, then the crumb goes to the biggest',
  cents(
    splitByPercentage(7, [
      { item: 'a', percentage: 33 },
      { item: 'b', percentage: 34 },
      { item: 'c', percentage: 33 },
    ])
  ),
  [
    ['a', 2],
    ['b', 3],
    ['c', 2],
  ]
);

eq(
  'a 100% split always sums to the exact deposit',
  splitByPercentage(9999, [
    { item: 'a', percentage: 33 },
    { item: 'b', percentage: 34 },
    { item: 'c', percentage: 33 },
  ]).reduce((sum, s) => sum + s.cents, 0),
  9999
);

eq(
  'goals at 0% are skipped entirely',
  cents(
    splitByPercentage(100, [
      { item: 'a', percentage: 100 },
      { item: 'idle', percentage: 0 },
    ])
  ),
  [['a', 100]]
);

eq(
  'an 80% strategy leaves 20% undistributed rather than inventing it',
  splitByPercentage(1000, [
    { item: 'a', percentage: 50 },
    { item: 'b', percentage: 30 },
  ]).reduce((sum, s) => sum + s.cents, 0),
  800
);

eq(
  'ties on weight go to the first goal',
  cents(
    splitByPercentage(1, [
      { item: 'first', percentage: 50 },
      { item: 'second', percentage: 50 },
    ])
  ),
  [
    ['first', 1],
    ['second', 0],
  ]
);

eq('nothing to split yields nothing', cents(splitByPercentage(0, [{ item: 'a', percentage: 100 }])), []);
eq('no live goals yields nothing', cents(splitByPercentage(500, [{ item: 'a', percentage: 0 }])), []);

// --- proportional, used when taking money back out
eq(
  'withdrawal splits by balance and places every cent',
  cents(
    splitProportionally(1000, [
      { item: 'a', weight: 2400 },
      { item: 'b', weight: 5000 },
      { item: 'c', weight: 800 },
    ])
  ),
  [
    ['a', 292],
    ['b', 611],
    ['c', 97],
  ]
);

eq(
  'proportional split always sums exactly',
  splitProportionally(1234, [
    { item: 'a', weight: 1 },
    { item: 'b', weight: 1 },
    { item: 'c', weight: 1 },
  ]).reduce((sum, s) => sum + s.cents, 0),
  1234
);

eq(
  'empty balances are skipped',
  cents(
    splitProportionally(100, [
      { item: 'a', weight: 0 },
      { item: 'b', weight: 50 },
    ])
  ),
  [['b', 100]]
);

report();
