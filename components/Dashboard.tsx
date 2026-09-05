
import React, { useEffect, useState } from 'react';
import { PiggyBank, Activity, ActivityType, Loan } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { balanceCents, planDeposit, totalDebtCents } from '../services/ledger';
import { fromCents, toCents } from '../services/money';
import { sortBanks } from '../services/sorting';
import { useSortOrder } from '../hooks/useSortOrder';
import SortMenu from './SortMenu';
import Avatar from './Avatar';
import { useBackHandler } from '../hooks/useBackHandler';

type Mode = 'deposit' | 'withdraw';

const ACTIVITY_STYLES: Record<ActivityType, { label: string; icon: string; tint: string; outgoing: boolean }> = {
  'auto-save': { label: 'Scheduled Deposit', icon: 'magic_button', tint: 'bg-primary/10 text-primary', outgoing: false },
  manual: { label: 'Deposit', icon: 'person', tint: 'bg-blue-400/10 text-blue-400', outgoing: false },
  withdraw: { label: 'Withdrawal', icon: 'north_east', tint: 'bg-slate-500/10 text-slate-400', outgoing: true },
  borrow: { label: 'Borrowed', icon: 'account_balance', tint: 'bg-amber-500/10 text-amber-400', outgoing: true },
};

interface DashboardProps {
  totalBalance: number;
  savingsToday: number;
  banks: PiggyBank[];
  activities: Activity[];
  loans: Loan[];
  onDeposit: (amount: number, targetBankId: string | null) => void;
  onWithdraw: (amount: number, sourceBankId: string, note: string) => void;
  onBorrow: (amount: number, note: string) => void;
  onViewAll: () => void;
  onSelectGoal: (id: string) => void;
  onOpenProfile: () => void;
  onOpenAlerts: () => void;
  unreadAlerts: number;
  /** Set from the nav's round button; cleared once the sheet is open. */
  quickAction: 'deposit' | 'withdraw' | null;
  onQuickActionHandled: () => void;
}

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

const Dashboard: React.FC<DashboardProps> = ({
  totalBalance,
  savingsToday,
  banks,
  activities,
  loans,
  onDeposit,
  onWithdraw,
  onBorrow,
  onViewAll,
  onSelectGoal,
  onOpenProfile,
  onOpenAlerts,
  unreadAlerts,
  quickAction,
  onQuickActionHandled,
}) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  // In deposit mode null means "split by strategy"; in withdraw mode it means
  // "borrowed from outside", which touches no goal at all.
  const [target, setTarget] = useState<string | null>(null);
  const [order, setOrder] = useSortOrder('savvypiggy.sort.home');
  const sortedBanks = sortBanks(banks, order);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Savvy Saver';
  // Goals switched out of auto-split take no share and do not count here.
  const allocated = banks.reduce((sum, b) => (b.autoSplit === false ? sum : sum + b.splitPercentage), 0);

  const openLoans = loans.filter((l) => l.outstanding > 0);
  const debtCents = totalDebtCents(openLoans);

  const cents = toCents(parseFloat(amount) || 0);
  const isBorrow = mode === 'withdraw' && target === null;
  const preview = mode === 'deposit' ? planDeposit(cents, banks, openLoans, target) : null;

  const blockedReason = () => {
    if (cents <= 0) return null;
    if (mode === 'deposit' && target === null && allocated === 0 && debtCents === 0)
      return 'No goal has a split yet — pick one above, or set percentages on Strategy.';
    return null;
  };

  const canSubmit = cents > 0 && blockedReason() === null;

  const closeModal = () => {
    setMode(null);
    setAmount('');
    setNote('');
    setTarget(null);
  };

  useBackHandler(mode !== null, closeModal);

  // The nav button lives outside this screen, so it asks through a prop.
  useEffect(() => {
    if (!quickAction) return;
    open(quickAction);
    onQuickActionHandled();
  }, [quickAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = () => {
    if (!canSubmit || !mode) return;
    const value = fromCents(cents);
    if (mode === 'deposit') onDeposit(value, target);
    else if (isBorrow) onBorrow(value, note);
    else onWithdraw(value, target!, note);
    closeModal();
  };

  const open = (next: Mode) => {
    setMode(next);
    setTarget(null);
  };

  const confirmLabel = mode === 'deposit' ? 'Confirm Deposit' : isBorrow ? 'Record Borrowing' : 'Withdraw';

  return (
    <div className="flex flex-col min-h-full pb-40 safe-pt relative">
      {/* App Bar */}
      <div className="flex items-center px-6 py-4 justify-between">
        <div>
          <h4 className="text-slate-500 text-xs font-bold uppercase tracking-widest">{greeting()}</h4>
          <h2 className="text-white text-xl font-extrabold">{displayName}</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenAlerts}
            aria-label="Alerts"
            className="relative size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded">notifications</span>
            {unreadAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-primary ring-2 ring-bg-dark" />
            )}
          </button>
          <Avatar onClick={onOpenProfile} />
        </div>
      </div>

      {/* Hero Balance Card */}
      <div className="px-6 py-2">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-accent p-8 shadow-2xl shadow-primary/20">
          <div className="absolute -right-12 -top-12 size-48 bg-white/20 rounded-full blur-3xl"></div>
          <div className="absolute -left-12 -bottom-12 size-48 bg-black/10 rounded-full blur-3xl"></div>

          <div className="relative z-10">
            <p className="text-black/60 font-bold text-xs uppercase tracking-widest mb-1">Total Savings</p>
            <h1 className="text-black text-5xl font-extrabold tracking-tight mb-6">
              {money(totalBalance)}
            </h1>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-black/50 text-[10px] font-bold uppercase">Saved today</p>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-rounded text-black text-sm">
                    {savingsToday < 0 ? 'trending_down' : 'trending_up'}
                  </span>
                  <p className="text-black font-bold">{savingsToday < 0 ? '' : '+'}{money(savingsToday)}</p>
                </div>
              </div>
              <button
                onClick={() => open('deposit')}
                className="bg-black text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-lg active:scale-95 transition-transform"
              >
                Deposit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Borrowed card — what is owed, and how it is being cleared. */}
      {debtCents > 0 && (
        <div className="px-6 pt-3">
          <div className="rounded-[2rem] bg-amber-500/10 border border-amber-500/20 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-amber-400/70 text-xs font-bold uppercase tracking-widest mb-1">Borrowed</p>
                <h2 className="text-amber-300 text-4xl font-extrabold tracking-tight">
                  ${fromCents(debtCents).toFixed(2)}
                </h2>
              </div>
              <span className="material-symbols-rounded text-amber-400/30 text-5xl shrink-0">account_balance</span>
            </div>
            <p className="text-amber-200/60 text-xs font-medium leading-relaxed">
              Deposits clear this before anything reaches your goals.
            </p>
            <div className="space-y-2">
              {openLoans.map((loan) => (
                <div key={loan.id} className="flex items-center justify-between gap-3 bg-black/20 rounded-2xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{loan.note || 'Borrowed'}</p>
                    <p className="text-slate-500 text-[10px] font-medium">
                      borrowed ${loan.amount.toFixed(2)}
                    </p>
                  </div>
                  <p className="shrink-0 text-amber-300 text-lg font-black tabular-nums">
                    ${loan.outstanding.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* What the savings are really worth once the debt is settled. */}
            <div className="flex items-baseline justify-between gap-3 pt-4 border-t border-amber-500/20">
              <p className="text-amber-400/70 text-[10px] font-black uppercase tracking-widest">
                Net after debt
              </p>
              <p className="text-white text-2xl font-black tabular-nums">
                {money(totalBalance - fromCents(debtCents))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Horizontal Goals */}
      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 px-6 mb-4">
          <h3 className="text-white text-lg font-bold truncate">Your Piggy Banks</h3>
          <div className="flex items-center gap-2 shrink-0">
            {banks.length > 1 && <SortMenu order={order} onChange={setOrder} compact />}
            <button onClick={onViewAll} className="text-primary text-sm font-bold">View All</button>
          </div>
        </div>

        <div className="flex overflow-x-auto no-scrollbar gap-5 px-6 pb-4">
          {banks.length === 0 ? (
            <div className="min-w-full text-center py-10 opacity-30 italic">No piggy banks created yet.</div>
          ) : (
            sortedBanks.map((bank) => {
              const overspent = bank.currentAmount < 0;
              const progress =
                bank.targetAmount > 0
                  ? Math.min(100, Math.max(0, (bank.currentAmount / bank.targetAmount) * 100))
                  : 0;
              return (
                <button
                  key={bank.id}
                  onClick={() => onSelectGoal(bank.id)}
                  className="min-w-[260px] flex flex-col gap-4 rounded-3xl bg-surface p-4 border border-white/5 shadow-xl text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-full aspect-[4/3] rounded-2xl relative overflow-hidden bg-gradient-to-br from-primary/25 to-accent/10">
                    {/* Drawn locally so a goal always has artwork, even offline. */}
                    <div className="absolute inset-0 flex items-center justify-center text-primary/25">
                      <span className="material-symbols-rounded text-7xl">{bank.icon}</span>
                    </div>
                    {bank.imageUrl && (
                      <img
                        key={bank.imageUrl}
                        src={bank.imageUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover"
                        // Hide rather than detach: removing a node React owns
                        // breaks the next render. A new src gets a fresh element.
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-8 shrink-0 rounded-lg glass flex items-center justify-center text-primary">
                          <span className="material-symbols-rounded text-lg">{bank.icon}</span>
                        </div>
                        <span className="text-white font-bold text-sm truncate">{bank.name}</span>
                      </div>
                      <span className="shrink-0 bg-primary text-black text-[10px] font-black px-2 py-1 rounded-md uppercase">
                        {bank.splitPercentage}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end gap-2">
                      <p className={`text-xs font-bold truncate ${overspent ? 'text-red-400' : 'text-slate-400'}`}>
                        {money(bank.currentAmount)} {overspent ? 'overspent' : 'saved'}
                      </p>
                      {bank.targetAmount > 0 ? (
                        <p className="text-white text-sm font-black shrink-0">{Math.round(progress)}%</p>
                      ) : (
                        <p className="text-primary text-sm font-black shrink-0 leading-none">&infin;</p>
                      )}
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      {overspent ? (
                        <div className="h-full w-full rounded-full bg-red-500/30"></div>
                      ) : bank.targetAmount > 0 ? (
                        <div
                          className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(74,222,128,0.5)] transition-all duration-700"
                          style={{ width: `${progress}%` }}
                        ></div>
                      ) : (
                        <div className="h-full w-full rounded-full bg-gradient-to-r from-primary/40 to-accent/10"></div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Activity List */}
      <div className="mt-8 px-6">
        <h3 className="text-white text-lg font-bold mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-sm">No recent activity.</div>
          ) : (
            activities.slice(0, 4).map((activity) => {
              const style = ACTIVITY_STYLES[activity.type];
              return (
                <div key={activity.id} className="flex items-center justify-between gap-3 p-4 rounded-2xl glass transition-all active:bg-white/5">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`size-12 shrink-0 rounded-2xl flex items-center justify-center ${style.tint}`}>
                      <span className="material-symbols-rounded">{style.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{activity.note || style.label}</p>
                      <p className="text-slate-500 text-[10px] font-medium">
                        {new Date(activity.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <p className={`font-black shrink-0 ${style.outgoing ? 'text-slate-400' : 'text-white'}`}>
                    {style.outgoing ? '-' : '+'}${activity.amount.toFixed(2)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Money movement. The header stays put and only the middle scrolls, so
          the close button can never be pushed off the top of the screen. */}
      {mode && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md max-h-[88vh] flex flex-col bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-7 pt-7 pb-4 flex items-center justify-between gap-3">
              <h3 className="text-white text-2xl font-black">
                {mode === 'deposit' ? 'Deposit' : 'Spend'}
              </h3>
              <button
                onClick={closeModal}
                className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-7 space-y-5">
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-slate-600">$</span>
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-20 pl-14 pr-6 rounded-3xl bg-white/5 border border-white/10 text-4xl font-black text-white focus:outline-none focus:border-primary transition-all placeholder:text-slate-800"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map((val) => (
                  <button
                    key={val}
                    onClick={() => setAmount(val.toString())}
                    className="py-3 rounded-2xl glass border border-white/5 text-white font-bold text-sm active:scale-90 transition-transform"
                  >
                    ${val}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">
                  {mode === 'deposit' ? 'Goes to' : 'Comes from'}
                </label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  <button
                    onClick={() => setTarget(null)}
                    className={`shrink-0 px-4 h-11 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 ${
                      target === null ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    {mode === 'withdraw' && (
                      <span className="material-symbols-rounded text-base">account_balance</span>
                    )}
                    {mode === 'deposit' ? 'Auto split' : 'Borrow'}
                  </button>
                  {banks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setTarget(b.id)}
                      className={`shrink-0 px-4 h-11 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 ${
                        target === b.id ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      <span className="material-symbols-rounded text-base">{b.icon}</span>
                      {b.name}
                    </button>
                  ))}
                </div>
                {mode === 'withdraw' && (
                  <p className="text-slate-500 text-[10px] text-center pt-1 font-medium leading-relaxed">
                    {isBorrow
                      ? 'Money from outside. No goal is touched — it just records what you owe.'
                      : `${money(fromCents(balanceCents(banks, target)))} in this goal. Spending more takes it negative.`}
                  </p>
                )}
              </div>

              {mode === 'withdraw' && (
                <div className="space-y-2">
                  <label className="text-slate-500 text-xs font-black uppercase tracking-widest ml-1">What for</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={isBorrow ? 'e.g. Borrowed from mum' : 'e.g. Groceries'}
                    className="w-full h-14 px-5 rounded-2xl bg-white/5 border border-white/10 text-base font-bold text-white focus:outline-none focus:border-primary transition-all placeholder:text-slate-700"
                  />
                </div>
              )}

              {/* Exactly where the money lands, worked out before you commit. */}
              {mode === 'deposit' && cents > 0 && (
                <div className="rounded-2xl bg-white/5 border border-white/10 px-5 py-4 space-y-2">
                  {preview!.repaidCents > 0 && (
                    <p className="text-amber-300 text-xs font-bold">
                      ${fromCents(preview!.repaidCents).toFixed(2)} clears your borrowing first
                    </p>
                  )}
                  {preview!.splitMovements.map((m) => {
                    const bank = banks.find((b) => b.id === m.bankId);
                    return (
                      <div key={m.bankId} className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 text-xs font-medium truncate">{bank?.name}</span>
                        <span className="text-white text-xs font-black tabular-nums">
                          ${fromCents(m.cents).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                  {target === null && allocated > 0 && allocated < 100 && preview!.repaidCents < cents && (
                    <p className="text-slate-500 text-[10px] font-medium pt-1">
                      Only {allocated}% is allocated, so the rest stays unassigned.
                    </p>
                  )}
                </div>
              )}

              {blockedReason() && (
                <div className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-4">
                  <span className="material-symbols-rounded text-red-400 text-lg">error</span>
                  <p className="text-red-300 text-xs font-bold leading-relaxed">{blockedReason()}</p>
                </div>
              )}
            </div>

            <div className="shrink-0 px-7 pt-4 pb-8 safe-pb">
              <button
                onClick={handleConfirm}
                disabled={!canSubmit}
                className={`w-full h-16 rounded-[2rem] font-black text-lg shadow-2xl transition-all ${
                  canSubmit
                    ? 'bg-primary text-black shadow-primary/20 active:scale-95'
                    : 'bg-white/5 text-slate-700 cursor-not-allowed'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
