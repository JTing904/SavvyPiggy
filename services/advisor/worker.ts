import {
  buildPanel,
  recordFor,
  STYLES,
  trainFinal,
  walkForwardWeights,
  type MonthlySeries,
  type Style,
  type StyleRecord,
} from './model';

/**
 * The slow half of the pick, off the main thread.
 *
 * Training three models once for every month of history takes a few seconds on
 * a phone; doing it where the screen draws would freeze the app. The walked-
 * forward weights depend only on the universe, not on anyone's list, so they
 * come back to be kept for the month and are passed in again next time.
 */

export interface AdvisorRequest {
  universe: Record<string, MonthlySeries>;
  watchlist: string[];
  fits?: Record<Style, { index: number; weights: number[] }[]> | null;
}

export interface AdvisorResponse {
  weights: Record<Style, number[]>;
  records: Record<Style, StyleRecord | null>;
  fits: Record<Style, { index: number; weights: number[] }[]>;
}

export const runAdvisor = ({ universe, watchlist, fits }: AdvisorRequest): AdvisorResponse => {
  const panel = buildPanel(universe);
  const weights = {} as Record<Style, number[]>;
  const records = {} as Record<Style, StyleRecord | null>;
  const allFits = {} as Record<Style, { index: number; weights: number[] }[]>;
  for (const style of STYLES) {
    const walked = fits?.[style]?.length ? fits[style] : walkForwardWeights(panel, style);
    allFits[style] = walked;
    weights[style] = trainFinal(panel, style);
    records[style] = recordFor(panel, style, walked, watchlist);
  }
  return { weights, records, fits: allFits };
};

// Only when loaded as a worker; importing this file for runAdvisor has no side effects.
declare const self: { onmessage: ((e: MessageEvent<AdvisorRequest>) => void) | null; postMessage: (msg: unknown) => void } | undefined;
if (typeof window === 'undefined' && typeof self !== 'undefined' && self) {
  self.onmessage = (e: MessageEvent<AdvisorRequest>) => {
    try {
      self!.postMessage({ ok: true, result: runAdvisor(e.data) });
    } catch (err) {
      self!.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
