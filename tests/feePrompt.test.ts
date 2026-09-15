import { feeEditsOf, feeMismatch } from '../services/feePrompt';
import type { Trade } from '../types';
import { eq, report } from './harness';

const trade = (id: string, createdAt: number, feeEdits?: Trade['feeEdits'], kind: Trade['kind'] = 'buy'): Trade => ({
  id,
  symbol: '1155.KL',
  name: 'MAYBANK',
  kind,
  units: 100,
  priceCents: 1060,
  pricePoints: 106_000,
  tradedAt: 0,
  createdAt,
  feeEdits,
});

const ids = (result: ReturnType<typeof feeMismatch>) => result && { key: result.key, direction: result.direction, ids: result.trades.map((t) => t.id) };

/* ------------------------------------------------------------ feeMismatch */

eq(
  'three trades in a row with brokerage typed lower → asked, newest first',
  ids(feeMismatch([trade('a', 1, { brokerageCents: -1 }), trade('b', 2, { brokerageCents: -1 }), trade('c', 3, { brokerageCents: -1 })], 0)),
  { key: 'brokerageCents', direction: -1, ids: ['c', 'b', 'a'] }
);

eq(
  'three typed higher → asked with direction 1',
  ids(feeMismatch([trade('a', 1, { stampCents: 1 }), trade('b', 2, { stampCents: 1 }), trade('c', 3, { stampCents: 1 })], 0)),
  { key: 'stampCents', direction: 1, ids: ['c', 'b', 'a'] }
);

eq(
  'a sale counts the same as a buy',
  ids(feeMismatch([trade('a', 1, { clearingCents: -1 }), trade('b', 2, { clearingCents: -1 }, 'sell'), trade('c', 3, { clearingCents: -1 })], 0)),
  { key: 'clearingCents', direction: -1, ids: ['c', 'b', 'a'] }
);

eq(
  'mixed directions on the same fee → not asked',
  feeMismatch([trade('a', 1, { brokerageCents: -1 }), trade('b', 2, { brokerageCents: 1 }), trade('c', 3, { brokerageCents: -1 })], 0),
  null
);

eq(
  'different fees edited on each → not asked',
  feeMismatch([trade('a', 1, { brokerageCents: -1 }), trade('b', 2, { clearingCents: -1 }), trade('c', 3, { stampCents: -1 })], 0),
  null
);

eq(
  'fewer than three trades → not asked',
  feeMismatch([trade('a', 1, { brokerageCents: -1 }), trade('b', 2, { brokerageCents: -1 })], 0),
  null
);

eq('no trades → not asked', feeMismatch([], 0), null);

eq(
  'trades entered before the last answer are ignored',
  feeMismatch([trade('a', 1, { brokerageCents: -1 }), trade('b', 2, { brokerageCents: -1 }), trade('c', 3, { brokerageCents: -1 })], 1),
  null
);

eq(
  'a trade entered in the same millisecond as "Not now" belongs to the dismissed run',
  feeMismatch([trade('a', 5, { brokerageCents: -1 }), trade('b', 6, { brokerageCents: -1 }), trade('c', 7, { brokerageCents: -1 })], 5),
  null
);

eq(
  'three new ones after the answer → asked again',
  ids(
    feeMismatch(
      [
        trade('old', 1, { brokerageCents: -1 }),
        trade('a', 11, { brokerageCents: -1 }),
        trade('b', 12, { brokerageCents: -1 }),
        trade('c', 13, { brokerageCents: -1 }),
      ],
      10
    )
  ),
  { key: 'brokerageCents', direction: -1, ids: ['c', 'b', 'a'] }
);

eq(
  'an untouched trade breaks the run, even with older edits behind it',
  feeMismatch(
    [
      trade('a', 1, { brokerageCents: -1 }),
      trade('b', 2, { brokerageCents: -1 }),
      trade('c', 3, { brokerageCents: -1 }),
      trade('d', 4),
    ],
    0
  ),
  null
);

eq(
  'only the three most recent by entry time count, not by input order',
  ids(
    feeMismatch(
      [trade('c', 30, { brokerageCents: 1 }), trade('x', 5), trade('a', 10, { brokerageCents: 1 }), trade('b', 20, { brokerageCents: 1 })],
      0
    )
  ),
  { key: 'brokerageCents', direction: 1, ids: ['c', 'b', 'a'] }
);

eq(
  'dividends are not trades anyone typed fees into, so they neither count nor break a run',
  ids(
    feeMismatch(
      [
        trade('a', 1, { brokerageCents: -1 }),
        trade('b', 2, { brokerageCents: -1 }),
        trade('div', 3, undefined, 'dividend'),
        trade('c', 4, { brokerageCents: -1 }),
      ],
      0
    )
  ),
  { key: 'brokerageCents', direction: -1, ids: ['c', 'b', 'a'] }
);

eq(
  'one fee matching across all three is enough, whatever else was edited',
  ids(
    feeMismatch(
      [
        trade('a', 1, { brokerageCents: -1, stampCents: 1 }),
        trade('b', 2, { brokerageCents: 1, stampCents: 1 }),
        trade('c', 3, { stampCents: 1 }),
      ],
      0
    )
  ),
  { key: 'stampCents', direction: 1, ids: ['c', 'b', 'a'] }
);

/* ------------------------------------------------------------- feeEditsOf */

const RATES = { brokerageCents: 800, clearingCents: 32, stampCents: 200, sstCents: 0 };

eq('nothing edited → nothing recorded', feeEditsOf(RATES, RATES, {}), undefined);
eq(
  'typed lower and higher → both directions',
  feeEditsOf({ ...RATES, brokerageCents: 700, stampCents: 300 }, RATES, { brokerageCents: true, stampCents: true }),
  { brokerageCents: -1, stampCents: 1 }
);
eq(
  'typed back to the same sen is not an edit',
  feeEditsOf(RATES, RATES, { brokerageCents: true }),
  undefined
);
eq(
  'a field not marked edited is never counted',
  feeEditsOf({ ...RATES, clearingCents: 0 }, RATES, {}),
  undefined
);
eq('no broker → nothing to compare against', feeEditsOf(RATES, null, { brokerageCents: true }), undefined);

report();
