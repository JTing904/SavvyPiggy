import { formatMoney, percentReached, resplitDeposit, toCents, splitByPercentage, splitProportionally, type Share } from '../services/money';
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

// --- display
eq('money reads the Malaysian way', formatMoney(1240.5), 'RM1,240.50');
eq('the sign leads, never RM-10.00', formatMoney(-10), '-RM10.00');
eq('signed shows the plus too', formatMoney(45, { signed: true }), '+RM45.00');
eq('signed keeps the minus single', formatMoney(-5, { signed: true }), '-RM5.00');
eq('headline figures drop the cents, never rounding up', formatMoney(1240.5, { decimals: 0 }), 'RM1,240');
eq('RM999.99 is not yet RM1,000', formatMoney(999.99, { decimals: 0 }), 'RM999');
eq('float drift is not overspent', formatMoney(50.3 - 20.1 - 30.2), 'RM0.00');
eq('float drift below zero reads as zero, whole ringgit too', formatMoney(50.3 - 20.1 - 30.2, { decimals: 0 }), 'RM0');
eq('a real sen below zero still shows its sign', formatMoney(-0.01), '-RM0.01');
eq('drift just under a cent keeps the cent', formatMoney(20.099999999999998), 'RM20.10');
eq('csv wants a bare number', formatMoney(1240.5, { symbol: false }), '1,240.50');
eq('zero is not signed', formatMoney(0), 'RM0.00');

// The rule editActivity leans on when a past deposit is corrected: however a
// total is re-split, the parts must still add up to the whole. Splitting each
// share on its own and flooring shed the odd cent, which left an entry's
// stated total larger than the sum of what it says reached the goals.
{
  const split = (total: number, percentages: number[]) =>
    splitByPercentage(total, percentages.map((percentage, i) => ({ item: i, percentage })));

  for (const [total, pcts] of [
    [10000, [40, 30, 20, 10]],
    [3333, [33, 33, 34]],
    [1, [50, 50]],
    [777, [15, 15, 15, 15, 40]],
  ] as [number, number[]][]) {
    const parts = split(total, pcts);
    eq(`${total} split ${pcts.join('/')} loses nothing`,
      parts.reduce((sum, s) => sum + s.cents, 0), total);
  }
}

// Correcting a deposit re-splits it by its percentages, not by the sen each
// goal got: RM0.10 at 33/33/34 placed 3/3/4, which must not make RM1,000 300/300/400.
{
  const tiny = [{ amount: 0.03, percentage: 33 }, { amount: 0.03, percentage: 33 }, { amount: 0.04, percentage: 34 }];
  eq('RM0.10 at 33/33/34 corrected to RM1,000', resplitDeposit(100000, 10, tiny), [33000, 33000, 34000]);
  eq('the odd cent goes to the largest percentage', resplitDeposit(1001, 10, tiny), [330, 330, 341]);
  const thirds = [{ amount: 3.34, percentage: 33.33 }, { amount: 3.33, percentage: 33.33 }, { amount: 3.33, percentage: 33.33 }];
  eq('33.33% x 3 under overflow still places every sen', resplitDeposit(2000, 1000, thirds).reduce((a, b) => a + b, 0), 2000);
  const partial = [{ amount: 4, percentage: 40 }, { amount: 3, percentage: 30 }];
  eq('a split under 100% keeps leaving the rest out', resplitDeposit(2000, 1000, partial), [800, 600]);
  eq('a goal-targeted deposit moves whole', resplitDeposit(1234, 500, [{ amount: 5, percentage: 100 }]), [1234]);
}

eq('RM999.50 of RM1,000 is 99%, not 100%', percentReached(999.5, 1000), 99);
eq('reached is 100%', percentReached(1000, 1000), 100);
eq('past the target stays 100%', percentReached(1500, 1000), 100);
eq('RM0.29 of RM1 is 29% despite 28.999… in floats', percentReached(0.29, 1), 29);
eq('overspent is 0%', percentReached(-5, 1000), 0);

report();
