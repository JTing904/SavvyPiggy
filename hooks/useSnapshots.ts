import { useEffect, useRef, useState } from 'react';
import type { Snapshot, Trade } from '../types';
import { buildHoldings, quoteValueCents, type Quote, type Quotes } from '../services/holdings';
import { freshQuote } from '../services/quotes';
import { subscribeToSnapshots, writeSnapshot } from '../services/firestore';

/**
 * How old a fetched price may be and still be written into a month's record.
 * Long enough to outlast a slow network on the first open, short enough that
 * a phone left open overnight does not stamp yesterday's price.
 */
const PRICE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * A monthly record of what the investments were worth.
 *
 * The Growth screen had no chart because there was no honest way to draw one:
 * the app keeps no price history, so a line back through last year would have
 * to be invented. This is the alternative — write down what things are worth
 * as the months actually pass, and the chart fills in from here forward.
 *
 * A month already recorded is never rewritten. Re-stamping an old month with
 * today's prices would turn a record into a guess, which is the one thing the
 * chart exists to avoid.
 */
export const useSnapshots = (
  uid: string | undefined,
  trades: Trade[],
  quotes: Quotes,
  ready: boolean
) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  // Keyed by account, so another account signed into this session still gets its month.
  const written = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSnapshots([]);
      return;
    }
    return subscribeToSnapshots(uid, setSnapshots, () => undefined);
  }, [uid]);

  useEffect(() => {
    if (!uid || !ready || written.current === uid || trades.length === 0) return;

    // Only a month that has finished can be recorded: a value written today
    // for a month still running would be replaced by a different truth
    // tomorrow, and this never rewrites.
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const month = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const id = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    if (snapshots.some((s) => s.id === id)) return;

    /*
      The positions as that month ended, not as they are today.

      This used to replay the whole log, so a month's point described whatever
      was held when the app happened to open. Buy on the 3rd, open the app on
      the 5th, and last month's snapshot carried this month's shares — the
      chart then drew a cost line from the trades and a value line from a
      different portfolio, and the gap between them read as growth that never
      happened. A month already recorded is never rewritten, so it stayed
      wrong.
    */
    const holdings = buildHoldings(trades.filter((t) => t.tradedAt < end.getTime()));
    // Nothing was held then — there is no month to record, only one to wait for.
    if (holdings.length === 0) return;

    /*
      Prices are today's, which is the honest limit of this: a month-end value
      recorded a few days late is the nearest thing the app can know, and it
      is only ever recorded once.

      And they must really be today's. This used to run as soon as the ledger
      arrived, with whatever the price cache held — on a fresh install that is
      nothing, so every position was written down at cost, and a month is never
      rewritten. So it waits for a price fetched this session for every
      counter held at the month end. `quotes` is only a trigger here: it
      changes when a fetch lands, and this looks again. If a counter will not
      price, nothing is written and the next fetch or the next open tries.
    */
    const fresh: Quote[] = [];
    for (const h of holdings) {
      const quote = freshQuote(h.symbol, PRICE_MAX_AGE_MS);
      if (!quote) return;
      fresh.push(quote);
    }
    const value = holdings.reduce((sum, h, i) => sum + quoteValueCents(h, fresh[i]), 0);
    const cost = holdings.reduce((sum, h) => sum + h.costCents, 0);

    written.current = uid;
    void writeSnapshot(uid, { id, at: end.getTime(), valueCents: value, costCents: cost }).catch(() => {
      // Nothing depends on this having happened; next month asks again.
      written.current = null;
    });
  }, [uid, ready, trades, quotes, snapshots]);

  return snapshots;
};
