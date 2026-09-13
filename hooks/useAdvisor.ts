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
 *
 * The download and the training belong to the module, not to a screen. The
 * pick card on Home and the monthly buy page ask for the same list, and
 * moving between them used to throw a half-finished run away and start
 * another worker from nothing. Now a screen joins the run already going for
 * its list, the result is kept when it lands whoever is still looking, and a
 * run nobody has watched for a moment is stopped and its worker ended.
 */

export type AdvisorStatus = 'idle' | 'loading' | 'training' | 'ready' | 'unavailable';

/** v1 was trained on histories filed a month early; see services/advisor/history.ts. */
const CACHE_KEY = 'savvypiggy.advisor.v2';
const OLD_CACHE_KEYS = ['savvypiggy.advisor.v1'];

interface Cached {
  month: string;
  watchKey: string;
  weights: Record<Style, number[]>;
  records: Record<Style, StyleRecord | null>;
  fits: AdvisorResponse['fits'];
}

const readCache = (): Cached | null => {
  try {
    for (const old of OLD_CACHE_KEYS) localStorage.removeItem(old);
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

/** The same list however it was ordered or repeated. */
const watchKeyOf = (watchlist: string[]) => [...new Set(watchlist)].sort().join(',');

/** Fewer counters than this and the comparison the models make means nothing. */
const MIN_UNIVERSE = 20;

/** How long a run with nobody watching is kept going, so a screen change does not end it. */
const IDLE_MS = 2_000;

interface Snapshot {
  status: AdvisorStatus;
  progress: { done: number; total: number } | null;
  series: Record<string, MonthlySeries> | null;
  model: Pick<Cached, 'weights' | 'records'> | null;
}

const IDLE: Snapshot = { status: 'idle', progress: null, series: null, model: null };

interface Run {
  snapshot: Snapshot;
  listeners: Set<(s: Snapshot) => void>;
  stopped: boolean;
  worker: Worker | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

/** Keyed by month and list. A finished run stays, so coming back to a screen is instant. */
const runs = new Map<string, Run>();

const stopRun = (key: string, run: Run) => {
  if (run.idleTimer) clearTimeout(run.idleTimer);
  run.idleTimer = null;
  run.stopped = true;
  run.worker?.terminate();
  run.worker = null;
  if (runs.get(key) === run) runs.delete(key);
};

const inWorker = (run: Run, request: AdvisorRequest) =>
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
    run.worker = worker;
    const done = () => {
      worker.terminate();
      if (run.worker === worker) run.worker = null;
    };
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: AdvisorResponse; error?: string }>) => {
      done();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'advisor failed'));
    };
    worker.onerror = (e) => {
      done();
      reject(new Error(e.message));
    };
    worker.postMessage(request);
  });

const startRun = (key: string, watchKey: string): Run => {
  const run: Run = {
    snapshot: { ...IDLE, status: 'loading' },
    listeners: new Set(),
    stopped: false,
    worker: null,
    idleTimer: null,
  };
  const set = (patch: Partial<Snapshot>) => {
    if (run.stopped) return;
    run.snapshot = { ...run.snapshot, ...patch };
    for (const listener of run.listeners) listener(run.snapshot);
  };
  const forget = () => {
    if (runs.get(key) === run) runs.delete(key);
  };
  const fail = () => {
    set({ status: 'unavailable' });
    // Nothing to keep: the next screen to ask, or "Try again", starts afresh.
    forget();
  };
  const ready = (series: Record<string, MonthlySeries>, model: Snapshot['model'], month: string) => {
    set({ series, model, status: 'ready' });
    // Last month's history, because this month's could not be fetched: good
    // enough for the screen that is open, but the next one to ask tries again.
    if (month !== key.split('|')[0]) forget();
  };

  const list = watchKey.split(',');
  (async () => {
    const { series, month } = await loadHistory(
      list,
      (done, total) => set({ progress: { done, total } }),
      new Date(),
      () => run.stopped
    );
    if (run.stopped) return;
    if (Object.keys(series).length < MIN_UNIVERSE) return fail();

    const cached = readCache();
    if (cached && cached.month === month && cached.watchKey === watchKey) {
      ready(series, { weights: cached.weights, records: cached.records }, month);
      return;
    }

    set({ series, status: 'training' });
    const fits = cached?.month === month ? cached.fits : null;
    const result = await inWorker(run, { universe: series, watchlist: list, fits });
    if (run.stopped) return;
    // Written here rather than in a screen, so it is kept even if the screen
    // that asked has since closed.
    writeCache({ month, watchKey, ...result });
    ready(series, { weights: result.weights, records: result.records }, month);
  })().catch(() => {
    if (!run.stopped) fail();
  });
  return run;
};

/**
 * The per-style record for a list, if this month's has already been worked
 * out — from a run in memory or the phone's cache. Never starts a run, so it
 * is cheap enough to ask for whenever the style questions open.
 */
export const cachedRecords = (watchlist: string[]): Record<Style, StyleRecord | null> | null => {
  const watchKey = watchKeyOf(watchlist);
  if (!watchKey) return null;
  const month = thisMonth();
  const live = runs.get(`${month}|${watchKey}`)?.snapshot.model;
  if (live) return live.records;
  const cached = readCache();
  return cached && cached.month === month && cached.watchKey === watchKey ? cached.records : null;
};

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
  const watchKey = useMemo(() => watchKeyOf(watchlist), [watchlist]);
  // A run already finished for this list shows at once, not after a blank frame.
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    enabled && watchKey ? runs.get(`${thisMonth()}|${watchKey}`)?.snapshot ?? IDLE : IDLE
  );

  useEffect(() => {
    if (!enabled || !watchKey) {
      setSnapshot(IDLE);
      return;
    }
    const key = `${thisMonth()}|${watchKey}`;
    let run = runs.get(key);
    if (!run) {
      run = startRun(key, watchKey);
      runs.set(key, run);
    }
    // Runs for another list or an earlier month that nobody is watching are done with.
    for (const [otherKey, other] of [...runs]) if (other !== run && other.listeners.size === 0) stopRun(otherKey, other);

    const joined = run;
    if (joined.idleTimer) clearTimeout(joined.idleTimer);
    joined.idleTimer = null;
    joined.listeners.add(setSnapshot);
    setSnapshot(joined.snapshot);

    return () => {
      joined.listeners.delete(setSnapshot);
      const busy = joined.snapshot.status === 'loading' || joined.snapshot.status === 'training';
      if (joined.listeners.size === 0 && busy && !joined.stopped) {
        joined.idleTimer = setTimeout(() => stopRun(key, joined), IDLE_MS);
      }
    };
  }, [enabled, watchKey]);

  const { status, progress, series, model } = snapshot;

  const ranked: BlendedCounter[] = useMemo(() => {
    if (status !== 'ready' || !series || !model || !mix || !watchKey) return [];
    const live: Record<string, number> = {};
    for (const symbol of watchKey.split(',')) {
      const q = quotes[symbol];
      if (q) live[symbol] = (q.pricePoints ?? q.priceCents * 100) / 10_000;
    }
    return blend(scoreNow(series, watchKey.split(','), model.weights, live), mix);
  }, [status, series, model, mix, quotes, watchKey]);

  return { status, progress, ranked, records: status === 'ready' ? model?.records ?? null : null, month: thisMonth() };
};
