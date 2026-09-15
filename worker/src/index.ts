import { bursaCode, parseDividends } from '../../services/dividends';
import type { Dividend } from '../../types';

/**
 * The dividend service.
 *
 * Bursa's dividend dates are not in any free API — Yahoo has the prices but
 * leaves `dividendDate` empty for Malaysian counters, and Bursa's own site
 * turns away scrapers. They are in KLSE Screener's stock pages, which is a
 * web page, not an interface anyone promised to keep. Hence this: one place
 * that reads those pages, on a schedule, and hands the app a few kilobytes of
 * JSON.
 *
 * Why it exists at all rather than each phone fetching for itself:
 *
 *  - It reads each counter once a day and caches the answer, so a hundred
 *    phones are still one request. Scraping politely is the price of being
 *    allowed to scrape.
 *  - The parser can be fixed here when the site changes its markup, without
 *    waiting for anyone to install a new build of the app.
 *
 * It holds no personal data and can compute nothing: it knows which counters
 * have been asked about, and nothing about who holds what. Units, amounts and
 * the money itself stay on the phone.
 */

export interface Env {
  DIVIDENDS: KVNamespace;
  /** The Firebase project whose users are allowed in. */
  FIREBASE_PROJECT_ID: string;
}

/** A cached page's worth of announcements. */
interface Entry {
  fetchedAt: number;
  dividends: Dividend[];
}

const SOURCE = 'https://www.klsescreener.com/v2/stocks/view/';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Long enough to be one fetch a day per counter, short enough to stay current. */
const FRESH_MS = 20 * 60 * 60 * 1000;
const KEY_PREFIX = 'sym:';

/**
 * The code KLSE Screener files a counter under: four digits and, for the
 * likes of KLCC (5235SS) or an ETF (0800EA), a one- or two-letter suffix. The
 * page lives at that same code, suffix and all, and the app's symbol is it
 * plus ".KL". Shared with the app so the two can be tested against each other.
 */
const codeOf = bursaCode;

/**
 * At most this many counters per request. Each one can be a fetch to the
 * source, and the free plan allows 50 subrequests per invocation (the token
 * check can take one more); the app splits a longer list into batches of this
 * size (services/dividendApi.ts, which must be kept in step).
 */
const MAX_SYMBOLS = 25;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // The app calls this natively, so no browser origin needs allowing; a
      // browser that tries is refused rather than quietly half-working.
      'cache-control': 'no-store',
    },
  });

/* -------------------------------------------------------------------- auth */

/** Google's signing keys, as JWKs so WebCrypto can import them directly. */
const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let keyCache: { at: number; keys: Record<string, JsonWebKey> } | null = null;

const signingKeys = async () => {
  if (keyCache && Date.now() - keyCache.at < 60 * 60 * 1000) return keyCache.keys;
  const res = await fetch(JWKS);
  if (!res.ok) throw new Error('signing keys unavailable');
  const body = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const keys: Record<string, JsonWebKey> = {};
  for (const key of body.keys) keys[key.kid] = key;
  keyCache = { at: Date.now(), keys };
  return keys;
};

const decodeSegment = (segment: string) => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)), (c) =>
    c.charCodeAt(0)
  );
  return bytes;
};

/**
 * True if this is a live Firebase ID token for our own project.
 *
 * Without this the endpoint would be an open proxy that anyone could point at
 * the source site, which is both rude to them and a good way to get the
 * Worker's address blocked.
 */
const isOurUser = async (token: string, projectId: string) => {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const header = JSON.parse(new TextDecoder().decode(decodeSegment(parts[0]))) as {
      alg: string;
      kid: string;
    };
    if (header.alg !== 'RS256' || !header.kid) return false;

    const jwk = (await signingKeys())[header.kid];
    if (!jwk) return false;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeSegment(parts[2]), signed))) {
      return false;
    }

    const claims = JSON.parse(new TextDecoder().decode(decodeSegment(parts[1]))) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
    };
    const now = Math.floor(Date.now() / 1000);
    return (
      claims.aud === projectId &&
      claims.iss === `https://securetoken.google.com/${projectId}` &&
      typeof claims.sub === 'string' &&
      claims.sub.length > 0 &&
      typeof claims.exp === 'number' &&
      claims.exp > now
    );
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ source */

/**
 * One counter's announcements, from cache when it is fresh.
 *
 * A failed fetch or an unreadable page returns whatever was cached, however
 * old. With nothing cached there is no answer at all, and that is said
 * (`known: false`) rather than passed off as an empty list: a blocked request
 * or a challenge page parses to nothing, and "nothing announced" would be a
 * guess. Such an empty first read is not cached either, so the next request
 * tries again instead of repeating the guess for 20 hours. It never throws:
 * the app's rule is that a dividend it cannot read is a dividend it does not
 * record.
 */
const load = async (env: Env, symbol: string, force = false): Promise<{ dividends: Dividend[]; known: boolean }> => {
  const code = codeOf(symbol);
  if (!code) return { dividends: [], known: false };

  const key = `${KEY_PREFIX}${code}`;
  const cached = (await env.DIVIDENDS.get<Entry>(key, 'json')) ?? null;
  const fallback = () => (cached ? { dividends: cached.dividends, known: true } : { dividends: [], known: false });
  if (!force && cached && Date.now() - cached.fetchedAt < FRESH_MS) return { dividends: cached.dividends, known: true };

  try {
    const res = await fetch(`${SOURCE}${code}`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
    });
    if (!res.ok) return fallback();

    const html = await res.text();
    const dividends = parseDividends(html, `${code}.KL`);
    // An empty parse is either a counter that pays nothing or a page we can no
    // longer read. A real stock page (it always shows the market cap) that
    // lists nothing is an answer, and is cached like any other so a counter
    // that never pays is not fetched on every request. Anything else — a
    // challenge page, a changed layout — is not worth throwing away a good
    // cache for, and with no cache it is not an answer at all.
    if (dividends.length === 0 && (!html.includes('Market Cap') || (cached?.dividends.length ?? 0) > 0)) return fallback();

    await env.DIVIDENDS.put(key, JSON.stringify({ fetchedAt: Date.now(), dividends } satisfies Entry));
    return { dividends, known: true };
  } catch {
    return fallback();
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname !== '/dividends') return json({ error: 'not found' }, 404);
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

    const auth = request.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !(await isOurUser(token, env.FIREBASE_PROJECT_ID))) {
      return json({ error: 'unauthorized' }, 401);
    }

    // A cap, so one request can never become a burst against the source.
    // Duplicates are removed before the cap, so a repeated code cannot push a
    // real one out of it.
    const asked = (url.searchParams.get('symbols') ?? '')
      .split(',')
      .map((s) => codeOf(s))
      .filter((c): c is string => c !== null);
    const symbols = [...new Set(asked)].slice(0, MAX_SYMBOLS);
    if (symbols.length === 0) return json({ dividends: [] });

    const lists = await Promise.all(symbols.map((code) => load(env, code)));
    // `unknown` names the counters there is no answer for yet, as the app
    // writes them. Older builds of the app ignore it and read `dividends` as before.
    return json({
      dividends: lists.flatMap((l) => l.dividends),
      unknown: symbols.filter((_, i) => !lists[i].known).map((code) => `${code}.KL`),
      at: Date.now(),
    });
  },

  /**
   * Once a day, refresh everything anyone has ever asked about, so a pay date
   * that lands overnight is already waiting when the app next opens.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // The free plan allows 50 outbound fetches per run. Past that every
    // refresh failed quietly, so a different slice of the list is refreshed
    // each day; anything asked for by the app is still refreshed on demand.
    const PER_RUN = 45;
    const listed = await env.DIVIDENDS.list({ prefix: KEY_PREFIX, limit: 1000 });
    const keys = listed.keys;
    if (keys.length === 0) return;
    const day = Math.floor(Date.now() / 86_400_000);
    const start = keys.length > PER_RUN ? (day * PER_RUN) % keys.length : 0;
    const slice = Array.from({ length: Math.min(PER_RUN, keys.length) }, (_, i) => keys[(start + i) % keys.length]);
    for (const key of slice) {
      await load(env, key.name.slice(KEY_PREFIX.length), true);
    }
  },
};
