import { CHART, getJson } from '../quotes';
import { monthIndex, monthKey, type MonthlySeries } from './model';

/**
 * Twenty-odd years of monthly prices and dividends, straight from Yahoo on the
 * phone, kept for the month.
 *
 * The models learn from a fixed universe of 49 established Bursa counters
 * across every sector — the list the backtest was run on — plus whatever the
 * person is watching, so a counter outside the universe can still be scored
 * against it. History does not change once a month is over, so it is fetched
 * at most once a month and the phone keeps it; the live price on top comes
 * from the ordinary quotes the app already loads.
 */

/** Checked one by one against Yahoo on 13 Sep 2026. KLCC is a stapled security and is left to the watchlist. */
export const UNIVERSE = [
  '1155.KL', '1295.KL', '1023.KL', '1066.KL', '5819.KL', '1015.KL', '5258.KL', '5347.KL', '6033.KL', '6742.KL',
  '6012.KL', '6947.KL', '6888.KL', '4863.KL', '4707.KL', '3689.KL', '3026.KL', '2836.KL', '3255.KL', '4162.KL',
  '7052.KL', '7084.KL', '1961.KL', '2445.KL', '5285.KL', '2291.KL', '5681.KL', '7277.KL', '3816.KL', '5183.KL',
  '3182.KL', '4715.KL', '3859.KL', '5227.KL', '5176.KL', '5212.KL', '5106.KL', '5225.KL', '5878.KL', '8621.KL',
  '1818.KL', '5246.KL', '3034.KL', '4197.KL', '5398.KL', '3336.KL', '2089.KL', '1082.KL', '6399.KL',
];

const CACHE_KEY = 'savvypiggy.history.v1';

interface Cached {
  /** "YYYY-MM" the history was fetched in. */
  month: string;
  series: Record<string, MonthlySeries>;
}

const readCache = (): Cached | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
};

const writeCache = (cached: Cached) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Too big or no storage: the history still stands for this session.
  }
};

const ymOf = (seconds: number) => {
  const d = new Date(seconds * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Yahoo's monthly chart with dividends, as consecutive months. Null if it could not be read. */
export const parseHistory = (payload: unknown): MonthlySeries | null => {
  const result = (payload as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] }; events?: { dividends?: Record<string, { date: number; amount: number }> } }[] };
  })?.chart?.result?.[0];
  const stamps = result?.timestamp;
  const raw = result?.indicators?.quote?.[0]?.close;
  if (!stamps || !raw || stamps.length === 0) return null;

  const start = ymOf(stamps[0]);
  const closes: number[] = [];
  for (let k = 0; k < stamps.length; k++) {
    const c = raw[k];
    if (c == null || !(c > 0)) continue;
    closes[monthIndex(start, ymOf(stamps[k]))] = Math.round(c * 10_000) / 10_000;
  }
  // A month Yahoo skipped carries the last close forward rather than a hole.
  for (let i = 0; i < closes.length; i++) if (!(closes[i] > 0)) closes[i] = closes[i - 1] ?? 0;
  const firstPriced = closes.findIndex((c) => c > 0);
  if (firstPriced < 0) return null;

  const divs = closes.map(() => 0);
  for (const d of Object.values(result?.events?.dividends ?? {})) {
    const i = monthIndex(start, ymOf(d.date));
    if (i >= 0 && i < divs.length && d.amount > 0) divs[i] = Math.round((divs[i] + d.amount) * 10_000) / 10_000;
  }

  return {
    start: monthKey(start, firstPriced),
    closes: closes.slice(firstPriced),
    divs: divs.slice(firstPriced),
  };
};

const fetchOne = async (symbol: string) => {
  const payload = await getJson(`${CHART}${encodeURIComponent(symbol)}`, { range: 'max', interval: '1mo', events: 'div' });
  return payload ? parseHistory(payload) : null;
};

export const thisMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/**
 * The universe plus the watchlist, from this month's cache where it can be,
 * fetched four at a time where it cannot. A counter Yahoo will not give is
 * simply absent; the caller decides whether what came back is enough.
 */
export const loadHistory = async (
  watchlist: string[],
  onProgress: (done: number, total: number) => void = () => {},
  now = new Date()
): Promise<{ series: Record<string, MonthlySeries>; month: string }> => {
  const month = thisMonth(now);
  const cached = readCache();
  const series: Record<string, MonthlySeries> = cached?.month === month ? { ...cached.series } : {};

  const wanted = [...new Set([...UNIVERSE, ...watchlist])];
  const missing = wanted.filter((s) => !series[s]);
  let done = wanted.length - missing.length;
  onProgress(done, wanted.length);

  for (let k = 0; k < missing.length; k += 4) {
    const batch = missing.slice(k, k + 4);
    const got = await Promise.all(batch.map(async (s) => [s, await fetchOne(s)] as const));
    for (const [s, h] of got) if (h) series[s] = h;
    done += batch.length;
    onProgress(done, wanted.length);
  }

  if (missing.length > 0) writeCache({ month, series });
  return { series, month };
};
