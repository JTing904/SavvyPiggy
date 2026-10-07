import type { Trade } from '../types';
import type { CreditedDividend } from './dividends';
import { tradeCents } from './holdings';

/**
 * Correcting or taking back a dividend already paid into the investment pot.
 *
 * A broker often pays less than units times the announced rate (tax withheld,
 * a rounded payout), and the amount the app credited cannot be guessed at
 * after the fact — so the person states what really arrived, and these plans
 * work out what that moves. Pure, in whole sen.
 *
 * The trade row has no stored amount until corrected, so "what was credited" is
 * read from the row (tradeCents) and held against the marker; when the two
 * disagree something else has changed it, and nothing is guessed.
 */

export type DividendCorrectionProblem = 'notDividend' | 'notPot' | 'outOfSync' | 'amountPositive' | 'potShort';

export interface DividendCorrectionProblemInfo<K extends string = DividendCorrectionProblem> {
  problem: K;
  availableCents?: number;
  neededCents?: number;
}

/** The amount currently credited, or a reason it cannot be corrected. */
const credited = (trade: Trade, marker: CreditedDividend) => {
  if (trade.kind !== 'dividend') return { problem: 'notDividend' as const };
  if (trade.money?.mode !== 'pot') return { problem: 'notPot' as const };
  const cents = trade.amountCents ?? tradeCents(trade);
  if (marker.removed || marker.amountCents !== cents) return { problem: 'outOfSync' as const };
  return { cents };
};

export const planDividendCorrection = (i: {
  trade: Trade;
  marker: CreditedDividend;
  newCents: number;
  potCents: number;
}):
  | {
      plan: {
        oldCents: number;
        deltaCents: number;
        /** Into the pot (negative: out of it). */
        potDelta: number;
        trade: { amountCents: number };
        marker: { amountCents: number; corrected: true };
      };
    }
  | DividendCorrectionProblemInfo => {
  const old = credited(i.trade, i.marker);
  if ('problem' in old) return { problem: old.problem };
  if (!Number.isInteger(i.newCents) || i.newCents <= 0) return { problem: 'amountPositive' };

  const deltaCents = i.newCents - old.cents;
  // Less than was credited takes the difference back out, and the pot has to still hold it.
  if (i.potCents + deltaCents < 0) return { problem: 'potShort', availableCents: i.potCents, neededCents: -deltaCents };

  return {
    plan: {
      oldCents: old.cents,
      deltaCents,
      potDelta: deltaCents,
      trade: { amountCents: i.newCents },
      marker: { amountCents: i.newCents, corrected: true },
    },
  };
};

/**
 * Taking a credited dividend back out of the pot. The marker stays, marked
 * removed with nothing paid, and keeps its units: zeroing them would read as
 * "owed again" to the reconcile and bring the dividend back.
 */
export const planDividendRemoval = (i: {
  trade: Trade;
  marker: CreditedDividend;
  potCents: number;
}):
  | { plan: { potDelta: number; marker: { removed: true; amountCents: 0 } } }
  | DividendCorrectionProblemInfo<Exclude<DividendCorrectionProblem, 'amountPositive'>> => {
  const old = credited(i.trade, i.marker);
  if ('problem' in old) return { problem: old.problem };
  if (i.potCents < old.cents) return { problem: 'potShort', availableCents: i.potCents, neededCents: old.cents };
  return { plan: { potDelta: -old.cents, marker: { removed: true, amountCents: 0 } } };
};
