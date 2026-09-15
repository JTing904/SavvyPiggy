import type { Trade } from '../types';
import { ordered } from './holdings';

/** A sale that sells more units than were held at that point in the log. */
export interface ShortSale {
  trade: Trade;
  heldUnits: number;
}

// The same order replay walks the log in: by trade day, buys before sales on
// one day, then by when it was entered.

/**
 * The first sale in one counter's log that sells units that were not held.
 *
 * Replay quietly caps such a sale at what was held, but its money still counts
 * every unit typed — so a sale of 1,000 units against 100 put RM8,000 into the
 * goals for shares that never existed. The log is checked as a whole, because
 * correcting or deleting a buy can leave a later sale short too.
 */
export const shortSale = (trades: Trade[]): ShortSale | null => {
  let units = 0;
  for (const trade of ordered(trades)) {
    if (trade.kind === 'buy') units += trade.units;
    else if (trade.kind === 'sell') {
      if (trade.units > units) return { trade, heldUnits: units };
      units -= trade.units;
    }
  }
  return null;
};

/**
 * Whether a change to the log should be refused for leaving a sale short.
 * A log that was already short before this change (data from before the check
 * existed) is not held against an unrelated correction, only against one that
 * makes it worse or creates a new short sale.
 */
export const newShortSale = (before: Trade[], after: Trade[]): ShortSale | null => {
  const now = shortSale(after);
  if (!now) return null;
  const was = shortSale(before);
  if (was && was.trade.id === now.trade.id && now.trade.units - now.heldUnits <= was.trade.units - was.heldUnits) return null;
  return now;
};
