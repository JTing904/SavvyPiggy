import { useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Trade } from '../types';
import { CHART, getJson } from '../services/quotes';
import { parseDailyCloses, valueSeries, type DailyClose, type ValuePoint } from '../services/trails';

const CACHE_KEY = 'savvypiggy.closes.v1';
/** A close does not change once the day is over, so once or twice a day is enough. */
const FRESH_MS = 6 * 3_600_000;
const CONCURRENCY = 4;

interface Cached {
  at: number;
  closes: DailyClose[];
}
type Cache = Record<string, Cached>;

const read = (): Cache => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
};
const write = (cache: Cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Too big or no storage: the line still stands for this session.
  }
};

/**
 * What the shares were worth at each close of the last year, for the line on
 * the investing page. A year of closes comes straight from Yahoo on the phone
 * and is kept on the phone, so it costs no Firebase reads and no writes. When a
 * counter cannot be read the line is null: an old line beats a wrong one, so
 * whatever was cached stays until a fetch works.
 */
export const useValueTrail = (trades: Trade[]): { trail: ValuePoint[] | null; closes: Record<string, DailyClose[]> } => {
  const symbols = useMemo(() => [...new Set(trades.filter((t) => t.kind !== 'dividend').map((t) => t.symbol))].sort(), [trades]);
  const key = symbols.join(',');
  const [closes, setCloses] = useState<Record<string, DailyClose[]>>(() => {
    const cache = read();
    return Object.fromEntries(Object.entries(cache).map(([s, c]) => [s, c.closes]));
  });

  // Opened offline, or left open past a day: looked at again when the app comes back or the network does.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener('online', again);
    const resumed = Capacitor.isNativePlatform() ? CapacitorApp.addListener('resume', again) : null;
    return () => {
      window.removeEventListener('online', again);
      void resumed?.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    let live = true;
    const cache = read();
    const now = Date.now();
    const stale = symbols.filter((s) => !cache[s] || now - cache[s].at > FRESH_MS);
    if (stale.length === 0) return;
    void (async () => {
      for (let i = 0; i < stale.length; i += CONCURRENCY) {
        await Promise.all(
          stale.slice(i, i + CONCURRENCY).map(async (symbol) => {
            const payload = await getJson(`${CHART}${encodeURIComponent(symbol)}`, { range: '1y', interval: '1d' });
            const parsed = payload ? parseDailyCloses(payload) : null;
            if (parsed) cache[symbol] = { at: Date.now(), closes: parsed };
          })
        );
      }
      write(cache);
      if (live) setCloses(Object.fromEntries(Object.entries(cache).map(([s, c]) => [s, c.closes])));
    })();
    return () => {
      live = false;
    };
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const trail = useMemo(() => valueSeries(trades, closes), [trades, closes]);
  return { trail, closes };
};
