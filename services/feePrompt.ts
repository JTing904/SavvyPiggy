import type { Trade } from '../types';
import { FEE_KEYS, type FeeKey, type TradeFees } from './fees';

/**
 * Noticing when a broker's stored rates have stopped matching the contract notes.
 *
 * One fee typed over the broker's figure says nothing — a promotion, a typo, a
 * one-off rebate. The same fee typed over three trades running, every time in
 * the same direction, is the broker having changed what it charges. That is
 * the only pattern asked about, and the app never guesses the new rate: it
 * only points the person at their own settings.
 */

export type FeeDirection = 1 | -1;

export interface FeeMismatch {
  key: FeeKey;
  /** 1: every entry was above the broker's rate; −1: every entry was below it. */
  direction: FeeDirection;
  /** The trades that made the pattern, newest first. */
  trades: Trade[];
}

/** How many trades in a row it takes before the question is worth asking. */
export const MISMATCH_RUN = 3;

/**
 * Which fees were typed over, and whether above or below the broker's figure.
 * A field left as the rates gave it, or typed back to the same sen, is not an
 * edit. Without a broker there is nothing to compare against, so nothing is.
 */
export const feeEditsOf = (
  entered: TradeFees,
  computed: TradeFees | null,
  edited: Partial<Record<FeeKey, boolean>>
): Partial<Record<FeeKey, FeeDirection>> | undefined => {
  if (!computed) return undefined;
  const out: Partial<Record<FeeKey, FeeDirection>> = {};
  for (const key of FEE_KEYS) {
    if (!edited[key]) continue;
    const diff = entered[key] - computed[key];
    if (diff !== 0) out[key] = diff > 0 ? 1 : -1;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * The last three buys and sells entered after the question was last answered,
 * judged fee by fee. `since` is exclusive: a trade entered in the same
 * millisecond as "Not now" belongs to the run that was just dismissed.
 */
export const feeMismatch = (trades: Trade[], since: number): FeeMismatch | null => {
  const recent = trades
    .filter((t) => (t.kind === 'buy' || t.kind === 'sell') && t.createdAt > since)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MISMATCH_RUN);
  if (recent.length < MISMATCH_RUN) return null;

  for (const key of FEE_KEYS) {
    const direction = recent[0].feeEdits?.[key];
    if (direction !== 1 && direction !== -1) continue;
    if (recent.every((t) => t.feeEdits?.[key] === direction)) return { key, direction, trades: recent };
  }
  return null;
};
