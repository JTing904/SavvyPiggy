import { useEffect, useRef, useState } from 'react';
import type { Snapshot, Trade } from '../types';
import { buildHoldings, marketValueCents, averageCostCents, type Quotes } from '../services/holdings';
import { subscribeToSnapshots, writeSnapshot } from '../services/firestore';

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
  const written = useRef(false);

  useEffect(() => {
    if (!uid) {
      setSnapshots([]);
      return;
    }
    return subscribeToSnapshots(uid, setSnapshots, () => undefined);
  }, [uid]);

  useEffect(() => {
    if (!uid || !ready || written.current || trades.length === 0) return;

    const holdings = buildHoldings(trades);
    if (holdings.length === 0) return;

    // Only a month that has finished can be recorded: a value written today
    // for a month still running would be replaced by a different truth
    // tomorrow, and this never rewrites.
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const month = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const id = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    if (snapshots.some((s) => s.id === id)) return;

    // Prices are today's, which is the honest limit of this: a month-end value
    // recorded a few days late is the nearest thing the app can know, and it
    // is only ever recorded once.
    const value = holdings.reduce(
      (sum, h) => sum + marketValueCents(h, quotes[h.symbol]?.priceCents ?? Math.round(averageCostCents(h))),
      0
    );
    const cost = holdings.reduce((sum, h) => sum + h.costCents, 0);

    written.current = true;
    void writeSnapshot(uid, { id, at: end.getTime(), valueCents: value, costCents: cost }).catch(() => {
      // Nothing depends on this having happened; next month asks again.
      written.current = false;
    });
  }, [uid, ready, trades, quotes, snapshots]);

  return snapshots;
};
