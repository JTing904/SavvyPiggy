
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Tab, PiggyBank, Schedule, NotificationPrefs, SavingsSettings, type Activity } from './types';
import Dashboard from './components/Dashboard';
import StrategyEditor from './components/StrategyEditor';
import ActivityLog from './components/ActivityLog';
import CreateGoal from './components/CreateGoal';
import Navigation from './components/Navigation';
import Login from './components/Login';
import Profile from './components/Profile';
import GoalDetail from './components/GoalDetail';
import SetupNotice from './components/SetupNotice';
import RedeemInvite from './components/RedeemInvite';
import AutoDeposits from './components/AutoDeposits';
import Report from './components/Report';
import Alerts from './components/Alerts';
import Statements from './components/Statements';
import Trades from './components/Trades';
import Dividends from './components/Dividends';
import Growth from './components/Growth';
import TradeSheet, { type TradeDraft } from './components/TradeSheet';
import ArchiveSchedulesSheet from './components/ArchiveSchedulesSheet';
import PotTransferSheet from './components/invest/PotTransferSheet';
import type { Mode } from './components/Navigation';
import LanguagePicker from './components/LanguagePicker';
import MonthlyBuy from './components/invest/MonthlyBuy';
import StyleQuiz from './components/invest/StyleQuiz';
import BrokerPicker from './components/invest/BrokerPicker';
import { useLanguage, useT } from './contexts/LanguageContext';
import { getChoice, hasChosenLanguage, onLangChange, setLang } from './i18n';
import { useAuth } from './contexts/AuthContext';
import { usePiggyData } from './hooks/usePiggyData';
import { useMembership } from './hooks/useMembership';
import { useBackHandler } from './hooks/useBackHandler';
import { useDividends } from './hooks/useDividends';
import { useLedgerPruning } from './hooks/useLedgerPruning';
import { useSnapshots } from './hooks/useSnapshots';
import { useQuotes } from './hooks/useQuotes';
import { cachedRecords } from './hooks/useAdvisor';
import { exitApp, listenForBack } from './services/back';
import { isFirebaseConfigured } from './lib/firebase';
import * as api from './services/firestore';
import { fromCents, toCents } from './services/money';
import type { GoalMoneyChoice, GoneShareChoice } from './services/ledger';
import { staleAlerts, staleAlertsCutoff, streakAlertFor } from './services/alerts';
import { coveringRows, knownStreak } from './services/ledgerWindow';
import { readStreakMemory, writeStreakMemory } from './hooks/useOlderLedger';
import { useTradeRow } from './hooks/useTradeRow';
import { OlderRecordsSheet } from './components/OlderRecordsNotice';
import { checkPermission, onNotificationOpen, requestPermission, syncNotifications } from './services/notifications';

const Splash: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-full flex flex-col items-center justify-center gap-4">
    <span className="material-symbols-rounded text-primary text-4xl animate-pulse">savings</span>
    <p className="text-slate-600 text-xs font-black uppercase tracking-widest">{label}</p>
  </div>
);

const App: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const isMember = useMembership(user?.uid);
  // Firestore reads only start once an invite has unlocked the account.
  const uid = isMember ? user?.uid : undefined;
  const { lang } = useLanguage();
  const t = useT();
  const [languageChosen, setLanguageChosen] = useState(hasChosenLanguage);
  useEffect(() => onLangChange(() => setLanguageChosen(true)), []);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [showAutoDeposits, setShowAutoDeposits] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showStatements, setShowStatements] = useState(false);
  /* Which half of the app the bar and Home body are showing. The card the
     user swipes to on Home sets it; nothing else does. */
  const [mode, setMode] = useState<Mode>('save');
  const [tradeDraft, setTradeDraft] = useState<TradeDraft | null>(null);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [quickAction, setQuickAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showMonthlyBuy, setShowMonthlyBuy] = useState(false);
  /** Moving money between savings and the investment pot. */
  const [potSheet, setPotSheet] = useState<'in' | 'out' | null>(null);
  /**
   * The questions asked before something can open: the broker before a first
   * buy (its fees depend on it), with the buy waiting behind it; the style
   * questions before the recommendation page, which is `forPick`. Also used to
   * edit either on its own, with nothing waiting.
   */
  const [setup, setSetup] = useState<{ step: 'style' | 'broker'; pending: TradeDraft | null; forPick?: boolean; editing?: boolean } | null>(
    null
  );

  // A tab belongs to one half of the app, so the bar follows it. Screens reached
  // from Profile or an alert (the split, the report) used to open under the
  // investing bar with nothing lit.
  useEffect(() => {
    if ([Tab.LOG, Tab.BANKS, Tab.STATS].includes(activeTab)) setMode('save');
    else if ([Tab.TRADES, Tab.DIVIDENDS, Tab.GROWTH].includes(activeTab)) setMode('invest');
  }, [activeTab]);

  const { banks, activities, ledger, alertsCapped, schedules, loans, alerts, prefs, savings, trades, holdings, invest, loading: dataLoading, offline, error, retry } =
    usePiggyData(uid);

  // Prices and dividends both key off the counters in the log; a sold-out
  // position still matters, because its last dividend can pay weeks later.
  // Counters on the watchlist are priced too, so the recommendation can show
  // the price of something not held yet.
  const symbols = useMemo(
    () => [...new Set([...trades.map((t) => t.symbol), ...invest.watchlist.map((w) => w.symbol)])],
    [trades, invest.watchlist]
  );
  const { quotes } = useQuotes(symbols);
  // The quiz shows each style's record only if this month's run already exists; it never starts one.
  const quizRecords = useMemo(
    () => (setup?.step === 'style' ? cachedRecords(invest.watchlist.map((w) => w.symbol)) : null),
    [setup?.step, invest.watchlist]
  );
  const {
    dividends,
    credited: creditedDividends,
    busy: dividendsBusy,
    known: dividendsKnown,
    refresh: refreshDividends,
  } = useDividends({ uid, trades, ready: !dataLoading });
  const alertIds = useMemo(() => alerts.map((a) => a.id), [alerts]);

  useLedgerPruning(uid, savings, !dataLoading);
  const snapshots = useSnapshots(uid, trades, quotes, !dataLoading);

  // Archived goals keep their money and their history, so every screen that
  // looks backwards still gets the full list — only the working lists hide them.
  const activeBanks = useMemo(() => banks.filter((b) => !api.isArchived(b)), [banks]);

  // Deferred from sign-in, because the rules block users/{uid} until membership.
  useEffect(() => {
    if (user && isMember) run(() => api.ensureUserProfile(user));
  }, [user, isMember]);

  // No server fires recurring deposits on the free plan, so any occurrence
  // missed while the app was shut is posted when it comes back into view.
  const catchingUp = useRef(false);
  useEffect(() => {
    // Posting checks the rule on the server first, which cannot happen offline;
    // the catch-up runs again as soon as the app is back online.
    if (!uid || dataLoading || offline || schedules.length === 0) return;

    const catchUp = async () => {
      // `offline` only turns true after two seconds of cached data, and a
      // catch-up started inside that window failed with "the client is
      // offline" on every open without a connection. The phone knows sooner.
      if (catchingUp.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
      catchingUp.current = true;
      try {
        await api.runDueSchedules(uid, schedules, banks, loans, { alerts: prefs, savings });
      } catch (e) {
        // The connection dropped under it. Each day posts in its own
        // transaction, so nothing is half-done, and it runs again once online.
        if ((e as { code?: string } | null)?.code === 'unavailable') return;
        // This one posts real deposits and nobody asked it to run, so a
        // failure has to be visible: a rule pointing at a goal deleted on
        // another device used to stop posting silently, on every open,
        // forever, while the screen went on showing it as enabled.
        fail(e);
      } finally {
        catchingUp.current = false;
      }
    };

    void catchUp();
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
    };
  }, [uid, dataLoading, offline, schedules, banks, loans, prefs, savings]);

  /*
    The saving streak, shared by the alert, Profile and the Report.

    Only three months are live, which is always longer than the 7- and 30-day
    cards need. A run reaching the live window's start is extended with the run
    an earlier open verified (kept on the phone per account); only when nothing
    remembered joins up with it is the kept ledger read — once, and only if
    streak cards are switched on. A 100- or 365-day card therefore fires on the
    day it always did, and never from a guess: a run that cannot be counted
    stays "at least", which earns no card.
  */
  const streak = useMemo(
    () => knownStreak(activities, new Date(), ledger.loadedFrom, ledger.keptFrom, readStreakMemory(uid)),
    [uid, activities, ledger.loadedFrom.getTime(), ledger.keptFrom.getTime()] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!uid || dataLoading) return;
    if (!streak.needsOlder) writeStreakMemory(uid, streak.memory);
    else if (prefs.milestones) ledger.need(ledger.keptFrom);
  }, [uid, dataLoading, streak, prefs.milestones]); // eslint-disable-line react-hooks/exhaustive-deps

  // A trade opened for correcting waits for its History row when that is older than what is loaded.
  const tradeRow = useTradeRow(uid, tradeDraft, activities, ledger.keptFrom);

  // A streak milestone is judged on the live ledger rather than at deposit
  // time, so a catch-up run that lands on day 30 earns its card too.
  useEffect(() => {
    if (!uid || dataLoading || !prefs.milestones || streak.needsOlder) return;
    const draft = streakAlertFor(streak.run, alerts, new Date());
    if (draft) run(() => api.addAlert(uid, draft));
  }, [uid, dataLoading, streak, alerts, prefs.milestones]);

  // Alerts are disposable: anything older than the retention window goes,
  // once per session per account, without asking. The bell only reads the
  // newest few, so when it is full anything stale past them is found by a
  // bounded query instead.
  const swept = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || dataLoading || swept.current === uid) return;
    swept.current = uid;
    const now = new Date();
    const stale = staleAlerts(alerts, now);
    if (stale.length > 0) run(() => api.pruneAlerts(uid, stale.map((a) => a.id)));
    if (alertsCapped) run(() => api.pruneAlertsBefore(uid, staleAlertsCutoff(now)));
  }, [uid, dataLoading, alerts, alertsCapped]);

  // The language follows the account. Whichever was chosen more recently —
  // on this phone or on the account — wins, so picking 中文 on a new phone's
  // first screen is not overruled by an older English saved months ago.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void api
      .loadLanguage(uid)
      .then((remote) => {
        if (cancelled) return;
        const local = getChoice();
        if (remote && (!local || remote.at > local.at)) setLang(remote.lang, remote.at);
        else if (local && (!remote || local.at > remote.at || local.lang !== remote.lang)) void api.saveLanguage(uid, local).catch(() => {});
      })
      .catch(() => {});
    const stop = onLangChange(() => {
      const local = getChoice();
      if (local) void api.saveLanguage(uid, local).catch(() => {});
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [uid]);

  // The phone's alarms are rebuilt from the settings whenever they change, and
  // again whenever the app comes back into view: a phone that aggressively
  // sleeps apps — or a reinstall — can quietly drop what was already set.
  useEffect(() => {
    if (!uid || dataLoading) return;

    const sync = async () => {
      if (document.visibilityState !== 'visible') return;
      // The monthly digest and ex-date warnings start switched on, but Android 13+
      // delivers nothing until the phone is asked — and it was only ever asked
      // when a switch was flipped. Ask once, the first time something is on.
      if ((prefs.reminder || prefs.digest || prefs.exDates) && (await checkPermission()) === 'prompt') {
        let asked = false;
        try {
          asked = localStorage.getItem('savvypiggy.notifyAsked') === '1';
          localStorage.setItem('savvypiggy.notifyAsked', '1');
        } catch {
          // No storage: asking again next time is harmless.
        }
        if (!asked) await requestPermission().catch(() => undefined);
      }
      await syncNotifications(prefs, schedules, dividends, trades).catch(() => {});
    };
    const onVisible = () => void sync();
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // The language is in the list because every alarm's words are: switching
    // re-arms each one in the new language.
  }, [uid, dataLoading, prefs, schedules, dividends, trades, lang]);

  // Android's back gesture: close whatever is open, step back to Home, and
  // only then leave the app. Sheets inside a screen take it first — they push
  // their own handler on top of this one.
  useEffect(listenForBack, []);
  useBackHandler(showQuickPick, () => setShowQuickPick(false));
  useBackHandler(tradeDraft !== null, () => setTradeDraft(null));

  /**
   * Opening a trade. A first buy is held back until the broker is chosen, since
   * its fees come from the broker's rates; a sale never is — someone who has
   * sold has to be able to write it down. The style questions belong to the
   * recommendation, not to buying, so they are asked by openMonthlyBuy instead.
   */
  const openTrade = (draft: TradeDraft) => {
    if (draft.mode === 'new' && draft.kind === 'buy' && !invest.brokerId) return setSetup({ step: 'broker', pending: draft });
    setTradeDraft(draft);
  };

  /** The recommendation page, behind the style questions the pick is made from. */
  const openMonthlyBuy = () => {
    if (!invest.style) return setSetup({ step: 'style', pending: null, forPick: true });
    setShowMonthlyBuy(true);
  };

  const openTradeById = (tradeId: string) => {
    const trade = trades.find((t) => t.id === tradeId);
    if (trade) setTradeDraft({ mode: 'edit', trade });
  };
  useBackHandler(true, () => {
    if (showStatements) setShowStatements(false);
    else if (showCreateGoal) setShowCreateGoal(false);
    else if (showAutoDeposits) setShowAutoDeposits(false);
    else if (showAlerts) setShowAlerts(false);
    else if (showProfile) setShowProfile(false);
    else if (selectedGoalId) setSelectedGoalId(null);
    else if (activeTab !== Tab.HOME) setActiveTab(Tab.HOME);
    else if (mode !== 'save') setMode('save');
    else exitApp();
  });

  // Tapping a system notification lands on the screen it was about.
  useEffect(
    () =>
      onNotificationOpen((target) => {
        // Everything open on top is closed, or the screen the notification
        // points at would change behind a sheet that is still covering it.
        setSelectedGoalId(null);
        setShowProfile(false);
        setShowAlerts(false);
        setShowStatements(false);
        setShowMonthlyBuy(false);
        setShowCreateGoal(false);
        setShowAutoDeposits(false);
        setShowQuickPick(false);
        setQuickAction(null);
        setTradeDraft(null);
        setSetup(null);
        setMode(target === 'dividends' ? 'invest' : 'save');
        setActiveTab(target === 'report' ? Tab.STATS : target === 'dividends' ? Tab.DIVIDENDS : Tab.HOME);
      }),
    []
  );

  const unread = alerts.filter((a) => !a.read).length;

  const totalBalance = useMemo(
    () => banks.reduce((sum, bank) => sum + bank.currentAmount, 0),
    [banks]
  );
  // "Today" moves at midnight even if nothing else changes; resuming the app
  // the next morning used to keep showing yesterday's figure.
  const [dayStamp, setDayStamp] = useState(() => new Date().toDateString());
  useEffect(() => {
    const check = () => setDayStamp(new Date().toDateString());
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, []);
  const savingsToday = useMemo(() => {
    const today = new Date().toLocaleDateString();
    // What actually reached the goals today. A deposit's headline amount can be
    // larger, since the part that cleared debt never lands in a goal, and
    // spending takes money back out again. Money moved into or back from shares
    // is neither saving nor spending, so a buy does not turn today negative —
    // and nor is a deleted goal's money moving into another goal.
    // Summed in cents: RM50.30 in and RM20.10 + RM30.20 out came to a hair
    // below zero in floats.
    return fromCents(
      activities
        .filter((a) => !['invest', 'divest', 'transfer', 'toInvest', 'fromInvest'].includes(a.type))
        .filter((a) => new Date(a.date).toLocaleDateString() === today)
        .flatMap((a) => a.distributions)
        .reduce((sum, d) => sum + toCents(d.amount), 0)
    );
  }, [activities, dayStamp]);

  /**
   * Every write goes through here.
   *
   * They used to be fired with `void` and no catch, so a refused batch — an
   * offline write, a goal deleted on another device, a deposit with nowhere to
   * go — vanished into an unhandled rejection while the sheet had already
   * closed and the user believed the money had moved. This does not retry;
   * it only makes a failure impossible to miss.
   */
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (e: unknown) => {
    const text = e instanceof Error ? e.message : String(e);
    setFailure(text);
    setTimeout(() => setFailure((current) => (current === text ? null : current)), 6000);
  };
  const run = (job: () => Promise<unknown>) => {
    void job().catch(fail);
  };

  const handleDeposit = (amount: number, targetBankId: string | null) => {
    if (uid) run(() => api.deposit(uid, amount, banks, loans, targetBankId, { alerts: prefs, savings }));
  };

  const handleWithdraw = (amount: number, sourceBankId: string, note: string, category: string) => {
    if (uid) run(() => api.withdraw(uid, amount, sourceBankId, note, category));
  };

  const handleBorrow = (amount: number, note: string) => {
    if (uid) run(() => api.borrow(uid, amount, note));
  };

  const handleCreateSchedule = async (schedule: Omit<Schedule, 'id' | 'createdAt' | 'lastRunAt'>) => {
    if (!uid) return;
    try {
      await api.createSchedule(uid, schedule);
    } catch (e) {
      // The sheet closes on success, so it cannot report this itself.
      fail(e);
      throw e;
    }
  };

  const handleCreateGoal = async (newGoal: Partial<PiggyBank>) => {
    // Not awaited: addDoc settles only when the server confirms, so offline the
    // sheet spun forever over a goal the phone had already saved. A refusal
    // still surfaces through run.
    if (uid) run(() => api.createBank(uid, newGoal));
    setShowCreateGoal(false);
    // A goal can be started from the investing side (a sale with nowhere to go);
    // the goals page belongs to saving, so its tab bar has to come with it.
    setMode('save');
    setActiveTab(Tab.BANKS);
  };

  const handleSaveSavings = (patch: Partial<SavingsSettings>) => {
    if (uid) run(() => api.saveSavings(uid, patch));
  };

  /** A goal being archived that auto deposits still save into: they are asked about first. */
  const [archiving, setArchiving] = useState<string | null>(null);
  const handleArchiveBank = (id: string) => {
    if (!uid) return;
    if (schedules.some((s) => s.targetBankId === id)) setArchiving(id);
    else run(() => api.archiveBank(uid, banks, id));
  };

  const handleSavePrefs = (patch: Partial<NotificationPrefs>) => {
    if (uid) run(() => api.savePrefs(uid, patch));
  };

  const handleMarkRead = (ids: string[]) => {
    if (uid) run(() => api.markAlertsRead(uid, ids));
  };

  const handleSaveStrategy = (updated: PiggyBank[]) => {
    if (uid) run(() => api.saveStrategy(uid, updated));
  };

  const handleDeleteBank = (id: string, choice: GoalMoneyChoice | null, scheduleTarget?: string | null) => {
    const retarget =
      scheduleTarget === undefined
        ? null
        : { scheduleIds: schedules.filter((s) => s.targetBankId === id).map((s) => s.id), target: scheduleTarget };
    if (uid) run(() => api.deleteBank(uid, banks, id, choice, savings, retarget));
  };

  /**
   * A spent ahead waiting for the rest of the kept ledger before it is deleted,
   * because a deposit that covered it is older than what is loaded.
   */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; takeBack?: GoneShareChoice } | null>(null);

  const deleteNow = (activity: Activity, takeBack?: GoneShareChoice) => {
    if (!uid) return;
    // Deleting spending that was already covered puts that money back into
    // the goals, so the strategy travels with it — and so do the deposits
    // that covered it, which are the entries that get corrected.
    const covering = activity.loanId ? coveringRows(activity.loanId, undefined, activities).rows : [];
    run(() => api.deleteActivity(uid, activity, banks, savings, covering, takeBack));
  };

  const handleDeleteActivity = (id: string, takeBack?: GoneShareChoice) => {
    const activity = activities.find((a) => a.id === id);
    if (!uid || !activity) return;
    if (activity.loanId && ledger.status(ledger.keptFrom) !== 'ready') {
      // Only the last three months are loaded. When those rows do not account
      // for everything already covered, the rest is read first — once a
      // session — rather than leaving the goals short by what was missed.
      const { complete } = coveringRows(activity.loanId, loans.find((l) => l.id === activity.loanId), activities);
      if (!complete) {
        ledger.need(ledger.keptFrom);
        ledger.retry();
        setPendingDelete({ id, takeBack });
        return;
      }
    }
    deleteNow(activity, takeBack);
  };

  useEffect(() => {
    if (!pendingDelete) return;
    const status = ledger.status(ledger.keptFrom);
    if (status === 'loading') return;
    setPendingDelete(null);
    if (status === 'failed') return fail(new Error(t.errors.coveringUnavailable));
    const activity = activities.find((a) => a.id === pendingDelete.id);
    if (activity) deleteNow(activity, pendingDelete.takeBack);
    else fail(new Error(t.errors.recordGone));
  }, [pendingDelete, ledger, activities]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditActivity = (id: string, newAmount: number) => {
    const activity = activities.find((a) => a.id === id);
    if (uid && activity) run(() => api.editActivity(uid, activity, newAmount));
  };

  const renderContent = () => {
    if (dataLoading) return <Splash label={t.app.splash.syncing} />;

    if (error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-10 text-center">
          <span className="material-symbols-rounded text-red-400 text-4xl">cloud_off</span>
          <p className="text-white font-bold">{t.app.couldNotReach}</p>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">{error}</p>
          <button
            onClick={retry}
            className="mt-4 px-8 h-12 rounded-2xl bg-primary text-black font-black active:scale-95 transition-transform"
          >
            {t.app.tryAgain}
          </button>
        </div>
      );
    }

    if (showCreateGoal) {
      return <CreateGoal uid={uid!} onCancel={() => setShowCreateGoal(false)} onCreate={handleCreateGoal} />;
    }

    const selectedGoal = banks.find((b) => b.id === selectedGoalId);
    if (selectedGoal) {
      return (
        <GoalDetail
          uid={uid!}
          bank={selectedGoal}
          banks={banks}
          activities={activities}
          ledger={ledger}
          onChangePhoto={(imageUrl) => api.updateBank(uid!, selectedGoal.id, { imageUrl })}
          onBack={() => setSelectedGoalId(null)}
          onArchive={() => {
            handleArchiveBank(selectedGoal.id);
            setSelectedGoalId(null);
          }}
          onUnarchive={() => uid && run(() => api.unarchiveBank(uid, selectedGoal.id))}
          onEditStrategy={() => {
            setSelectedGoalId(null);
            setActiveTab(Tab.BANKS);
          }}
          onOpenTrade={openTradeById}
        />
      );
    }

    if (showAlerts) {
      return (
        <Alerts
          alerts={alerts}
          prefs={prefs}
          onBack={() => setShowAlerts(false)}
          onMarkRead={handleMarkRead}
          onSavePrefs={handleSavePrefs}
          onOpenStrategy={() => {
            setShowAlerts(false);
            setActiveTab(Tab.BANKS);
          }}
        />
      );
    }

    if (showMonthlyBuy && uid) {
      return (
        <MonthlyBuy
          uid={uid}
          trades={trades}
          invest={invest}
          quotes={quotes}
          onBack={() => setShowMonthlyBuy(false)}
          onRecordBuy={(d) => openTrade({ mode: 'new', kind: 'buy', ...d })}
          onEditStyle={() => setSetup({ step: 'style', pending: null, editing: true })}
        />
      );
    }

    if (showStatements) {
      return (
        <Statements
          activities={activities}
          ledger={ledger}
          banks={banks}
          trades={trades}
          quotes={quotes}
          savings={savings}
          owner={user?.displayName || user?.email || 'SavvyPiggy'}
          onSaveSettings={(patch) => handleSaveSavings(patch)}
          onBack={() => setShowStatements(false)}
        />
      );
    }

    if (showProfile) {
      return (
        <Profile
          banks={banks}
          activities={activities}
          streak={streak.run}
          schedules={schedules}
          savings={savings}
          unreadAlerts={unread}
          onBack={() => setShowProfile(false)}
          onToggleOverflow={(overflow) => handleSaveSavings({ overflow })}
          onUnarchive={(id) => uid && run(() => api.unarchiveBank(uid, id))}
          onOpenAutoDeposits={() => {
            // Profile is rendered above AutoDeposits, so leaving it open kept
            // the rules screen behind it and the row looked dead.
            setShowProfile(false);
            setShowAutoDeposits(true);
          }}
          onOpenStrategy={() => {
            setShowProfile(false);
            setActiveTab(Tab.BANKS);
          }}
          onOpenAlerts={() => {
            setShowProfile(false);
            setShowAlerts(true);
          }}
          onOpenReport={() => {
            // The row reads "Statements & exports", so that is where it goes.
            setShowProfile(false);
            setShowStatements(true);
          }}
          onOpenHoldings={() => {
            setShowProfile(false);
            setMode('invest');
            setActiveTab(Tab.HOME);
          }}
          holdingCount={holdings.length}
        />
      );
    }

    if (showAutoDeposits) {
      return (
        <AutoDeposits
          schedules={schedules}
          banks={banks}
          onCancel={() => setShowAutoDeposits(false)}
          onCreate={handleCreateSchedule}
          onUpdate={(id, patch) => uid && run(() => api.updateSchedule(uid, id, patch))}
          onToggle={(id, enabled) => uid && run(() => api.updateSchedule(uid, id, { enabled }))}
          onDelete={(id) => uid && run(() => api.deleteSchedule(uid, id))}
        />
      );
    }

    switch (activeTab) {
      case Tab.HOME:
        return (
          <Dashboard
            totalBalance={totalBalance}
            savingsToday={savingsToday}
            banks={activeBanks}
            activities={activities}
            loans={loans}
            onDeposit={handleDeposit}
            onWithdraw={handleWithdraw}
            onBorrow={handleBorrow}
            onViewAll={() => setActiveTab(Tab.BANKS)}
            onSelectGoal={setSelectedGoalId}
            onOpenProfile={() => setShowProfile(true)}
            onOpenAlerts={() => setShowAlerts(true)}
            mode={mode}
            onModeChange={setMode}
            onTrade={(holding, kind) => openTrade({ mode: 'new', kind, symbol: holding.symbol, name: holding.name })}
            investSettings={invest}
            onPotMove={setPotSheet}
            onOpenMonthlyBuy={openMonthlyBuy}
            onOpenTrade={openTradeById}
            onOpenTrades={() => setActiveTab(Tab.TRADES)}
            holdings={holdings}
            trades={trades}
            quotes={quotes}
            savings={savings}
            unreadAlerts={unread}
            quickAction={quickAction}
            onQuickActionHandled={() => setQuickAction(null)}
          />
        );
      case Tab.STATS:
        return (
          <Report
            banks={banks}
            activities={activities}
            ledger={ledger}
            streak={streak.run}
            onOpenStrategy={() => setActiveTab(Tab.BANKS)}
            onOpenProfile={() => setShowProfile(true)}
            onOpenStatements={() => setShowStatements(true)}
          />
        );
      case Tab.BANKS:
        return (
          <StrategyEditor
            banks={activeBanks}
            onUpdateBanks={handleSaveStrategy}
            onDeleteBank={handleDeleteBank}
            onArchiveBank={handleArchiveBank}
            onAddGoal={() => setShowCreateGoal(true)}
            scheduleCount={schedules.filter((s) => s.enabled).length}
            schedules={schedules}
            onOpenAutoDeposits={() => setShowAutoDeposits(true)}
          />
        );
      case Tab.LOG:
        return (
          <ActivityLog
            activities={activities}
            ledger={ledger}
            banks={banks}
            onDeleteActivity={handleDeleteActivity}
            onEditActivity={handleEditActivity}
            onSetCategory={(id, category) => uid && run(() => api.setActivityCategory(uid, id, category))}
            onOpenTrade={openTradeById}
          />
        );
      case Tab.TRADES:
        return (
          <Trades
            uid={uid!}
            trades={trades}
            activities={activities}
            keptFrom={ledger.keptFrom}
            banks={banks}
            loans={loans}
            savings={savings}
            invest={invest}
            credited={creditedDividends}
            dividends={dividends}
            alertIds={alertIds}
            onEditBroker={() => setSetup({ step: 'broker', pending: null, editing: true })}
            onCreateGoal={() => setShowCreateGoal(true)}
            onBack={() => setActiveTab(Tab.HOME)}
          />
        );
      case Tab.DIVIDENDS:
        return (
          <Dividends
            dividends={dividends}
            credited={creditedDividends}
            trades={trades}
            busy={dividendsBusy}
            known={dividendsKnown}
            onRefresh={() => void refreshDividends(true)}
            onBack={() => setActiveTab(Tab.HOME)}
          />
        );
      case Tab.GROWTH:
        return (
          <Growth
            trades={trades}
            quotes={quotes}
            snapshots={snapshots}
            onBack={() => setActiveTab(Tab.HOME)}
          />
        );
      default:
        return <div className="flex items-center justify-center h-full text-white/50">{t.app.comingSoon}</div>;
    }
  };

  const shell = (children: React.ReactNode, withNav = false) => (
    <div className="h-screen w-full flex flex-col bg-bg-dark overflow-hidden">
      {/*
        One column, centred, capped.

        Every screen was laid out for a phone and then allowed to run the full
        width of whatever it was opened on. The floating nav was already capped
        at a phone width, so on a tablet a narrow island of navigation sat under
        content sprawling twice as wide, and the mode rail — two cards that are
        meant to be swiped between — had room to show both at once, which killed
        the swipe and the whole idea of looking at one half at a time.

        The column has to be as tall as the screen, not just as wide as a
        phone. Without h-full every screen that centres itself or scrolls inside
        its own height — the splash, sign-in, History, Trades — measured against
        a column that was only as tall as its content, so the splash's piggy
        sat at the top instead of the middle.
      */}
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <div className="mx-auto w-full max-w-md h-full">{children}</div>
      </main>

      {/* Showing yesterday's numbers is fine; showing them as if they were
          today's is not. */}
      {offline && !failure && (
        <div className="fixed inset-x-0 top-0 z-[55] px-4 pt-3 safe-pt pointer-events-none">
          <div className="max-w-md mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/35 backdrop-blur px-4 py-2.5 flex items-center gap-2.5">
            <span className="material-symbols-rounded text-amber-300 text-lg shrink-0">cloud_off</span>
            <p className="text-amber-200 text-[11px] font-black">
              {t.app.offline}
            </p>
          </div>
        </div>
      )}

      {/* A write that did not happen has to say so. It sits above everything,
          including the sheet that has already congratulated the user. */}
      {failure && (
        <div className="fixed inset-x-0 top-0 z-[60] px-4 pt-3 safe-pt pointer-events-none">
          <div
            role="alert"
            className="max-w-md mx-auto rounded-2xl bg-red-500/15 border border-red-500/40 backdrop-blur px-4 py-3 flex items-start gap-3"
          >
            <span className="material-symbols-rounded text-red-400 text-xl shrink-0">error</span>
            <div className="min-w-0">
              <p className="text-red-300 text-xs font-black">{t.app.didNotSave}</p>
              <p className="text-red-200/80 text-[11px] font-bold mt-0.5 leading-relaxed">{failure}</p>
            </div>
          </div>
        </div>
      )}
      {withNav && (
        <Navigation
          mode={mode}
          activeTab={activeTab}
          onTabChange={(tab) => {
            // Leaving for another tab should close whatever detail is open.
            setSelectedGoalId(null);
            setShowProfile(false);
            setShowAlerts(false);
            setActiveTab(tab);
          }}
          onQuickAction={() => setShowQuickPick(true)}
        />
      )}

      {tradeDraft && uid && tradeRow.status !== 'ready' && (
        <OlderRecordsSheet status={tradeRow.status} onRetry={tradeRow.retry} onClose={() => setTradeDraft(null)} />
      )}
      {tradeDraft && uid && tradeRow.status === 'ready' && (
        <TradeSheet
          uid={uid}
          trades={trades}
          activities={tradeRow.activities}
          banks={banks}
          loans={loans}
          savings={savings}
          invest={invest}
          credited={creditedDividends}
          dividends={dividends}
          alertIds={alertIds}
          draft={tradeDraft}
          onClose={() => setTradeDraft(null)}
          onDone={() => undefined}
          onEditBroker={() => setSetup({ step: 'broker', pending: null, editing: true })}
          onSyncError={fail}
          onCreateGoal={() => {
            setTradeDraft(null);
            setShowCreateGoal(true);
          }}
        />
      )}

      {/* After the Buy sheet in the tree, so the broker picker it opens lands on top of it. */}
      {setup?.step === 'style' && uid && (
        <StyleQuiz
          initial={invest.style}
          records={quizRecords}
          required={!!setup.forPick}
          startOnMix={!!setup.editing && !!invest.style}
          onDone={(style) => {
            void api.saveInvest(uid, { style }).catch(fail);
            const forPick = setup.forPick;
            setSetup(null);
            if (forPick) setShowMonthlyBuy(true);
          }}
          onClose={() => setSetup(null)}
        />
      )}
      {potSheet && uid && (
        <PotTransferSheet
          direction={potSheet}
          banks={banks}
          potBalance={invest.potBalance ?? 0}
          savings={savings}
          onConfirm={(target, cents) => {
            const direction = potSheet;
            setPotSheet(null);
            run(async () => {
              if (direction === 'in' && target) await api.transferToPot(uid, banks, target, cents);
              else if (direction === 'out') await api.transferFromPot(uid, banks, invest.potBalance ?? 0, target, cents, savings);
            });
          }}
          onClose={() => setPotSheet(null)}
        />
      )}
      {archiving && uid && banks.some((b) => b.id === archiving) && (
        <ArchiveSchedulesSheet
          bank={banks.find((b) => b.id === archiving)!}
          banks={banks}
          aimed={schedules.filter((s) => s.targetBankId === archiving).length}
          onConfirm={(target) => {
            const id = archiving;
            const scheduleIds = schedules.filter((s) => s.targetBankId === id).map((s) => s.id);
            setArchiving(null);
            run(() => api.archiveBank(uid, banks, id, { scheduleIds, target }));
          }}
          onClose={() => setArchiving(null)}
        />
      )}
      {setup?.step === 'broker' && uid && (
        <BrokerPicker
          brokerId={invest.brokerId}
          customRule={invest.customRule}
          firstTime={!!setup.pending}
          onPick={(brokerId, customRule) => {
            void api.saveInvest(uid, { brokerId, customRule }).catch(fail);
            const pending = setup.pending;
            setSetup(null);
            if (pending) setTradeDraft(pending);
          }}
          onClose={() => setSetup(null)}
        />
      )}

      {showQuickPick && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 veil-in"
          onClick={() => setShowQuickPick(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb max-h-[90dvh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The same button, two jobs: which one follows the card on Home. */}
            <h3 className="text-white text-2xl font-black">
              {mode === 'save' ? t.app.quick.moveMoney : t.app.quick.recordTrade}
            </h3>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {(mode === 'save'
                ? ([
                    { key: 'deposit', label: t.app.quick.deposit, icon: 'south_west', tint: 'text-primary' },
                    { key: 'withdraw', label: t.app.quick.spend, icon: 'north_east', tint: 'text-slate-400' },
                  ] as const)
                : ([
                    { key: 'buy', label: t.app.quick.buy, icon: 'trending_up', tint: 'text-accent' },
                    { key: 'sell', label: t.app.quick.sell, icon: 'trending_down', tint: 'text-slate-400' },
                  ] as const)
              ).map((option) => (
                <button
                  key={option.key}
                  onClick={() => {
                    setShowQuickPick(false);
                    setSelectedGoalId(null);
                    setShowProfile(false);
                    setShowAlerts(false);
                    if (option.key === 'buy' || option.key === 'sell') {
                      openTrade({ mode: 'new', kind: option.key });
                      return;
                    }
                    setActiveTab(Tab.HOME);
                    setQuickAction(option.key);
                  }}
                  className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-[1.75rem] py-6 active:scale-95 transition-transform"
                >
                  <span className={`material-symbols-rounded text-3xl ${option.tint}`}>{option.icon}</span>
                  <span className="text-white font-black">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-slate-500 text-xs font-medium leading-relaxed mt-5">
              {mode === 'save'
                ? t.app.quick.saveHint
                : t.app.quick.tradeHint}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (!isFirebaseConfigured) return shell(<SetupNotice />);
  if (!languageChosen) return shell(<LanguagePicker />);
  if (authLoading) return shell(<Splash label={t.app.splash.startingUp} />);
  if (!user) return shell(<Login />);
  if (isMember === null) return shell(<Splash label={t.app.splash.checkingInvite} />);
  if (!isMember) return shell(<RedeemInvite user={user} />);

  return shell(
    renderContent(),
    !showCreateGoal && !showAutoDeposits && !showProfile && !showAlerts && !showStatements && !showMonthlyBuy && !dataLoading
  );
};

export default App;
