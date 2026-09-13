import { useEffect, useMemo, useState } from 'react';
import type { Quotes } from '../services/holdings';
import type { StyleMix } from '../types';
import { loadHistory, thisMonth } from '../services/advisor/history';
import { blend, scoreNow, type BlendedCounter, type MonthlySeries, type Style, type StyleRecord } from '../services/advisor/model';
import { runAdvisor, type AdvisorRequest, type AdvisorResponse } from '../services/advisor/worker';

/**
 * This month's pick for a watchlist and a style mix.
 *
 * History is fetched once a month and the models trained once a month, in a
 * worker; both are kept on the phone. Changing the mix or the live price only
 * re-scores, which is instant. Changing the list re-runs the record, because
 * the record is about that list.
 */

export type AdvisorStatus = 'idle' | 'loading' | 'training' | 'ready' | 'unavailable';

const CACHE_KEY = 'savvypiggy.advisor.v1';

interface Cached {
  month: string;
  watchKey: string;
  weights: Record<Style, number[]>;
  records: Record<Style, StyleRecord | null>;
  fits: AdvisorResponse['fits'];
}

const readCache = (): Cached | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
};

const writeCache = (value: Cached) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Kept for the session only.
  }
};

const inWorker = (request: AdvisorRequest) =>
  new Promise<AdvisorResponse>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../services/advisor/worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // No workers here: do it on this thread, slower but the same answer.
      try {
        resolve(runAdvisor(request));
      } catch (e) {
        reject(e);
      }
      return;
    }
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: AdvisorResponse; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'advisor failed'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(request);
  });

/** Fewer counters than this and the comparison the models make means nothing. */
const MIN_UNIVERSE = 20;

export const useAdvisor = ({
  watchlist,
  mix,
  quotes,
  enabled,
}: {
  watchlist: string[];
  mix: StyleMix | null;
  quotes: Quotes;
  enabled: boolean;
}) => {
  const watchKey = useMemo(() => [...new Set(watchlist)].sort().join(','), [watchlist]);
  const [status, setStatus] = useState<AdvisorStatus>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [series, setSeries] = useState<Record<string, MonthlySeries> | null>(null);
  const [model, setModel] = useState<Pick<Cached, 'weights' | 'records'> | null>(null);

  useEffect(() => {
    if (!enabled || !watchKey) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    const list = watchKey.split(',');
    (async () => {
      setStatus('loading');
      const { series: loaded, month } = await loadHistory(list, (done, total) => !cancelled && setProgress({ done, total }));
      if (cancelled) return;
      if (Object.keys(loaded).length < MIN_UNIVERSE) {
        setStatus('unavailable');
        return;
      }
      setSeries(loaded);

      const cached = readCache();
      if (cached && cached.month === month && cached.watchKey === watchKey) {
        setModel(cached);
        setStatus('ready');
        return;
      }

      setStatus('training');
      const fits = cached?.month === month ? cached.fits : null;
      const result = await inWorker({ universe: loaded, watchlist: list, fits });
      if (cancelled) return;
      writeCache({ month, watchKey, ...result });
      setModel(result);
      setStatus('ready');
    })().catch(() => !cancelled && setStatus('unavailable'));
    return () => {
      cancelled = true;
    };
  }, [enabled, watchKey]);

  const ranked: BlendedCounter[] = useMemo(() => {
    if (!series || !model || !mix || !watchKey) return [];
    const live: Record<string, number> = {};
    for (const symbol of watchKey.split(',')) {
      const q = quotes[symbol];
      if (q) live[symbol] = (q.pricePoints ?? q.priceCents * 100) / 10_000;
    }
    return blend(scoreNow(series, watchKey.split(','), model.weights, live), mix);
  }, [series, model, mix, quotes, watchKey]);

  return { status, progress, ranked, records: model?.records ?? null, month: thisMonth() };
};
