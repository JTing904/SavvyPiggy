import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadQuotes, readCache } from '../services/quotes';
import type { Quotes } from '../services/holdings';

/**
 * Live prices for a set of counters, shared by everything that shows them.
 *
 * It starts from the last prices seen so a cold start is never blank, then
 * fetches when the screen mounts and again whenever the app comes back into
 * view — the same moment the rest of the app catches up. A failed fetch keeps
 * the cached price rather than showing nothing: a missing price must never
 * look like a missing ringgit.
 */
export const useQuotes = (symbols: string[]) => {
  const [quotes, setQuotes] = useState<Quotes>(() => readCache());
  const [refreshing, setRefreshing] = useState(false);

  // A stable key, so a re-render with an equal list does not refetch.
  const key = useMemo(() => [...new Set(symbols)].sort().join(','), [symbols]);

  const refresh = useCallback(
    async (force = false) => {
      const wanted = key ? key.split(',') : [];
      if (wanted.length === 0) return;
      setRefreshing(true);
      try {
        setQuotes(await loadQuotes(wanted, force));
      } finally {
        setRefreshing(false);
      }
    },
    [key]
  );

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { quotes, refreshing, refresh };
};
