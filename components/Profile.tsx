import React, { useMemo, useState } from 'react';
import type { Activity, PiggyBank, SavingsSettings, Schedule } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isArchived, isFull, isInSplit, seedSampleBanks } from '../services/firestore';
import { currentStreak, summarize } from '../services/analytics';
import { describe, nextOccurrence } from '../services/schedules';
import { APP_VERSION } from '../services/version';
import { SLICE_COLORS } from './DonutChart';

interface ProfileProps {
  banks: PiggyBank[];
  activities: Activity[];
  schedules: Schedule[];
  savings: SavingsSettings;
  unreadAlerts: number;
  onBack: () => void;
  onToggleOverflow: (on: boolean) => void;
  onUnarchive: (id: string) => void;
  onOpenAutoDeposits: () => void;
  onOpenStrategy: () => void;
  onOpenAlerts: () => void;
  onOpenReport: () => void;
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const monthYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-surface border border-white/5 rounded-[2rem] shadow-xl ${className}`}>{children}</div>
);

const Section: React.FC<{ label: string; action?: React.ReactNode; children: React.ReactNode }> = ({ label, action, children }) => (
  <section>
    <div className="flex items-center justify-between gap-3 px-1 mb-3">
      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{label}</p>
      {action}
    </div>
    {children}
  </section>
);

const Switch: React.FC<{ on: boolean; onChange: (on: boolean) => void }> = ({ on, onChange }) => (
  <button
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-primary/20' : 'bg-white/10'}`}
  >
    <span className={`inline-block size-6 transform rounded-full transition-transform ${on ? 'translate-x-7 bg-primary' : 'translate-x-1 bg-slate-600'}`} />
  </button>
);

const Row: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
  dot?: boolean;
  trailing?: React.ReactNode;
}> = ({ icon, title, subtitle, onClick, dot, trailing }) => {
  const inner = (
    <>
      <div className="size-11 shrink-0 rounded-2xl bg-white/5 text-slate-300 flex items-center justify-center">
        <span className="material-symbols-rounded">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white font-bold text-sm">{title}</p>
        <p className="text-slate-500 text-xs font-medium mt-0.5">{subtitle}</p>
      </div>
      {dot && <span className="size-2.5 rounded-full bg-primary shrink-0" />}
      {trailing ?? (onClick && <span className="material-symbols-rounded text-slate-600 shrink-0">chevron_right</span>)}
    </>
  );

  return onClick ? (
    <button onClick={onClick} className="w-full p-5 flex items-center gap-4 text-left active:bg-white/[0.02] transition-colors">
      {inner}
    </button>
  ) : (
    <div className="w-full p-5 flex items-center gap-4">{inner}</div>
  );
};

const Profile: React.FC<ProfileProps> = ({
  banks,
  activities,
  schedules,
  savings,
  unreadAlerts,
  onBack,
  onToggleOverflow,
  onUnarchive,
  onOpenAutoDeposits,
  onOpenStrategy,
  onOpenAlerts,
  onOpenReport,
}) => {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const now = new Date();

  if (!user) return null;

  const label = user.displayName || user.email || 'Savvy Saver';
  const initial = label.charAt(0).toUpperCase();
  const joined = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;

  const active = banks.filter((b) => !isArchived(b));
  const archived = banks.filter(isArchived);
  const totalBalance = banks.reduce((sum, b) => sum + b.currentAmount, 0);
  const archivedTotal = archived.reduce((sum, b) => sum + b.currentAmount, 0);
  const withTarget = active.filter((b) => b.targetAmount > 0);
  const reached = active.filter(isFull);

  const summary = useMemo(() => summarize(activities, banks, 'month', now), [activities, banks]); // eslint-disable-line react-hooks/exhaustive-deps
  const streak = useMemo(() => currentStreak(activities, now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps

  const colorOf = (id: string) => SLICE_COLORS[Math.max(0, banks.findIndex((b) => b.id === id)) % SLICE_COLORS.length];
  const inSplit = active.filter(isInSplit);
  const allocated = inSplit.reduce((sum, b) => sum + b.splitPercentage, 0);

  const liveRules = schedules.filter((s) => s.enabled);
  const nextRun = liveRules
    .map((s) => nextOccurrence(s, now))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const handleSeed = async () => {
    setBusy(true);
    try {
      await seedSampleBanks(user.uid);
    } finally {
      setBusy(false);
    }
  };

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short' });

  const stats = [
    {
      label: 'Saved',
      value: whole(totalBalance),
      // The full sentence would be clipped in a third of a phone's width.
      hint:
        summary.change === null
          ? 'This month'
          : `${summary.change >= 0 ? '+' : ''}${summary.change}% vs ${lastMonth}`,
      tone: summary.change !== null && summary.change < 0 ? 'text-slate-500' : 'text-primary',
    },
    {
      label: 'Goals',
      value: String(active.length),
      hint: withTarget.length === 0 ? 'No targets' : `${reached.length}/${withTarget.length} reached`,
      tone: 'text-slate-500',
    },
    {
      label: 'Streak',
      value: `${streak}d`,
      hint: streak === 0 ? 'Start today' : 'In a row',
      tone: streak > 0 ? 'text-primary' : 'text-slate-500',
    },
  ];

  return (
    <div className="flex flex-col min-h-full pb-16 safe-pt">
      {/* Header */}
      <div className="px-6 pt-6 flex items-center gap-4">
        <button
          onClick={onBack}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded">arrow_back</span>
        </button>
        <div className="min-w-0">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Member profile</p>
          <h2 className="text-white text-3xl font-black tracking-tight">Settings</h2>
        </div>
      </div>

      <div className="px-6 mt-6 space-y-8">
        {/* Identity */}
        <Card className="p-6 bg-gradient-to-br from-surface to-primary/5">
          <div className="flex items-center gap-5">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-16 rounded-2xl object-cover border-2 border-primary/40" />
            ) : (
              <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl font-black">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-white font-black text-lg truncate">{label}</h3>
              <p className="text-slate-500 text-xs font-medium truncate">{user.email}</p>
              {joined && <p className="text-primary/70 text-[11px] font-bold mt-1">Saving since {monthYear(joined)}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {/* A third of a phone's width, so everything here wraps rather
                than truncating on a large system font. */}
            {stats.map((s) => (
              <div key={s.label} className="bg-black/20 rounded-2xl p-3 text-center min-w-0">
                <p className="text-white text-base font-black tabular-nums leading-tight whitespace-nowrap">{s.value}</p>
                <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mt-1 leading-tight">{s.label}</p>
                <p className={`text-[9px] font-bold mt-1.5 leading-tight ${s.tone}`}>{s.hint}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Savings engine */}
        <Section label="Automated savings">
          <Card className="divide-y divide-white/5">
            <Row
              icon="event_repeat"
              title={liveRules.length === 0 ? 'No auto deposits yet' : liveRules.length === 1 ? describe(liveRules[0]) : `${liveRules.length} rules running`}
              subtitle={
                liveRules.length === 0
                  ? 'Set money aside on a schedule'
                  : nextRun
                    ? `Next on ${shortDate(nextRun)} · posts when you open the app`
                    : 'Posts when you open the app'
              }
              onClick={onOpenAutoDeposits}
              trailing={
                liveRules.length > 0 ? (
                  <span className="shrink-0 px-3 h-7 rounded-full bg-primary/10 text-primary text-[11px] font-black flex items-center">
                    {money(liveRules.reduce((sum, s) => sum + s.amount, 0))}
                  </span>
                ) : undefined
              }
            />
            <div className="p-5 flex items-center gap-4">
              <div className="size-11 shrink-0 rounded-2xl bg-white/5 text-slate-300 flex items-center justify-center">
                <span className="material-symbols-rounded">sync_alt</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">Smart goal overflow</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5 leading-relaxed">
                  A goal that hits its target stops taking a cut; its share goes to the goals still short of theirs.
                </p>
              </div>
              <Switch on={savings.overflow} onChange={onToggleOverflow} />
            </div>
            <Row
              icon="pie_chart"
              title="Distribution split"
              subtitle={allocated === 100 ? 'Fully allocated' : `${allocated}% allocated · ${100 - allocated}% unassigned`}
              onClick={onOpenStrategy}
            />
          </Card>
        </Section>

        {/* Goals */}
        <Section
          label="Goals"
          action={
            <button onClick={onOpenStrategy} className="text-primary text-[11px] font-black active:opacity-60">
              Manage all ({active.length})
            </button>
          }
        >
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-white font-black text-sm">Active distribution</p>
              <span className="px-3 h-7 rounded-full bg-white/5 text-slate-400 text-[11px] font-black flex items-center">
                {whole(totalBalance - archivedTotal)} active
              </span>
            </div>

            {inSplit.length === 0 ? (
              <p className="text-slate-500 text-xs font-medium mt-4 leading-relaxed">
                No goal is taking a share of deposits yet. Set the split on the Strategy tab.
              </p>
            ) : (
              <>
                <div className="flex gap-1 mt-4 h-3">
                  {inSplit.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-full"
                      style={{ width: `${b.splitPercentage}%`, backgroundColor: colorOf(b.id) }}
                    />
                  ))}
                  {allocated < 100 && <div className="rounded-full bg-white/10" style={{ width: `${100 - allocated}%` }} />}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  {inSplit.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 min-w-0">
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: colorOf(b.id) }} />
                      <span className="text-slate-300 text-[11px] font-bold truncate flex-1">{b.name}</span>
                      <span className="text-white text-[11px] font-black shrink-0">{b.splitPercentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {archived.length > 0 && (
              <div className="mt-5 pt-5 border-t border-white/5">
                <button onClick={() => setShowArchive((v) => !v)} className="w-full flex items-center gap-3 text-left">
                  <span className="material-symbols-rounded text-slate-500 text-lg">inventory_2</span>
                  <span className="text-slate-400 text-xs font-bold flex-1">
                    Archived goals ({archived.length})
                  </span>
                  <span className="text-slate-500 text-xs font-black">{whole(archivedTotal)} put away</span>
                  <span className={`material-symbols-rounded text-slate-600 transition-transform ${showArchive ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>

                {showArchive && (
                  <div className="space-y-2 mt-4">
                    {archived.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 min-w-0">
                        <div className="size-10 shrink-0 rounded-xl bg-white/5 text-slate-400 flex items-center justify-center">
                          <span className="material-symbols-rounded text-lg">{b.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-300 text-sm font-bold truncate">{b.name}</p>
                          <p className="text-slate-600 text-[10px] font-medium">
                            {money(b.currentAmount)}
                            {b.archivedAt ? ` · archived ${shortDate(new Date(b.archivedAt))}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => onUnarchive(b.id)}
                          className="shrink-0 h-9 px-4 rounded-full glass text-slate-300 text-[11px] font-black active:scale-95 transition-transform"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                    <p className="text-slate-600 text-[10px] font-medium leading-relaxed px-1 pt-1">
                      Archived goals keep their money and their history. Restoring one brings it back at 0% — give it a share
                      on the Strategy tab.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Section>

        {/* App */}
        <Section label="App">
          <Card className="divide-y divide-white/5">
            <Row
              icon="notifications"
              title="Notification center"
              subtitle="Milestones, receipts and reminders"
              onClick={onOpenAlerts}
              dot={unreadAlerts > 0}
            />
            <Row
              icon="description"
              title="Statements & exports"
              subtitle="Download your ledger as CSV or PDF"
              onClick={onOpenReport}
            />
            <Row
              icon="payments"
              title="Amounts shown as $"
              subtitle="Dollar formatting and 12-hour times, everywhere in the app"
            />
            <Row icon="cloud_done" title="Synced with Firebase" subtitle="Changes save instantly across your devices" />
          </Card>
        </Section>

        {banks.length === 0 && (
          <button
            onClick={() => void handleSeed()}
            disabled={busy}
            className="w-full h-16 rounded-[2rem] glass border border-white/10 text-white font-bold flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="material-symbols-rounded text-primary">auto_awesome</span>
            {busy ? 'Adding…' : 'Add three sample goals'}
          </button>
        )}

        <div>
          <button
            onClick={() => void logout()}
            className="w-full h-16 rounded-[2rem] bg-red-500/10 border border-red-500/20 text-red-400 font-black flex items-center justify-center gap-3 active:scale-95 transition-transform"
          >
            <span className="material-symbols-rounded">logout</span>
            Sign Out
          </button>
          <p className="text-center text-slate-600 text-[10px] font-bold mt-4">SavvyPiggy v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
