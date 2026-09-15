import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { parseQuote, type Quote, type Quotes } from './holdings';

/**
 * Share prices, straight from the phone. Two things shape this file:
 *
 * There is no server, so the app talks to Yahoo's public chart endpoint
 * itself. On Android that goes through CapacitorHttp, which makes the request
 * natively and so never meets the browser's cross-origin rules; in a desktop
 * browser the same call is blocked, which is why prices only appear on the
 * phone. Nothing else in the app depends on this working.
 *
 * And the endpoint is not a promise anybody made us. It can change or go away,
 * so every failure here is silent: the caller keeps the last price it saw and
 * the screen says how old it is. A missing price must never look like a
 * missing ringgit.
 */

export const CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const CACHE_KEY = 'savvypiggy.quotes';

/** Long enough that flicking between apps costs nothing, short enough to feel live. */
const FRESH_MS = 60_000;

/** Price requests in flight at once, as the advisor's history download does. */
const QUOTE_CONCURRENCY = 4;

const native = () => Capacitor.isNativePlatform();

/**
 * Yahoo turns away clients that do not look like a browser, so every request
 * carries an ordinary user agent. Without it the endpoints answer 401 and the
 * screen would quietly show nothing.
 */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

/** One request, whichever transport this platform has. Never throws. */
export const getJson = async (url: string, params: Record<string, string>): Promise<unknown | null> => {
  try {
    if (native()) {
      const res = await CapacitorHttp.get({ url, params, headers: HEADERS, readTimeout: 12_000, connectTimeout: 12_000 });
      if (res.status < 200 || res.status >= 300) {
        console.warn('[quotes] HTTP', res.status, url, String(res.data).slice(0, 200));
        return null;
      }
      return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    }
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${query}`, { headers: HEADERS });
    if (!res.ok) {
      console.warn('[quotes] HTTP', res.status, url);
      return null;
    }
    return await res.json();
  } catch (e) {
    // Offline, blocked by CORS in a browser, or Yahoo changed its mind.
    console.warn('[quotes] request failed', url, e instanceof Error ? e.message : e);
    return null;
  }
};

/* ------------------------------------------------------------------ cache */

/** The last price seen for each symbol, so a cold start is never blank. */
export const readCache = (): Quotes => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Quotes;
    // Anything shaped wrong is treated as no cache at all.
    return Object.entries(parsed).reduce<Quotes>((out, [symbol, quote]) => {
      if (quote && Number.isFinite(quote.priceCents) && quote.priceCents > 0) out[symbol] = quote;
      return out;
    }, {});
  } catch {
    return {};
  }
};

const writeCache = (quotes: Quotes) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(quotes));
  } catch {
    // Storage may be unavailable; the prices still stand for this session.
  }
};

/* ----------------------------------------------------------------- quotes */

/** When we last asked, per symbol — kept in memory so it resets with the app. */
const lastFetched = new Map<string, number>();

/**
 * Prices that actually came back from Yahoo in this session, with when. The
 * cache cannot say this: after a fresh install it is empty, and after a week
 * away it is a week old, and both look like prices. Anything that records a
 * value for good (the monthly snapshot) asks here instead.
 */
const fetchedThisSession = new Map<string, { quote: Quote; at: number }>();

/** A price fetched this session no longer ago than `maxAgeMs`, or null. */
export const freshQuote = (symbol: string, maxAgeMs: number, now = Date.now()): Quote | null => {
  const hit = fetchedThisSession.get(symbol);
  return hit && now - hit.at <= maxAgeMs ? hit.quote : null;
};

const fetchQuote = async (symbol: string): Promise<Quote | null> => {
  const payload = await getJson(`${CHART}${encodeURIComponent(symbol)}`, { range: '1d', interval: '1d' });
  return payload ? parseQuote(payload) : null;
};

/**
 * Prices for the symbols given, cache first. Symbols asked for recently are
 * left alone unless `force` is set, so coming back to the app every few
 * minutes costs one request per counter, not a stream of them.
 *
 * The returned map always includes whatever was cached, so callers can render
 * immediately and simply get better numbers when this resolves.
 */
export const loadQuotes = async (symbols: string[], force = false): Promise<Quotes> => {
  const cached = readCache();
  const now = Date.now();
  const wanted = [...new Set(symbols)].filter(Boolean);

  const stale = wanted.filter((symbol) => force || now - (lastFetched.get(symbol) ?? 0) > FRESH_MS);
  if (stale.length === 0) return cached;

  // One request per counter: the batch endpoint needs a session Yahoo will not
  // hand out. At most QUOTE_CONCURRENCY at a time — a long watchlist used to
  // fire every request at once on each resume — and a failure only loses its
  // own symbol.
  stale.forEach((symbol) => lastFetched.set(symbol, now));
  const fetched: (readonly [string, Quote | null])[] = new Array(stale.length);
  let next = 0;
  const worker = async () => {
    while (next < stale.length) {
      const i = next++;
      fetched[i] = [stale[i], await fetchQuote(stale[i]).catch(() => null)] as const;
    }
  };
  await Promise.all(Array.from({ length: Math.min(QUOTE_CONCURRENCY, stale.length) }, worker));

  const merged = { ...cached };
  const landed = Date.now();
  for (const [symbol, quote] of fetched) {
    if (!quote) continue;
    merged[symbol] = quote;
    fetchedThisSession.set(symbol, { quote, at: landed });
  }

  writeCache(merged);
  return merged;
};

/* ----------------------------------------------------------------- search */

export interface SymbolHit {
  symbol: string;
  name: string;
  exchange: string;
}

/**
 * Look a counter up by name, so nobody has to remember that Maybank is 1155.
 * Bursa only — a search for "maybank" otherwise turns up Bangkok and Frankfurt
 * listings that would quietly price the wrong thing.
 */
export const searchSymbols = async (query: string): Promise<SymbolHit[]> => {
  const text = query.trim();
  if (text.length < 2) return [];

  const payload = await getJson(SEARCH, { q: text, quotesCount: '12', newsCount: '0' });
  const quotes = (payload as { quotes?: Record<string, unknown>[] } | null)?.quotes;
  if (!Array.isArray(quotes)) return [];

  return quotes
    .filter((q) => typeof q.symbol === 'string' && (q.symbol as string).endsWith('.KL'))
    .map((q) => ({
      symbol: q.symbol as string,
      name: String(q.shortname ?? q.longname ?? q.symbol),
      exchange: String(q.exchDisp ?? 'Kuala Lumpur'),
    }));
};
