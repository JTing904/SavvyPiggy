import { newShortSale, shortSale } from '../services/tradeCheck';
import type { Trade } from '../types';
import { eq, report } from './harness';

const DAY = 86_400_000;
const trade = (id: string, kind: 'buy' | 'sell', units: number, day: number, createdAt = day): Trade => ({
  id,
  symbol: '1066.KL',
  name: 'RHBBANK',
  kind,
  units,
  priceCents: 790,
  tradedAt: day * DAY,
  createdAt,
});

const held = [trade('b1', 'buy', 100, 1)];

eq('selling what was held is fine', shortSale([...held, trade('s1', 'sell', 100, 2)]), null);
eq('selling 1,000 of 100 is short', shortSale([...held, trade('s1', 'sell', 1000, 2)])?.heldUnits, 100);
eq('a sale dated before its buy is short', shortSale([...held, trade('s1', 'sell', 100, 0)])?.trade.id, 's1');
eq('same day: a buy counts before a sale, whichever was entered first', shortSale([trade('s1', 'sell', 100, 1, 1), trade('b1', 'buy', 100, 1, 2)]), null);
eq('same day: two sales keep the order entered', shortSale([...held, trade('s1', 'sell', 80, 2, 1), trade('s2', 'sell', 80, 2, 2)])?.trade.id, 's2');
eq('two sales that add up to more than held: the second is short', shortSale([...held, trade('s1', 'sell', 60, 2), trade('s2', 'sell', 60, 3)])?.trade.id, 's2');
{
  const log = [...held, trade('s1', 'sell', 100, 5)];
  eq('deleting the buy leaves the later sale short', newShortSale(log, [trade('s1', 'sell', 100, 5)])?.trade.id, 's1');
  eq('lowering the buy below the later sale is short', newShortSale(log, [trade('b1', 'buy', 50, 1), trade('s1', 'sell', 100, 5)])?.trade.id, 's1');
}
{
  // Data from before the check: already short by 50.
  const old = [trade('b1', 'buy', 50, 1), trade('s1', 'sell', 100, 5)];
  eq('an old short sale does not block an unrelated correction', newShortSale(old, [trade('b1', 'buy', 50, 1), trade('s1', 'sell', 100, 5), trade('b2', 'buy', 10, 9)]), null);
  eq('but making it worse is refused', newShortSale(old, [trade('b1', 'buy', 40, 1), trade('s1', 'sell', 100, 5)])?.trade.id, 's1');
}

report();
