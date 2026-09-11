import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PiggyBank, Activity, Schedule, Loan, Alert, Trade, NotificationPrefs, SavingsSettings } from '../types';
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
  migrateHoldingsToTrades,
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
      (a) => {
        setActivities(a);
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
    loading: loading || !activitiesReady,
    offline,
    error,
    retry,
  };
};
