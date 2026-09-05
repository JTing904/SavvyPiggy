import { useCallback, useEffect, useState } from 'react';
import type { PiggyBank, Activity, Schedule, Loan, Alert, NotificationPrefs, SavingsSettings } from '../types';
import { DEFAULT_PREFS, DEFAULT_SAVINGS } from '../services/alerts';
import {
  subscribeToBanks,
  subscribeToActivities,
  subscribeToSchedules,
  subscribeToLoans,
  subscribeToAlerts,
  subscribeToPrefs,
  subscribeToSavings,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // onSnapshot tears the listener down on error, so recovering means resubscribing.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!uid) {
      setBanks([]);
      setActivities([]);
      setSchedules([]);
      setLoans([]);
      setAlerts([]);
      setPrefs(DEFAULT_PREFS);
      setSavings(DEFAULT_SAVINGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let banksReady = false;
    let activitiesReady = false;
    let schedulesReady = false;
    let loansReady = false;
    let alertsReady = false;
    let prefsReady = false;
    let savingsReady = false;
    const settle = () => {
      if (banksReady && activitiesReady && schedulesReady && loansReady && alertsReady && prefsReady && savingsReady) setLoading(false);
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
    const unsubActivities = subscribeToActivities(
      uid,
      (a) => {
        setActivities(a);
        activitiesReady = true;
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

    return () => {
      unsubSavings();
      unsubAlerts();
      unsubPrefs();
      unsubBanks();
      unsubActivities();
      unsubSchedules();
      unsubLoans();
    };
  }, [uid, attempt]);

  return { banks, activities, schedules, loans, alerts, prefs, savings, loading, error, retry };
};
