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

/** False until the Worker's address is in .env.local, which the screens say. */
export const isDividendApiConfigured = typeof API === 'string' && API.length > 0;

const native = () => Capacitor.isNativePlatform();

interface Cache {
  at: number;
  dividends: Dividend[];
}

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

const cachedAt = (): number => {
  try {
    return (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache).at ?? 0;
  } catch {
    return 0;
  }
};

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

export const loadDividends = async (
  symbols: string[],
  force = false
): Promise<DividendAnswer> => {
  const cached = readCache();
  const wanted = [...new Set(symbols)].filter(Boolean);
  const fallback = (): DividendAnswer => ({ dividends: cached, known: cachedAt() > 0 });
  if (!isDividendApiConfigured || wanted.length === 0) return fallback();
  if (!force && Date.now() - cachedAt() < FRESH_MS) return { dividends: cached, known: true };

  const user = auth.currentUser;
  if (!user) return fallback();

  try {
    // The Worker checks this is a live token for this project before it will
    // fetch anything, so the endpoint cannot be used as an open proxy.
    const token = await user.getIdToken();
    const url = `${API!.replace(/\/$/, '')}/dividends`;
    const params = { symbols: wanted.join(',') };
    const headers = { Authorization: `Bearer ${token}` };

    let payload: unknown;
    if (native()) {
      const res = await CapacitorHttp.get({ url, params, headers, readTimeout: 12_000, connectTimeout: 12_000 });
      if (res.status < 200 || res.status >= 300) return fallback();
      payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } else {
      const res = await fetch(`${url}?${new URLSearchParams(params)}`, { headers });
      if (!res.ok) return fallback();
      payload = await res.json();
    }

    const rows = (payload as { dividends?: Dividend[] } | null)?.dividends;
    if (!Array.isArray(rows)) return fallback();

    const dividends = rows.filter(isSound);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), dividends } satisfies Cache));
    return { dividends, known: true };
  } catch (e) {
    console.warn('[dividends] request failed', e instanceof Error ? e.message : e);
    return fallback();
  }
};
