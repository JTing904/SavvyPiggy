import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PiggyBank, Activity, Schedule, Loan, Alert, Trade, NotificationPrefs, SavingsSettings, InvestSettings } from '../types';
import { buildHoldings } from '../services/holdings';
import { DEFAULT_PREFS, DEFAULT_SAVINGS } from '../services/alerts';
import {
  subscribeToBanks,
  subscribeToActivities,
  subscribeToSchedules,
  subscribeToLoans,
  subscribeToAlerts,
  subscribeToPrefs,
  subscribeToSavings,
  subscribeToTrades,
  subscribeToInvest,
  migrateHoldingsToTrades,
  DEFAULT_INVEST,
} from '../services/firestore';

/** Live Firestore data for one user. Every collection streams in real time. */
export const usePiggyData = (uid: string | undefined) => {
  const [banks, setBanks] = useState<PiggyBank[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [savings, setSavings] = useState<SavingsSettings>(DEFAULT_SAVINGS);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [invest, setInvest] = useState<InvestSettings>(DEFAULT_INVEST);
  const [loading, setLoading] = useState(true);
  const [activitiesReady, setActivitiesReady] = useState(false);
  /**
   * True when the ledger on screen came from the phone rather than the
   * server. An empty cache used to render as RM0.00 and no goals with
   * nothing to say it was not the truth.
   */
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // onSnapshot tears the listener down on error, so recovering means resubscribing.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!uid) {
      setBanks([]);
      setSchedules([]);
      setLoans([]);
      setAlerts([]);
      setPrefs(DEFAULT_PREFS);
      setSavings(DEFAULT_SAVINGS);
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let banksReady = false;
    let schedulesReady = false;
    let loansReady = false;
    let alertsReady = false;
    let prefsReady = false;
    let savingsReady = false;
    let tradesReady = false;
    const settle = () => {
      if (banksReady && schedulesReady && loansReady && alertsReady && prefsReady && savingsReady && tradesReady) setLoading(false);
    };
    const fail = (e: { message: string }) => {
      setError(e.message);
      setLoading(false);
    };

    const unsubBanks = subscribeToBanks(
      uid,
      (b) => {
        setBanks(b);
        banksReady = true;
        settle();
      },
      fail
    );
    const unsubSchedules = subscribeToSchedules(
      uid,
      (sch) => {
        setSchedules(sch);
        schedulesReady = true;
        settle();
      },
      fail
    );

    const unsubLoans = subscribeToLoans(
      uid,
      (l) => {
        setLoans(l);
        loansReady = true;
        settle();
      },
      fail
    );

    const unsubAlerts = subscribeToAlerts(
      uid,
      (a) => {
        setAlerts(a);
        alertsReady = true;
        settle();
      },
      fail
    );

    const unsubPrefs = subscribeToPrefs(
      uid,
      (p) => {
        setPrefs(p);
        prefsReady = true;
        settle();
      },
      fail
    );

    const unsubSavings = subscribeToSavings(
      uid,
      (v) => {
        setSavings(v);
        savingsReady = true;
        settle();
      },
      fail
    );

    const unsubTrades = subscribeToTrades(
      uid,
      (t) => {
        setTrades(t);
        tradesReady = true;
        settle();
      },
      fail
    );

    // Anyone who recorded a position before the log existed is moved onto it
    // once, here, where a uid is known and the listener will pick the result
    // straight up. A failure leaves the old row alone to try again next time.
    void migrateHoldingsToTrades(uid).catch(() => undefined);

    return () => {
      unsubTrades();
      unsubSavings();
      unsubAlerts();
      unsubPrefs();
      unsubBanks();
      unsubSchedules();
      unsubLoans();
    };
  }, [uid, attempt]);

  /**
   * The ledger is read through the window the user keeps, so the daily read
   * allowance is spent on records that still exist. Changing the window
   * reopens this; nothing else here depends on it.
   */
  /*
    Saying "offline" only once it is actually true.

    Every local write produces an optimistic snapshot served from the cache
    before the server acknowledges it, so reacting to `fromCache` the moment
    it arrives would flash the banner on each deposit. Being genuinely offline
    keeps it true, so a short wait tells the two apart. Coming back is
    immediate — there is nothing to be careful about in good news.
  */
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flagOffline = useCallback((fromCache: boolean) => {
    if (offlineTimer.current) {
      clearTimeout(offlineTimer.current);
      offlineTimer.current = null;
    }
    if (!fromCache) {
      setOffline(false);
      return;
    }
    offlineTimer.current = setTimeout(() => setOffline(true), 2_000);
  }, []);

  useEffect(() => () => {
    if (offlineTimer.current) clearTimeout(offlineTimer.current);
  }, []);

  // Investing settings never hold the savings screens back: until they arrive
  // the defaults simply mean nothing has been chosen yet.
  useEffect(() => {
    if (!uid) {
      setInvest(DEFAULT_INVEST);
      return;
    }
    return subscribeToInvest(uid, setInvest, (e) => setError(e.message));
  }, [uid, attempt]);

  useEffect(() => {
    if (!uid) {
      setActivities([]);
      setActivitiesReady(true);
      return;
    }
    setActivitiesReady(false);
    return subscribeToActivities(
      uid,
      savings.retentionMonths,
      // The second argument is why this listener asks for metadata at all:
      // an empty cache and an empty ledger look identical without it, and
      // the banner that says so was never being switched on.
      (a, fromCache) => {
        setActivities(a);
        flagOffline(fromCache);
        setActivitiesReady(true);
      },
      (e) => {
        setError(e.message);
        setActivitiesReady(true);
      }
    );
  }, [uid, attempt, savings.retentionMonths]);

  // Positions are replayed rather than stored, so they update the moment a
  // trade in the log does.
  const holdings = useMemo(() => buildHoldings(trades), [trades]);

  return {
    banks,
    activities,
    schedules,
    loans,
    alerts,
    prefs,
    savings,
    trades,
    holdings,
    invest,
    loading: loading || !activitiesReady,
    offline,
    error,
    retry,
  };
};
