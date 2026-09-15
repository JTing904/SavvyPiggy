import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dividend, Trade } from '../types';
import { dividendTradeId, dueDividends, settleSlots, slotOf, type CreditedDividend } from '../services/dividends';
import { loadDividends, readCache } from '../services/dividendApi';
import { creditDividend, subscribeToCreditedDividends } from '../services/firestore';

interface Options {
  uid: string | undefined;
  trades: Trade[];
  /** Nothing is credited until the ledger has actually arrived. */
  ready: boolean;
}

/**
 * Dividends: fetched when the app opens, and paid in when they fall due.
 *
 * The crediting happens here rather than on a screen because it is not a
 * screen's job — a payment lands whether or not anyone is looking at the
 * investments, and it should be in the pot the next time the app is opened,
 * not the next time that tab is visited.
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
export const useDividends = ({ uid, trades, ready }: Options) => {
  const [announced, setAnnounced] = useState<Dividend[]>(() => readCache());
  const [busy, setBusy] = useState(false);
  /**
   * Whether anyone has ever got an answer. A cache that has never been filled
   * and a counter that has declared nothing produce the same empty list, and
   * only one of them entitles the screen to say so.
   */
  const [known, setKnown] = useState(false);

  /**
   * Which dividends have already been paid in, and on what. Kept apart from
   * the trade log on purpose: the log is a record the user may tidy away, and
   * whether the money moved is not something a tidy-up should be able to
   * change.
   *
   * `null` until the listener's first answer. Before it, every past dividend
   * looks unpaid, and a fresh install would run a transaction for each one
   * only to find it already paid.
   */
  const [credited, setCredited] = useState<CreditedDividend[] | null>(null);

  useEffect(() => {
    setCredited(null);
    if (!uid) return;
    return subscribeToCreditedDividends(uid, setCredited, () => undefined);
  }, [uid]);

  // Same-ex-date dividends keep the ids they were paid under, whatever order the page lists them in.
  const dividends = useMemo(() => settleSlots(announced, credited ?? [], trades), [announced, credited, trades]);
  const creditedIds = useMemo(() => (credited ?? []).map((c) => c.id), [credited]);

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
        const answer = await loadDividends(symbols.split(','), force);
        setAnnounced(answer.dividends);
        setKnown(answer.known);
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
    // Dividends go into the investment pot, so a person with no goals is paid too.
    if (!uid || !ready || credited === null || running.current || dividends.length === 0) return;

    const paid = new Set(creditedIds);
    const due = dueDividends(dividends, trades, creditedIds).filter(
      /*
        A second dividend on the same ex-date waits until the first is
        recorded as paid. The first keeps the id every earlier version used,
        so it must be the one that claims it: were the second credited first
        under that id, the first would then look paid when it was not. The
        effect runs again as soon as the marker arrives, so the wait is
        seconds.
      */
      (item) =>
        slotOf(item.dividend) === 0 ||
        paid.has(dividendTradeId(item.dividend.symbol, item.dividend.exDate))
    );
    if (due.length === 0) return;

    running.current = true;
    void (async () => {
      try {
        for (const item of due) {
          const name =
            trades.find((t) => t.symbol === item.dividend.symbol)?.name ?? item.dividend.symbol;
          // Dividends go into the investment pot, so nothing about goals or debt is planned here.
          await creditDividend(uid, item, name);
        }
      } catch (e) {
        // A refused write leaves the dividend due, and the next app open tries
        // again. Nothing here is allowed to interrupt the rest of the app.
        console.warn('[dividends] could not credit', e instanceof Error ? e.message : e);
      } finally {
        running.current = false;
      }
    })();
  }, [uid, ready, dividends, trades, credited, creditedIds]);

  // Still null before the first answer: a trade saved then would skip correcting dividends already paid.
  return { dividends, credited, busy, known, refresh };
};
