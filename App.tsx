
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
import { useAuth } from './contexts/AuthContext';
import { usePiggyData } from './hooks/usePiggyData';
import { useMembership } from './hooks/useMembership';
import { useBackHandler } from './hooks/useBackHandler';
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
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [quickAction, setQuickAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const { banks, activities, schedules, loans, alerts, prefs, savings, loading: dataLoading, error, retry } =
    usePiggyData(uid);

  // Archived goals keep their money and their history, so every screen that
  // looks backwards still gets the full list — only the working lists hide them.
  const activeBanks = useMemo(() => banks.filter((b) => !api.isArchived(b)), [banks]);

  // Deferred from sign-in, because the rules block users/{uid} until membership.
  useEffect(() => {
    if (user && isMember) void api.ensureUserProfile(user);
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
    if (draft) void api.addAlert(uid, draft);
  }, [uid, dataLoading, activities, alerts, prefs.milestones]);

  // Alerts are disposable: anything older than the retention window goes,
  // once per session, without asking.
  const swept = useRef(false);
  useEffect(() => {
    if (!uid || dataLoading || swept.current) return;
    swept.current = true;
    const stale = staleAlerts(alerts, new Date());
    if (stale.length > 0) void api.pruneAlerts(uid, stale.map((a) => a.id));
  }, [uid, dataLoading, alerts]);

  // The phone's alarms are rebuilt from the settings whenever they change, and
  // again whenever the app comes back into view: a phone that aggressively
  // sleeps apps — or a reinstall — can quietly drop what was already set.
  useEffect(() => {
    if (!uid || dataLoading) return;

    const sync = () => {
      if (document.visibilityState === 'visible') void syncNotifications(prefs, schedules).catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [uid, dataLoading, prefs, schedules]);

  // Android's back gesture: close whatever is open, step back to Home, and
  // only then leave the app. Sheets inside a screen take it first — they push
  // their own handler on top of this one.
  useEffect(listenForBack, []);
  useBackHandler(showQuickPick, () => setShowQuickPick(false));
  useBackHandler(true, () => {
    if (showCreateGoal) setShowCreateGoal(false);
    else if (showAutoDeposits) setShowAutoDeposits(false);
    else if (showAlerts) setShowAlerts(false);
    else if (showProfile) setShowProfile(false);
    else if (selectedGoalId) setSelectedGoalId(null);
    else if (activeTab !== Tab.HOME) setActiveTab(Tab.HOME);
    else exitApp();
  });

  // Tapping a system notification lands on the screen it was about.
  useEffect(
    () =>
      onNotificationOpen((target) => {
        setSelectedGoalId(null);
        setShowProfile(false);
        setShowAlerts(false);
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

  const handleDeposit = (amount: number, targetBankId: string | null) => {
    if (uid) void api.deposit(uid, amount, banks, loans, targetBankId, { alerts: prefs, savings });
  };

  const handleWithdraw = (amount: number, sourceBankId: string, note: string) => {
    if (uid) void api.withdraw(uid, amount, sourceBankId, note);
  };

  const handleBorrow = (amount: number, note: string) => {
    if (uid) void api.borrow(uid, amount, note);
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
    if (uid) void api.saveSavings(uid, patch);
  };

  const handleArchiveBank = (id: string) => {
    if (uid) void api.archiveBank(uid, banks, id);
  };

  const handleSavePrefs = (patch: Partial<NotificationPrefs>) => {
    if (uid) void api.savePrefs(uid, patch);
  };

  const handleMarkRead = (ids: string[]) => {
    if (uid) void api.markAlertsRead(uid, ids);
  };

  const handleSaveStrategy = (updated: PiggyBank[]) => {
    if (uid) void api.saveStrategy(uid, updated);
  };

  const handleDeleteBank = (id: string) => {
    if (uid) void api.deleteBank(uid, id);
  };

  const handleDeleteActivity = (id: string) => {
    const activity = activities.find((a) => a.id === id);
    if (uid && activity) void api.deleteActivity(uid, activity);
  };

  const handleEditActivity = (id: string, newAmount: number) => {
    const activity = activities.find((a) => a.id === id);
    if (uid && activity) void api.editActivity(uid, activity, newAmount);
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
          onUnarchive={() => uid && void api.unarchiveBank(uid, selectedGoal.id)}
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
          onUnarchive={(id) => uid && void api.unarchiveBank(uid, id)}
          onOpenAutoDeposits={() => setShowAutoDeposits(true)}
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
          onToggle={(id, enabled) => uid && void api.updateSchedule(uid, id, { enabled })}
          onDelete={(id) => uid && void api.deleteSchedule(uid, id)}
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
            unreadAlerts={unread}
            quickAction={quickAction}
            onQuickActionHandled={() => setQuickAction(null)}
          />
        );
      case Tab.STATS:
        return (
          <Report
            uid={uid!}
            banks={banks}
            activities={activities}
            onOpenStrategy={() => setActiveTab(Tab.BANKS)}
            onOpenProfile={() => setShowProfile(true)}
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
          />
        );
      default:
        return <div className="flex items-center justify-center h-full text-white/50">Feature coming soon</div>;
    }
  };

  const shell = (children: React.ReactNode, withNav = false) => (
    <div className="h-screen w-full flex flex-col bg-bg-dark overflow-hidden">
      <main className="flex-1 overflow-y-auto no-scrollbar relative">{children}</main>
      {withNav && (
        <Navigation
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

      {showQuickPick && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowQuickPick(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl animate-in slide-in-from-bottom duration-300 p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-2xl font-black">Move money</h3>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {(
                [
                  { mode: 'deposit', label: 'Deposit', icon: 'south_west', tint: 'text-primary' },
                  { mode: 'withdraw', label: 'Spend', icon: 'north_east', tint: 'text-slate-400' },
                ] as const
              ).map((option) => (
                <button
                  key={option.mode}
                  onClick={() => {
                    setShowQuickPick(false);
                    setSelectedGoalId(null);
                    setShowProfile(false);
                    setShowAlerts(false);
                    setActiveTab(Tab.HOME);
                    setQuickAction(option.mode);
                  }}
                  className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-[1.75rem] py-6 active:scale-95 transition-transform"
                >
                  <span className={`material-symbols-rounded text-3xl ${option.tint}`}>{option.icon}</span>
                  <span className="text-white font-black">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-slate-500 text-xs font-medium leading-relaxed mt-5">
              Spending without picking a goal records borrowed money instead — your next deposits clear it before
              anything reaches your goals.
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

  return shell(renderContent(), !showCreateGoal && !showAutoDeposits && !showProfile && !showAlerts && !dataLoading);
};

export default App;
