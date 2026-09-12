
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Tab, PiggyBank, Schedule, NotificationPrefs, SavingsSettings } from './types';
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
import type { Mode } from './components/Navigation';
import { useAuth } from './contexts/AuthContext';
import { usePiggyData } from './hooks/usePiggyData';
import { useMembership } from './hooks/useMembership';
import { useBackHandler } from './hooks/useBackHandler';
import { useDividends } from './hooks/useDividends';
import { useLedgerPruning } from './hooks/useLedgerPruning';
import { useSnapshots } from './hooks/useSnapshots';
import { useQuotes } from './hooks/useQuotes';
import { exitApp, listenForBack } from './services/back';
import { isFirebaseConfigured } from './lib/firebase';
import * as api from './services/firestore';
import { staleAlerts, streakAlert } from './services/alerts';
import { onNotificationOpen, syncNotifications } from './services/notifications';

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

  const { banks, activities, schedules, loans, alerts, prefs, savings, trades, holdings, loading: dataLoading, offline, error, retry } =
    usePiggyData(uid);

  // Prices and dividends both key off the counters in the log; a sold-out
  // position still matters, because its last dividend can pay weeks later.
  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))], [trades]);
  const { quotes } = useQuotes(symbols);
  const {
    dividends,
    busy: dividendsBusy,
    refresh: refreshDividends,
  } = useDividends({ uid, trades, banks, loans, prefs, savings, ready: !dataLoading });

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
    if (!uid || dataLoading || schedules.length === 0) return;

    const catchUp = async () => {
      if (catchingUp.current || document.visibilityState !== 'visible') return;
      catchingUp.current = true;
      try {
        await api.runDueSchedules(uid, schedules, banks, loans, { alerts: prefs, savings });
      } finally {
        catchingUp.current = false;
      }
    };

    void catchUp();
    document.addEventListener('visibilitychange', catchUp);
    return () => document.removeEventListener('visibilitychange', catchUp);
  }, [uid, dataLoading, schedules, banks, loans, prefs, savings]);

  // A streak milestone is judged on the live ledger rather than at deposit
  // time, so a catch-up run that lands on day 30 earns its card too.
  useEffect(() => {
    if (!uid || dataLoading || !prefs.milestones) return;
    const draft = streakAlert(activities, alerts, new Date());
    if (draft) run(() => api.addAlert(uid, draft));
  }, [uid, dataLoading, activities, alerts, prefs.milestones]);

  // Alerts are disposable: anything older than the retention window goes,
  // once per session, without asking.
  const swept = useRef(false);
  useEffect(() => {
    if (!uid || dataLoading || swept.current) return;
    swept.current = true;
    const stale = staleAlerts(alerts, new Date());
    if (stale.length > 0) run(() => api.pruneAlerts(uid, stale.map((a) => a.id)));
  }, [uid, dataLoading, alerts]);

  // The phone's alarms are rebuilt from the settings whenever they change, and
  // again whenever the app comes back into view: a phone that aggressively
  // sleeps apps — or a reinstall — can quietly drop what was already set.
  useEffect(() => {
    if (!uid || dataLoading) return;

    const sync = () => {
      if (document.visibilityState === 'visible') void syncNotifications(prefs, schedules, dividends, trades).catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [uid, dataLoading, prefs, schedules, dividends, trades]);

  // Android's back gesture: close whatever is open, step back to Home, and
  // only then leave the app. Sheets inside a screen take it first — they push
  // their own handler on top of this one.
  useEffect(listenForBack, []);
  useBackHandler(showQuickPick, () => setShowQuickPick(false));
  useBackHandler(tradeDraft !== null, () => setTradeDraft(null));
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
        setSelectedGoalId(null);
        setShowProfile(false);
        setShowAlerts(false);
        setMode('save');
        setActiveTab(target === 'report' ? Tab.STATS : Tab.HOME);
      }),
    []
  );

  const unread = alerts.filter((a) => !a.read).length;

  const totalBalance = useMemo(
    () => banks.reduce((sum, bank) => sum + bank.currentAmount, 0),
    [banks]
  );
  const savingsToday = useMemo(() => {
    const today = new Date().toLocaleDateString();
    // What actually reached the goals today. A deposit's headline amount can be
    // larger, since the part that cleared debt never lands in a goal, and
    // spending takes money back out again.
    return activities
      .filter((a) => new Date(a.date).toLocaleDateString() === today)
      .flatMap((a) => a.distributions)
      .reduce((sum, d) => sum + d.amount, 0);
  }, [activities]);

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
  const run = (job: () => Promise<unknown>) => {
    void job().catch((e: unknown) => {
      const text = e instanceof Error ? e.message : String(e);
      setFailure(text);
      setTimeout(() => setFailure((current) => (current === text ? null : current)), 6000);
    });
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
    if (uid) await api.createSchedule(uid, schedule);
  };

  const handleCreateGoal = async (newGoal: Partial<PiggyBank>) => {
    if (uid) await api.createBank(uid, newGoal);
    setShowCreateGoal(false);
    setActiveTab(Tab.BANKS);
  };

  const handleSaveSavings = (patch: Partial<SavingsSettings>) => {
    if (uid) run(() => api.saveSavings(uid, patch));
  };

  const handleArchiveBank = (id: string) => {
    if (uid) run(() => api.archiveBank(uid, banks, id));
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

  const handleDeleteBank = (id: string) => {
    if (uid) run(() => api.deleteBank(uid, id));
  };

  const handleDeleteActivity = (id: string) => {
    const activity = activities.find((a) => a.id === id);
    // Deleting spending that was already covered puts that money back into
    // the goals, so the strategy travels with it — and so do the deposits
    // that covered it, which are the entries that get corrected.
    const covering = activity?.loanId
      ? activities.filter((a) => a.repayments?.some((r) => r.loanId === activity.loanId))
      : [];
    if (uid && activity) run(() => api.deleteActivity(uid, activity, banks, savings, covering));
  };

  const handleEditActivity = (id: string, newAmount: number) => {
    const activity = activities.find((a) => a.id === id);
    if (uid && activity) run(() => api.editActivity(uid, activity, newAmount));
  };

  const renderContent = () => {
    if (dataLoading) return <Splash label="Syncing your savings" />;

    if (error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-10 text-center">
          <span className="material-symbols-rounded text-red-400 text-4xl">cloud_off</span>
          <p className="text-white font-bold">Could not reach Firestore</p>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">{error}</p>
          <button
            onClick={retry}
            className="mt-4 px-8 h-12 rounded-2xl bg-primary text-black font-black active:scale-95 transition-transform"
          >
            Try again
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

    if (showStatements) {
      return (
        <Statements
          activities={activities}
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
            setShowProfile(false);
            setActiveTab(Tab.STATS);
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
          banks={activeBanks}
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
            onTrade={(holding, kind) =>
              setTradeDraft({ mode: 'new', kind, symbol: holding.symbol, name: holding.name })
            }
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
            onAddGoal={() => setShowCreateGoal(true)}
            scheduleCount={schedules.filter((s) => s.enabled).length}
            onOpenAutoDeposits={() => setShowAutoDeposits(true)}
          />
        );
      case Tab.LOG:
        return (
          <ActivityLog
            activities={activities}
            banks={banks}
            onDeleteActivity={handleDeleteActivity}
            onEditActivity={handleEditActivity}
            onSetCategory={(id, category) => uid && run(() => api.setActivityCategory(uid, id, category))}
          />
        );
      case Tab.TRADES:
        return <Trades uid={uid!} trades={trades} onBack={() => setActiveTab(Tab.HOME)} />;
      case Tab.DIVIDENDS:
        return (
          <Dividends
            dividends={dividends}
            trades={trades}
            busy={dividendsBusy}
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
        return <div className="flex items-center justify-center h-full text-white/50">Feature coming soon</div>;
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
      */}
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>

      {/* Showing yesterday's numbers is fine; showing them as if they were
          today's is not. */}
      {offline && !failure && (
        <div className="fixed inset-x-0 top-0 z-[55] px-4 pt-3 safe-pt pointer-events-none">
          <div className="max-w-md mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/35 backdrop-blur px-4 py-2.5 flex items-center gap-2.5">
            <span className="material-symbols-rounded text-amber-300 text-lg shrink-0">cloud_off</span>
            <p className="text-amber-200 text-[11px] font-black">
              Offline — showing what was last synced to this phone
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
              <p className="text-red-300 text-xs font-black">That did not save</p>
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

      {tradeDraft && uid && (
        <TradeSheet
          uid={uid}
          trades={trades}
          draft={tradeDraft}
          onClose={() => setTradeDraft(null)}
          onDone={() => undefined}
        />
      )}

      {showQuickPick && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 veil-in"
          onClick={() => setShowQuickPick(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The same button, two jobs: which one follows the card on Home. */}
            <h3 className="text-white text-2xl font-black">
              {mode === 'save' ? 'Move money' : 'Record a trade'}
            </h3>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {(mode === 'save'
                ? ([
                    { key: 'deposit', label: 'Deposit', icon: 'south_west', tint: 'text-primary' },
                    { key: 'withdraw', label: 'Spend', icon: 'north_east', tint: 'text-slate-400' },
                  ] as const)
                : ([
                    { key: 'buy', label: 'Buy', icon: 'trending_up', tint: 'text-accent' },
                    { key: 'sell', label: 'Sell', icon: 'trending_down', tint: 'text-slate-400' },
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
                      setTradeDraft({ mode: 'new', kind: option.key });
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
                ? 'Spending without picking a goal is recorded as spent ahead — your next deposits cover it before anything reaches your goals.'
                : 'Every trade keeps the day it was done. That date is what decides which dividends are yours, so enter the day you dealt, not the day you typed it in.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (!isFirebaseConfigured) return shell(<SetupNotice />);
  if (authLoading) return shell(<Splash label="Starting up" />);
  if (!user) return shell(<Login />);
  if (isMember === null) return shell(<Splash label="Checking your invite" />);
  if (!isMember) return shell(<RedeemInvite user={user} />);

  return shell(
    renderContent(),
    !showCreateGoal && !showAutoDeposits && !showProfile && !showAlerts && !showStatements && !dataLoading
  );
};

export default App;
