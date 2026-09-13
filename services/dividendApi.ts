import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { auth } from '../lib/firebase';
import type { Dividend } from '../types';

/**
 * Talking to the dividend Worker.
 *
 * Shaped like services/quotes.ts and for the same reasons: the request goes
 * out natively on Android so it never meets the browser's cross-origin rules,
 * every failure is silent, and the last good answer is kept so a screen is
 * never blank because the network was.
 *
 * The stakes are higher here than with prices, because this feeds money into
 * the ledger. So the rule is absolute: no answer means no dividends, never a
 * guess. A payment missed today is recorded the next time the app opens; a
 * payment invented is wrong for good.
 */

const API = import.meta.env.VITE_DIVIDENDS_API as string | undefined;
const CACHE_KEY = 'savvypiggy.dividends';

/** Announcements move once a quarter; asking hourly is generous. */
const FRESH_MS = 60 * 60 * 1000;

/**
 * The Worker answers for at most this many counters a request (MAX_SYMBOLS in
 * worker/src/index.ts) and silently ignores the rest, so a longer list goes
 * out in batches of this size. Keep the two in step.
 */
const BATCH = 25;

/** False until the Worker's address is in .env.local, which the screens say. */
export const isDividendApiConfigured = typeof API === 'string' && API.length > 0;

const native = () => Capacitor.isNativePlatform();

interface Cache {
  at: number;
  dividends: Dividend[];
  /**
   * The counters that answer actually covers. Without it, a counter bought a
   * minute ago looked "fresh" for the rest of the hour and its dividends were
   * never asked about. Caches written before this field existed have none,
   * and are treated as covering nothing.
   */
  symbols?: string[];
}

const readRaw = (): Partial<Cache> => {
  try {
    return (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Partial<Cache>) ?? {};
  } catch {
    return {};
  }
};

export const readCache = (): Dividend[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Cache;
    return Array.isArray(parsed?.dividends) ? parsed.dividends.filter(isSound) : [];
  } catch {
    return [];
  }
};

const cachedAt = (): number => readRaw().at ?? 0;

/**
 * A row is only usable if every field money depends on is really there. A
 * malformed announcement is dropped rather than defaulted, because a default
 * would end up in someone's balance.
 */
const isSound = (d: Dividend) =>
  !!d &&
  typeof d.symbol === 'string' &&
  Number.isFinite(d.exDate) &&
  Number.isFinite(d.payDate) &&
  Number.isFinite(d.perUnitPoints) &&
  d.perUnitPoints > 0;

/**
 * Announcements for the counters given. Returns the cache when the network
 * fails, when the Worker is not configured, or when anything comes back
 * looking wrong.
 */
/**
 * Whether the list that came back was actually fetched. A screen that says
 * "nothing has been announced" is making a claim about the user's holdings,
 * and it is only entitled to make it when somebody asked and got an answer.
 */
export interface DividendAnswer {
  dividends: Dividend[];
  /**
   * True when this reflects a real answer — a fetch that just succeeded, or a
   * cache some earlier fetch wrote. False means nobody has ever got through,
   * and "nothing has been announced" would be a guess dressed as a fact.
   */
  known: boolean;
}

/** One batch of counters. Null on any failure, so the caller can keep what it had. */
const fetchBatch = async (symbols: string[], token: string): Promise<Dividend[] | null> => {
  const url = `${API!.replace(/\/$/, '')}/dividends`;
  const params = { symbols: symbols.join(',') };
  const headers = { Authorization: `Bearer ${token}` };

  let payload: unknown;
  if (native()) {
    const res = await CapacitorHttp.get({ url, params, headers, readTimeout: 12_000, connectTimeout: 12_000 });
    if (res.status < 200 || res.status >= 300) return null;
    payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } else {
    const res = await fetch(`${url}?${new URLSearchParams(params)}`, { headers });
    if (!res.ok) return null;
    payload = await res.json();
  }

  const rows = (payload as { dividends?: Dividend[] } | null)?.dividends;
  return Array.isArray(rows) ? rows.filter(isSound) : null;
};

export const loadDividends = async (
  symbols: string[],
  force = false
): Promise<DividendAnswer> => {
  const cached = readCache();
  const wanted = [...new Set(symbols)].filter(Boolean).sort();
  const fallback = (): DividendAnswer => ({ dividends: cached, known: cachedAt() > 0 });
  if (!isDividendApiConfigured || wanted.length === 0) return fallback();

  // Fresh only if the last answer was recent and covered every counter asked
  // about now; a newly traded one is fetched straight away.
  const covered = new Set(readRaw().symbols ?? []);
  if (!force && Date.now() - cachedAt() < FRESH_MS && wanted.every((s) => covered.has(s))) {
    return { dividends: cached, known: true };
  }

  const user = auth.currentUser;
  if (!user) return fallback();

  try {
    // The Worker checks this is a live token for this project before it will
    // fetch anything, so the endpoint cannot be used as an open proxy.
    const token = await user.getIdToken();

    const batches: string[][] = [];
    for (let i = 0; i < wanted.length; i += BATCH) batches.push(wanted.slice(i, i + BATCH));
    // One after another rather than together: each batch can make the Worker
    // read up to 25 pages, and there is no hurry that justifies a burst.
    const answers: (Dividend[] | null)[] = [];
    for (const batch of batches) {
      try {
        answers.push(await fetchBatch(batch, token));
      } catch (e) {
        console.warn('[dividends] batch failed', e instanceof Error ? e.message : e);
        answers.push(null);
      }
    }
    if (answers.every((a) => a === null)) return fallback();

    /*
      A batch that failed keeps what the cache already had for its counters —
      real announcements from an earlier answer, never a guess — and those
      counters are left out of `symbols`, so the next call asks again.
    */
    const answered = new Set(batches.flatMap((batch, i) => (answers[i] ? batch : [])));
    const dividends = [
      ...answers.flatMap((a) => a ?? []),
      ...cached.filter((d) => !answered.has(d.symbol)),
    ];
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), dividends, symbols: [...answered] } satisfies Cache)
    );
    return { dividends, known: true };
  } catch (e) {
    console.warn('[dividends] request failed', e instanceof Error ? e.message : e);
    return fallback();
  }
};
