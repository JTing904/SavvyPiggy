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

/**
 * v1 filed every monthly close a month early (see `ymOf`), so its histories
 * are thrown away and fetched again once.
 */
const CACHE_KEY = 'savvypiggy.history.v2';
const OLD_CACHE_KEYS = ['savvypiggy.history.v1'];

export interface HistoryCache {
  /** "YYYY-MM" the history was fetched in. */
  month: string;
  series: Record<string, MonthlySeries>;
  /**
   * Counters Yahoo would not give while it was giving the others, with the
   * day ("YYYY-MM-DD") that happened. They are not asked for again that day,
   * so one delisted counter does not cost a request and a rewrite every open.
   */
  failed?: Record<string, string>;
}

const readCache = (): HistoryCache | null => {
  try {
    for (const old of OLD_CACHE_KEYS) localStorage.removeItem(old);
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as HistoryCache) : null;
  } catch {
    return null;
  }
};

const writeCache = (cached: HistoryCache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Too big or no storage: the history still stands for this session.
  }
};

/** Bursa's offset from UTC, for a payload that does not say. */
const MYT_OFFSET_SECONDS = 8 * 3600;

/**
 * The month a Yahoo timestamp belongs to, on the exchange's own calendar.
 *
 * Yahoo stamps a monthly bar at midnight on the 1st in the exchange's time
 * zone, which for Bursa is 16:00 UTC on the last day of the month before.
 * Read in UTC, every close landed a month early and the live point for this
 * month became a month of its own. Dividends are stamped during the day and
 * come out the same either way, but go through here too so both agree.
 */
const ymOf = (seconds: number, offsetSeconds: number) => {
  const d = new Date((seconds + offsetSeconds) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Yahoo's monthly chart with dividends, as consecutive months. Null if it could not be read. */
export const parseHistory = (payload: unknown): MonthlySeries | null => {
  const result = (payload as {
    chart?: {
      result?: {
        meta?: { gmtoffset?: number };
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[] }[] };
        events?: { dividends?: Record<string, { date: number; amount: number }> };
      }[];
    };
  })?.chart?.result?.[0];
  const stamps = result?.timestamp;
  const raw = result?.indicators?.quote?.[0]?.close;
  if (!stamps || !raw || stamps.length === 0) return null;
  const gmtoffset = result?.meta?.gmtoffset;
  const offset = typeof gmtoffset === 'number' && Number.isFinite(gmtoffset) ? gmtoffset : MYT_OFFSET_SECONDS;

  const start = ymOf(stamps[0], offset);
  const closes: number[] = [];
  for (let k = 0; k < stamps.length; k++) {
    const c = raw[k];
    if (c == null || !(c > 0)) continue;
    // Timestamps run oldest first, so this month's live point, which shares
    // the month with this month's bar, is the one that stays.
    closes[monthIndex(start, ymOf(stamps[k], offset))] = Math.round(c * 10_000) / 10_000;
  }
  // A month Yahoo skipped carries the last close forward rather than a hole.
  for (let i = 0; i < closes.length; i++) if (!(closes[i] > 0)) closes[i] = closes[i - 1] ?? 0;
  const firstPriced = closes.findIndex((c) => c > 0);
  if (firstPriced < 0) return null;

  const divs = closes.map(() => 0);
  for (const d of Object.values(result?.events?.dividends ?? {})) {
    const i = monthIndex(start, ymOf(d.date, offset));
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
const today = (now: Date) => `${thisMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;

/**
 * The universe plus the watchlist, from this month's cache where it can be,
 * fetched four at a time where it cannot. A counter Yahoo will not give is
 * simply absent; the caller decides whether what came back is enough.
 *
 * `month` is the month the returned history was fetched in. When nothing at
 * all could be fetched for a new month — the phone is offline — last month's
 * history is returned as it was, and the cache on the phone is left alone
 * rather than replaced by an empty one.
 *
 * `stop` is asked between batches; once it says yes, whatever has arrived is
 * kept and nothing more is fetched.
 */
export const loadHistory = async (
  watchlist: string[],
  onProgress: (done: number, total: number) => void = () => {},
  now = new Date(),
  stop: () => boolean = () => false,
  fetcher: (symbol: string) => Promise<MonthlySeries | null> = fetchOne,
  cache: { read: () => HistoryCache | null; write: (c: HistoryCache) => void } = { read: readCache, write: writeCache }
): Promise<{ series: Record<string, MonthlySeries>; month: string }> => {
  const month = thisMonth(now);
  const day = today(now);
  const cached = cache.read();
  const current = cached?.month === month;
  const series: Record<string, MonthlySeries> = current ? { ...cached.series } : {};
  const failed: Record<string, string> = current ? { ...(cached.failed ?? {}) } : {};

  const wanted = [...new Set([...UNIVERSE, ...watchlist])];
  const missing = wanted.filter((s) => !series[s] && failed[s] !== day);
  let done = wanted.length - missing.length;
  onProgress(done, wanted.length);

  let got = 0;
  const notGiven: string[] = [];
  for (let k = 0; k < missing.length; k += 4) {
    if (stop()) break;
    const batch = missing.slice(k, k + 4);
    const results = await Promise.all(batch.map(async (s) => [s, await fetcher(s).catch(() => null)] as const));
    for (const [s, h] of results) {
      if (h) {
        series[s] = h;
        delete failed[s];
        got++;
      } else {
        notGiven.push(s);
      }
    }
    done += batch.length;
    onProgress(done, wanted.length);
  }

  if (got === 0) {
    // Nothing new: nothing to write. A new month with nothing fetched is the
    // phone being offline, and last month's history is better than none.
    if (!current && missing.length > 0 && cached && Object.keys(cached.series).length > 0) {
      return { series: cached.series, month: cached.month };
    }
    return { series, month };
  }

  // Only when most of the round came back is a failure the counter's own
  // doing; a round that mostly failed is the connection, and tries again.
  if (got >= notGiven.length * 3) for (const s of notGiven) failed[s] = day;
  cache.write({ month, series, failed });
  return { series, month };
};
