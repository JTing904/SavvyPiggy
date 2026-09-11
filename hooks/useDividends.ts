import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dividend, Loan, NotificationPrefs, PiggyBank, SavingsSettings, Trade } from '../types';
import { dueDividends } from '../services/dividends';
import { loadDividends, readCache } from '../services/dividendApi';
import { creditDividend, subscribeToCreditedDividends } from '../services/firestore';

interface Options {
  uid: string | undefined;
  trades: Trade[];
  banks: PiggyBank[];
  loans: Loan[];
  prefs: NotificationPrefs;
  savings: SavingsSettings;
  /** Nothing is credited until the ledger has actually arrived. */
  ready: boolean;
}

/**
 * Dividends: fetched when the app opens, and paid in when they fall due.
 *
 * The crediting happens here rather than on a screen because it is not a
 * screen's job — a payment lands whether or not anyone is looking at the
 * investments, and it should be in the savings the next time the app is
 * opened, not the next time that tab is visited.
 *
 * Three rules keep this from going wrong:
 *
 * It only ever credits what the trade log says was held on the ex-date, so
 * buying or selling since then changes nothing about a payment already
 * decided.
 *
 * It writes through a transaction keyed on the dividend's own id, so however
 * many times this runs — two phones, ten app opens — a dividend is paid once.
 *
 * And it does nothing at all when the data is missing or unreadable. A
 * payment recorded late is a small annoyance; a payment invented is a lie in
 * someone's savings.
 */
export const useDividends = ({ uid, trades, banks, loans, prefs, savings, ready }: Options) => {
  const [dividends, setDividends] = useState<Dividend[]>(() => readCache());
  const [busy, setBusy] = useState(false);

  /**
   * Which dividends have already been paid in. Kept apart from the trade log
   * on purpose: the log is a record the user may tidy away, and whether the
   * money moved is not something a tidy-up should be able to change.
   */
  const [credited, setCredited] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) {
      setCredited([]);
      return;
    }
    return subscribeToCreditedDividends(uid, setCredited, () => undefined);
  }, [uid]);

  // Every counter ever traded, not just those still held: a dividend can pay
  // weeks after the position that earned it was closed.
  const symbols = useMemo(
    () => [...new Set(trades.map((t) => t.symbol))].sort().join(','),
    [trades]
  );

  const refresh = useCallback(
    async (force = false) => {
      if (!symbols) return;
      setBusy(true);
      try {
        setDividends(await loadDividends(symbols.split(','), force));
      } finally {
        setBusy(false);
      }
    },
    [symbols]
  );

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // One pass at a time. Firestore's own listener brings the new trade back,
  // which removes it from the due list, so this settles on its own.
  const running = useRef(false);

  useEffect(() => {
    if (!uid || !ready || running.current || dividends.length === 0 || banks.length === 0) return;

    const due = dueDividends(dividends, trades, credited);
    if (due.length === 0) return;

    running.current = true;
    void (async () => {
      try {
        for (const item of due) {
          const name =
            trades.find((t) => t.symbol === item.dividend.symbol)?.name ?? item.dividend.symbol;
          // Sequential on purpose: each credit changes the balances the next
          // one is split against.
          await creditDividend(uid, item, name, banks, loans, { alerts: prefs, savings });
        }
      } catch (e) {
        // A refused write leaves the dividend due, and the next app open tries
        // again. Nothing here is allowed to interrupt the rest of the app.
        console.warn('[dividends] could not credit', e instanceof Error ? e.message : e);
      } finally {
        running.current = false;
      }
    })();
  }, [uid, ready, dividends, trades, credited, banks, loans, prefs, savings]);

  return { dividends, busy, refresh };
};
